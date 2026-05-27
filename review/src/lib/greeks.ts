// Black-Scholes Options Greeks Calculator
// For European-style options

const SQRT2PI = Math.sqrt(2 * Math.PI);

// Cumulative normal distribution function (CDF)
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2.0);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normalPDF(x: number): number {
  return Math.exp((-x * x) / 2.0) / SQRT2PI;
}

export interface GreeksResult {
  theoreticalPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  iv: number;
}

export interface GreeksInput {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number; // in years
  riskFreeRate: number; // annual rate (e.g., 0.07 for 7%)
  volatility: number; // annual volatility (e.g., 0.15 for 15%)
  optionType: "CE" | "PE";
}

export function calculateGreeks(input: GreeksInput): GreeksResult {
  const { spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility, optionType } = input;

  if (timeToExpiry <= 0) {
    // At expiry
    const intrinsicValue =
      optionType === "CE"
        ? Math.max(0, spotPrice - strikePrice)
        : Math.max(0, strikePrice - spotPrice);

    return {
      theoreticalPrice: intrinsicValue,
      delta: spotPrice > strikePrice ? (optionType === "CE" ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      iv: volatility,
    };
  }

  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spotPrice / strikePrice) + (riskFreeRate + (volatility * volatility) / 2) * timeToExpiry) /
    (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  if (optionType === "CE") {
    const nd1 = normalCDF(d1);
    const nd2 = normalCDF(d2);
    const npd1 = normalPDF(d1);

    const theoreticalPrice =
      spotPrice * nd1 - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * nd2;

    const delta = nd1;
    const gamma = npd1 / (spotPrice * volatility * sqrtT);
    const theta =
      (-(spotPrice * npd1 * volatility) / (2 * sqrtT) -
        riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * nd2) /
      365;
    const vega = (spotPrice * npd1 * sqrtT) / 100;
    const rho = (strikePrice * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * nd2) / 100;

    return { theoreticalPrice, delta, gamma, theta, vega, rho, iv: volatility };
  } else {
    const nnd1 = normalCDF(-d1);
    const nnd2 = normalCDF(-d2);
    const npd1 = normalPDF(d1);

    const theoreticalPrice =
      strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * nnd2 - spotPrice * nnd1;

    const delta = nd1 - 1; // Put delta = N(d1) - 1
    const gamma = npd1 / (spotPrice * volatility * sqrtT);
    const theta =
      (-(spotPrice * npd1 * volatility) / (2 * sqrtT) +
        riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * nnd2) /
      365;
    const vega = (spotPrice * npd1 * sqrtT) / 100;
    const rho =
      (-strikePrice * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * nnd2) / 100;

    return { theoreticalPrice, delta, gamma, theta, vega, rho, iv: volatility };
  }
}

// Implied Volatility calculation using Newton-Raphson method
export function calculateImpliedVolatility(
  marketPrice: number,
  spotPrice: number,
  strikePrice: number,
  timeToExpiry: number,
  riskFreeRate: number,
  optionType: "CE" | "PE"
): number {
  let iv = 0.3; // Initial guess of 30%
  const maxIterations = 100;
  const tolerance = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    const greeks = calculateGreeks({
      spotPrice,
      strikePrice,
      timeToExpiry,
      riskFreeRate,
      volatility: iv,
      optionType,
    });

    const priceDiff = greeks.theoreticalPrice - marketPrice;

    if (Math.abs(priceDiff) < tolerance) break;
    if (greeks.vega === 0) break;

    const vegaForCalc = greeks.vega * 100; // Convert back from percentage
    iv = iv - priceDiff / vegaForCalc;

    if (iv < 0.001) iv = 0.001;
    if (iv > 5) iv = 5;
  }

  return iv;
}

// Calculate days to expiry
export function daysToExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);

  // If expiry is before today, return 0
  if (expiry < now) return 0;

  // NSE expires at 3:30 PM IST
  expiry.setHours(15, 30, 0, 0);
  now.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

  const diffMs = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// Get ATM strike from spot price
export function getATMStrike(spotPrice: number, strikePrices: number[]): number {
  let atm = strikePrices[0];
  let minDiff = Math.abs(spotPrice - atm);

  for (const strike of strikePrices) {
    const diff = Math.abs(spotPrice - strike);
    if (diff < minDiff) {
      minDiff = diff;
      atm = strike;
    }
  }

  return atm;
}

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
      // Linear interpolation
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
