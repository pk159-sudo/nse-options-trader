"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { calculateStrategyPayoff } from "@/lib/greeks";
import type { StrategyLeg } from "@/lib/greeks";
import { STRATEGIES } from "@/lib/strategies";
import { useNSEStore } from "@/store/nse-store";
import { formatPrice, formatIndianNumber } from "@/lib/nse";
import { Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, Info } from "lucide-react";

const LOT_SIZE = 65;
const STRIKE_STEP = 50;

function MarketViewBadge({ view }: { view: string }) {
  const config: Record<string, { icon: React.ElementType; label: string; className: string }> = {
    BULLISH: { icon: TrendingUp, label: "Bullish", className: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" },
    BEARISH: { icon: TrendingDown, label: "Bearish", className: "border-red-500/50 text-red-400 bg-red-500/10" },
    NEUTRAL: { icon: Minus, label: "Neutral", className: "border-amber-500/50 text-amber-400 bg-amber-500/10" },
    VOLATILE: { icon: AlertTriangle, label: "Volatile", className: "border-purple-500/50 text-purple-400 bg-purple-500/10" },
    MILDLY_BULLISH: { icon: TrendingUp, label: "Mildly Bullish", className: "border-cyan-500/50 text-cyan-400 bg-cyan-500/10" },
  };
  const c = config[view] || config.NEUTRAL;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={c.className}>
      <Icon className="h-3 w-3 mr-1" />
      {c.label}
    </Badge>
  );
}

function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; className: string }> = {
    LOW: { label: "Low Risk", className: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" },
    MEDIUM: { label: "Medium Risk", className: "border-amber-500/50 text-amber-400 bg-amber-500/10" },
    HIGH: { label: "High Risk", className: "border-red-500/50 text-red-400 bg-red-500/10" },
  };
  const c = config[level] || config.MEDIUM;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

export function StrategyBuilder() {
  const { optionChain } = useNSEStore();
  const spotPrice = optionChain?.spotPrice || 24500;
  const atmStrike = optionChain?.atmStrike || 24500;
  const lotSize = LOT_SIZE;
  const strikeStep = STRIKE_STEP;

  const [selectedStrategyId, setSelectedStrategyId] = useState("long-straddle");
  const [quantity, setQuantity] = useState(1);

  const selectedStrategy = STRATEGIES.find((s) => s.id === selectedStrategyId);

  // Get premium from actual option chain data if available
  function getPremiumFromChain(optionType: string, strike: number): number | null {
    if (!optionChain?.chainData) return null;
    const strikeData = optionChain.chainData.find((item) => item.strikePrice === strike);
    if (!strikeData) return null;
    const data = optionType === "CE" ? strikeData.CE : strikeData.PE;
    return data?.lastPrice || null;
  }

  // Build strategy legs from actual data or estimates
  const legs: StrategyLeg[] = selectedStrategy
    ? selectedStrategy.legs.map((legDef) => {
        const strike = atmStrike + legDef.strikeOffset * strikeStep;
        const actualPremium = getPremiumFromChain(legDef.optionType, strike);
        const premium = actualPremium || 100;
        const qty = (legDef.quantityMultiplier || 1) * lotSize * quantity;
        return {
          action: legDef.action,
          optionType: legDef.optionType,
          strikePrice: strike,
          premium,
          quantity: qty,
        };
      })
    : [];

  // Calculate payoff
  const payoff = legs.length > 0
    ? calculateStrategyPayoff(legs, {
        min: Math.round((spotPrice - spotPrice * 0.08) / strikeStep) * strikeStep,
        max: Math.round((spotPrice + spotPrice * 0.08) / strikeStep) * strikeStep,
        step: strikeStep,
      })
    : null;

  const chartData = payoff
    ? payoff.spotPrices.map((spot, i) => ({
        spot,
        pnl: Math.round(payoff.pnl[i] * 100) / 100,
      }))
    : [];

  // Net premium
  let netPremium = 0;
  for (const leg of legs) {
    netPremium += leg.action === "BUY" ? -leg.premium : leg.premium;
  }
  netPremium = netPremium * lotSize * quantity;

  if (!optionChain) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-8 text-center">
          <Brain className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">Load option chain data first to use Strategy Builder</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Strategy Selection */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            Select Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm w-full md:w-[250px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 max-h-80">
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Lots:</label>
              <Select value={String(quantity)} onValueChange={(v) => setQuantity(Number(v))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {[1, 2, 3, 4, 5, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500">
                ({lotSize} qty/lot, {lotSize * quantity} total)
              </span>
            </div>
          </div>

          {/* Strategy Info */}
          {selectedStrategy && (
            <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-200">{selectedStrategy.name}</h3>
                <MarketViewBadge view={selectedStrategy.marketView} />
                <RiskBadge level={selectedStrategy.riskLevel} />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{selectedStrategy.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Legs */}
      {selectedStrategy && legs.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-zinc-300">Strategy Legs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedStrategy.legs.map((legDef, idx) => {
                const leg = legs[idx];
                const isBuy = leg.action === "BUY";
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-800"
                  >
                    <Badge
                      variant="outline"
                      className={isBuy ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-red-500/50 text-red-400 bg-red-500/10"}
                    >
                      {isBuy ? "BUY" : "SELL"}
                    </Badge>
                    <span className={`text-sm font-medium ${leg.optionType === "CE" ? "text-emerald-400" : "text-red-400"}`}>
                      {leg.optionType}
                    </span>
                    <span className="text-sm font-mono text-zinc-300">
                      {leg.strikePrice}
                    </span>
                    <span className="text-xs text-zinc-500">@</span>
                    <span className="text-sm font-mono text-amber-400">
                      {formatPrice(leg.premium)}
                    </span>
                    <span className="text-xs text-zinc-500">x</span>
                    <span className="text-sm font-mono text-zinc-400">
                      {leg.quantity}
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">
                      {legDef.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Net Premium */}
            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Net Premium ({quantity} lot{quantity > 1 ? "s" : ""})</span>
              <span className={`text-sm font-bold font-mono ${netPremium >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {netPremium >= 0 ? "Credit: " : "Debit: "}
                {formatPrice(Math.abs(netPremium))}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payoff Chart */}
      {payoff && chartData.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between">
              <CardTitle className="text-sm text-zinc-300">Payoff Diagram</CardTitle>
              <div className="flex gap-3">
                <div className="text-xs">
                  <span className="text-emerald-400">Max Profit: </span>
                  <span className="text-zinc-300 font-mono">
                    {payoff.maxProfit === Infinity ? "Unlimited" : formatPrice(payoff.maxProfit)}
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-red-400">Max Loss: </span>
                  <span className="text-zinc-300 font-mono">
                    {payoff.maxLoss === -Infinity ? "Unlimited" : formatPrice(payoff.maxLoss)}
                  </span>
                </div>
                {payoff.breakevens.length > 0 && (
                  <div className="text-xs">
                    <span className="text-amber-400">BE: </span>
                    <span className="text-zinc-300 font-mono">
                      {payoff.breakevens.map((be) => formatPrice(be)).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <defs>
                  <linearGradient id="pnlGradientPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pnlGradientNeg" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="spot"
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickFormatter={(v) => v.toString()}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickFormatter={(v) => formatPrice(v)}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [
                    `${formatPrice(value)}`,
                    "P&L",
                  ]}
                  labelFormatter={(label) => `Spot: ${label}`}
                />
                <ReferenceLine
                  x={spotPrice}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  label={{ value: "Spot", fill: "#f59e0b", fontSize: 10, position: "top" }}
                />
                <ReferenceLine y={0} stroke="#52525b" strokeWidth={1.5} />
                {payoff.breakevens.map((be, i) => (
                  <ReferenceLine
                    key={i}
                    x={be}
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    strokeWidth={1}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#pnlGradientPos)"
                  dot={false}
                  baseValue={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <Card className="bg-zinc-900/50 border-zinc-800/50">
        <CardContent className="p-3">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            <Info className="h-3 w-3 inline mr-1" />
            This payoff diagram uses live LTP from NSE option chain. Actual P&L may differ due to bid-ask spread, slippage, and commissions.
            This tool is for educational purposes only and not financial advice. Always do your own research before trading.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
