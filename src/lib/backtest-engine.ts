/**
 * NSE Options Backtest Engine
 * Pure TypeScript module — no React, no Next.js dependencies.
 * Reads 1-min CSV data and runs backtests using OI-delta signal logic.
 */

import * as fs from "fs";
import * as path from "path";

// ===== Constants (must match live store exactly) =====
const LOT_SIZE = 65;
const PROFIT_TARGET_PCT = 50;
const INITIAL_STOP_PCT = 15;
const BREAKEVEN_TRIGGER_PCT = 15;
const PROFIT_LOCK_TRIGGER_PCT = 30;
const TRAILING_STOP_PCT = 15;
const TRAILING_STEP2_TRIGGER_PCT = 45;
const TRAILING_STEP2_STOP_PCT = 30;

// ===== Types =====

export interface BacktestConfig {
  intervalMinutes: number; // default 15
  oiThreshold: number; // default 25000
  maxOpenTrades: number; // default 3
}

export interface BacktestTrade {
  id: string;
  date: string;
  time: string;
  signalType: "BULLISH" | "BEARISH";
  strike: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  profitPct: number;
  status: "OPEN" | "CLOSED";
  exitReason: string; // "TARGET" | "STOP_LOSS" | "EOD_CLOSE"
  highestProfitPct: number;
  maxDrawdownPct: number;
  entryTime: string;
  exitTime: string;
  fromStrike: number;
  oiChange: number;
}

export interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgHoldingTime: string;
  dailyPnl: { date: string; pnl: number; cumulativePnl: number }[];
  monthlyBreakdown: {
    month: string;
    trades: number;
    wins: number;
    pnl: number;
    winRate: number;
  }[];
}

export interface BacktestResult {
  stats: BacktestStats;
  trades: BacktestTrade[];
  signalsGenerated: number;
  snapshotsProcessed: number;
  daysProcessed: number;
  config: BacktestConfig;
  processingTimeMs: number;
}

// ===== Internal types =====

interface CSVRow {
  datetime: string;
  strike_label: string;
  option_type: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
  iv: number;
  strike_price: number;
  spot: number;
}

interface SnapshotStrike {
  strike: number;
  ceOI: number;
  peOI: number;
  ceLTP: number;
  peLTP: number;
}

interface Snapshot {
  timestamp: string;
  date: string;
  time: string;
  spotPrice: number;
  strikes: SnapshotStrike[];
}

interface InternalTrade {
  id: string;
  date: string;
  time: string;
  signalType: "BULLISH" | "BEARISH";
  strike: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  profitPct: number;
  status: "OPEN" | "CLOSED";
  exitReason: string;
  highestProfitPct: number;
  maxDrawdownPct: number;
  entryTime: string;
  exitTime: string;
  fromStrike: number;
  oiChange: number;
}

// ===== Helpers =====

function floorToInterval(timeStr: string, intervalMin: number): string {
  // timeStr: "2026-01-02 09:17:00" → floor minutes to interval
  const parts = timeStr.split(" ");
  const timeParts = parts[1].split(":");
  let h = parseInt(timeParts[0], 10);
  const m = parseInt(timeParts[1], 10);
  const flooredM = Math.floor(m / intervalMin) * intervalMin;
  return `${parts[0]} ${String(h).padStart(2, "0")}:${String(flooredM).padStart(2, "0")}:00`;
}

function parseCSVRow(line: string, headers: string[]): CSVRow | null {
  const values = line.split(",");
  if (values.length < headers.length) return null;

  const get = (idx: number): string => values[idx]?.trim() ?? "";
  const getNum = (idx: number): number => {
    const v = parseFloat(values[idx]);
    return isNaN(v) ? 0 : v;
  };

  return {
    datetime: get(0),
    strike_label: get(1),
    option_type: get(2),
    open: getNum(3),
    high: getNum(4),
    low: getNum(5),
    close: getNum(6),
    volume: getNum(7),
    oi: getNum(8),
    iv: getNum(9),
    strike_price: getNum(10),
    spot: getNum(11),
  };
}

function getATM(spotPrice: number): number {
  return Math.round(spotPrice / 50) * 50;
}

function findNearestStrike(
  strikeMap: Map<number, SnapshotStrike>,
  target: number,
  direction: "up" | "down"
): number | null {
  const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
  if (direction === "up") {
    return strikes.find((s) => s >= target) ?? null;
  }
  return strikes.reverse().find((s) => s <= target) ?? null;
}

function getOptionLTP(
  strikeMap: Map<number, SnapshotStrike>,
  strike: number,
  optionType: "CE" | "PE"
): number | null {
  const item = strikeMap.get(strike);
  if (!item) return null;
  return optionType === "CE" ? item.ceLTP : item.peLTP;
}

// ===== CSV Processing =====

function parseCSVFile(filePath: string): { rows: CSVRow[]; date: string } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], date: "" };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseCSVRow(lines[i], headers);
    if (parsed) rows.push(parsed);
  }

  // Extract date from first row
  const date = rows.length > 0 ? rows[0].datetime.split(" ")[0] : path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";

  return { rows, date };
}

function buildSnapshots(rows: CSVRow[], intervalMinutes: number): Snapshot[] {
  // Group rows by floored 15-min interval
  const buckets = new Map<string, CSVRow[]>();

  for (const row of rows) {
    const bucketKey = floorToInterval(row.datetime, intervalMinutes);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(row);
  }

  const snapshots: Snapshot[] = [];

  // Sort bucket keys chronologically
  const sortedKeys = Array.from(buckets.keys()).sort();

  for (const key of sortedKeys) {
    const bucketRows = buckets.get(key)!;
    if (bucketRows.length === 0) continue;

    // Build strike map: for each strike_price, keep the LAST CE row and LAST PE row
    // We iterate in order so the last one wins
    const ceMap = new Map<number, { ltp: number; oi: number }>();
    const peMap = new Map<number, { ltp: number; oi: number }>();
    let spotPrice = 0;

    for (const row of bucketRows) {
      spotPrice = row.spot;
      const strike = row.strike_price;
      if (strike <= 0) continue;

      if (row.option_type === "CALL" || row.option_type === "CE") {
        ceMap.set(strike, { ltp: row.close, oi: row.oi });
      } else if (row.option_type === "PUT" || row.option_type === "PE") {
        peMap.set(strike, { ltp: row.close, oi: row.oi });
      }
    }

    // Merge into strikes array
    const allStrikes = Array.from(new Set([...Array.from(ceMap.keys()), ...Array.from(peMap.keys())]));
    const strikes: SnapshotStrike[] = [];

    for (const strike of allStrikes) {
      const ce = ceMap.get(strike);
      const pe = peMap.get(strike);
      strikes.push({
        strike,
        ceOI: ce?.oi ?? 0,
        peOI: pe?.oi ?? 0,
        ceLTP: ce?.ltp ?? 0,
        peLTP: pe?.ltp ?? 0,
      });
    }

    strikes.sort((a, b) => a.strike - b.strike);

    if (spotPrice > 0 && strikes.length > 0) {
      const timeParts = key.split(" ");
      snapshots.push({
        timestamp: key,
        date: timeParts[0],
        time: timeParts[1] ?? "",
        spotPrice,
        strikes,
      });
    }
  }

  return snapshots;
}

// ===== Signal Scanning (matches scanSignalsImproved from nse-store.ts) =====

function scanSignals(
  prevSnapshot: Snapshot | null,
  currentSnapshot: Snapshot,
  threshold: number
): { signalType: "BULLISH" | "BEARISH"; fromStrike: number; toStrike: number; entryPrice: number; oiChange: number } | null {
  if (!prevSnapshot) return null;

  const spotPrice = currentSnapshot.spotPrice;
  const atm = getATM(spotPrice);

  // Build prev OI map
  const prevMap = new Map<number, { ceOI: number; peOI: number }>();
  for (const s of prevSnapshot.strikes) {
    prevMap.set(s.strike, { ceOI: s.ceOI, peOI: s.peOI });
  }

  // Build current map with OI and LTP
  const currentMap = new Map<number, SnapshotStrike>();
  for (const s of currentSnapshot.strikes) {
    currentMap.set(s.strike, s);
  }

  // Calculate OI changes
  const oiChanges: {
    strike: number;
    ceChange: number;
    peChange: number;
  }[] = [];

  for (const [strike, curr] of Array.from(currentMap.entries())) {
    const prev = prevMap.get(strike);
    if (!prev) continue;
    const ceChange = curr.ceOI - prev.ceOI;
    const peChange = curr.peOI - prev.peOI;
    oiChanges.push({ strike, ceChange, peChange });
  }

  // Filter to ATM ± 200
  const relevant = oiChanges.filter(
    (c) => c.strike >= atm - 200 && c.strike <= atm + 200
  );

  // BULLISH candidates: CE OI DECREASED by > threshold → CALL BUY at strike+200
  const callCandidates = relevant
    .filter((c) => c.ceChange < -threshold)
    .map((c) => {
      const toStrike = findNearestStrike(currentMap, c.strike + 200, "up");
      const entryPrice = toStrike ? getOptionLTP(currentMap, toStrike, "CE") : null;
      return toStrike && entryPrice && entryPrice > 0
        ? {
            type: "BULLISH" as const,
            fromStrike: c.strike,
            toStrike,
            change: Math.abs(c.ceChange),
            entryPrice,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // BEARISH candidates: PE OI DECREASED by > threshold → PUT BUY at strike-200
  const putCandidates = relevant
    .filter((c) => c.peChange < -threshold)
    .map((c) => {
      const toStrike = findNearestStrike(currentMap, c.strike - 200, "down");
      const entryPrice = toStrike ? getOptionLTP(currentMap, toStrike, "PE") : null;
      return toStrike && entryPrice && entryPrice > 0
        ? {
            type: "BEARISH" as const,
            fromStrike: c.strike,
            toStrike,
            change: Math.abs(c.peChange),
            entryPrice,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const candidates = [...callCandidates, ...putCandidates];
  if (candidates.length === 0) return null;

  // Pick best candidate (highest OI change magnitude)
  candidates.sort((a, b) => b.change - a.change);
  const best = candidates[0];

  return {
    signalType: best.type,
    fromStrike: best.fromStrike,
    toStrike: best.toStrike,
    entryPrice: best.entryPrice,
    oiChange: best.change,
  };
}

// ===== Exit Conditions (matches checkExitConditions from nse-store.ts) =====

function checkExits(
  trade: InternalTrade,
  currentSnapshot: Snapshot
): { closed: boolean; exitPrice: number; exitReason: string } {
  const strikeData = currentSnapshot.strikes.find((s) => s.strike === trade.strike);
  if (!strikeData) return { closed: false, exitPrice: 0, exitReason: "" };

  // BULLISH = CALL BUY → track CE LTP
  // BEARISH = PUT BUY → track PE LTP
  const currentPrice =
    trade.signalType === "BULLISH" ? strikeData.ceLTP : strikeData.peLTP;
  if (currentPrice <= 0) return { closed: false, exitPrice: 0, exitReason: "" };

  const entry = trade.entryPrice;
  const profitPct = ((currentPrice - entry) / entry) * 100;

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
    trade.pnl = (currentPrice - entry) * LOT_SIZE;
    trade.profitPct = profitPct;
    trade.status = "CLOSED";
    trade.exitReason = "TARGET";
    trade.exitTime = currentSnapshot.time;
    return { closed: true, exitPrice: currentPrice, exitReason: "TARGET" };
  }

  // 2. Trailing stop loss ladder
  let stopPrice: number;
  if (trade.highestProfitPct >= TRAILING_STEP2_TRIGGER_PCT) {
    // Step 4: Lock 30% profit after 45% gain
    stopPrice = entry * (1 + TRAILING_STEP2_STOP_PCT / 100);
  } else if (trade.highestProfitPct >= PROFIT_LOCK_TRIGGER_PCT) {
    // Step 3: Lock 15% profit after 30% gain
    stopPrice = entry * (1 + TRAILING_STOP_PCT / 100);
  } else if (trade.highestProfitPct >= BREAKEVEN_TRIGGER_PCT) {
    // Step 2: Move stop to breakeven after 15% gain
    stopPrice = entry;
  } else {
    // Step 1: Initial stop loss 15% below entry
    stopPrice = entry * (1 - INITIAL_STOP_PCT / 100);
  }

  // Check if stop triggered (buy position → price drops below stop)
  if (currentPrice <= stopPrice) {
    trade.exitPrice = currentPrice;
    trade.pnl = (currentPrice - entry) * LOT_SIZE;
    trade.profitPct = profitPct;
    trade.status = "CLOSED";
    trade.exitReason = "STOP_LOSS";
    trade.exitTime = currentSnapshot.time;
    return { closed: true, exitPrice: currentPrice, exitReason: "STOP_LOSS" };
  }

  return { closed: false, exitPrice: currentPrice, exitReason: "" };
}

// ===== Stats Computation =====

function computeStats(trades: BacktestTrade[]): BacktestStats {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);
  const totalTrades = closedTrades.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const maxWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
  const maxLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let cumulative = 0;

  for (const t of closedTrades) {
    cumulative += t.pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    }
  }

  // Average holding time
  let totalHoldingMinutes = 0;
  for (const t of closedTrades) {
    try {
      const entryDate = new Date(`${t.date}T${t.entryTime}`);
      const exitDate = new Date(`${t.date}T${t.exitTime}`);
      if (!isNaN(entryDate.getTime()) && !isNaN(exitDate.getTime())) {
        totalHoldingMinutes += (exitDate.getTime() - entryDate.getTime()) / 60000;
      }
    } catch {
      // skip
    }
  }
  const avgMinutes = totalTrades > 0 ? totalHoldingMinutes / totalTrades : 0;
  let avgHoldingTime = "";
  if (avgMinutes >= 60) {
    avgHoldingTime = `${Math.floor(avgMinutes / 60)}h ${Math.round(avgMinutes % 60)}m`;
  } else {
    avgHoldingTime = `${Math.round(avgMinutes)}m`;
  }

  // Daily PnL
  const dailyMap = new Map<string, number>();
  for (const t of closedTrades) {
    dailyMap.set(t.date, (dailyMap.get(t.date) ?? 0) + t.pnl);
  }
  const dailyPnl: { date: string; pnl: number; cumulativePnl: number }[] = [];
  let cumPnl = 0;
  const sortedDates = Array.from(dailyMap.keys()).sort();
  for (const d of sortedDates) {
    cumPnl += dailyMap.get(d)!;
    dailyPnl.push({ date: d, pnl: dailyMap.get(d)!, cumulativePnl: cumPnl });
  }

  // Monthly breakdown
  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of closedTrades) {
    const month = t.date.substring(0, 7); // "2026-01"
    const entry = monthlyMap.get(month) ?? { trades: 0, wins: 0, pnl: 0 };
    entry.trades++;
    if (t.pnl > 0) entry.wins++;
    entry.pnl += t.pnl;
    monthlyMap.set(month, entry);
  }
  const monthlyBreakdown: BacktestStats["monthlyBreakdown"] = [];
  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  for (const m of sortedMonths) {
    const data = monthlyMap.get(m)!;
    monthlyBreakdown.push({
      month: m,
      trades: data.trades,
      wins: data.wins,
      pnl: data.pnl,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    });
  }

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalPnl,
    avgWin,
    avgLoss,
    maxWin,
    maxLoss,
    profitFactor,
    maxDrawdown,
    maxDrawdownPct,
    avgHoldingTime,
    dailyPnl,
    monthlyBreakdown,
  };
}

// ===== Main Backtest Runner =====

export async function runBacktest(
  csvDir: string,
  config?: Partial<BacktestConfig>
): Promise<BacktestResult> {
  const startTime = Date.now();

  const cfg: BacktestConfig = {
    intervalMinutes: config?.intervalMinutes ?? 15,
    oiThreshold: config?.oiThreshold ?? 25000,
    maxOpenTrades: config?.maxOpenTrades ?? 3,
  };

  // Read all CSV files, sorted by date
  const files = fs
    .readdirSync(csvDir)
    .filter((f) => f.endsWith(".csv"))
    .sort();

  const allTrades: InternalTrade[] = [];
  let signalsGenerated = 0;
  let snapshotsProcessed = 0;
  let daysProcessed = 0;

  // Process file by file (day by day)
  for (const file of files) {
    const filePath = path.join(csvDir, file);
    const { rows, date } = parseCSVFile(filePath);
    if (rows.length === 0) continue;

    daysProcessed++;

    // Build 15-min snapshots for this day
    const daySnapshots = buildSnapshots(rows, cfg.intervalMinutes);
    snapshotsProcessed += daySnapshots.length;

    // Open trades reset each day (we close all at EOD)
    let openTrades: InternalTrade[] = [];
    let prevSnapshot: Snapshot | null = null;

    for (let si = 0; si < daySnapshots.length; si++) {
      const snapshot = daySnapshots[si];

      // Check exit conditions on all open trades
      const stillOpen: InternalTrade[] = [];
      for (const trade of openTrades) {
        const result = checkExits(trade, snapshot);
        if (result.closed) {
          allTrades.push(trade);
        } else {
          stillOpen.push(trade);
        }
      }
      openTrades = stillOpen;

      // Generate signals (only if we have a previous snapshot and capacity)
      if (prevSnapshot && openTrades.length < cfg.maxOpenTrades) {
        const signal = scanSignals(prevSnapshot, snapshot, cfg.oiThreshold);

        if (signal) {
          signalsGenerated++;

          // Check we're not exceeding max open trades
          if (openTrades.length < cfg.maxOpenTrades) {
            const newTrade: InternalTrade = {
              id: `bt-${date}-${signal.signalType.toLowerCase()}-${signal.toStrike}`,
              date,
              time: snapshot.time,
              signalType: signal.signalType,
              strike: signal.toStrike,
              entryPrice: signal.entryPrice,
              exitPrice: 0,
              pnl: 0,
              profitPct: 0,
              status: "OPEN",
              exitReason: "",
              highestProfitPct: 0,
              maxDrawdownPct: 0,
              entryTime: snapshot.time,
              exitTime: "",
              fromStrike: signal.fromStrike,
              oiChange: signal.oiChange,
            };
            openTrades.push(newTrade);
          }
        }
      }

      prevSnapshot = snapshot;
    }

    // EOD: close all remaining open trades
    for (const trade of openTrades) {
      if (trade.status === "OPEN" && daySnapshots.length > 0) {
        const lastSnapshot = daySnapshots[daySnapshots.length - 1];
        const strikeData = lastSnapshot.strikes.find(
          (s) => s.strike === trade.strike
        );
        const exitPrice = strikeData
          ? trade.signalType === "BULLISH"
            ? strikeData.ceLTP
            : strikeData.peLTP
          : trade.entryPrice;

        trade.exitPrice = exitPrice > 0 ? exitPrice : trade.entryPrice;
        trade.pnl = (trade.exitPrice - trade.entryPrice) * LOT_SIZE;
        trade.profitPct =
          trade.entryPrice > 0
            ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
            : 0;
        trade.status = "CLOSED";
        trade.exitReason = "EOD_CLOSE";
        trade.exitTime = lastSnapshot.time;
        allTrades.push(trade);
      }
    }
  }

  // Convert to output format
  const outputTrades: BacktestTrade[] = allTrades.map((t) => ({
    id: t.id,
    date: t.date,
    time: t.time,
    signalType: t.signalType,
    strike: t.strike,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    pnl: t.pnl,
    profitPct: t.profitPct,
    status: t.status,
    exitReason: t.exitReason,
    highestProfitPct: t.highestProfitPct,
    maxDrawdownPct: t.maxDrawdownPct,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    fromStrike: t.fromStrike,
    oiChange: t.oiChange,
  }));

  const stats = computeStats(outputTrades);

  return {
    stats,
    trades: outputTrades,
    signalsGenerated,
    snapshotsProcessed,
    daysProcessed,
    config: cfg,
    processingTimeMs: Date.now() - startTime,
  };
}