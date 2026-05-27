import { NextRequest, NextResponse } from "next/server";
import { fetchOptionChainV3, calculatePCR, calculateMaxPain, getATMStrike } from "@/lib/nse";
import type { NSESymbol } from "@/lib/nse";
import { daysToExpiry } from "@/lib/greeks";

// Server-side cache for stale-while-revalidate pattern
let cachedData: Record<string, { data: unknown; timestamp: number }> = {};
const CACHE_TTL = 45 * 1000; // 45 seconds cache

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") || "NIFTY") as NSESymbol;
    const expiry = searchParams.get("expiry") || undefined;
    const cacheKey = `${symbol}-${expiry || "current"}`;

    const data = await fetchOptionChainV3(symbol, expiry);

    if (!data || !data.records || !data.records.data?.length) {
      // Check if we have stale cache to return while fresh data fails
      const stale = cachedData[cacheKey];
      if (stale && Date.now() - stale.timestamp < 120 * 1000) {
        return NextResponse.json({
          ...stale.data as Record<string, unknown>,
          _stale: true,
          _staleAge: Math.round((Date.now() - stale.timestamp) / 1000),
        });
      }

      const now = new Date();
      const istH = now.getUTCHours();
      const istM = (now.getUTCMinutes() + 30);
      const istHour = (istH + 5 + Math.floor(istM / 60)) % 24;
      const istMin = istM % 60;
      const day = now.getUTCDay();
      const isWeekend = day === 0 || day === 6;
      const afterMarket = istHour >= 16;
      const beforeMarket = istHour < 9 || (istHour === 9 && istMin < 15);

      let reason = "NSE servers may be unreachable or rate-limited from your IP.";
      if (isWeekend) reason = "Market is closed (Weekend). Try during market hours (Mon-Fri, 9:15 AM - 3:30 PM IST).";
      else if (afterMarket) reason = "Market is closed for the day. Try tomorrow after 9:15 AM IST.";
      else if (beforeMarket) reason = "Market hasn't opened yet. Try after 9:15 AM IST.";
      else reason += " Retrying automatically with backoff (3 attempts).";

      return NextResponse.json(
        { error: `Failed to fetch option chain. ${reason}`, _retrying: true },
        { status: 503 }
      );
    }

    const chainData = data.records.data;
    const spotPrice = chainData[0]?.CE?.underlyingValue || chainData[0]?.PE?.underlyingValue || 0;
    const strikePrices = data.records.strikePrices;
    const expiryDates = data.records.expiryDates;
    const timestamp = data.records.timestamp;

    const pcr = calculatePCR(chainData);
    const maxPainData = calculateMaxPain(chainData, spotPrice);
    const atmStrike = getATMStrike(spotPrice, strikePrices);
    const dte = expiry ? daysToExpiry(expiry) : daysToExpiry(expiryDates[0]);

    const oiByStrike = chainData.map((item) => ({
      strike: item.strikePrice,
      ceOI: item.CE?.openInterest || 0,
      peOI: item.PE?.openInterest || 0,
      ceChangeOI: item.CE?.changeinOpenInterest || 0,
      peChangeOI: item.PE?.changeinOpenInterest || 0,
      ceVolume: item.CE?.totalTradedVolume || 0,
      peVolume: item.PE?.totalTradedVolume || 0,
      ceIV: item.CE?.impliedVolatility || 0,
      peIV: item.PE?.impliedVolatility || 0,
    }));

    let totalCEOI = 0;
    let totalPEOI = 0;
    let totalCEVolume = 0;
    let totalPEVolume = 0;
    let maxCEOI = { strike: 0, oi: 0 };
    let maxPEOI = { strike: 0, oi: 0 };
    let maxCEChangeOI = { strike: 0, change: 0 };
    let maxPEChangeOI = { strike: 0, change: 0 };

    for (const item of chainData) {
      if (item.CE) {
        totalCEOI += item.CE.openInterest || 0;
        totalCEVolume += item.CE.totalTradedVolume || 0;
        if (item.CE.openInterest > maxCEOI.oi) {
          maxCEOI = { strike: item.strikePrice, oi: item.CE.openInterest };
        }
        if (item.CE.changeinOpenInterest > maxCEChangeOI.change) {
          maxCEChangeOI = { strike: item.strikePrice, change: item.CE.changeinOpenInterest };
        }
      }
      if (item.PE) {
        totalPEOI += item.PE.openInterest || 0;
        totalPEVolume += item.PE.totalTradedVolume || 0;
        if (item.PE.openInterest > maxPEOI.oi) {
          maxPEOI = { strike: item.strikePrice, oi: item.PE.openInterest };
        }
        if (item.PE.changeinOpenInterest > maxPEChangeOI.change) {
          maxPEChangeOI = { strike: item.strikePrice, change: item.PE.changeinOpenInterest };
        }
      }
    }

    const strikesAboveATM = chainData.filter(
      (item) => item.strikePrice >= spotPrice && item.PE?.openInterest
    ).sort((a, b) => (b.PE?.openInterest || 0) - (a.PE?.openInterest || 0));
    const strikesBelowATM = chainData.filter(
      (item) => item.strikePrice <= spotPrice && item.CE?.openInterest
    ).sort((a, b) => (b.CE?.openInterest || 0) - (a.CE?.openInterest || 0));

    const resistance = strikesAboveATM[0]?.strikePrice || 0;
    const support = strikesBelowATM[0]?.strikePrice || 0;

    const responseData = {
      symbol,
      spotPrice,
      timestamp,
      atmStrike,
      daysToExpiry: dte,
      expiryDates,
      selectedExpiry: expiry || expiryDates[0],
      chainData,
      analysis: {
        pcr,
        maxPain: maxPainData.maxPain,
        totalCEOI,
        totalPEOI,
        totalCEVolume,
        totalPEVolume,
        maxCEOI,
        maxPEOI,
        maxCEChangeOI,
        maxPEChangeOI,
        resistance,
        support,
      },
      oiByStrike,
    };

    // Update server cache
    cachedData[cacheKey] = { data: responseData, timestamp: Date.now() };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Option chain API error:", error);
    return NextResponse.json(
      { error: "Internal server error fetching option chain data" },
      { status: 500 }
    );
  }
}
