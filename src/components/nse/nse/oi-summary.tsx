"use client";

import { useNSEStore, OISummaryData, OIStrikeRow } from "@/store/nse-store";
import { Card, CardContent } from "@/components/ui/card";
import { formatIndianNumber } from "@/lib/nse";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

function formatPlain(n: number): string {
  if (Math.abs(n) >= 1e6) return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1e3) return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return n.toFixed(0);
}

function OIStrikeRowItem({
  row,
  type,
  color,
}: {
  row: OIStrikeRow;
  type: "CE" | "PE";
  color: string;
}) {
  const isPositive = row.oiChange > 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-zinc-800/60 border-l-2 border-zinc-700 hover:bg-zinc-800 transition-colors">
      <span className="text-xs font-mono font-bold text-zinc-200">{row.strike}</span>
      <span className={`text-xs font-mono font-bold ${changeColor}`}>
        {isPositive ? "+" : ""}
        {formatPlain(row.oiChange)}
      </span>
      <span className="text-xs font-mono text-zinc-400">{formatPlain(row.oiCurrent)}</span>
    </div>
  );
}

function OICard({
  title,
  data,
  borderColor,
  icon: Icon,
  color,
}: {
  title: string;
  data: OIStrikeRow[];
  borderColor: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
      <div className={`h-1 ${borderColor}`} />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className={`text-xs font-bold ${color} flex items-center gap-1.5`}>
            <Icon className="h-3.5 w-3.5" />
            {title}
          </h4>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-bold">
            {data.length} strike{data.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="text-[10px] text-zinc-500 font-mono flex justify-between px-1">
          <span>Strike</span>
          <span>Delta OI</span>
          <span>OI</span>
        </div>

        <div className="space-y-1.5">
          {data.length === 0 ? (
            <p className="text-xs text-zinc-600 italic text-center py-3">
              No significant changes
            </p>
          ) : (
            data.map((row) => (
              <OIStrikeRowItem
                key={row.strike}
                row={row}
                type={title.includes("CALL") ? "CE" : "PE"}
                color={color}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OISummaryPanel() {
  const { oiSummary, snapshots } = useNSEStore();

  if (!oiSummary) {
    return (
      <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-zinc-600" />
          <div>
            <h3 className="text-sm font-bold text-zinc-300">OI Summary (Delta)</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Need at least 2 data snapshots to show OI changes. Keep auto-refresh ON.
            </p>
          </div>
        </div>

        {/* Show 4 empty cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { title: "CALL OI Increase", border: "bg-emerald-500", color: "text-emerald-400", Icon: TrendingUp },
            { title: "PUT OI Increase", border: "bg-amber-500", color: "text-amber-400", Icon: TrendingUp },
            { title: "CALL OI Decrease", border: "bg-red-500", color: "text-red-400", Icon: TrendingDown },
            { title: "PUT OI Decrease", border: "bg-yellow-500", color: "text-yellow-400", Icon: TrendingDown },
          ].map((card) => (
            <Card key={card.title} className="bg-zinc-900 border-zinc-800 opacity-50">
              <div className={`h-1 ${card.border}`} />
              <CardContent className="p-3 text-center">
                <p className="text-xs text-zinc-600 italic">
                  {card.title} - Waiting...
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const sentimentConfig = {
    BULLISH: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "BULLISH" },
    BEARISH: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", label: "BEARISH" },
    NEUTRAL: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", label: "NEUTRAL" },
  };

  const sentiment = sentimentConfig[oiSummary.sentiment];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-lg">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">OI Summary (Delta)</h3>
              <p className="text-[11px] text-zinc-500">
                Updated: {oiSummary.lastUpdated} | Snapshots: {snapshots.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${sentiment.bg} ${sentiment.color}`}>
              {sentiment.label}
            </span>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-zinc-500 uppercase">ATM Strike</p>
            <p className="text-sm font-bold text-amber-400 mt-0.5">{oiSummary.atmStrike}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-zinc-500 uppercase">Range</p>
            <p className="text-sm font-bold text-zinc-300 mt-0.5">{oiSummary.dataRange}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-zinc-500 uppercase">Total CE OI Chg</p>
            <p className={`text-sm font-bold mt-0.5 ${oiSummary.ceTotalChange > 0 ? "text-emerald-400" : oiSummary.ceTotalChange < 0 ? "text-red-400" : "text-zinc-400"}`}>
              {oiSummary.ceTotalChange > 0 ? "+" : ""}
              {formatPlain(oiSummary.ceTotalChange)}
            </p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-zinc-500 uppercase">Total PE OI Chg</p>
            <p className={`text-sm font-bold mt-0.5 ${oiSummary.peTotalChange > 0 ? "text-emerald-400" : oiSummary.peTotalChange < 0 ? "text-red-400" : "text-zinc-400"}`}>
              {oiSummary.peTotalChange > 0 ? "+" : ""}
              {formatPlain(oiSummary.peTotalChange)}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <OICard
          title="CALL OI Increase"
          data={oiSummary.callIncrease}
          borderColor="bg-emerald-500"
          icon={TrendingUp}
          color="text-emerald-400"
        />
        <OICard
          title="PUT OI Increase"
          data={oiSummary.putIncrease}
          borderColor="bg-amber-500"
          icon={TrendingUp}
          color="text-amber-400"
        />
        <OICard
          title="CALL OI Decrease"
          data={oiSummary.callDecrease}
          borderColor="bg-red-500"
          icon={TrendingDown}
          color="text-red-400"
        />
        <OICard
          title="PUT OI Decrease"
          data={oiSummary.putDecrease}
          borderColor="bg-yellow-500"
          icon={TrendingDown}
          color="text-yellow-400"
        />
      </div>
    </div>
  );
}
