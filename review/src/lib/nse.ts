// NSE India API helper - Server-side only
// Scrapes option chain data from NSE India

const NSE_BASE_URL = "https://www.nseindia.com";

// option-chain-contract-info returns only metadata (expiry dates + strike prices)
const CONTRACT_INFO_URL = `${NSE_BASE_URL}/api/option-chain-contract-info?symbol=`;

// option-chain-v3 returns the full option chain data (OI, LTP, Volume, etc.)
// This may be blocked from some IPs
const OC_V3_URL = `${NSE_BASE_URL}/api/option-chain-v3?type=Indices&symbol=`;

const NSE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "X-Requested-With": "XMLHttpRequest",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

let cookieJar: string[] = [];
let lastSessionTime = 0;
const SESSION_TTL = 5 * 60 * 1000; // Re-init session every 5 min
const FETCH_TIMEOUT = 12000; // 12 second timeout (faster fail = faster retry)
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // Exponential backoff: 2s, 5s, 10s

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Fetch timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function initSession(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${NSE_BASE_URL}/`, {
      method: "GET",
      headers: NSE_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      cookieJar = setCookies.map((c) => c.split(";")[0]);
    }

    // Also visit option-chain page to get additional cookies (_abck, bm_sz, nsit)
    if (cookieJar.length > 0) {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 8000);
      await fetch(`${NSE_BASE_URL}/option-chain`, {
        method: "GET",
        headers: {
          ...NSE_HEADERS,
          Referer: `${NSE_BASE_URL}/`,
          Cookie: cookieJar.join("; "),
        },
        redirect: "follow",
        signal: c2.signal,
      }).catch(() => {});
      clearTimeout(t2);
    }

    lastSessionTime = Date.now();
  } catch {
    // Continue without cookies
  }
}

async function fetchNSE<T>(url: string): Promise<T | null> {
  // Re-init session if expired
  if (cookieJar.length === 0 || Date.now() - lastSessionTime > SESSION_TTL) {
    await initSession();
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // On retry (after first attempt), wait with exponential backoff
      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
        await new Promise((r) => setTimeout(r, delay));
        // Refresh session before retry
        cookieJar = [];
        await initSession();
      }

      const headers: Record<string, string> = {
        ...NSE_HEADERS,
        Referer: `${NSE_BASE_URL}/option-chain`,
      };

      if (cookieJar.length > 0) {
        headers["Cookie"] = cookieJar.join("; ");
      }

      const response = await withTimeout(
        fetch(url, {
          method: "GET",
          headers,
          redirect: "follow",
          cache: "no-store",
        }),
        FETCH_TIMEOUT
      );

      if (!response.ok) {
        lastError = new Error(`NSE returned ${response.status}`);
        // Don't retry on 4xx client errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }
        continue;
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err as Error;
    }
  }

  return null;
}

// Types for contract-info response (metadata only)
export interface ContractInfoResponse {
  expiryDates: string[];
  strikePrice: string[];
}

// Types for option-chain-v3 response (full data)
export interface OptionStrikeData {
  strikePrice: number;
  expiryDate: string;
  expiryType: string;
  underlying: string;
  strikeType: string;
  identifier: string;
  underlyingValue: number;
  totalTradedVolume: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  openInterest: number;
  changeinOpenInterest: number;
  pchangeinOpenInterest: number;
  impliedVolatility: number;
  lastPrice: number;
  change: number;
  pChange: number;
  totalTradedValue: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
  IV: string;
}

export interface OptionData {
  strikePrice: number;
  CE?: OptionStrikeData;
  PE?: OptionStrikeData;
}

export interface OptionChainV3Response {
  records: {
    data: OptionData[];
    strikePrices: number[];
    expiryDates: string[];
    timestamp: string;
  };
}

export type NSESymbol = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "NIFTYIT";

// Fetch available expiry dates using contract-info endpoint
export async function fetchExpiryDates(
  symbol: NSESymbol
): Promise<string[] | null> {
  const url = `${CONTRACT_INFO_URL}${symbol}`;
  const data = await fetchNSE<ContractInfoResponse>(url);
  return data?.expiryDates || null;
}

// Fetch option chain data using option-chain-v3 endpoint
export async function fetchOptionChainV3(
  symbol: NSESymbol,
  expiryDate?: string
): Promise<OptionChainV3Response | null> {
  let url = `${OC_V3_URL}${symbol}`;
  if (expiryDate) {
    url += `&expiry=${encodeURIComponent(expiryDate)}`;
  }
  return fetchNSE<OptionChainV3Response>(url);
}

// Calculate PCR (Put-Call Ratio) from option chain data
export function calculatePCR(data: OptionData[]): number {
  let totalCEOI = 0;
  let totalPEOI = 0;

  for (const item of data) {
    if (item.CE?.openInterest) totalCEOI += item.CE.openInterest;
    if (item.PE?.openInterest) totalPEOI += item.PE.openInterest;
  }

  return totalCEOI > 0 ? totalPEOI / totalCEOI : 0;
}

// Calculate Max Pain from option chain data
// For each potential settlement strike, compute total pain (loss) to option writers.
// Max Pain = the strike where total writer loss is minimum (writers lose least).
export function calculateMaxPain(
  data: OptionData[],
  spotPrice: number
): { maxPain: number; painAtStrike: { strike: number; pain: number }[] } {
  if (!data.length) return { maxPain: 0, painAtStrike: [] };

  // Collect all unique strikes
  const allStrikes = data.map((item) => item.strikePrice);
  const painAtStrike: { strike: number; pain: number }[] = [];

  // For each potential settlement strike, compute total writer pain
  for (const settlementStrike of allStrikes) {
    let totalPain = 0;

    for (const item of data) {
      const strike = item.strikePrice;

      // CE writers lose if settlement > strike price: loss = (settlement - strike) * OI
      if (item.CE && item.CE.openInterest > 0 && settlementStrike > strike) {
        totalPain += item.CE.openInterest * (settlementStrike - strike);
      }

      // PE writers lose if settlement < strike price: loss = (strike - settlement) * OI
      if (item.PE && item.PE.openInterest > 0 && settlementStrike < strike) {
        totalPain += item.PE.openInterest * (strike - settlementStrike);
      }
    }

    painAtStrike.push({ strike: settlementStrike, pain: totalPain });
  }

  // Max Pain = strike where pain is minimum (writers lose least)
  let maxPain = 0;
  let minPain = Infinity;

  for (const item of painAtStrike) {
    if (item.pain < minPain) {
      minPain = item.pain;
      maxPain = item.strike;
    }
  }

  return { maxPain, painAtStrike };
}

// Get ATM strike from spot price
export function getATMStrike(spotPrice: number, strikePrices: number[]): number {
  let atm = strikePrices[0];
  let minDiff = Math.abs(spotPrice - atm);

  for (const strike of strikePrices) {
    const diff = Math.abs(spotPrice - strike);
    if (diff < minDiff) {
      minDiff = diff;
      atm = strike;
    }
  }

  return atm;
}

// Format number for Indian currency style (lakhs, crores)
export function formatIndianNumber(num: number): string {
  if (num >= 10000000) {
    return (num / 10000000).toFixed(2) + " Cr";
  } else if (num >= 100000) {
    return (num / 100000).toFixed(2) + " L";
  }
  const parts = num.toString().split(".");
  let intPart = parts[0];
  const decPart = parts[1];

  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formattedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    intPart = formattedRest + "," + lastThree;
  }

  return decPart ? `${intPart}.${decPart}` : intPart;
}

// Format price with 2 decimal places
export function formatPrice(price: number): string {
  return price.toFixed(2);
}
