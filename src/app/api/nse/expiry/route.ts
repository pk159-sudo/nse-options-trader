import { NextRequest, NextResponse } from "next/server";
import { fetchExpiryDates } from "@/lib/nse";

// Simple cache for expiry dates (changes rarely)
let cachedExpiry: { symbol: string; dates: string[]; timestamp: number } | null = null;
const EXPIRY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "NIFTY";

    // Return cached expiry dates if fresh
    if (cachedExpiry && cachedExpiry.symbol === symbol && Date.now() - cachedExpiry.timestamp < EXPIRY_CACHE_TTL) {
      return NextResponse.json({
        symbol,
        expiryDates: cachedExpiry.dates,
        _cached: true,
      });
    }

    const expiryDates = await fetchExpiryDates(symbol);

    if (!expiryDates) {
      // Return stale cache if available
      if (cachedExpiry && cachedExpiry.symbol === symbol) {
        return NextResponse.json({
          symbol,
          expiryDates: cachedExpiry.dates,
          _stale: true,
        });
      }
      return NextResponse.json(
        { error: "Failed to fetch expiry dates from NSE" },
        { status: 503 }
      );
    }

    // Update cache
    cachedExpiry = { symbol, dates: expiryDates, timestamp: Date.now() };

    return NextResponse.json({
      symbol,
      expiryDates,
    });
  } catch (error) {
    console.error("Expiry API error:", error);
    return NextResponse.json(
      { error: "Internal server error fetching expiry dates" },
      { status: 500 }
    );
  }
}
