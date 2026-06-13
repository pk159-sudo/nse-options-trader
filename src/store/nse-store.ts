import { create } from "zustand";
import { persist } from "zustand/middleware";

// NIFTY only — multi-symbol support removed

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

const LOT_SIZES: Record<string, number> = { NIFTY: 65 };
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
    lastUpdated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
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
  // selectedSymbol removed — NIFTY only
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

  // setSymbol removed — NIFTY only
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
  closeTrade: (tradeId: string) => void;
  closeAllTrades: () => void;
  connectBroker: (account: BrokerAccount) => void;
  disconnectBroker: () => void;
  updateBrokerBalance: (balance: number) => void;
}

// Reconstruct optionChain state from a saved snapshot (for off-market / expiry-switch viewing)
// Snapshot stores only OI + LTP per strike, so other fields (IV, volume, changeOI) will be 0.
// This is intentional — off-market data is historical, not live.
function reconstructOptionChainFromSnapshot(
  snapshot: OISnapshot,
  symbol: string
): OptionChainState {
  const chainData: OptionData[] = snapshot.strikes.map((s) => ({
    strikePrice: s.strike,
    CE: {
      strikePrice: s.strike,
      openInterest: s.ceOI,
      lastPrice: s.ceLTP,
      expiryDate: snapshot.expiry,
      underlyingValue: snapshot.spotPrice,
      changeinOpenInterest: 0,
      totalTradedVolume: 0,
      impliedVolatility: 0,
      change: 0,
      pChange: 0,
      bidQty: 0,
      bidprice: 0,
      askQty: 0,
      askPrice: 0,
    },
    PE: {
      strikePrice: s.strike,
      openInterest: s.peOI,
      lastPrice: s.peLTP,
      expiryDate: snapshot.expiry,
      underlyingValue: snapshot.spotPrice,
      changeinOpenInterest: 0,
      totalTradedVolume: 0,
      impliedVolatility: 0,
      change: 0,
      pChange: 0,
      bidQty: 0,
      bidprice: 0,
      askQty: 0,
      askPrice: 0,
    },
  }));

  // Basic analysis from snapshot data
  const totalCEOI = chainData.reduce((sum, item) => sum + (item.CE?.openInterest || 0), 0);
  const totalPEOI = chainData.reduce((sum, item) => sum + (item.PE?.openInterest || 0), 0);
  const pcr = totalCEOI > 0 ? totalPEOI / totalCEOI : 0;

  // Max CE/PE OI strikes for support/resistance
  let maxCEOI = { strike: 0, oi: 0 };
  let maxPEOI = { strike: 0, oi: 0 };
  for (const item of chainData) {
    const ceOI = item.CE?.openInterest || 0;
    const peOI = item.PE?.openInterest || 0;
    if (ceOI > maxCEOI.oi) maxCEOI = { strike: item.strikePrice, oi: ceOI };
    if (peOI > maxPEOI.oi) maxPEOI = { strike: item.strikePrice, oi: peOI };
  }

  const atmStrike = Math.round(snapshot.spotPrice / 50) * 50;
  const expiryDate = new Date(snapshot.expiry);
  const today = new Date(new Date().toISOString().split("T")[0]);
  const daysToExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    spotPrice: snapshot.spotPrice,
    timestamp: snapshot.timestamp,
    atmStrike,
    daysToExpiry,
    expiryDates: [],
    selectedExpiry: snapshot.expiry,
    chainData,
    analysis: {
      pcr: Math.round(pcr * 100) / 100,
      maxPain: 0,
      totalCEOI,
      totalPEOI,
      totalCEVolume: 0,
      totalPEVolume: 0,
      maxCEOI,
      maxPEOI,
      maxCEChangeOI: { strike: 0, change: 0 },
      maxPEChangeOI: { strike: 0, change: 0 },
      resistance: maxCEOI.strike,
      support: maxPEOI.strike,
    },
    oiByStrike: chainData.map((item) => ({
      strike: item.strikePrice,
      ceOI: item.CE?.openInterest || 0,
      peOI: item.PE?.openInterest || 0,
      ceChangeOI: 0,
      peChangeOI: 0,
      ceVolume: 0,
      peVolume: 0,
      ceIV: 0,
      peIV: 0,
    })),
  };
}

// Load last snapshot from disk and reconstruct optionChain (off-market / expiry switch)
// Returns true if optionChain was reconstructed, false if no snapshot found
async function loadFromDisk(): Promise<boolean> {
  try {
    const state = useNSEStore.getState();
    if (!state.selectedExpiry) return false;

    // Load disk files (snapshots, signals, trades, delta)
    await Promise.all([
      state.loadSnapshotHistory(),
      state.loadSignalsFromFile(),
      state.loadTradesFromFile(),
      state.loadDeltaFromFile(),
    ]);

    // Get fresh state after disk load
    const updated = useNSEStore.getState();
    if (updated.snapshots.length > 0) {
      const latestSnapshot = updated.snapshots[updated.snapshots.length - 1];
      const reconstructed = reconstructOptionChainFromSnapshot(latestSnapshot, "NIFTY");
      useNSEStore.setState({
        optionChain: reconstructed,
        lastUpdated: new Date(latestSnapshot.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
        spotPrice: latestSnapshot.spotPrice,
        isLoading: false,
      });
      return true;
    }
  } catch {
    // Ignore disk read failures
  }
  return false;
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
  // NIFTY only (selectedSymbol removed)
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

  isMarketOpen: false,
  checkMarketHours: () => {
    set({ isMarketOpen: checkIfMarketOpen() });
  },

  // setSymbol removed — NIFTY only


  setExpiry: async (expiry) => {
    // On expiry change, clear only session data (not trades from other expiries if any)
    set({ selectedExpiry: expiry, optionChain: null, error: null, snapshots: [], oiSummary: null, signals: [], trades: [], snapshotDelta: {}, snapshotDeltaTime: null });
    if (expiry) {
      // Load from disk first. If no data found, allow one NSE fetch
      // to download the latest closing data for this expiry week.
      const loaded = await loadFromDisk();
      if (!loaded) {
        // No disk data for this expiry — trigger one fetch
        await get().fetchOptionChain();
      }
    }
  },

  setAutoRefresh: (val) => set({ autoRefresh: val }),
  setRefreshInterval: (seconds) => set({ refreshInterval: seconds }),
  setOIThreshold: (threshold) => set({ oiThreshold: threshold }),

  fetchExpiryDates: async () => {
    set({ isExpiryLoading: true, error: null });
    try {
      const res = await fetch(`/api/nse/expiry?symbol=NIFTY`);
      const resData = await res.json();
      if (!resData?.expiryDates?.length) throw new Error("Failed to fetch expiry dates from NSE");
      const expiryDates = resData.expiryDates || [];
      set({ expiryDates, isExpiryLoading: false });
      if (expiryDates.length > 0 && !get().selectedExpiry) {
        set({ selectedExpiry: expiryDates[0] });
        // Load from disk. If no data found, trigger one NSE fetch
        // so user sees latest data even when opening off-market.
        const loaded = await loadFromDisk();
        if (!loaded) {
          void get().fetchOptionChain();
        }
      }
    } catch (err: unknown) {
      set({ error: (err as Error).message, isExpiryLoading: false });
    }
  },

  fetchOptionChain: async (forceRefresh = false) => {
    const { selectedExpiry, snapshots, oiThreshold, trades } = get();
    if (!selectedExpiry) return;

    // ===== OFF-MARKET GATE =====
    // Don't fetch from NSE or save snapshots when market is closed.
    // Live market only: 9:15 AM - 3:30 PM IST, Mon-Fri
    //
    // EXCEPTION: If no data exists for current expiry (no snapshots on disk
    // and no optionChain in state), allow ONE fetch from NSE so the user
    // sees the latest closing data instead of an empty screen.
    // This also handles: new expiry week, first-time app open, data wiped.
    if (!checkIfMarketOpen()) {
      const { optionChain, snapshots } = get();
      const hasData = optionChain?.chainData?.length > 0 || snapshots.length > 0;
      if (hasData) return; // Data exists — show cached, no NSE hit
      // No data for this expiry — allow one fetch to get closing data
    }

    // ===== LIVE MARKET: Full flow (fetch + save + calc + scan + exit check) =====
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams({
        symbol: "NIFTY",
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

          snapshotDeltaTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });

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
          lastUpdated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
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
          lastUpdated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
        });
      }
    } catch (err: unknown) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  saveDeltaToFile: async (prevTimestamp: string) => {
    const { selectedExpiry, snapshotDelta, spotPrice } = get();
    if (!selectedExpiry || Object.keys(snapshotDelta).length === 0) return;
    try {
      await fetch("/api/nse/delta-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "NIFTY",
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
    const { selectedExpiry } = get();
    if (!selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/delta-history?symbol=NIFTY&expiry=${encodeURIComponent(selectedExpiry)}`
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
    if (!snapshot.expiry) return null;
    try {
      const resp = await fetch("/api/nse/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "NIFTY",
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
    const { selectedExpiry } = get();
    if (!selectedExpiry) return;
    try {
      const response = await fetch(
          `/api/nse/snapshots?symbol=NIFTY&expiry=${encodeURIComponent(selectedExpiry)}`
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
    const { selectedExpiry } = get();
    const expiry = signal.expiry || selectedExpiry;
    if (!expiry) return;
    try {
      await fetch(`/api/nse/signals?symbol=NIFTY&expiry=${encodeURIComponent(expiry)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      });
    } catch {
      // Ignore write failures
    }
  },

  loadSignalsFromFile: async () => {
    const { selectedExpiry } = get();
    if (!selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/signals?symbol=NIFTY&expiry=${encodeURIComponent(selectedExpiry)}&limit=10`
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
    const { selectedExpiry } = get();
    const expiry = trade.expiry || selectedExpiry;
    if (!expiry) return;
    try {
      await fetch(`/api/nse/trades?symbol=NIFTY&expiry=${encodeURIComponent(expiry)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
    } catch {
      // Ignore write failures
    }
  },

  loadTradesFromFile: async () => {
    const { selectedExpiry } = get();
    if (!selectedExpiry) return;
    try {
      const response = await fetch(
        `/api/nse/trades?symbol=NIFTY&expiry=${encodeURIComponent(selectedExpiry)}&limitClosed=5`
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

    // Update signal status to APPROVED immediately
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

    set({
      signals: updatedSignals,
      pendingSignals: updatedPending,
      trades: [...state.trades, trade],
    });
    void get().saveSignalToFile(updatedSignals.find((s) => s.id === signalId) ?? signal);
    void get().saveTradeToFile(trade);

    // If broker is connected, place real order via API
    if (isBrokerConnected && state.brokerAccount) {
      const acc = state.brokerAccount;
      const symbol = "NIFTY";
      fetch("/api/broker/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: acc.broker,
          accessToken: acc.accessToken,
          apiKey: acc.apiKey,
          apiSecret: acc.apiSecret,
          symbol,
          strikePrice: signal.toStrike,
          optionType: signal.type.includes("CALL") ? "CE" : "PE",
          transactionType: "BUY",
          quantity: LOT_SIZES[symbol] || LOT_SIZE,
          price: signal.entryPrice,
          orderType: "MARKET",
          product: "MIS",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.orderId) {
            // Update the trade with real broker order ID
            const { trades: currentTrades } = get();
            const updatedTrades = currentTrades.map((t) =>
              t.id === trade.id
                ? { ...t, brokerOrderId: data.orderId }
                : t
            );
            // Mark signal as EXECUTED with order ID
            const { signals: currentSignals } = get();
            const finalSignals = currentSignals.map((s) =>
              s.id === signalId ? { ...s, tradeId: trade.id, status: "EXECUTED" as const, brokerOrderId: data.orderId } : s
            );
            set({ trades: updatedTrades, signals: finalSignals });
            console.log(`Real order placed: ${data.orderId} — ${data.message}`);
          } else {
            console.error(`Order placement failed: ${data.error}`);
          }
        })
        .catch((err) => {
          console.error("Failed to place real order:", err);
        });
    }
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

  closeTrade: (tradeId) => {
    const state = get();
    const trade = state.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== "OPEN") return;

    // Get current LTP from option chain for exit price
    const chainData = state.optionChain?.chainData;
    let exitPrice = trade.entryPrice; // fallback to entry if no LTP available
    if (chainData && Array.isArray(chainData)) {
      for (const rawItem of chainData) {
        const item = rawItem as unknown as { strikePrice?: number; CE?: { lastPrice?: number }; PE?: { lastPrice?: number } };
        if (item.strikePrice === trade.strike) {
          exitPrice = trade.signalType === "BULLISH"
            ? (item.CE?.lastPrice || trade.entryPrice)
            : (item.PE?.lastPrice || trade.entryPrice);
          break;
        }
      }
    }

    const pnl = (exitPrice - trade.entryPrice) * LOT_SIZE;
    const profitPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const updatedTrade: Trade = {
      ...trade,
      status: "CLOSED",
      exitPrice,
      pnl,
      highestProfitPct: Math.max(trade.highestProfitPct, profitPct > 0 ? profitPct : 0),
      priceHistory: [...trade.priceHistory, { time: timeStr, price: exitPrice }],
    };

    const updatedTrades = state.trades.map((t) =>
      t.id === tradeId ? updatedTrade : t
    );
    set({ trades: updatedTrades });
    void get().saveTradeToFile(updatedTrade);

    // If real trade with broker, place exit order (SELL)
    if (trade.isRealTrade && trade.brokerName && state.brokerAccount) {
      const acc = state.brokerAccount;
      fetch("/api/broker/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: acc.broker,
          accessToken: acc.accessToken,
          apiKey: acc.apiKey,
          apiSecret: acc.apiSecret,
          symbol: "NIFTY",
          strikePrice: trade.strike,
          optionType: trade.signalType === "BULLISH" ? "CE" : "PE",
          transactionType: "SELL",
          quantity: LOT_SIZES["NIFTY"] || LOT_SIZE,
          price: exitPrice,
          orderType: "MARKET",
          product: "MIS",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            console.log(`Manual close order placed: ${data.orderId}`);
          } else {
            console.error(`Close order failed: ${data.error}`);
          }
        })
        .catch((err) => {
          console.error("Failed to place close order:", err);
        });
    }
  },

  closeAllTrades: () => {
    const state = get();
    const openTrades = state.trades.filter((t) => t.status === "OPEN");
    if (openTrades.length === 0) return;

    // Close each open trade
    for (const trade of openTrades) {
      get().closeTrade(trade.id);
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
    // selectedSymbol removed from persist — NIFTY only
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
