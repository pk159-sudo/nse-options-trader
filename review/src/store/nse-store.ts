import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NSESymbol = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "NIFTYIT";

interface OptionStrikeData {
  strikePrice: number;
  expiryDate: string;
  underlyingValue: number;
  openInterest: number;
  changeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  lastPrice: number;
  change: number;
  pChange: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
}

export interface OptionData {
  strikePrice: number;
  CE?: OptionStrikeData;
  PE?: OptionStrikeData;
}

export interface OIByStrike {
  strike: number;
  ceOI: number;
  peOI: number;
  ceChangeOI: number;
  peChangeOI: number;
  ceVolume: number;
  peVolume: number;
  ceIV: number;
  peIV: number;
}

export interface AnalysisData {
  pcr: number;
  maxPain: number;
  totalCEOI: number;
  totalPEOI: number;
  totalCEVolume: number;
  totalPEVolume: number;
  maxCEOI: { strike: number; oi: number };
  maxPEOI: { strike: number; oi: number };
  maxCEChangeOI: { strike: number; change: number };
  maxPEChangeOI: { strike: number; change: number };
  resistance: number;
  support: number;
}

export interface OptionChainState {
  spotPrice: number;
  timestamp: string;
  atmStrike: number;
  daysToExpiry: number;
  expiryDates: string[];
  selectedExpiry: string;
  chainData: OptionData[];
  analysis: AnalysisData | null;
  oiByStrike: OIByStrike[];
}

// ===== Snapshot for OI Delta =====
export interface OISnapshot {
  timestamp: string;
  expiry: string;
  spotPrice: number;
  strikes: {
    strike: number;
    ceOI: number;
    peOI: number;
    ceLTP: number;
    peLTP: number;
  }[];
}

// ===== OI Summary =====
export interface OIStrikeRow {
  strike: number;
  oiChange: number;
  oiCurrent: number;
}

export interface OISummaryData {
  callIncrease: OIStrikeRow[];  // top 3
  putIncrease: OIStrikeRow[];
  callDecrease: OIStrikeRow[];
  putDecrease: OIStrikeRow[];
  ceTotalChange: number;
  peTotalChange: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  atmStrike: number;
  dataRange: string;
  lastUpdated: string;
}

// ===== Signals =====
export interface TradingSignal {
  id: string;
  time: string;
  fromStrike: number;
  toStrike: number;
  type: "BULLISH" | "BEARISH";
  strength: number;
  reason: string;
  entryPrice: number;
  oiChange: number;
  expiry: string;
  tradeId?: string;
  executed: boolean;
  skipReason?: string;
  // Semi-auto fields
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  brokerOrderId?: string;
  isRealTrade?: boolean;
}

// ===== Trades =====
export interface Trade {
  id: string;
  time: string;
  signalType: "BULLISH" | "BEARISH";
  strike: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  status: "OPEN" | "CLOSED";
  currentStop: number;
  highestProfitPct: number;
  maxDrawdownPct: number;
  priceHistory: { time: string; price: number }[];
  expiry: string;
  signalId?: string;
  // Broker fields
  isRealTrade?: boolean;
  brokerOrderId?: string;
  brokerName?: string;
}

// ===== Broker Types =====
export type BrokerName = "ZERODHA" | "ANGEL_ONE" | "UPSTOX" | "DHAN" | "GROWW";

export interface BrokerAccount {
  broker: BrokerName;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  status: "CONNECTED" | "DISCONNECTED";
  balance: number;
  connectedAt: string | null;
  userId?: string;
}

export type TradeMode = "PAPER" | "SEMI_AUTO";

const LOT_SIZE = 65;
const PROFIT_TARGET_PCT = 50;
const INITIAL_STOP_PCT = 15;
const BREAKEVEN_TRIGGER_PCT = 15;
const PROFIT_LOCK_TRIGGER_PCT = 30;
const TRAILING_STOP_PCT = 15;

function calculateOISummary(
  prevSnapshot: OISnapshot | null,
  currentChain: OptionData[],
  spotPrice: number,
  expiry: string
): OISummaryData | null {
  if (!prevSnapshot || !currentChain.length) return null;

  const atm = Math.round(spotPrice / 50) * 50;

  // Determine range based on days to expiry
  let range = 500;
  try {
    const expDate = new Date(expiry);
    const daysToExpiry = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry <= 7) range = 300;
  } catch {}

  // Build current OI map
  const currentMap = new Map<number, { ceOI: number; peOI: number }>();
  for (const item of currentChain) {
    currentMap.set(item.strikePrice, {
      ceOI: item.CE?.openInterest || 0,
      peOI: item.PE?.openInterest || 0,
    });
  }

  // Build prev OI map
  const prevMap = new Map<number, { ceOI: number; peOI: number }>();
  for (const s of prevSnapshot.strikes) {
    prevMap.set(s.strike, { ceOI: s.ceOI, peOI: s.peOI });
  }

  // Calculate changes for relevant strikes
  const relevantStrikes: {
    strike: number;
    ceOIChange: number;
    peOIChange: number;
    ceOICurrent: number;
    peOICurrent: number;
  }[] = [];

  for (const [strike, curr] of currentMap) {
    if (strike < atm - range || strike > atm + range) continue;
    const prev = prevMap.get(strike);
    if (!prev) continue;

    const ceOIChange = curr.ceOI - prev.ceOI;
    const peOIChange = curr.peOI - prev.peOI;

    if (ceOIChange !== 0 || peOIChange !== 0) {
      relevantStrikes.push({
        strike,
        ceOIChange,
        peOIChange,
        ceOICurrent: curr.ceOI,
        peOICurrent: curr.peOI,
      });
    }
  }

  if (relevantStrikes.length === 0) return null;

  // Sort and pick top 3
  const ceIncreases = relevantStrikes
    .filter((s) => s.ceOIChange > 0)
    .sort((a, b) => b.ceOIChange - a.ceOIChange)
    .slice(0, 3)
    .map((s) => ({ strike: s.strike, oiChange: s.ceOIChange, oiCurrent: s.ceOICurrent }));

  const peIncreases = relevantStrikes
    .filter((s) => s.peOIChange > 0)
    .sort((a, b) => b.peOIChange - a.peOIChange)
    .slice(0, 3)
    .map((s) => ({ strike: s.strike, oiChange: s.peOIChange, oiCurrent: s.peOICurrent }));

  const ceDecreases = relevantStrikes
    .filter((s) => s.ceOIChange < 0)
    .sort((a, b) => a.ceOIChange - b.ceOIChange)
    .slice(0, 3)
    .map((s) => ({ strike: s.strike, oiChange: s.ceOIChange, oiCurrent: s.ceOICurrent }));

  const peDecreases = relevantStrikes
    .filter((s) => s.peOIChange < 0)
    .sort((a, b) => a.peOIChange - b.peOIChange)
    .slice(0, 3)
    .map((s) => ({ strike: s.strike, oiChange: s.peOIChange, oiCurrent: s.peOICurrent }));

  const ceTotalChange = relevantStrikes.reduce((sum, s) => sum + s.ceOIChange, 0);
  const peTotalChange = relevantStrikes.reduce((sum, s) => sum + s.peOIChange, 0);

  let sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (ceTotalChange > 0 && peTotalChange < 0) sentiment = "BEARISH";
  else if (peTotalChange > 0 && ceTotalChange < 0) sentiment = "BULLISH";

  return {
    callIncrease: ceIncreases,
    putIncrease: peIncreases,
    callDecrease: ceDecreases,
    putDecrease: peDecreases,
    ceTotalChange,
    peTotalChange,
    sentiment,
    atmStrike: atm,
    dataRange: `±${range}`,
    lastUpdated: new Date().toLocaleTimeString("en-IN"),
  };
}

function getOptionLTP(
  currentMap: Map<number, { ceLTP: number; peLTP: number }>,
  strike: number,
  optionType: "CE" | "PE"
): number | null {
  const item = currentMap.get(strike);
  if (!item) return null;
  return optionType === "CE" ? item.ceLTP : item.peLTP;
}

function findNearestStrike(
  currentMap: Map<number, { ceLTP: number; peLTP: number }>,
  target: number,
  direction: "up" | "down"
): number | null {
  const strikes = Array.from(currentMap.keys()).sort((a, b) => a - b);
  if (direction === "up") {
    return strikes.find((s) => s >= target) ?? null;
  }
  return strikes.reverse().find((s) => s <= target) ?? null;
}

function scanSignalsImproved(
  prevSnapshot: OISnapshot | null,
  currentChain: OptionData[],
  spotPrice: number,
  expiry: string,
  threshold: number
): TradingSignal[] {
  // ===== SIMPLIFIED BUY-ONLY SIGNAL ENGINE =====
  // Logic: OI data se pata chal jayega market kis side shift ho raha hai
  // BULLISH (OI shift upar) → CALL BUY at (shift strike + 200)
  // BEARISH (OI shift neeche) → PUT BUY at (shift strike - 200)
  // Sirf BUY karna hai — no selling, no shorting

  if (!prevSnapshot || !currentChain.length) return [];

  const now = new Date().toLocaleTimeString("en-IN", { hour12: false });

  const prevMap = new Map<number, { ceOI: number; peOI: number }>();
  for (const s of prevSnapshot.strikes) {
    prevMap.set(s.strike, { ceOI: s.ceOI, peOI: s.peOI });
  }

  const currentMap = new Map<number, { ceOI: number; ceLTP: number; peOI: number; peLTP: number }>();
  for (const item of currentChain) {
    currentMap.set(item.strikePrice, {
      ceOI: item.CE?.openInterest || 0,
      ceLTP: item.CE?.lastPrice || 0,
      peOI: item.PE?.openInterest || 0,
      peLTP: item.PE?.lastPrice || 0,
    });
  }

  // Calculate CE & PE OI changes for all strikes
  const oiChanges: { strike: number; ceChange: number; peChange: number; ceLTP: number; peLTP: number }[] = [];
  for (const [strike, curr] of currentMap) {
    const prev = prevMap.get(strike);
    if (!prev) continue;
    const ceChange = curr.ceOI - prev.ceOI;
    const peChange = curr.peOI - prev.peOI;
    oiChanges.push({ strike, ceChange, peChange, ceLTP: curr.ceLTP, peLTP: curr.peLTP });
  }

  const atm = Math.round(spotPrice / 50) * 50;

  // Filter to relevant window: ATM ± 200
  const relevant = oiChanges.filter(
    (c) => c.strike >= atm - 200 && c.strike <= atm + 200
  );

  const callCandidates = relevant
    .filter((c) => c.ceChange < -threshold)
    .map((c) => {
      const toStrike = findNearestStrike(currentMap, c.strike + 200, "up");
      return toStrike
        ? {
            type: "BULLISH" as const,
            fromStrike: c.strike,
            toStrike,
            change: Math.abs(c.ceChange),
            entryPrice: getOptionLTP(currentMap, toStrike, "CE") || 0,
          }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => candidate.entryPrice > 0);

  const putCandidates = relevant
    .filter((c) => c.peChange < -threshold)
    .map((c) => {
      const toStrike = findNearestStrike(currentMap, c.strike - 200, "down");
      return toStrike
        ? {
            type: "BEARISH" as const,
            fromStrike: c.strike,
            toStrike,
            change: Math.abs(c.peChange),
            entryPrice: getOptionLTP(currentMap, toStrike, "PE") || 0,
          }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => candidate.entryPrice > 0);

  const candidates = [...callCandidates, ...putCandidates];
  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.change - a.change);
  const best = candidates[0];
  const reason = best.type === "BULLISH"
    ? `CE OI reduction at ${best.fromStrike} → CALL BUY ${best.toStrike}`
    : `PE OI reduction at ${best.fromStrike} → PUT BUY ${best.toStrike}`;
  const strength = Math.min(90, 50 + (best.change / threshold) * 10);

  return [
    {
      id: `sig-${Date.now()}-${best.type.toLowerCase()}-1`,
      time: now,
      fromStrike: best.fromStrike,
      toStrike: best.toStrike,
      type: best.type,
      strength: Math.min(95, Math.max(50, Math.round(strength * 10) / 10)),
      reason,
      entryPrice: best.entryPrice,
      oiChange: best.change,
      expiry,
      executed: false,
      status: "PENDING" as const,
    },
  ];
}

function scanSignalsFallback(
  currentChain: OptionData[],
  spotPrice: number,
  expiry: string
): TradingSignal[] {
  // ===== FALLBACK SIGNAL ENGINE (BUY ONLY) =====
  // Jab migration data na ho, OI concentration se signals generate karo
  // Max CE OI → resistance → BEARISH → PUT BUY at (strike - 200)
  // Max PE OI → support → BULLISH → CALL BUY at (strike + 200)
  const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
  const atm = Math.round(spotPrice / 50) * 50;
  const currentMap = new Map<number, { ceLTP: number; peLTP: number }>();
  for (const item of currentChain) {
    currentMap.set(item.strikePrice, {
      ceLTP: item.CE?.lastPrice || 0,
      peLTP: item.PE?.lastPrice || 0,
    });
  }

  // Find strikes within ±150 of ATM
  const win = currentChain.filter(
    (item) => item.strikePrice >= atm - 150 && item.strikePrice <= atm + 150
  );
  if (win.length === 0) return [];

  const signals: TradingSignal[] = [];

  // Find max CE OI → resistance zone → BEARISH → PUT BUY
  let maxCEIdx = 0;
  let maxCEOI = 0;
  for (let i = 0; i < win.length; i++) {
    const ceOI = win[i].CE?.openInterest || 0;
    if (ceOI > maxCEOI) {
      maxCEOI = ceOI;
      maxCEIdx = i;
    }
  }

  // Find max PE OI → support zone → BULLISH → CALL BUY
  let maxPEIdx = 0;
  let maxPEOI = 0;
  for (let i = 0; i < win.length; i++) {
    const peOI = win[i].PE?.openInterest || 0;
    if (peOI > maxPEOI) {
      maxPEOI = peOI;
      maxPEIdx = i;
    }
  }

  const dominanceRatio = Math.abs(maxCEOI - maxPEOI) / Math.max(maxCEOI, maxPEOI, 1);
  const preferBear = maxCEOI >= maxPEOI;
  let signalCreated = false;

  const tryBear = () => {
    if (maxCEOI <= 0) return false;
    const ceStrike = win[maxCEIdx].strikePrice;
    const putBuyStrike = ceStrike - 200;
    const putLTP = getOptionLTP(currentMap, putBuyStrike, "PE");
    if (!putLTP || putLTP <= 0) return false;
    signals.push({
      id: `sig-${Date.now()}-fbear`,
      time: now,
      fromStrike: ceStrike,
      toStrike: putBuyStrike,
      type: "BEARISH",
      strength: 60.0,
      reason: `CE OI resistance at ${ceStrike} → PUT BUY ${putBuyStrike}`,
      entryPrice: putLTP,
      oiChange: 0,
      expiry,
      executed: false,
      status: "PENDING" as const,
    });
    return true;
  };

  const tryBull = () => {
    if (maxPEOI <= 0) return false;
    const peStrike = win[maxPEIdx].strikePrice;
    const callBuyStrike = peStrike + 200;
    const callLTP = getOptionLTP(currentMap, callBuyStrike, "CE");
    if (!callLTP || callLTP <= 0) return false;
    signals.push({
      id: `sig-${Date.now()}-fbull`,
      time: now,
      fromStrike: peStrike,
      toStrike: callBuyStrike,
      type: "BULLISH",
      strength: 65.0,
      reason: `PE OI support at ${peStrike} → CALL BUY ${callBuyStrike}`,
      entryPrice: callLTP,
      oiChange: 0,
      expiry,
      executed: false,
      status: "PENDING" as const,
    });
    return true;
  };

  if (dominanceRatio >= 0.08) {
    signalCreated = preferBear ? tryBear() : tryBull();
  }

  if (!signalCreated) {
    signalCreated = preferBear ? tryBear() : tryBull();
    if (!signalCreated) {
      signalCreated = preferBear ? tryBull() : tryBear();
    }
  }

  return signals;
}

function checkExitConditions(
  currentChain: OptionData[],
  openTrades: Trade[]
): Trade[] {
  const updated = openTrades.map((t) => ({ ...t, priceHistory: [...t.priceHistory] }));
  let changed = false;

  const currentMap = new Map<number, { ceLTP: number; peLTP: number }>();
  for (const item of currentChain) {
    currentMap.set(item.strikePrice, {
      ceLTP: item.CE?.lastPrice || 0,
      peLTP: item.PE?.lastPrice || 0,
    });
  }

  const now = new Date().toLocaleTimeString("en-IN", { hour12: false });

  for (let i = 0; i < updated.length; i++) {
    const trade = updated[i];
    if (trade.status !== "OPEN") continue;

    const data = currentMap.get(trade.strike);
    if (!data) continue;

    // BULLISH = CALL BUY → track CE LTP (profit when CE price rises)
    // BEARISH = PUT BUY → track PE LTP (profit when PE price rises)
    // Both are BUY positions — profit when bought option price increases
    const currentPrice = trade.signalType === "BULLISH" ? data.ceLTP : data.peLTP;
    if (currentPrice <= 0) continue;

    const entry = trade.entryPrice;
    // Both CALL BUY and PUT BUY: profit = (current - entry) / entry
    // Because we BUY the option, profit increases when option price goes up
    const profitPct = ((currentPrice - entry) / entry) * 100;

    // Track price history for the trade
    trade.priceHistory.push({ time: now, price: currentPrice });
    if (trade.priceHistory.length > 200) trade.priceHistory = trade.priceHistory.slice(-200);

    // Track highest profit and max drawdown
    if (profitPct > trade.highestProfitPct) {
      trade.highestProfitPct = profitPct;
    }
    if (profitPct < 0 && Math.abs(profitPct) > trade.maxDrawdownPct) {
      trade.maxDrawdownPct = Math.abs(profitPct);
    }

    // 1. Profit target 50%
    if (profitPct >= PROFIT_TARGET_PCT) {
      trade.exitPrice = currentPrice;
      // Both CALL BUY and PUT BUY: PnL = (current - entry) * lot_size
      trade.pnl = (currentPrice - entry) * LOT_SIZE;
      trade.status = "CLOSED";
      changed = true;
      continue;
    }

    // 2. Stop loss ladder for buy positions:
    //    - Move SL to breakeven once price is up 15%
    //    - Move SL to 15% profit once price is up 30%
    let stopPrice: number;
    if (trade.highestProfitPct >= PROFIT_LOCK_TRIGGER_PCT) {
      // Lock a 15% profit after 30% gain
      stopPrice = entry * (1 + TRAILING_STOP_PCT / 100);
    } else if (trade.highestProfitPct >= BREAKEVEN_TRIGGER_PCT) {
      // Move stop to breakeven after 15% gain
      stopPrice = entry;
    } else {
      // Initial stop loss 15% below entry
      stopPrice = entry * (1 - INITIAL_STOP_PCT / 100);
    }

    trade.currentStop = stopPrice;

    // Check if stop triggered (buy position → price drops below stop)
    if (currentPrice <= stopPrice) {
      trade.exitPrice = currentPrice;
      trade.pnl = (currentPrice - entry) * LOT_SIZE;
      trade.status = "CLOSED";
      changed = true;
    }
  }

  return changed ? updated : openTrades;
}

interface NSEStore {
  selectedSymbol: NSESymbol;
  selectedExpiry: string;
  expiryDates: string[];
  optionChain: OptionChainState | null;
  isLoading: boolean;
  isExpiryLoading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number;
  lastUpdated: string | null;

  // Snapshot history
  snapshots: OISnapshot[];
  maxSnapshots: number;

  // OI Summary
  oiSummary: OISummaryData | null;

  // Signals
  signals: TradingSignal[];
  oiThreshold: number;

  // Trades
  trades: Trade[];

  // Spot price from latest data
  spotPrice: number;

  // Snapshot-based OI Delta per strike (like Python's get_delta)
  snapshotDelta: Record<number, { ceOIChange: number; peOIChange: number; ceLTPChange: number; peLTPChange: number }>;
  snapshotDeltaTime: string | null;

  // Semi-auto trading
  tradeMode: TradeMode;
  pendingSignals: TradingSignal[];
  brokerAccount: BrokerAccount | null;

  setSymbol: (symbol: NSESymbol) => void;
  setExpiry: (expiry: string) => void;
  setAutoRefresh: (val: boolean) => void;
  setRefreshInterval: (seconds: number) => void;
  setOIThreshold: (threshold: number) => void;
  fetchExpiryDates: () => Promise<void>;
  fetchOptionChain: (forceRefresh?: boolean) => Promise<void>;
  saveSnapshotToCsv: (snapshot: OISnapshot) => Promise<OISnapshot[] | null>;
  loadSnapshotHistory: () => Promise<void>;
  saveSignalToFile: (signal: TradingSignal) => Promise<void>;
  loadSignalsFromFile: () => Promise<void>;
  saveTradeToFile: (trade: Trade) => Promise<void>;
  loadTradesFromFile: () => Promise<void>;
  saveDeltaToFile: (prevTimestamp: string) => Promise<void>;
  loadDeltaFromFile: () => Promise<void>;
  isMarketOpen: boolean;
  checkMarketHours: () => void;

  // Semi-auto trading methods
  setTradeMode: (mode: TradeMode) => void;
  approveSignal: (signalId: string) => void;
  rejectSignal: (signalId: string) => void;
  connectBroker: (account: BrokerAccount) => void;
  disconnectBroker: () => void;
  updateBrokerBalance: (balance: number) => void;
}

// Market hours helper: 9:15 AM - 3:30 PM IST, Mon-Fri
function checkIfMarketOpen(): boolean {
  try {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60; // minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset + 1440) % 1440; // handle wrap
    const day = now.getUTCDay(); // 0=Sun, 6=Sat

    // Weekend check
    if (day === 0 || day === 6) return false;

    // 9:15 = 555 minutes, 15:30 = 930 minutes
    if (istMinutes < 555 || istMinutes > 930) return false;

    return true;
  } catch {
    return true; // default to open if can't determine
  }
}

export const useNSEStore = create<NSEStore>()(
  persist(
    (set, get) => ({
  selectedSymbol: "NIFTY",
  selectedExpiry: "",
  expiryDates: [],
  optionChain: null,
  isLoading: false,
  isExpiryLoading: false,
  error: null,
  autoRefresh: true,
  refreshInterval: 30,
  lastUpdated: null,

  snapshots: [],
  maxSnapshots: 10,

  oiSummary: null,

  signals: [],
  oiThreshold: 25000,

  trades: [],

  spotPrice: 0,

  snapshotDelta: {} as Record<number, { ceOIChange: number; peOIChange: number; ceLTPChange: number; peLTPChange: number }>,
  snapshotDeltaTime: null,

  // Semi-auto trading
  tradeMode: "PAPER" as TradeMode,
  pendingSignals: [],
  brokerAccount: null,

  isMarketOpen: checkIfMarketOpen(),
  checkMarketHours: () => {
    set({ isMarketOpen: checkIfMarketOpen() });
  },

  setSymbol: (symbol) => {
    set({ selectedSymbol: symbol, selectedExpiry: "", optionChain: null, error: null, snapshots: [], oiSummary: null, signals: [], trades: [], snapshotDelta: {}, snapshotDeltaTime: null });
    get().fetchExpiryDates();
  },

  setExpiry: async (expiry) => {
    // On expiry change, clear only session data (not trades from other expiries if any)
    set({ selectedExpiry: expiry, optionChain: null, error: null, snapshots: [], oiSummary: null, signals: [], trades: [], snapshotDelta: {}, snapshotDeltaTime: null });
    if (expiry) {
      await Promise.all([
        get().loadSnapshotHistory(),
        get().loadSignalsFromFile(),
        get().loadTradesFromFile(),
        get().loadDeltaFromFile(),
      ]);
      get().fetchOptionChain();
    }
  },

  setAutoRefresh: (val) => set({ autoRefresh: val }),
  setRefreshInterval: (seconds) => set({ refreshInterval: seconds }),
  setOIThreshold: (threshold) => set({ oiThreshold: threshold }),

  fetchExpiryDates: async () => {
    set({ isExpiryLoading: true, error: null });
    try {
      const res = await fetch(`/api/nse/expiry?symbol=${get().selectedSymbol}`);
      const resData = await res.json();
      if (!resData?.expiryDates?.length) throw new Error("Failed to fetch expiry dates from NSE");
      const expiryDates = resData.expiryDates || [];
      set({ expiryDates, isExpiryLoading: false });
      if (expiryDates.length > 0 && !get().selectedExpiry) {
        set({ selectedExpiry: expiryDates[0] });
        get().fetchOptionChain();
      }
    } catch (err: unknown) {
      set({ error: (err as Error).message, isExpiryLoading: false });
    }
  },

  fetchOptionChain: async (forceRefresh = false) => {
    const { selectedSymbol, selectedExpiry, snapshots, oiThreshold, trades } = get();
    if (!selectedExpiry) return;

    // ===== OFF-MARKET GATE =====
    // Don't fetch from NSE or save snapshots when market is closed.
    // Live market only: 9:15 AM - 3:30 PM IST, Mon-Fri
    // Data already available from:
    //   1. Zustand persist (optionChain in localStorage from last session)
    //   2. Disk files (snapshots, signals, trades, delta loaded at expiry change)
    // This prevents junk snapshots corrupting delta history when app opens off-market.
    if (!checkIfMarketOpen()) {
      return;
    }

    // ===== LIVE MARKET: Full flow (fetch + save + calc + scan + exit check) =====
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams({
        symbol: selectedSymbol,
        expiry: selectedExpiry,
      });

      // Direct fetch from NSE via server API
      const res = await fetch(`/api/nse/option-chain?${params}`);
      const data = await res.json();
      if (!data?.chainData?.length) throw new Error((data as Record<string, unknown>)?.error as string || "Failed to fetch option chain");

      // Save snapshot before updating
      const currentChain: OptionData[] = data.chainData || [];
      const spotPrice: number = data.spotPrice || 0;

      if (currentChain.length > 0 && spotPrice > 0) {
        const newSnapshot: OISnapshot = {
          timestamp: new Date().toISOString(),
          expiry: selectedExpiry,
          spotPrice,
          strikes: currentChain.map((item: OptionData) => ({
            strike: item.strikePrice,
            ceOI: item.CE?.openInterest || 0,
            peOI: item.PE?.openInterest || 0,
            ceLTP: item.CE?.lastPrice || 0,
            peLTP: item.PE?.lastPrice || 0,
          })),
        };

        // Persist snapshot to disk immediately and obtain last snapshots from server
        // to avoid race conditions between write and subsequent read.
        let prevSnapshot: OISnapshot | null = null;
        try {
          const rows = await get().saveSnapshotToCsv(newSnapshot);
          if (rows && rows.length >= 2) {
            prevSnapshot = rows[rows.length - 2];
          } else if (rows && rows.length === 1) {
            prevSnapshot = rows[0];
          }
        } catch {
          prevSnapshot = null;
        }

        // ===== Calculate Snapshot-based OI Delta (like Python's get_delta) =====
        let snapshotDelta: Record<number, { ceOIChange: number; peOIChange: number; ceLTPChange: number; peLTPChange: number }> = {};
        let snapshotDeltaTime: string | null = null;

        if (prevSnapshot) {
          const prevMap = new Map<number, { ceOI: number; peOI: number; ceLTP: number; peLTP: number }>();
          for (const s of prevSnapshot.strikes) {
            prevMap.set(s.strike, { ceOI: s.ceOI, peOI: s.peOI, ceLTP: s.ceLTP, peLTP: s.peLTP });
          }

          for (const item of currentChain) {
            const strike = item.strikePrice;
            const prev = prevMap.get(strike);
            if (!prev) continue;

            const currCEOI = item.CE?.openInterest || 0;
            const currPEOI = item.PE?.openInterest || 0;
            const currCELTP = item.CE?.lastPrice || 0;
            const currPELTP = item.PE?.lastPrice || 0;

            const ceOIChange = currCEOI - prev.ceOI;
            const peOIChange = currPEOI - prev.peOI;
            const ceLTPChange = prev.ceLTP > 0 ? currCELTP - prev.ceLTP : 0;
            const peLTPChange = prev.peLTP > 0 ? currPELTP - prev.peLTP : 0;

            if (ceOIChange !== 0 || peOIChange !== 0) {
              snapshotDelta[strike] = { ceOIChange, peOIChange, ceLTPChange, peLTPChange };
            }
          }

          snapshotDeltaTime = new Date().toLocaleTimeString("en-IN");

          // Persist delta to disk for: app restart, overnight reference, backtesting
          if (Object.keys(snapshotDelta).length > 0) {
            void get().saveDeltaToFile(prevSnapshot.timestamp);
          }
        }

        // Calculate OI Summary
        const oiSummary = calculateOISummary(prevSnapshot, currentChain, spotPrice, selectedExpiry);

        // Scan signals using the simplified OI-reduction rule only
        const newSignals = scanSignalsImproved(prevSnapshot, currentChain, spotPrice, selectedExpiry, oiThreshold);

        for (const sig of newSignals) {
          void get().saveSignalToFile(sig);
        }

        // Check exit conditions on open trades
        let updatedTrades = checkExitConditions(currentChain, trades);

        // Execute new trades from signals
        // In PAPER mode: auto-execute. In SEMI_AUTO mode: add to pending queue
        const currentTradeMode = get().tradeMode;

        for (const sig of newSignals) {
          if (sig.strength < 50) {
            sig.skipReason = "Weak signal (<50%)";
            sig.status = "REJECTED";
            continue;
          }
          // Max 3 open trades at a time
          const openCount = updatedTrades.filter((t) => t.status === "OPEN").length;
          if (openCount >= 3) {
            sig.skipReason = `Max ${3} open trades reached`;
            sig.status = "REJECTED";
            continue;
          }
          // Check if already have open trade at this strike
          const existingOpen = updatedTrades.find(
            (t) => t.strike === sig.toStrike && t.status === "OPEN"
          );
          if (existingOpen) {
            sig.skipReason = "Already open at this strike";
            sig.status = "REJECTED";
            continue;
          }
          // Skip if entry price is invalid
          if (!sig.entryPrice || sig.entryPrice <= 0) {
            sig.skipReason = "Invalid entry price";
            sig.status = "REJECTED";
            continue;
          }

          // PAPER mode: auto-execute the trade
          if (currentTradeMode === "PAPER") {
            const tradeId = `trade-${Date.now()}-${sig.toStrike}`;
            sig.tradeId = tradeId;
            sig.executed = true;
            sig.status = "EXECUTED";

            // Both CALL BUY and PUT BUY are buy positions → stop loss below entry
            const initialStop = sig.entryPrice * (1 - INITIAL_STOP_PCT / 100);

            updatedTrades.push({
              id: tradeId,
              time: sig.time,
              signalType: sig.type,
              strike: sig.toStrike,
              entryPrice: sig.entryPrice,
              exitPrice: 0,
              pnl: 0,
              expiry: sig.expiry,
              status: "OPEN",
              currentStop: initialStop,
              highestProfitPct: 0,
              maxDrawdownPct: 0,
              priceHistory: [{ time: sig.time, price: sig.entryPrice }],
              signalId: sig.id,
              isRealTrade: false,
            });
          } else {
            // SEMI_AUTO mode: add to pending queue for approval
            sig.status = "PENDING";
          }
        }

        // Keep all signals for display
        const allSignals = [...get().signals, ...newSignals].slice(-20);

        // Only save trades that actually changed to prevent unbounded JSONL growth
        const prevTradesMap = new Map<string, Trade>();
        for (const t of trades) prevTradesMap.set(t.id, t);
        for (const trade of updatedTrades) {
          const prev = prevTradesMap.get(trade.id);
          if (!prev) {
            // New trade — must save
            void get().saveTradeToFile(trade);
          } else if (prev.status !== trade.status || prev.exitPrice !== trade.exitPrice ||
                     prev.currentStop !== trade.currentStop || prev.pnl !== trade.pnl ||
                     prev.priceHistory.length !== trade.priceHistory.length) {
            // Trade state changed — save
            void get().saveTradeToFile(trade);
          }
        }

        set({
          optionChain: data as unknown as OptionChainState,
          isLoading: false,
          lastUpdated: new Date().toLocaleTimeString("en-IN"),
          spotPrice: spotPrice || 0,
          // Do not keep full snapshot history in memory; rely on disk for persistence.
          snapshots: [],
          oiSummary,
          signals: allSignals,
          trades: updatedTrades,
          snapshotDelta,
          snapshotDeltaTime,
        });

        if (!prevSnapshot) {
          // No previous snapshot → load last saved delta from disk (e.g. yesterday's closing)
          void get().loadDeltaFromFile();
        }
      } else {
        set({
          optionChain: data as unknown as OptionChainState,
          isLoading: false,
          lastUpdated: new Date().toLocaleTimeString("en-IN"),
        });
      }
    } catch (err: unknown) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  saveDeltaToFile: async (prevTimestamp: string) => {
    const { selectedSymbol, selectedExpiry, snapshotDelta, spotPrice } = get();
    if (!selectedSymbol || !selectedExpiry || Object.keys(snapshotDelta).length === 0) return;
    try {
      await fetch("/api/nse/delta-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          expiry: selectedExpiry,
          timestamp: new Date().toISOString(),
          spotPrice,
          prevTimestamp,
          snapshotDelta,
        }),
      });
    } catch {
      // Ignore write failures
    }
  },

  loadDeltaFromFile: async () => {
    const { selectedSymbol, selectedExpiry } = get();
    if (!selectedSymbol || !selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/delta-history?symbol=${selectedSymbol}&expiry=${encodeURIComponent(selectedExpiry)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data?.snapshotDelta) {
        set({
          snapshotDelta: data.snapshotDelta,
          snapshotDeltaTime: data.snapshotDeltaTime || null,
        });
      }
    } catch {
      // Ignore read failures
    }
  },

  saveSnapshotToCsv: async (snapshot) => {
    const { selectedSymbol } = get();
    if (!selectedSymbol || !snapshot.expiry) return null;
    try {
      const resp = await fetch("/api/nse/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          expiry: snapshot.expiry,
          timestamp: snapshot.timestamp,
          spotPrice: snapshot.spotPrice,
          strikes: snapshot.strikes,
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return Array.isArray(data?.snapshots) ? data.snapshots : null;
    } catch {
      return null;
    }
  },

  loadSnapshotHistory: async () => {
    const { selectedSymbol, selectedExpiry } = get();
    if (!selectedSymbol || !selectedExpiry) return;
    try {
      const response = await fetch(
          `/api/nse/snapshots?symbol=${selectedSymbol}&expiry=${encodeURIComponent(selectedExpiry)}`
        );
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.snapshots)) {
        set({ snapshots: data.snapshots });
      }
    } catch {
      // Ignore read failures
    }
  },

  saveSignalToFile: async (signal) => {
    const { selectedSymbol, selectedExpiry } = get();
    const expiry = signal.expiry || selectedExpiry;
    if (!selectedSymbol || !expiry) return;
    try {
      await fetch(`/api/nse/signals?symbol=${selectedSymbol}&expiry=${encodeURIComponent(expiry)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      });
    } catch {
      // Ignore write failures
    }
  },

  loadSignalsFromFile: async () => {
    const { selectedSymbol, selectedExpiry } = get();
    if (!selectedSymbol || !selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/signals?symbol=${selectedSymbol}&expiry=${encodeURIComponent(selectedExpiry)}&limit=10`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.signals)) {
        set({ signals: data.signals });
      }
    } catch {
      // Ignore read failures
    }
  },

  saveTradeToFile: async (trade) => {
    const { selectedSymbol, selectedExpiry } = get();
    const expiry = trade.expiry || selectedExpiry;
    if (!selectedSymbol || !expiry) return;
    try {
      await fetch(`/api/nse/trades?symbol=${selectedSymbol}&expiry=${encodeURIComponent(expiry)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
    } catch {
      // Ignore write failures
    }
  },

  loadTradesFromFile: async () => {
    const { selectedSymbol, selectedExpiry } = get();
    if (!selectedSymbol || !selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/trades?symbol=${selectedSymbol}&expiry=${encodeURIComponent(selectedExpiry)}&limitClosed=5`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data?.openTrades) && Array.isArray(data?.closedTrades)) {
        const expiry = selectedExpiry;
        const normalizedTrades = [...data.openTrades, ...data.closedTrades].map((trade) => ({
          expiry: expiry || trade.expiry || "",
          ...trade,
        }));
        set({ trades: normalizedTrades });
      }
    } catch {
      // Ignore read failures
    }
  },

  // Semi-auto trading methods
  setTradeMode: (mode) => set({ tradeMode: mode }),

  approveSignal: (signalId) => {
    const state = get();
    const signal = state.signals.find((s) => s.id === signalId);
    if (!signal) return;

    const isBrokerConnected = state.brokerAccount?.status === "CONNECTED" && state.brokerAccount.broker !== "GROWW";

    // Update signal status
    const updatedSignals = state.signals.map((s) =>
      s.id === signalId
        ? { ...s, status: "APPROVED" as const, executed: true, isRealTrade: isBrokerConnected }
        : s
    );

    // Remove from pending queue
    const updatedPending = state.pendingSignals.filter((s) => s.id !== signalId);

    // Create trade
    const trade: Trade = {
      id: `trade-${Date.now()}-${signal.toStrike}`,
      time: signal.time,
      signalType: signal.type,
      strike: signal.toStrike,
      entryPrice: signal.entryPrice,
      exitPrice: 0,
      pnl: 0,
      expiry: signal.expiry,
      status: "OPEN",
      currentStop: signal.entryPrice * (1 - INITIAL_STOP_PCT / 100),
      highestProfitPct: 0,
      maxDrawdownPct: 0,
      priceHistory: [{ time: signal.time, price: signal.entryPrice }],
      signalId: signal.id,
      isRealTrade: isBrokerConnected,
      brokerName: isBrokerConnected ? state.brokerAccount?.broker : undefined,
    };

    // Update the signal with trade reference and set status to EXECUTED
    const finalSignals = updatedSignals.map((s) =>
      s.id === signalId ? { ...s, tradeId: trade.id, status: "EXECUTED" as const } : s
    );

    set({
      signals: finalSignals,
      pendingSignals: updatedPending,
      trades: [...state.trades, trade],
    });
    void get().saveSignalToFile(finalSignals.find((s) => s.id === signalId) ?? signal);
    void get().saveTradeToFile(trade);
  },

  rejectSignal: (signalId) => {
    const state = get();
    const updatedSignals = state.signals.map((s) =>
      s.id === signalId ? { ...s, status: "REJECTED" as const, executed: false } : s
    );
    const updatedPending = state.pendingSignals.filter((s) => s.id !== signalId);
    set({ signals: updatedSignals, pendingSignals: updatedPending });
    const rejected = updatedSignals.find((s) => s.id === signalId);
    if (rejected) {
      void get().saveSignalToFile(rejected);
    }
  },

  connectBroker: (account) => {
    set({ brokerAccount: { ...account, status: "CONNECTED", connectedAt: new Date().toISOString() } });
  },

  disconnectBroker: () => {
    const current = get().brokerAccount;
    if (current) {
      set({ brokerAccount: { ...current, status: "DISCONNECTED", connectedAt: null } });
    }
  },

  updateBrokerBalance: (balance) => {
    const current = get().brokerAccount;
    if (current) {
      set({ brokerAccount: { ...current, balance } });
    }
  },
}),
{
  name: "nse-options-store",
  // Save only core data to localStorage; snapshots, signals, and trades are stored on the server
  partialize: (state) => ({
    selectedSymbol: state.selectedSymbol,
    selectedExpiry: state.selectedExpiry,
    autoRefresh: state.autoRefresh,
    refreshInterval: state.refreshInterval,
    oiThreshold: state.oiThreshold,
    lastUpdated: state.lastUpdated,
    optionChain: state.optionChain,
    spotPrice: state.spotPrice,
    oiSummary: state.oiSummary,
    tradeMode: state.tradeMode,
    pendingSignals: state.pendingSignals,
    brokerAccount: state.brokerAccount,
  }),
}
)
);
