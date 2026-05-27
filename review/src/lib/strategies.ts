// Common options strategy definitions for NSE traders

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  marketView: "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILE";
  legs: StrategyLegDef[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface StrategyLegDef {
  action: "BUY" | "SELL";
  optionType: "CE" | "PE";
  strikeOffset: number; // offset from ATM (0 = ATM, +1 = 1 strike above, etc.)
  name: string;
  quantityMultiplier?: number;
}

export const STRATEGIES: StrategyDefinition[] = [
  {
    id: "long-straddle",
    name: "Long Straddle",
    description:
      "Buy ATM Call + Buy ATM Put. Profits from large price moves in either direction. Loss limited to total premium paid. Best for events like budget, earnings where high volatility is expected.",
    marketView: "VOLATILE",
    riskLevel: "MEDIUM",
    legs: [
      { action: "BUY", optionType: "CE", strikeOffset: 0, name: "Buy ATM CE" },
      { action: "BUY", optionType: "PE", strikeOffset: 0, name: "Buy ATM PE" },
    ],
  },
  {
    id: "long-strangle",
    name: "Long Strangle",
    description:
      "Buy OTM Call + Buy OTM Put. Cheaper than straddle but requires larger move. Profits from significant price movement in either direction beyond the breakevens.",
    marketView: "VOLATILE",
    riskLevel: "MEDIUM",
    legs: [
      { action: "BUY", optionType: "CE", strikeOffset: 3, name: "Buy OTM CE (+3)" },
      { action: "BUY", optionType: "PE", strikeOffset: -3, name: "Buy OTM PE (-3)" },
    ],
  },
  {
    id: "bull-call-spread",
    name: "Bull Call Spread",
    description:
      "Buy ATM Call + Sell OTM Call. Limited risk and reward strategy. Profits when the underlying moves moderately upward. Net cost is reduced by selling the higher strike.",
    marketView: "BULLISH",
    riskLevel: "LOW",
    legs: [
      { action: "BUY", optionType: "CE", strikeOffset: 0, name: "Buy ATM CE" },
      { action: "SELL", optionType: "CE", strikeOffset: 5, name: "Sell OTM CE (+5)" },
    ],
  },
  {
    id: "bear-put-spread",
    name: "Bear Put Spread",
    description:
      "Buy ATM Put + Sell OTM Put. Limited risk strategy that profits from moderate decline. Net cost reduced by selling lower strike put.",
    marketView: "BEARISH",
    riskLevel: "LOW",
    legs: [
      { action: "BUY", optionType: "PE", strikeOffset: 0, name: "Buy ATM PE" },
      { action: "SELL", optionType: "PE", strikeOffset: -5, name: "Sell OTM PE (-5)" },
    ],
  },
  {
    id: "short-straddle",
    name: "Short Straddle",
    description:
      "Sell ATM Call + Sell ATM Put. Profits when price stays within a range. Unlimited risk - not recommended for beginners. High margin requirement.",
    marketView: "NEUTRAL",
    riskLevel: "HIGH",
    legs: [
      { action: "SELL", optionType: "CE", strikeOffset: 0, name: "Sell ATM CE" },
      { action: "SELL", optionType: "PE", strikeOffset: 0, name: "Sell ATM PE" },
    ],
  },
  {
    id: "short-strangle",
    name: "Short Strangle",
    description:
      "Sell OTM Call + Sell OTM Put. Profits when price stays in a wider range. Cheaper premium collection but larger risk zone. Requires high margin.",
    marketView: "NEUTRAL",
    riskLevel: "HIGH",
    legs: [
      { action: "SELL", optionType: "CE", strikeOffset: 5, name: "Sell OTM CE (+5)" },
      { action: "SELL", optionType: "PE", strikeOffset: -5, name: "Sell OTM PE (-5)" },
    ],
  },
  {
    id: "iron-condor",
    name: "Iron Condor",
    description:
      "Sell OTM Strangle + Buy further OTM Strangle. Defined risk credit spread. Profits from range-bound markets. One of the most popular income strategies in Indian markets.",
    marketView: "NEUTRAL",
    riskLevel: "LOW",
    legs: [
      { action: "SELL", optionType: "CE", strikeOffset: 3, name: "Sell OTM CE (+3)" },
      { action: "BUY", optionType: "CE", strikeOffset: 7, name: "Buy Far OTM CE (+7)" },
      { action: "SELL", optionType: "PE", strikeOffset: -3, name: "Sell OTM PE (-3)" },
      { action: "BUY", optionType: "PE", strikeOffset: -7, name: "Buy Far OTM PE (-7)" },
    ],
  },
  {
    id: "iron-butterfly",
    name: "Iron Butterfly",
    description:
      "Sell ATM Straddle + Buy OTM Strangle. Defined risk credit spread. Tighter range than Iron Condor but higher premium. Best for very range-bound markets.",
    marketView: "NEUTRAL",
    riskLevel: "LOW",
    legs: [
      { action: "SELL", optionType: "CE", strikeOffset: 0, name: "Sell ATM CE" },
      { action: "BUY", optionType: "CE", strikeOffset: 5, name: "Buy OTM CE (+5)" },
      { action: "SELL", optionType: "PE", strikeOffset: 0, name: "Sell ATM PE" },
      { action: "BUY", optionType: "PE", strikeOffset: -5, name: "Buy OTM PE (-5)" },
    ],
  },
  {
    id: "long-call",
    name: "Long Call",
    description:
      "Simple directional bullish bet. Buy a Call option at a chosen strike. Unlimited profit potential with limited risk (premium paid). Best for strong bullish view.",
    marketView: "BULLISH",
    riskLevel: "MEDIUM",
    legs: [{ action: "BUY", optionType: "CE", strikeOffset: 0, name: "Buy ATM CE" }],
  },
  {
    id: "long-put",
    name: "Long Put",
    description:
      "Simple directional bearish bet. Buy a Put option at a chosen strike. Profit potential limited to strike minus premium. Best for strong bearish view or hedging.",
    marketView: "BEARISH",
    riskLevel: "MEDIUM",
    legs: [{ action: "BUY", optionType: "PE", strikeOffset: 0, name: "Buy ATM PE" }],
  },
  {
    id: "covered-call",
    name: "Covered Call (Synthetic)",
    description:
      "Buy ATM Call + Sell OTM Call (Bull Spread variant). Simulates covered call payoff. Generates income from premium. Capped upside with reduced breakeven.",
    marketView: "MILDLY_BULLISH",
    riskLevel: "LOW",
    legs: [
      { action: "BUY", optionType: "CE", strikeOffset: -2, name: "Buy ITM CE (-2)" },
      { action: "SELL", optionType: "CE", strikeOffset: 3, name: "Sell OTM CE (+3)" },
    ],
  },
  {
    id: "ratio-call-spread",
    name: "Call Ratio Spread",
    description:
      "Buy 1 ATM Call + Sell 2 OTM Calls. Credit or low-cost strategy. Profits in moderate bull market. Risky if market moves sharply above sold strikes.",
    marketView: "MILDLY_BULLISH",
    riskLevel: "HIGH",
    legs: [
      { action: "BUY", optionType: "CE", strikeOffset: 0, name: "Buy ATM CE" },
      { action: "SELL", optionType: "CE", strikeOffset: 5, name: "Sell OTM CE (+5) x2", quantityMultiplier: 2 },
    ],
  },
];

// Strategy P&L Calculator
export interface StrategyLeg {
  action: "BUY" | "SELL";
  optionType: "CE" | "PE";
  strikePrice: number;
  premium: number;
  quantity: number;
}

export interface StrategyPayoff {
  spotPrices: number[];
  pnl: number[];
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
}

export function calculateStrategyPayoff(
  legs: StrategyLeg[],
  spotRange: { min: number; max: number; step: number }
): StrategyPayoff {
  const spotPrices: number[] = [];
  for (let s = spotRange.min; s <= spotRange.max; s += spotRange.step) {
    spotPrices.push(s);
  }

  const pnl: number[] = spotPrices.map((spot) => {
    let totalPnL = 0;
    for (const leg of legs) {
      const intrinsic =
        leg.optionType === "CE"
          ? Math.max(0, spot - leg.strikePrice)
          : Math.max(0, leg.strikePrice - spot);
      const legPnL = leg.action === "BUY" ? intrinsic - leg.premium : leg.premium - intrinsic;
      totalPnL += legPnL * leg.quantity;
    }
    return totalPnL;
  });

  const maxProfit = Math.max(...pnl);
  const maxLoss = Math.min(...pnl);

  const breakevens: number[] = [];
  for (let i = 1; i < pnl.length; i++) {
    if ((pnl[i - 1] <= 0 && pnl[i] >= 0) || (pnl[i - 1] >= 0 && pnl[i] <= 0)) {
      const s1 = spotPrices[i - 1];
      const s2 = spotPrices[i];
      const p1 = pnl[i - 1];
      const p2 = pnl[i];
      const be = s1 + ((-p1) * (s2 - s1)) / (p2 - p1);
      breakevens.push(Math.round(be * 100) / 100);
    }
  }

  return { spotPrices, pnl, maxProfit, maxLoss, breakevens };
}
