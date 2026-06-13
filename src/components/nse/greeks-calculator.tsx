"use client";

import { useState } from "react";
import { useNSEStore } from "@/store/nse-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calculateGreeks } from "@/lib/greeks";
import type { GreeksInput, GreeksResult } from "@/lib/greeks";
import { formatPrice } from "@/lib/nse";
import { Calculator, Info } from "lucide-react";

function GreekBar({
  label,
  value,
  maxVal,
  color,
  description,
}: {
  label: string;
  value: number;
  maxVal: number;
  color: string;
  description: string;
}) {
  const pct = Math.min(Math.abs(value) / maxVal, 1);
  const isNeg = value < 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="t-text-4 font-medium">{label}</span>
          <span className="t-text-6 text-xs" title={description}>
            <Info className="h-3 w-3 inline" />
          </span>
        </div>
        <span className={`font-mono font-bold ${isNeg ? "text-red-400" : color}`}>
          {isNeg ? "-" : ""}
          {Math.abs(value).toFixed(4)}
        </span>
      </div>
      <div className="h-2 t-bg-hover rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isNeg ? "bg-red-500" : color}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <p className="text-[10px] t-text-6">{description}</p>
    </div>
  );
}

export function GreeksCalculator() {
  const { optionChain, selectedExpiry } = useNSEStore();

  const [spotPrice, setSpotPrice] = useState(optionChain?.spotPrice || 24500);
  const [strikePrice, setStrikePrice] = useState(optionChain?.atmStrike || 24500);
  const [daysToExpiry, setDaysToExpiry] = useState(optionChain?.daysToExpiry || 7);
  const [riskFreeRate, setRiskFreeRate] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");

  const effectiveSpot = optionChain?.spotPrice || spotPrice;
  const effectiveATM = optionChain?.atmStrike || strikePrice;
  const effectiveDTE = optionChain?.daysToExpiry || daysToExpiry;

  const input: GreeksInput = {
    spotPrice: effectiveSpot,
    strikePrice: effectiveATM,
    timeToExpiry: effectiveDTE / 365,
    riskFreeRate: riskFreeRate / 100,
    volatility: volatility / 100,
    optionType,
  };

  const greeks: GreeksResult = calculateGreeks(input);
  const isITM =
    optionType === "CE"
      ? effectiveSpot > effectiveATM
      : effectiveSpot < effectiveATM;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="t-bg-card t-border-main">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-400" />
            Input Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Spot Price</Label>
              <Input
                type="number"
                value={spotPrice}
                onChange={(e) => setSpotPrice(Number(e.target.value))}
                className="t-bg-hover t-border-main text-sm h-9 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Strike Price</Label>
              <Input
                type="number"
                value={strikePrice}
                onChange={(e) => setStrikePrice(Number(e.target.value))}
                className="t-bg-hover t-border-main text-sm h-9 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Days to Expiry</Label>
              <Input
                type="number"
                value={daysToExpiry}
                onChange={(e) => setDaysToExpiry(Number(e.target.value))}
                className="t-bg-hover t-border-main text-sm h-9 font-mono"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Option Type</Label>
              <Select value={optionType} onValueChange={(v) => setOptionType(v as "CE" | "PE")}>
                <SelectTrigger className="t-bg-hover t-border-main text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="t-bg-hover t-border-main">
                  <SelectItem value="CE">
                    <span className="text-emerald-400">Call (CE)</span>
                  </SelectItem>
                  <SelectItem value="PE">
                    <span className="text-red-400">Put (PE)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Risk Free Rate (%)</Label>
              <Input
                type="number"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(Number(e.target.value))}
                className="t-bg-hover t-border-main text-sm h-9 font-mono"
                step={0.5}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs t-text-4">Volatility (%)</Label>
              <Input
                type="number"
                value={volatility}
                onChange={(e) => setVolatility(Number(e.target.value))}
                className="t-bg-hover t-border-main text-sm h-9 font-mono"
                step={0.5}
                min={0.1}
              />
            </div>
          </div>

          <div className="pt-2 t-border-main border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs t-text-4">Moneyness:</span>
              <Badge
                variant="outline"
                className={
                  isITM
                    ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                    : strikePrice === spotPrice
                    ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                    : "t-border-sub t-text-4"
                }
              >
                {isITM ? "In The Money (ITM)" : strikePrice === spotPrice ? "At The Money (ATM)" : "Out of The Money (OTM)"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="t-bg-card t-border-main">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs t-text-4 uppercase tracking-wider">Theoretical Price (Fair Value)</p>
                <p className="text-3xl font-bold mt-1 t-text-1 font-mono">
                  {formatPrice(greeks.theoreticalPrice)}
                </p>
              </div>
              <div className="text-right">
                <Badge
                  variant="outline"
                  className={optionType === "CE" ? "border-emerald-500/50 text-emerald-400" : "border-red-500/50 text-red-400"}
                >
                  {optionType === "CE" ? "CALL" : "PUT"}
                </Badge>
                <p className="text-xs t-text-5 mt-1">
                  Strike: {strikePrice}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="t-bg-card t-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm t-text-3">Option Greeks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GreekBar
              label="Delta"
              value={greeks.delta}
              maxVal={1}
              color="bg-emerald-500"
              description="Rate of change of option price w.r.t. underlying price"
            />
            <GreekBar
              label="Gamma"
              value={greeks.gamma}
              maxVal={0.01}
              color="bg-cyan-500"
              description="Rate of change of delta w.r.t. underlying price"
            />
            <GreekBar
              label="Theta"
              value={greeks.theta}
              maxVal={10}
              color="bg-amber-500"
              description="Rate of time decay per day (negative for long options)"
            />
            <GreekBar
              label="Vega"
              value={greeks.vega}
              maxVal={10}
              color="bg-purple-500"
              description="Sensitivity to 1% change in implied volatility"
            />
            <GreekBar
              label="Rho"
              value={greeks.rho}
              maxVal={10}
              color="bg-rose-500"
              description="Sensitivity to 1% change in risk-free interest rate"
            />
          </CardContent>
        </Card>

        <Card className="t-bg-card t-border-main">
          <CardContent className="p-4">
            <p className="text-xs t-text-4 font-medium mb-2">Quick Reference</p>
            <div className="grid grid-cols-1 gap-1.5 text-[11px] t-text-5">
              <p><span className="text-emerald-400">Delta &gt; 0.5</span> = Deep ITM | <span className="text-red-400">&lt; 0.3</span> = Deep OTM</p>
              <p><span className="text-amber-400">High Gamma</span> = Near ATM, high sensitivity</p>
              <p><span className="text-amber-400">Theta</span> = Time decay accelerates near expiry</p>
              <p><span className="text-purple-400">Vega</span> = Higher for longer DTE & ATM options</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
