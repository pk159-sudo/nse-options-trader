"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNSEStore } from "@/store/nse-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Clock,
  Shield,
  Target,
  AlertTriangle,
  Calculator,
  Eye,
  Zap,
  Building2,
  Wifi,
  WifiOff,
  Paperclip,
  Timer,
  TimerReset,
  FlaskConical,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { formatIndianNumber, formatPrice } from "@/lib/nse";
import { OISummaryPanel } from "@/components/nse/oi-summary";
import { SignalsPanel } from "@/components/nse/signals-panel";
import { AccountConnector } from "@/components/nse/account-connector";
import BacktestPanel from "@/components/nse/backtest-panel";
import { ThemeSwitcher } from "@/components/theme-switcher";

// NIFTY only

const LOT_SIZE = 65;

function formatExpiryDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card className="t-bg-card t-border-main">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs t-text-4 uppercase tracking-wider">{title}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            {subtitle && <p className="text-xs t-text-5 mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg t-bg-hover ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionChainTable() {
  const { optionChain, isLoading, error, spotPrice: storeSpotPrice, snapshotDelta, snapshotDeltaTime } = useNSEStore();
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (optionChain && tableRef.current) {
      const atmRow = tableRef.current.querySelector("[data-atm='true']");
      if (atmRow) {
        atmRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [optionChain]);

  if (error) {
    return (
      <Card className="t-bg-card t-border-main">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400 font-medium">{error}</p>
          <p className="t-text-5 text-sm mt-2">
            Unable to reach NSE servers. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="t-bg-card t-border-main">
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-10 t-bg-hover w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!optionChain?.chainData?.length) {
    const { selectedExpiry: expiry, isMarketOpen } = useNSEStore.getState();
    return (
      <Card className="t-bg-card t-border-main" suppressHydrationWarning>
        <CardContent className="p-8 text-center" suppressHydrationWarning>
          <BarChart3 className="h-12 w-12 t-text-6 mx-auto mb-4" />
          {expiry && !isMarketOpen ? (
            <>
              <p className="t-text-4">Market is closed</p>
              <p className="text-xs t-text-5 mt-1">Showing last session data. New data will auto-load at 9:15 AM IST</p>
            </>
          ) : (
            <p className="t-text-4">Select an expiry date to view option chain</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const { chainData, analysis } = optionChain;
  const atmStrike = optionChain.atmStrike;
  const spotPrice = optionChain.spotPrice || 0;
  const maxCEOIStrike = analysis?.maxCEOI?.strike || 0;
  const maxPEOIStrike = analysis?.maxPEOI?.strike || 0;

  const daysToExpiry = optionChain?.daysToExpiry || 0;
  const strikeRange = daysToExpiry <= 7 ? 300 : 500;

  let filteredChain;
  if (spotPrice > 0) {
    const atm = Math.round(spotPrice / 50) * 50;
    filteredChain = chainData.filter(
      (item) => item.strikePrice >= atm - strikeRange && item.strikePrice <= atm + strikeRange
    );
  } else if (atmStrike > 0) {
    filteredChain = chainData.filter(
      (item) => item.strikePrice >= atmStrike - strikeRange && item.strikePrice <= atmStrike + strikeRange
    );
  } else {
    filteredChain = chainData.slice(0, 13);
  }

  return (
    <Card className="t-bg-card t-border-main overflow-hidden">
      <div ref={tableRef} className="max-h-[70vh] overflow-y-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="t-bg-hover">
              <th colSpan={3} className="text-center py-2 text-emerald-400 font-semibold t-border-main border-b">
                CALLS (CE)
              </th>
              <th className="text-center py-2 text-amber-400 font-semibold t-border-main border-b t-bg-hover/80">
                STRIKE
              </th>
              <th colSpan={3} className="text-center py-2 text-red-400 font-semibold t-border-main border-b">
                PUTS (PE)
              </th>
            </tr>
            <tr className="t-bg-hover/90 t-text-4">
              <th className="py-1.5 px-2 text-right border-b t-border-main/50">OI</th>
              <th className="py-1.5 px-2 text-right border-b t-border-main/50">DeltaOI</th>
              <th className="py-1.5 px-2 text-right border-b t-border-main/50">LTP</th>
              <th className="py-1.5 px-3 text-center border-b t-border-main/50 t-bg-hover/60 text-amber-300 font-bold">
                {optionChain.atmStrike || "-"}
              </th>
              <th className="py-1.5 px-2 text-left border-b t-border-main/50">LTP</th>
              <th className="py-1.5 px-2 text-left border-b t-border-main/50">DeltaOI</th>
              <th className="py-1.5 px-2 text-left border-b t-border-main/50">OI</th>
            </tr>
          </thead>
          <tbody>
            {filteredChain.map((item) => {
              const isATM = item.strikePrice === optionChain.atmStrike;
              const isMaxCEOI = item.strikePrice === maxCEOIStrike;
              const isMaxPEOI = item.strikePrice === maxPEOIStrike;
              const ceITM = item.CE ? spotPrice > item.strikePrice : false;
              const peITM = item.PE ? spotPrice < item.strikePrice : false;

              const delta = snapshotDelta[item.strikePrice];
              const ceDeltaOI = delta?.ceOIChange ?? 0;
              const peDeltaOI = delta?.peOIChange ?? 0;

              let rowClass = "border-b t-border-main/50 hover:t-bg-hover/50 transition-colors";
              if (isATM) rowClass += " bg-amber-500/10 border-amber-500/30";
              else if (ceITM && peITM) rowClass += " t-bg-hover/30";
              else if (ceITM) rowClass += " bg-emerald-500/5";
              else if (peITM) rowClass += " bg-red-500/5";

              return (
                <tr key={item.strikePrice} className={rowClass} data-atm={isATM}>
                  {/* CE Side */}
                  <td className={`py-1.5 px-2 text-right font-mono ${isMaxCEOI ? "text-emerald-300 font-bold" : "t-text-3"}`}>
                    {formatIndianNumber(item.CE?.openInterest || 0)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono">
                    <span className={ceDeltaOI > 0 ? "text-emerald-400" : ceDeltaOI < 0 ? "text-red-400" : "t-text-5"}>
                      {ceDeltaOI !== 0 ? formatIndianNumber(ceDeltaOI) : "-"}
                    </span>
                  </td>
                  <td className={`py-1.5 px-2 text-right font-mono ${(item.CE?.change || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {item.CE?.lastPrice ? formatPrice(item.CE.lastPrice) : "-"}
                  </td>

                  {/* Strike */}
                  <td className={`py-1.5 px-3 text-center font-mono font-bold ${isATM ? "text-amber-400 bg-amber-500/10 text-sm" : "t-text-3"}`}>
                    {item.strikePrice}
                    {isMaxCEOI && <span className="ml-1 text-[8px] text-emerald-400">&#9650;</span>}
                    {isMaxPEOI && <span className="ml-1 text-[8px] text-red-400">&#9660;</span>}
                  </td>

                  {/* PE Side */}
                  <td className={`py-1.5 px-2 text-left font-mono ${(item.PE?.change || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {item.PE?.lastPrice ? formatPrice(item.PE.lastPrice) : "-"}
                  </td>
                  <td className="py-1.5 px-2 text-left font-mono">
                    <span className={peDeltaOI > 0 ? "text-emerald-400" : peDeltaOI < 0 ? "text-red-400" : "t-text-5"}>
                      {peDeltaOI !== 0 ? formatIndianNumber(peDeltaOI) : "-"}
                    </span>
                  </td>
                  <td className={`py-1.5 px-2 text-left font-mono ${isMaxPEOI ? "text-red-300 font-bold" : "t-text-3"}`}>
                    {formatIndianNumber(item.PE?.openInterest || 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OIAnalysisPanel() {
  const { optionChain, spotPrice, snapshotDelta, snapshotDeltaTime } = useNSEStore();

  if (!optionChain?.oiByStrike?.length) {
    return (
      <div className="flex items-center justify-center h-64 t-text-5">
        <BarChart3 className="h-8 w-8 mr-3" />
        Load option chain data first
      </div>
    );
  }

  const atm = Math.round((optionChain.spotPrice || 0) / 50) * 50;
  const daysToExpiry = optionChain?.daysToExpiry || 0;
  const range = daysToExpiry <= 7 ? 300 : 500;

  const chartData = optionChain.oiByStrike
    .filter(
      (item) => (item.ceOI > 0 || item.peOI > 0) &&
                item.strike >= atm - range && item.strike <= atm + range
    )
    .map((item) => {
      const delta = snapshotDelta[item.strike];
      return {
        ...item,
        ceDeltaOI: delta?.ceOIChange ?? 0,
        peDeltaOI: delta?.peOIChange ?? 0,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs t-text-5">
        <span>ATM: {atm} | Range: {range > 0 ? `+/-${range}` : "All"}</span>
        <span>{chartData.length} strikes</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="t-bg-card t-border-main">
          <CardContent className="p-4">
            <p className="text-xs t-text-4 uppercase tracking-wider">Resistance (Max CE OI)</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {optionChain.analysis?.resistance || "-"}
            </p>
            <p className="text-xs t-text-5 mt-1">
              CE OI: {formatIndianNumber(optionChain.analysis?.maxCEOI?.oi || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="t-bg-card t-border-main">
          <CardContent className="p-4">
            <p className="text-xs t-text-4 uppercase tracking-wider">Support (Max PE OI)</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {optionChain.analysis?.support || "-"}
            </p>
            <p className="text-xs t-text-5 mt-1">
              PE OI: {formatIndianNumber(optionChain.analysis?.maxPEOI?.oi || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm t-text-3">Open Interest by Strike</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="t-chart-grid" />
              <XAxis
                dataKey="strike"
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
                tickFormatter={(v) => formatIndianNumber(v)}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "var(--t-chart-tooltip-bg)",
                  border: "1px solid var(--t-chart-tooltip-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--t-text-2)",
                }}
                formatter={(value: number, name: string) => [
                  formatIndianNumber(value),
                  name,
                ]}
                labelFormatter={(label) => `Strike: ${label}`}
              />
              <ReferenceLine
                x={optionChain.atmStrike}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                label={{ value: "ATM", fill: "#f59e0b", fontSize: 10 }}
              />
              <Bar dataKey="ceOI" name="CE OI" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="peOI" name="PE OI" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm t-text-3">OI Change (Snapshot Delta)</CardTitle>
            {snapshotDeltaTime && (
              <span className="text-[10px] t-text-5 font-mono">Delta: {snapshotDeltaTime}</span>
            )}
          </div>
          {(!snapshotDelta || Object.keys(snapshotDelta).length === 0) && (
            <p className="text-[10px] text-amber-400 mt-1">Need 2+ snapshots for delta. Keep auto-refresh ON.</p>
          )}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="t-chart-grid" />
              <XAxis
                dataKey="strike"
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
                tickFormatter={(v) => formatIndianNumber(v)}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "var(--t-chart-tooltip-bg)",
                  border: "1px solid var(--t-chart-tooltip-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--t-text-2)",
                }}
                formatter={(value: number, name: string) => [
                  formatIndianNumber(value),
                  name,
                ]}
              />
              <ReferenceLine y={0} className="t-chart-axis" />
              <ReferenceLine
                x={optionChain.atmStrike}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                label={{ value: "ATM", fill: "#f59e0b", fontSize: 10 }}
              />
              <Bar dataKey="ceDeltaOI" name="CE Delta OI" fill="#10b981" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`ce-${index}`} fill={entry.ceDeltaOI >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
              <Bar dataKey="peDeltaOI" name="PE Delta OI" fill="#ef4444" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`pe-${index}`} fill={entry.peDeltaOI >= 0 ? "#ef4444" : "#10b981"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm t-text-3">Volume Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="t-chart-grid" />
              <XAxis
                dataKey="strike"
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="t-chart-label"
                axisLine={{ className: "t-chart-axis" }}
                tickFormatter={(v) => formatIndianNumber(v)}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "var(--t-chart-tooltip-bg)",
                  border: "1px solid var(--t-chart-tooltip-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--t-text-2)",
                }}
                formatter={(value: number, name: string) => [
                  formatIndianNumber(value),
                  name,
                ]}
              />
              <Bar dataKey="ceVolume" name="CE Volume" fill="#34d399" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              <Bar dataKey="peVolume" name="PE Volume" fill="#f87171" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Market Countdown Hook =====
function useMarketCountdown() {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isOpen: false, label: "" });

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
      const day = istNow.getDay();
      const h = istNow.getHours();
      const m = istNow.getMinutes();
      const s = istNow.getSeconds();
      const totalSecsNow = h * 3600 + m * 60 + s;

      const marketOpen = 9 * 3600 + 15 * 60;
      const marketClose = 15 * 3600 + 30 * 60;

      const isWeekend = day === 0 || day === 6;
      const isOpen = !isWeekend && totalSecsNow >= marketOpen && totalSecsNow <= marketClose;

      let targetSecs: number;
      let label: string;

      if (isOpen) {
        targetSecs = marketClose - totalSecsNow;
        label = "Market Closes in";
      } else if (isWeekend) {
        const daysToAdd = day === 6 ? 2 : 1;
        targetSecs = (daysToAdd * 86400) + (marketOpen - totalSecsNow);
        label = "Market Opens in";
      } else if (totalSecsNow < marketOpen) {
        targetSecs = marketOpen - totalSecsNow;
        label = "Market Opens in";
      } else {
        targetSecs = (86400 - totalSecsNow) + marketOpen;
        label = "Market Opens in";
      }

      if (targetSecs < 0) targetSecs = 0;

      const hours = Math.floor(targetSecs / 3600);
      const minutes = Math.floor((targetSecs % 3600) / 60);
      const seconds = targetSecs % 60;

      setCountdown({ hours, minutes, seconds, isOpen, label });
    };

    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, []);

  return countdown;
}

export default function NSEOptionsTool() {
  const {
    selectedExpiry,
    expiryDates,
    optionChain,
    isLoading,
    isExpiryLoading,
    error,
    autoRefresh,
    refreshInterval,
    lastUpdated,
    isMarketOpen,
    checkMarketHours,
    setExpiry,
    setAutoRefresh,
    setRefreshInterval,
    fetchExpiryDates,
    fetchOptionChain,
    loadSnapshotHistory,
    loadSignalsFromFile,
    loadTradesFromFile,
    loadDeltaFromFile,
    tradeMode,
    brokerAccount,
  } = useNSEStore();

  const marketCountdown = useMarketCountdown();
  const [countdownDisplay, setCountdownDisplay] = useState(refreshInterval);
  const fetchOptionChainRef = useRef(fetchOptionChain);

  useEffect(() => {
    fetchOptionChainRef.current = fetchOptionChain;
  }, [fetchOptionChain]);

  useEffect(() => {
    checkMarketHours();
    const timer = setInterval(checkMarketHours, 60000); // Check every minute always
    return () => clearInterval(timer);
  }, [checkMarketHours]);

  useEffect(() => {
    setCountdownDisplay(refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    if (!autoRefresh || !selectedExpiry || !isMarketOpen) return;

    setCountdownDisplay(refreshInterval);

    const timer = setInterval(() => {
      setCountdownDisplay((prev) => {
        if (prev <= 1) {
          fetchOptionChainRef.current();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, selectedExpiry, refreshInterval, isMarketOpen]);

  useEffect(() => {
    fetchExpiryDates();
  }, []);

  useEffect(() => {
    if (!selectedExpiry) return;

    void Promise.all([
      loadSnapshotHistory(),
      loadSignalsFromFile(),
      loadTradesFromFile(),
      loadDeltaFromFile(),
    ]);
  }, [selectedExpiry, loadSnapshotHistory, loadSignalsFromFile, loadTradesFromFile, loadDeltaFromFile]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const spotPrice = optionChain?.spotPrice || 0;
  const analysis = optionChain?.analysis;
  const chainData = optionChain?.chainData;

  return (
    <div className="min-h-screen t-bg-main t-text-1" suppressHydrationWarning>
      {/* Header */}
      <header className="t-border-main border-b t-bg-header backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <Activity className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold t-text-1">NSE Option Traders</h1>
                <p className="text-xs t-text-5 flex items-center gap-2">
                  Real-time options chain analytics
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isMarketOpen ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}`}>
                    {isMarketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tradeMode === "SEMI_AUTO" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "t-bg-muted t-text-4 t-border-sub border"}`}>
                    {tradeMode === "SEMI_AUTO" ? "SEMI-AUTO" : "PAPER"}
                  </span>
                  {brokerAccount?.status === "CONNECTED" ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                      <Wifi className="h-2.5 w-2.5" />
                      {brokerAccount.broker.replace("_", " ")}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full t-bg-subtle t-text-5 t-border-sub border flex items-center gap-0.5">
                      <WifiOff className="h-2.5 w-2.5" />
                      No Broker
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Market Countdown Timer */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${marketCountdown.isOpen ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
              <div className={`p-1.5 rounded-lg ${marketCountdown.isOpen ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                {marketCountdown.isOpen ? (
                  <Timer className="h-4 w-4 text-emerald-400" />
                ) : (
                  <TimerReset className="h-4 w-4 text-red-400" />
                )}
              </div>
              <div className="text-center">
                <p className={`text-[9px] font-semibold uppercase tracking-wider ${marketCountdown.isOpen ? "text-emerald-400" : "text-red-400"}`}>
                  {marketCountdown.label}
                </p>
                <p className={`text-lg font-mono font-bold tabular-nums ${marketCountdown.isOpen ? "text-emerald-300" : "text-red-300"}`}>
                  {String(marketCountdown.hours).padStart(2, "0")}:
                  {String(marketCountdown.minutes).padStart(2, "0")}:
                  {String(marketCountdown.seconds).padStart(2, "0")}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Theme Switcher */}
              <ThemeSwitcher />

              <Select value={selectedExpiry} onValueChange={setExpiry}>
                <SelectTrigger className="w-[220px] t-bg-hover t-border-main t-text-1 text-sm h-9">
                  <SelectValue placeholder={isExpiryLoading ? "Loading..." : "Select Expiry"} />
                </SelectTrigger>
                <SelectContent className="t-bg-hover t-border-main max-h-60">
                  {expiryDates.map((exp) => (
                    <SelectItem key={exp} value={exp}>
                      {formatExpiryDate(exp)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  disabled={!isMarketOpen}
                  className="data-[state=checked]:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!isMarketOpen ? "Auto-refresh disabled after market closing" : ""}
                />
                <Label 
                  htmlFor="auto-refresh" 
                  className={`text-xs cursor-pointer ${!isMarketOpen ? "opacity-50" : "t-text-4"}`}
                  title={!isMarketOpen ? "Auto-refresh disabled after market closing" : ""}
                >
                  Auto
                </Label>
              </div>

              <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                <SelectTrigger className="w-[90px] t-bg-hover t-border-main t-text-1 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="t-bg-hover t-border-main">
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1 min</SelectItem>
                  <SelectItem value="300">5 min</SelectItem>
                  <SelectItem value="900">15 min</SelectItem>
                </SelectContent>
              </Select>

              {autoRefresh && selectedExpiry && (
                <div className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border ${countdownDisplay <= 5 ? "text-red-400 bg-red-500/10 border-red-500/30 animate-pulse" : countdownDisplay <= 10 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"}`}>
                  <RefreshCw className={`h-3 w-3 ${countdownDisplay <= 5 ? "animate-spin" : ""}`} />
                  <span className="font-bold tabular-nums">{formatCountdown(countdownDisplay)}</span>
                  <span className="text-[9px] opacity-60">next</span>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedExpiry && fetchOptionChain(true)}
                disabled={isLoading || !selectedExpiry}
                className="t-bg-hover t-border-main hover:t-bg-hover text-sm h-9"
                title={!isMarketOpen ? "Off-market: refreshes only if no cached data exists" : ""}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              {lastUpdated && (
                <span className="text-xs t-text-5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lastUpdated}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Spot Price Banner */}
        {spotPrice > 0 && (
          <div className="flex flex-wrap items-center gap-4 t-bg-muted t-border-main border rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="t-border-sub t-text-3 text-xs">
                NIFTY
              </Badge>
              <span className="text-2xl font-bold t-text-1">{formatPrice(spotPrice)}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs t-text-4">
              <span>Lot: {LOT_SIZE}</span>
              <span>Expiry: {formatExpiryDate(optionChain?.selectedExpiry || "")}</span>
              <span>DTE: {optionChain?.daysToExpiry || 0} days</span>
              {analysis && (
                <>
                  <span className="text-emerald-400">
                    Sup: {analysis.support}
                  </span>
                  <span className="text-red-400">
                    Res: {analysis.resistance}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {analysis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              title="PCR"
              value={analysis.pcr.toFixed(3)}
              icon={BarChart3}
              color={analysis.pcr > 1 ? "text-emerald-400" : analysis.pcr < 0.7 ? "text-red-400" : "text-amber-400"}
              subtitle={analysis.pcr > 1 ? "Bullish" : analysis.pcr < 0.7 ? "Bearish" : "Neutral"}
            />
            <MetricCard
              title="Max Pain"
              value={analysis.maxPain.toString()}
              icon={Target}
              color="text-amber-400"
              subtitle={Math.abs(spotPrice - analysis.maxPain) < 50 ? "Near Spot" : `${Math.abs(spotPrice - analysis.maxPain)} pts away`}
            />
            <MetricCard
              title="CE OI Total"
              value={formatIndianNumber(analysis.totalCEOI)}
              icon={TrendingUp}
              color="text-emerald-400"
              subtitle={`Max: ${analysis.maxCEOI.strike}`}
            />
            <MetricCard
              title="PE OI Total"
              value={formatIndianNumber(analysis.totalPEOI)}
              icon={TrendingDown}
              color="text-red-400"
              subtitle={`Max: ${analysis.maxPEOI.strike}`}
            />
            <MetricCard
              title="Support"
              value={analysis.support.toString()}
              icon={Shield}
              color="text-emerald-400"
              subtitle="Max PE OI Strike"
            />
            <MetricCard
              title="Resistance"
              value={analysis.resistance.toString()}
              icon={AlertTriangle}
              color="text-red-400"
              subtitle="Max CE OI Strike"
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="chain" className="space-y-4">
          <TabsList className="t-bg-card t-border-main border p-1 h-auto flex-wrap">
            <TabsTrigger value="chain" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <BarChart3 className="h-4 w-4" />
              Option Chain
            </TabsTrigger>
            <TabsTrigger value="oi" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <Eye className="h-4 w-4" />
              OI Summary
            </TabsTrigger>
            <TabsTrigger value="signals" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <Zap className="h-4 w-4" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="oi-chart" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <Eye className="h-4 w-4" />
              OI Charts
            </TabsTrigger>
            <TabsTrigger value="backtest" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <FlaskConical className="h-4 w-4" />
              Backtest
            </TabsTrigger>
            <TabsTrigger value="account" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 t-text-4 text-sm gap-1.5 py-2">
              <Building2 className="h-4 w-4" />
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chain">
            <OptionChainTable />
          </TabsContent>

          <TabsContent value="oi">
            <OISummaryPanel />
          </TabsContent>

          <TabsContent value="signals">
            <SignalsPanel />
          </TabsContent>

          <TabsContent value="oi-chart">
            <OIAnalysisPanel />
          </TabsContent>

          <TabsContent value="backtest">
            <BacktestPanel />
          </TabsContent>

          <TabsContent value="account">
            <AccountConnector />
          </TabsContent>
        </Tabs>
      </main>

      {/* Disclaimer Footer */}
      <footer className="t-border-main/50 border-t mt-8 pb-6">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="t-bg-muted t-border-main/60 border rounded-lg px-4 py-3">
            <p className="text-[10px] t-text-6 leading-relaxed">
              <span className="t-text-5 font-semibold">DISCLAIMER:</span> This tool is for educational and informational purposes only.
              It does not constitute financial advice, stock tips, or recommendations to buy/sell any securities.
              Options trading involves substantial risk and may not be suitable for all investors.
              Past performance of any signal or strategy does not guarantee future results.
              Please consult a qualified financial advisor before making any investment decisions.
              NSE Option Traders is not SEBI registered and is not liable for any financial losses incurred.
            </p>
          </div>
          <p className="text-[9px] t-text-7 text-center mt-3">
            NSE Option Traders &copy; {new Date().getFullYear()} | Data sourced from NSE India | For educational use only
          </p>
        </div>
      </footer>
    </div>
  );
}
