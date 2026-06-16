"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Zap,
  Trophy,
  AlertTriangle,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import type {
  BacktestResult,
  BacktestTrade,
  BacktestStats,
} from "@/lib/backtest-engine";

// ===== Formatting Helpers =====

function formatIndian(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatIndianFull(n: number): string {
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  const str = abs.toFixed(0);
  // Indian comma formatting: last 3 digits, then groups of 2
  let result = "";
  let count = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    result = str[i] + result;
    count++;
    if (count === 3 && i > 0) {
      result = "," + result;
      count = 0;
    } else if (count === 2 && i > 0) {
      result = "," + result;
      count = 0;
    }
  }
  return `${sign}₹${result}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ===== Sub-components =====

function StatCard({
  label,
  value,
  subtext,
  color = "t-text-2",
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="t-bg-hover t-border-sub rounded-xl p-3 border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] t-text-6 uppercase tracking-wider font-medium">
          {label}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 t-text-6" />}
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {subtext && <p className="text-[10px] t-text-6 mt-0.5">{subtext}</p>}
    </div>
  );
}

function MiniBar({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] t-text-4">{label}</span>
      <span className={`text-[11px] font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ===== Equity Curve =====

function EquityCurve({ dailyPnl }: { dailyPnl: { date: string; pnl: number; cumulativePnl: number }[] }) {
  if (dailyPnl.length === 0) return null;

  const cumValues = dailyPnl.map((d) => d.cumulativePnl);
  const minVal = Math.min(0, ...cumValues);
  const maxVal = Math.max(0, ...cumValues);
  const range = maxVal - minVal || 1;

  // Build SVG path
  const width = 600;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = cumValues.map((v, i) => {
    const x = padding.left + (i / Math.max(cumValues.length - 1, 1)) * chartW;
    const y = padding.top + chartH - ((v - minVal) / range) * chartH;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const zeroY = padding.top + chartH - ((0 - minVal) / range) * chartH;
  const isPositive = cumValues[cumValues.length - 1] >= 0;

  // Build area fill
  const areaPath = `${linePath} L ${padding.left + chartW},${padding.top + chartH} L ${padding.left},${padding.top + chartH} Z`;

  // PnL bars at the bottom
  const barHeight = 8;
  const barY = height - padding.bottom + 6;
  const maxPnl = Math.max(...dailyPnl.map((d) => Math.abs(d.pnl)), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="4,4" />
      <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#27272a" strokeWidth="0.5" />
      <line x1={padding.left} y1={padding.top + chartH} x2={width - padding.right} y2={padding.top + chartH} stroke="#27272a" strokeWidth="0.5" />

      {/* Area fill */}
      <path d={areaPath} fill={isPositive ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)"} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth="1.5" />

      {/* Daily PnL bars */}
      {dailyPnl.map((d, i) => {
        const barW = Math.max(1, chartW / dailyPnl.length - 1);
        const x = padding.left + (i / dailyPnl.length) * chartW;
        const barH = (Math.abs(d.pnl) / maxPnl) * barHeight;
        const y = d.pnl >= 0 ? barY - barH : barY;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={d.pnl >= 0 ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)"}
            rx="0.5"
          />
        );
      })}

      {/* Axis labels */}
      {dailyPnl.length > 1 && (
        <>
          <text x={padding.left} y={height + 10} fill="#71717a" fontSize="7" textAnchor="start">
            {formatDate(dailyPnl[0].date)}
          </text>
          <text x={width - padding.right} y={height + 10} fill="#71717a" fontSize="7" textAnchor="end">
            {formatDate(dailyPnl[dailyPnl.length - 1].date)}
          </text>
        </>
      )}

      {/* End value */}
      <text x={width - padding.right} y={padding.top + 8} fill={isPositive ? "#10b981" : "#ef4444"} fontSize="8" fontWeight="bold" textAnchor="end">
        {formatIndian(cumValues[cumValues.length - 1])}
      </text>
    </svg>
  );
}

// ===== Trade Log Row =====

function TradeLogRow({ trade }: { trade: BacktestTrade }) {
  const isBullish = trade.signalType === "BULLISH";
  const isProfit = trade.pnl > 0;
  const optionLabel = isBullish ? "CE" : "PE";

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:t-bg-hover/50 transition-colors text-[11px]">
      <span className="t-text-6 w-[60px] flex-shrink-0">{formatDate(trade.date)}</span>
      <span className={`w-[50px] flex-shrink-0 font-bold ${isBullish ? "text-emerald-400" : "text-red-400"}`}>
        {isBullish ? "BULL" : "BEAR"}
      </span>
      <span className="t-text-4 w-[55px] flex-shrink-0">{trade.strike} {optionLabel}</span>
      <span className="t-text-4 w-[50px] flex-shrink-0 text-right">₹{trade.entryPrice.toFixed(0)}</span>
      <span className="t-text-4 w-[50px] flex-shrink-0 text-right">₹{trade.exitPrice.toFixed(0)}</span>
      <span className={`w-[70px] flex-shrink-0 text-right font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
        {formatIndianFull(trade.pnl)}
      </span>
      <span className="t-text-6 w-[40px] flex-shrink-0 text-right">{trade.profitPct.toFixed(1)}%</span>
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
          trade.exitReason === "TARGET"
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : trade.exitReason === "STOP_LOSS"
            ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
        }`}
      >
        {trade.exitReason === "TARGET" ? "🎯 Target" : trade.exitReason === "STOP_LOSS" ? "🛡️ SL" : "⏰ EOD"}
      </span>
      <span className="t-text-6 w-[90px] flex-shrink-0 text-right">{trade.entryTime} → {trade.exitTime}</span>
    </div>
  );
}

// ===== Main Component =====

export default function BacktestPanel() {
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [oiThreshold, setOIThreshold] = useState(25000);
  const [maxOpenTrades, setMaxOpenTrades] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [progressText, setProgressText] = useState("");

  async function runBacktest() {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgressText("Processing 94 days of 1-min candle data...");

    try {
      const res = await fetch("/api/nse/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalMinutes,
          oiThreshold,
          maxOpenTrades,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      const data: BacktestResult = await res.json();
      setResult(data);
      setProgressText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
      setProgressText("");
    } finally {
      setLoading(false);
    }
  }

  const stats = result?.stats;
  const trades = result?.trades ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="t-bg-card t-border-main border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm t-text-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              📊 Backtest Engine
            </CardTitle>
            {result && (
              <span className="text-[10px] t-bg-hover t-text-4 px-2 py-0.5 rounded-full t-border-sub border">
                {result.processingTimeMs / 1000}s · {result.daysProcessed} days · {result.snapshotsProcessed} snapshots
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Config Row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[10px] t-text-6 uppercase tracking-wider font-medium block">
                Interval
              </label>
              <Select value={String(intervalMinutes)} onValueChange={(v) => setIntervalMinutes(Number(v))}>
                <SelectTrigger className="w-[110px] h-8 text-xs t-bg-hover t-border-main">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="t-bg-card t-border-main">
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] t-text-6 uppercase tracking-wider font-medium block">
                OI Threshold
              </label>
              <Input
                type="number"
                value={oiThreshold}
                onChange={(e) => setOIThreshold(Number(e.target.value) || 25000)}
                className="w-[110px] h-8 text-xs t-bg-hover t-border-main"
                min={1000}
                step={5000}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] t-text-6 uppercase tracking-wider font-medium block">
                Max Trades
              </label>
              <Select value={String(maxOpenTrades)} onValueChange={(v) => setMaxOpenTrades(Number(v))}>
                <SelectTrigger className="w-[110px] h-8 text-xs t-bg-hover t-border-main">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="t-bg-card t-border-main">
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={runBacktest}
              disabled={loading}
              className="h-8 px-4 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>

          {/* Progress / Error */}
          {loading && progressText && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span className="text-[11px] t-text-4">{progressText}</span>
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="text-xs text-red-400">{error}</span>
              </div>
            </div>
          )}

          {/* Strategy Info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {[
              { label: "Engine", value: "OI Unwind", color: "text-emerald-400" },
              { label: "Bullish", value: "CE OI↓ → CALL +200", color: "text-emerald-400" },
              { label: "Bearish", value: "PE OI↓ → PUT -200", color: "text-red-400" },
              { label: "Target", value: "50% (Trailing)", color: "text-emerald-400" },
              { label: "Stop Loss", value: "-15% / BE / +15%", color: "text-amber-400" },
            ].map((s) => (
              <div key={s.label} className="t-bg-subtle rounded-lg p-1.5 text-center">
                <p className="text-[9px] t-text-6">{s.label}</p>
                <p className={`text-[10px] font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 t-bg-hover rounded-xl" />
          ))}
        </div>
      )}

      {/* Results */}
      {stats && !loading && (
        <>
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              subtext={`${stats.wins}W / ${stats.losses}L`}
              color={stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}
              icon={Trophy}
            />
            <StatCard
              label="Total P&L"
              value={formatIndian(stats.totalPnl)}
              subtext={`${stats.totalTrades} trades`}
              color={stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Profit Factor"
              value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
              subtext={`Signals: ${result.signalsGenerated}`}
              color="text-amber-400"
              icon={Target}
            />
            <StatCard
              label="Max Drawdown"
              value={formatIndian(stats.maxDrawdown)}
              subtext={`${stats.maxDrawdownPct.toFixed(1)}%`}
              color="text-red-400"
              icon={Shield}
            />
          </div>

          {/* Detailed Stats */}
          <Card className="t-bg-card t-border-main border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-400" />
                Detailed Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                <div className="divide-y divide-zinc-800/50">
                  <MiniBar label="Avg Win" value={formatIndian(stats.avgWin)} color="text-emerald-400" />
                  <MiniBar label="Avg Loss" value={formatIndian(stats.avgLoss)} color="text-red-400" />
                  <MiniBar label="Max Win" value={formatIndian(stats.maxWin)} color="text-emerald-400" />
                  <MiniBar label="Max Loss" value={formatIndian(stats.maxLoss)} color="text-red-400" />
                </div>
                <div className="divide-y divide-zinc-800/50">
                  <MiniBar label="Total Trades" value={String(stats.totalTrades)} color="t-text-2" />
                  <MiniBar label="Avg Holding" value={stats.avgHoldingTime} color="t-text-2" />
                  <MiniBar label="Days Processed" value={String(result.daysProcessed)} color="t-text-2" />
                  <MiniBar label="Signals Generated" value={String(result.signalsGenerated)} color="t-text-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equity Curve */}
          {stats.dailyPnl.length > 0 && (
            <Card className="t-bg-card t-border-main border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                  Equity Curve (Cumulative P&L)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EquityCurve dailyPnl={stats.dailyPnl} />
              </CardContent>
            </Card>
          )}

          {/* Monthly Breakdown */}
          {stats.monthlyBreakdown.length > 0 && (
            <Card className="t-bg-card t-border-main border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-400" />
                  Monthly Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {/* Table header */}
                  <div className="flex items-center gap-2 py-2 px-2 border-b border-zinc-800/50 text-[10px] t-text-6 uppercase tracking-wider font-medium">
                    <span className="w-[80px]">Month</span>
                    <span className="w-[60px] text-center">Trades</span>
                    <span className="w-[50px] text-center">Wins</span>
                    <span className="w-[60px] text-center">Win %</span>
                    <span className="w-[80px] text-right">P&L</span>
                    <span className="flex-1" /> {/* Bar */}
                  </div>
                  {/* Rows */}
                  {stats.monthlyBreakdown.map((m) => {
                    const isProfit = m.pnl >= 0;
                    const maxAbsPnl = Math.max(...stats.monthlyBreakdown.map((x) => Math.abs(x.pnl)), 1);
                    const barPct = (Math.abs(m.pnl) / maxAbsPnl) * 100;
                    return (
                      <div key={m.month} className="flex items-center gap-2 py-1.5 px-2">
                        <span className="w-[80px] text-[11px] t-text-2 font-medium">
                          {new Date(m.month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                        </span>
                        <span className="w-[60px] text-[11px] t-text-4 text-center">{m.trades}</span>
                        <span className="w-[50px] text-[11px] t-text-4 text-center">{m.wins}</span>
                        <span className={`w-[60px] text-[11px] text-center font-bold ${m.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                          {m.winRate.toFixed(0)}%
                        </span>
                        <span className={`w-[80px] text-[11px] text-right font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                          {formatIndian(m.pnl)}
                        </span>
                        <div className="flex-1 h-3 bg-zinc-800/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isProfit ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                            style={{ width: `${barPct}%`, marginLeft: isProfit ? "auto" : undefined }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trade Log */}
          <Card className="t-bg-card t-border-main border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm t-text-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Trade Log
                </CardTitle>
                {trades.length > 10 && (
                  <button
                    onClick={() => setShowAllTrades(!showAllTrades)}
                    className="flex items-center gap-1 text-[10px] t-text-4 hover:t-text-2 transition-colors cursor-pointer"
                  >
                    {showAllTrades ? "Show Less" : `Show All (${trades.length})`}
                    {showAllTrades ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-10 w-10 t-text-6 mx-auto mb-2" />
                  <p className="text-xs t-text-6">No trades generated</p>
                  <p className="text-[10px] t-text-7 mt-1">Try lowering the OI threshold</p>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="flex items-center gap-2 py-1.5 px-2 border-b border-zinc-800/50 text-[9px] t-text-6 uppercase tracking-wider font-medium">
                    <span className="w-[60px]">Date</span>
                    <span className="w-[50px]">Type</span>
                    <span className="w-[55px]">Strike</span>
                    <span className="w-[50px] text-right">Entry</span>
                    <span className="w-[50px] text-right">Exit</span>
                    <span className="w-[70px] text-right">P&L</span>
                    <span className="w-[40px] text-right">%</span>
                    <span>Reason</span>
                    <span className="w-[90px] text-right">Time</span>
                  </div>
                  {/* Rows */}
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {(showAllTrades ? trades : trades.slice(-20)).map((trade) => (
                      <TradeLogRow key={trade.id} trade={trade} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}