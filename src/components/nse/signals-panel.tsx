"use client";

import { useMemo } from "react";
import { useNSEStore, Trade, OptionData } from "@/store/nse-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Trophy,
  Clock,
  AlertTriangle,
  Shield,
  Flame,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Timer,
  BarChart3,
  Crosshair,
  Activity,
  Wallet,
  XCircle,
  Square,
  Calendar,
} from "lucide-react";

const LOT_SIZE = 65;

function formatRs(n: number): string {
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function timeSince(timeStr: string): string {
  try {
    const tradeTime = new Date(`1970-01-01T${timeStr}`);
    if (isNaN(tradeTime.getTime())) return "";
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const tradeMinutes = tradeTime.getHours() * 60 + tradeTime.getMinutes();
    const diff = currentMinutes - tradeMinutes;
    if (diff < 0) return "";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h ${m}m ago`;
  } catch {
    return "";
  }
}

function formatCreatedAt(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function SmartTradeCard({
  trade,
  currentLTP,
  onClose,
}: {
  trade: Trade;
  currentLTP: number;
  onClose?: () => void;
}) {
  const isBullish = trade.signalType === "BULLISH";
  const isOpen = trade.status === "OPEN";
  const optionLabel = isBullish ? "CE" : "PE";
  const tradeAction = isBullish ? "CALL BUY" : "PUT BUY";

  let liveProfitPct = 0;
  let livePnl = 0;
  let currentPrice = trade.exitPrice || 0;

  if (isOpen && currentLTP > 0) {
    currentPrice = currentLTP;
    liveProfitPct = ((currentLTP - trade.entryPrice) / trade.entryPrice) * 100;
    livePnl = (currentLTP - trade.entryPrice) * LOT_SIZE;
  } else if (!isOpen) {
    liveProfitPct = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    livePnl = trade.pnl;
  }

  const isProfit = livePnl > 0;
  const pnlColor = livePnl > 0 ? "text-emerald-400" : livePnl < 0 ? "text-red-400" : "t-text-4";
  const pnlBg = livePnl > 0 ? "bg-emerald-500/10 border-emerald-500/20" : livePnl < 0 ? "bg-red-500/10 border-red-500/20" : "t-bg-hover t-border-sub border";

  const stopPct = isOpen ? (Math.abs(currentPrice - trade.currentStop) / trade.entryPrice) * 100 : 0;
  const progressPct = Math.min(100, Math.max(0, (liveProfitPct / 50) * 100));

  // Ladder system: 3-step trailing SL (based on highestProfitPct — same logic as store)
  // Step 1: Init SL = -15% below entry (default, always active at start)
  // Step 2: When peak profit >= 15% → SL moves to Breakeven
  // Step 3: When peak profit >= 30% → SL moves to +15% profit lock
  // Target: 50% → Exit
  const peak = trade.highestProfitPct;
  const maxDrawdown = trade.maxDrawdownPct;
  const ladderSteps = [
    { label: "SL -15%", sub: "Initial", trigger: 0, slLabel: "-15% SL", reached: true, current: peak < 15 },
    { label: "BE", sub: "Breakeven", trigger: 15, slLabel: "Entry = SL", reached: peak >= 15, current: peak >= 15 && peak < 30 },
    { label: "Lock +15%", sub: "Profit Lock", trigger: 30, slLabel: "+15% SL", reached: peak >= 30, current: peak >= 30 && peak < 50 },
    { label: "Target", sub: "50% Exit", trigger: 50, slLabel: "Full Exit", reached: peak >= 50, current: peak >= 50 },
  ];
  const currentLadderIndex = ladderSteps.findIndex((s) => s.current);

  return (
    <div className={`border rounded-xl overflow-hidden ${isOpen ? pnlBg : "t-bg-subtle t-border-sub/50 border"}`}>
      <div className={`h-0.5 ${isOpen ? (isProfit ? "bg-emerald-500" : "bg-red-500") : (trade.pnl > 0 ? "bg-emerald-500/50" : "bg-red-500/50")}`} />
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${isBullish ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {isBullish ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {isBullish ? "BULL" : "BEAR"}
            </div>
            <span className="text-sm font-bold t-text-2 font-mono">{trade.strike}</span>
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${isBullish ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{optionLabel}</span>
            <span className={`text-[11px] t-text-5 font-semibold px-1.5 py-0.5 rounded ${isBullish ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{tradeAction}</span>
            <span className="text-[11px] t-text-4 font-semibold uppercase tracking-[0.08em]">EXP {trade.expiry}</span>
          </div>
          <div className="text-right">
            <span className={`text-base font-bold font-mono ${pnlColor}`}>
              {livePnl > 0 ? "+" : ""}{formatRs(livePnl)}₹
            </span>
            <span className={`ml-1.5 text-[11px] font-bold ${pnlColor}`}>
              ({liveProfitPct > 0 ? "+" : ""}{liveProfitPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="t-text-5">Entry:</span>
            <span className="font-mono t-text-3">₹{trade.entryPrice.toFixed(2)}</span>
          </div>
          {isOpen && currentLTP > 0 && (
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-amber-400" />
              <span className="t-text-5">LTP:</span>
              <span className={`font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`}>₹{currentLTP.toFixed(2)}</span>
            </div>
          )}
          {!isOpen && (
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 t-text-5" />
              <span className="t-text-5">Exit:</span>
              <span className="font-mono t-text-3">₹{trade.exitPrice.toFixed(2)}</span>
            </div>
          )}
        </div>

        {isOpen && (
          <>
            {/* Ladder Target Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="t-text-4 font-semibold flex items-center gap-1">
                  <Target className="h-3 w-3 text-amber-400" />
                  Ladder Target 50%
                </span>
                <span className={`font-bold ${progressPct >= 100 ? "text-emerald-400" : progressPct >= 50 ? "text-amber-400" : "t-text-4"}`}>
                  {progressPct.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={progressPct}
                className={`h-2 ${progressPct >= 100 ? "[&>div]:bg-emerald-500" : progressPct >= 50 ? "[&>div]:bg-amber-500" : progressPct >= 25 ? "[&>div]:bg-yellow-600" : "[&>div]:t-text-6"}`}
              />
            </div>

            {/* Ladder Steps */}
            <div className="flex items-center gap-1">
              {ladderSteps.map((step, i) => {
                const isReached = step.reached && !step.current;
                const isCurrent = step.current;
                const isPending = !step.reached && !step.current;
                return (
                  <div key={step.label} className="flex items-center gap-1 flex-1">
                    <div className={`flex-1 text-center py-1.5 px-1 rounded-md border text-[10px] font-bold transition-all ${
                      isCurrent
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30"
                        : isReached
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                          : "t-bg-hover t-border-sub/20 border t-text-7"
                    }`}>
                      <div className="flex items-center justify-center gap-0.5">
                        {isReached && <span className="text-emerald-400">✓</span>}
                        {isCurrent && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                        {isPending && <span className="t-text-7">○</span>}
                        <span>{step.label}</span>
                      </div>
                      <div className={`text-[8px] mt-0.5 font-medium ${isCurrent ? "text-amber-400/70" : isReached ? "text-emerald-400/60" : "t-text-7"}`}>
                        {step.sub}
                      </div>
                    </div>
                    {i < ladderSteps.length - 1 && (
                      <div className={`w-3 h-0.5 rounded-full ${step.reached ? "bg-emerald-500/50" : "bg-gray-700/30"}`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* SL + Peak + Drawdown + Time */}
            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <div className="flex items-center gap-3">
                <span className="t-text-4 font-medium flex items-center gap-1">
                  <Shield className="h-3 w-3 text-red-400" />
                  SL: <span className="font-mono text-red-400 font-bold">₹{trade.currentStop.toFixed(2)}</span>
                </span>
                {peak > 0 && (
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <Flame className="h-3 w-3" />
                    Peak: {peak.toFixed(1)}%
                  </span>
                )}
                {maxDrawdown > 0 && (
                  <span className="text-red-400/70 flex items-center gap-0.5">
                    DD: {maxDrawdown.toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="t-text-5 flex items-center gap-0.5">
                <Timer className="h-3 w-3" />
                {timeSince(trade.time)}
              </span>
            </div>
          </>
        )}

        {isOpen && onClose && (
          <button
            onClick={onClose}
            className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors text-[11px] font-bold cursor-pointer"
          >
            <XCircle className="h-3.5 w-3.5" />
            Manually Close
          </button>
        )}

        {!isOpen && (
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full font-bold ${trade.pnl > 0 ? "bg-emerald-500/15 text-emerald-400" : trade.pnl < 0 ? "bg-red-500/15 text-red-400" : "t-text-7 t-text-4"}`}>
                {trade.pnl > 0 ? "WIN" : trade.pnl < 0 ? "LOSS" : "BE"}
              </span>
              {trade.createdAt && (
                <span className="t-text-4 font-medium flex items-center gap-0.5">
                  <Calendar className="h-3 w-3" />
                  {formatCreatedAt(trade.createdAt)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="t-text-4 font-medium flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                {trade.time}
              </span>
              {trade.exitPrice > 0 && trade.priceHistory.length > 1 && (
                <span className="t-text-4 font-medium flex items-center gap-0.5">
                  <ArrowDownRight className="h-3 w-3 text-red-400" />
                  {trade.priceHistory[trade.priceHistory.length - 1]?.time || ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalCard({ signal, linkedTrade }: {
  signal: ReturnType<typeof useNSEStore.getState>["signals"][0];
  linkedTrade: ReturnType<typeof useNSEStore.getState>["trades"][0] | undefined;
}) {
  const isBullish = signal.type === "BULLISH";
  const optionType = isBullish ? "CALL BUY" : "PUT BUY";
  const optionLabel = isBullish ? "CE" : "PE";
  const color = isBullish ? "text-emerald-400" : "text-red-400";
  const borderColor = isBullish ? "border-l-emerald-500" : "border-l-red-500";
  const bgColor = isBullish ? "bg-emerald-500/5" : "bg-red-500/5";
  const strengthColor =
    signal.strength >= 80
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : signal.strength >= 60
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "t-text-4 t-bg-hover t-border-sub border";

  let tradeOutcome: { pnl: number; profitPct: number; status: string } | null = null;
  if (linkedTrade) {
    const entry = linkedTrade.entryPrice;
    if (linkedTrade.status === "CLOSED") {
      const profitPct = ((linkedTrade.exitPrice - entry) / entry) * 100;
      tradeOutcome = { pnl: linkedTrade.pnl, profitPct, status: "CLOSED" };
    } else {
      const lastPrice = linkedTrade.priceHistory.length > 0
        ? linkedTrade.priceHistory[linkedTrade.priceHistory.length - 1].price
        : entry;
      const profitPct = ((lastPrice - entry) / entry) * 100;
      const unrealizedPnl = (lastPrice - entry) * LOT_SIZE;
      tradeOutcome = { pnl: unrealizedPnl, profitPct, status: "OPEN" };
    }
  }

  return (
    <div className={`border-l-2 ${borderColor} ${bgColor} t-border-main border rounded-lg p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${color}`}>
            {isBullish ? "BULLISH" : "BEARISH"}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBullish ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {optionType}
          </span>
          <span className="text-[11px] t-text-4 font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {signal.time}
          </span>
          {signal.createdAt && (
            <span className="text-[11px] t-text-4 font-medium flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {formatCreatedAt(signal.createdAt)}
            </span>
          )}
          {signal.expiry && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
              {signal.expiry}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${strengthColor}`}>
            {signal.strength}%
          </div>
          {signal.executed && linkedTrade && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              linkedTrade.status === "OPEN"
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse"
                : linkedTrade.pnl > 0
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {linkedTrade.status === "OPEN" ? "LIVE" : linkedTrade.pnl > 0 ? "WIN" : "LOSS"}
            </span>
          )}
          {signal.skipReason && (
            <span className="text-[9px] t-text-6 t-bg-hover px-2 py-0.5 rounded-full t-border-sub border" title={signal.skipReason}>
              SKIP
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-bold t-text-2 font-mono">
          {signal.fromStrike} - {signal.toStrike}
        </div>
        <span className={`text-[11px] font-bold ${isBullish ? "text-emerald-400" : "text-red-400"}`}>
          {optionLabel} @{signal.toStrike}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="t-text-4 font-mono">
          Entry: ₹{signal.entryPrice.toFixed(2)}
        </span>
        <span className="text-[10px] t-text-5 max-w-[180px] truncate">{signal.reason}</span>
      </div>
      {signal.oiChange && (
        <div className="text-[10px] t-text-5 flex items-center gap-1">
          <BarChart3 className="h-3 w-3" />
          OI Change: {formatRs(signal.oiChange)}
        </div>
      )}
      {tradeOutcome && linkedTrade && (
        <div className={`mt-1 pt-2 t-border-main border-t ${
          tradeOutcome.pnl > 0 ? "bg-emerald-500/5" : tradeOutcome.pnl < 0 ? "bg-red-500/5" : ""
        } rounded px-2 py-1.5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="t-text-5">
                {tradeOutcome.status === "OPEN" ? "Current" : "Exit"}: ₹{(
                  tradeOutcome.status === "OPEN"
                    ? linkedTrade.priceHistory[linkedTrade.priceHistory.length - 1]?.price || signal.entryPrice
                    : linkedTrade.exitPrice
                  ).toFixed(2)}
              </span>
              {linkedTrade.highestProfitPct > 0 && (
                <span className="text-amber-400/70 flex items-center gap-0.5">
                  <Flame className="h-2.5 w-2.5" />
                  Peak: {linkedTrade.highestProfitPct.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold font-mono ${
                tradeOutcome.pnl > 0 ? "text-emerald-400" : tradeOutcome.pnl < 0 ? "text-red-400" : "t-text-4"
              }`}>
                {tradeOutcome.pnl > 0 ? "+" : ""}{formatRs(tradeOutcome.pnl)}₹
              </span>
              <span className={`text-[10px] font-bold ${
                tradeOutcome.pnl > 0 ? "text-emerald-400" : tradeOutcome.pnl < 0 ? "text-red-400" : "t-text-4"
              }`}>
                ({tradeOutcome.profitPct > 0 ? "+" : ""}{tradeOutcome.profitPct.toFixed(1)}%)
              </span>
            </div>
          </div>
          {tradeOutcome.status === "OPEN" && (
            <div className="mt-1.5">
              <Progress
                value={Math.min(100, Math.max(0, (tradeOutcome.profitPct / 50) * 100))}
                className={`h-1 ${tradeOutcome.profitPct >= 50 ? "[&>div]:bg-emerald-500" : tradeOutcome.profitPct >= 25 ? "[&>div]:bg-amber-500" : "[&>div]:t-text-6"}`}
              />
              <div className="flex items-center justify-between text-[9px] mt-0.5">
                <span className="t-text-6">SL: ₹{linkedTrade.currentStop.toFixed(2)}</span>
                <span className="t-text-6">Target: 50%</span>
              </div>
            </div>
          )}
          {tradeOutcome.status === "CLOSED" && (
            <div className="flex items-center gap-2 mt-1 text-[9px] t-text-5">
              <span>Entry: ₹{linkedTrade.entryPrice.toFixed(2)}</span>
              <span>-</span>
              <span>Exit: ₹{linkedTrade.exitPrice.toFixed(2)}</span>
              <span className={linkedTrade.maxDrawdownPct > 0 ? "text-red-400/70" : "t-text-6"}>
                DD: {linkedTrade.maxDrawdownPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PerformanceStats({ trades, unrealizedPnl }: { trades: Trade[]; unrealizedPnl: number }) {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");

  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);
  const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const totalWinPnl = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLossPnl = losses.reduce((s, t) => s + t.pnl, 0);
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const bestTrade = closedTrades.length > 0
    ? closedTrades.reduce((best, t) => t.pnl > best.pnl ? t : best, closedTrades[0])
    : null;
  const worstTrade = closedTrades.length > 0
    ? closedTrades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, closedTrades[0])
    : null;

  let currentStreakCount = 0;
  let currentStreakType: "WIN" | "LOSS" | "" = "";
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const t = closedTrades[i];
    if (t.pnl > 0 && (currentStreakType === "WIN" || currentStreakType === "")) {
      currentStreakCount++;
      currentStreakType = "WIN";
    } else if (t.pnl <= 0 && (currentStreakType === "LOSS" || currentStreakType === "")) {
      currentStreakCount++;
      currentStreakType = "LOSS";
    } else {
      break;
    }
  }

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let runningStreak = 0;
  let runningType: "WIN" | "LOSS" | "" = "";

  for (const t of closedTrades) {
    const outcome = t.pnl > 0 ? "WIN" : "LOSS";
    if (outcome === runningType) {
      runningStreak++;
    } else {
      if (runningType === "WIN") longestWinStreak = Math.max(longestWinStreak, runningStreak);
      if (runningType === "LOSS") longestLossStreak = Math.max(longestLossStreak, runningStreak);
      runningType = outcome;
      runningStreak = 1;
    }
  }

  if (runningType === "WIN") longestWinStreak = Math.max(longestWinStreak, runningStreak);
  if (runningType === "LOSS") longestLossStreak = Math.max(longestLossStreak, runningStreak);

  const combinedPnl = totalPnl + unrealizedPnl;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Realized</p>
          <p className={`text-lg font-bold mt-0.5 font-mono ${totalPnl > 0 ? "text-emerald-400" : totalPnl < 0 ? "text-red-400" : "t-text-4"}`}>
            {totalPnl > 0 ? "+" : ""}{formatRs(totalPnl)}
          </p>
          <p className="text-[9px] t-text-6">₹ closed</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Unrealized</p>
          <p className={`text-lg font-bold mt-0.5 font-mono ${unrealizedPnl > 0 ? "text-emerald-400" : unrealizedPnl < 0 ? "text-red-400" : "t-text-4"}`}>
            {unrealizedPnl > 0 ? "+" : ""}{formatRs(unrealizedPnl)}
          </p>
          <p className="text-[9px] t-text-6">₹ open</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Total P&L</p>
          <p className={`text-lg font-bold mt-0.5 font-mono ${combinedPnl > 0 ? "text-emerald-400" : combinedPnl < 0 ? "text-red-400" : "t-text-4"}`}>
            {combinedPnl > 0 ? "+" : ""}{formatRs(combinedPnl)}
          </p>
          <p className="text-[9px] t-text-6">₹ combined</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Max Profit</p>
          <p className="text-lg font-bold mt-0.5 font-mono text-emerald-400">
            {bestTrade ? `+${formatRs(bestTrade.pnl)}` : "-"}
          </p>
          <p className="text-[9px] t-text-6">best closed</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Max Loss</p>
          <p className="text-lg font-bold mt-0.5 font-mono text-red-400">
            {worstTrade ? `${formatRs(worstTrade.pnl)}` : "-"}
          </p>
          <p className="text-[9px] t-text-6">worst closed</p>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Win Rate</p>
          <p className={`text-lg font-bold mt-0.5 font-mono ${winRate >= 50 ? "text-emerald-400" : winRate > 0 ? "text-red-400" : "t-text-5"}`}>
            {winRate.toFixed(0)}%
          </p>
          <p className="text-[9px] t-text-6">{wins.length}W / {losses.length}L</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Current Streak</p>
          <p className={`text-lg font-bold mt-0.5 font-mono ${currentStreakType === "WIN" ? "text-emerald-400" : currentStreakType === "LOSS" ? "text-red-400" : "t-text-5"}`}>
            {currentStreakCount > 0 ? `${currentStreakCount}${currentStreakType === "WIN" ? "W" : "L"}` : "-"}
          </p>
          <p className="text-[9px] t-text-6">latest closed</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Longest Win Streak</p>
          <p className="text-lg font-bold mt-0.5 font-mono text-emerald-400">
            {longestWinStreak || "-"}
          </p>
          <p className="text-[9px] t-text-6">historical</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Longest Loss Streak</p>
          <p className="text-lg font-bold mt-0.5 font-mono text-red-400">
            {longestLossStreak || "-"}
          </p>
          <p className="text-[9px] t-text-6">historical</p>
        </div>
        <div className="t-bg-muted rounded-xl p-3 text-center">
          <p className="text-[9px] t-text-5 uppercase tracking-wider">Open</p>
          <p className="text-lg font-bold mt-0.5 text-amber-400 font-mono">
            {openTrades.length}
          </p>
          <p className="text-[9px] t-text-6">active</p>
        </div>
      </div>

      {closedTrades.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="t-bg-subtle rounded-lg p-2.5 text-center t-border-sub/30 border">
            <div className="flex items-center justify-center gap-1">
              <Trophy className="h-3 w-3 text-amber-400" />
              <span className="text-[9px] t-text-5">Profit Factor</span>
            </div>
            <p className={`text-sm font-bold font-mono mt-0.5 ${profitFactor >= 1.5 ? "text-emerald-400" : profitFactor > 0 ? "text-amber-400" : "t-text-5"}`}>
              {profitFactor === Infinity ? "INF" : profitFactor > 0 ? profitFactor.toFixed(2) : "-"}
            </p>
          </div>
          <div className="t-bg-subtle rounded-lg p-2.5 text-center t-border-sub/30 border">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[9px] t-text-5">Avg Win</span>
            </div>
            <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
              +{formatRs(avgWin)}
            </p>
          </div>
          <div className="t-bg-subtle rounded-lg p-2.5 text-center t-border-sub/30 border">
            <div className="flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-400" />
              <span className="text-[9px] t-text-5">Avg Loss</span>
            </div>
            <p className="text-sm font-bold text-red-400 font-mono mt-0.5">
              -{formatRs(avgLoss)}
            </p>
          </div>
          <div className="t-bg-subtle rounded-lg p-2.5 text-center t-border-sub/30 border">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-3 w-3 text-amber-400" />
              <span className="text-[9px] t-text-5">Streak</span>
            </div>
            <p className={`text-sm font-bold font-mono mt-0.5 ${currentStreakType === "WIN" ? "text-emerald-400" : currentStreakType === "LOSS" ? "text-red-400" : "t-text-5"}`}>
              {currentStreakCount > 0 ? `${currentStreakCount}${currentStreakType === "WIN" ? "W" : "L"}` : "-"}
            </p>
          </div>
        </div>
      )}

      {bestTrade && (
        <div className="flex gap-2">
          <div className="flex-1 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
            <div className="flex items-center gap-1 text-[9px] text-emerald-400/70 mb-1">
              <Trophy className="h-2.5 w-2.5" /> Best Trade
            </div>
            <p className="text-xs font-bold text-emerald-400 font-mono">
              {bestTrade.strike} {bestTrade.signalType === "BULLISH" ? "CALL" : "PUT"} → +{formatRs(bestTrade.pnl)}₹
            </p>
          </div>
          {worstTrade && worstTrade.pnl < bestTrade.pnl && (
            <div className="flex-1 bg-red-500/5 border border-red-500/10 rounded-lg p-2">
              <div className="flex items-center gap-1 text-[9px] text-red-400/70 mb-1">
                <AlertTriangle className="h-2.5 w-2.5" /> Worst Trade
              </div>
              <p className="text-xs font-bold text-red-400 font-mono">
                {worstTrade.strike} {worstTrade.signalType === "BULLISH" ? "CALL" : "PUT"} → {formatRs(worstTrade.pnl)}₹
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignalsPanel() {
  const { signals, trades, oiThreshold, setOIThreshold, snapshots, optionChain, closeTrade, closeAllTrades } = useNSEStore();

  const openTrades = trades.filter((t) => t.status === "OPEN");
  const closedTrades = trades.filter((t) => t.status === "CLOSED");

  const tradeBySignalId = useMemo(() => {
    const map = new Map<string, Trade>();
    for (const t of trades) {
      if (t.signalId) map.set(t.signalId, t);
    }
    return map;
  }, [trades]);

  const ltpMap = useMemo(() => {
    const map = new Map<number, { ceLTP: number; peLTP: number }>();
    const chainData = optionChain?.chainData;
    if (chainData && Array.isArray(chainData)) {
      for (const rawItem of chainData) {
        const item = rawItem as unknown as OptionData;
        const strike = item.strikePrice;
        if (typeof strike === "number") {
          map.set(strike, {
            ceLTP: item.CE?.lastPrice || 0,
            peLTP: item.PE?.lastPrice || 0,
          });
        }
      }
    }
    return map;
  }, [optionChain]);

  const unrealizedPnl = useMemo(() => {
    let total = 0;
    for (const trade of openTrades) {
      const ltp = ltpMap.get(trade.strike);
      if (!ltp) continue;
      const currentPrice = trade.signalType === "BULLISH" ? ltp.ceLTP : ltp.peLTP;
      if (currentPrice > 0 && trade.entryPrice > 0) {
        total += (currentPrice - trade.entryPrice) * LOT_SIZE;
      }
    }
    return total;
       }, [openTrades, ltpMap]);

     return (
    <div className="space-y-4">
      <PerformanceStats trades={trades} unrealizedPnl={unrealizedPnl} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Card className="t-bg-card t-border-main">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-amber-400" />
                  Live Signals
                </CardTitle>
                <span className="text-[10px] t-bg-hover t-text-4 px-2 py-0.5 rounded-full t-border-sub border">
                  {snapshots.length} snaps
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 t-bg-subtle rounded-lg p-2 t-border-sub/30 border">
                <Zap className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                <label className="text-[11px] t-text-5 flex-shrink-0">OI Unwind Threshold:</label>
                <Input
                  type="number"
                  value={oiThreshold}
                  onChange={(e) => setOIThreshold(Number(e.target.value) || 50000)}
                  className="w-28 h-7 text-xs t-bg-hover t-border-main ml-auto"
                  min={1000}
                  step={5000}
                />
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: "Engine", value: "BUY Only", color: "text-emerald-400" },
                  { label: "Bullish", value: "CALL +200", color: "text-emerald-400" },
                  { label: "Bearish", value: "PUT -200", color: "text-red-400" },
                  { label: "Target", value: "50%", color: "text-emerald-400" },
                  { label: "Stop", value: "15% / BE@15% / +15%@30%", color: "text-amber-400" },
                ].map((s) => (
                  <div key={s.label} className="t-bg-subtle rounded-lg p-1.5 text-center">
                    <p className="text-[9px] t-text-6">{s.label}</p>
                    <p className={`text-[11px] font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {signals.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-10 w-10 t-text-6 mx-auto mb-2" />
                  <p className="text-xs t-text-6">Waiting for OI unwinding signals</p>
                  <p className="text-[10px] t-text-7 mt-1">Need 2+ snapshots with auto-refresh ON</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {[...signals].reverse().slice(0, 15).map((sig, i) => {
                    const linkedTrade = sig.tradeId ? tradeBySignalId.get(sig.tradeId) : undefined;
                    return (
                      <SignalCard key={`${sig.id}-${i}`} signal={sig} linkedTrade={linkedTrade} />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="t-bg-card t-border-main">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-400" />
                  Trade Book
                </CardTitle>
                <div className="flex items-center gap-2">
                  {openTrades.length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold animate-pulse">
                      {openTrades.length} LIVE
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {openTrades.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertTriangle className="h-3 w-3" />
                      Open Positions ({openTrades.length})
                    </h4>
                    {openTrades.length > 1 && (
                      <button
                        onClick={closeAllTrades}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-[10px] font-bold cursor-pointer"
                      >
                        <Square className="h-3 w-3" />
                        Close All
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {openTrades.map((trade) => {
                      const ltp = ltpMap.get(trade.strike);
                      const currentLTP = trade.signalType === "BULLISH"
                        ? (ltp?.ceLTP || 0)
                        : (ltp?.peLTP || 0);
                      return (
                        <SmartTradeCard
                          key={`open-${trade.id}`}
                          trade={trade}
                          currentLTP={currentLTP}
                          onClose={() => closeTrade(trade.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-[11px] font-bold t-text-5 flex items-center gap-1.5 uppercase tracking-wider">
                  <Shield className="h-3 w-3" />
                  Closed Trades ({closedTrades.length})
                </h4>
                {closedTrades.length === 0 ? (
                  <div className="text-center py-6">
                    <Shield className="h-8 w-8 t-text-6 mx-auto mb-2" />
                    <p className="text-xs t-text-6 italic">No closed trades yet</p>
                    <p className="text-[10px] t-text-7 mt-1">Trades close at 50% target or 15% stop loss</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {[...closedTrades].reverse().slice(0, 20).map((trade, i) => (
                      <SmartTradeCard
                        key={`closed-${trade.strike}-${trade.time}-${i}`}
                        trade={trade}
                        currentLTP={0}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
