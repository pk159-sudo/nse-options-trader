import { NextRequest, NextResponse } from "next/server";

// Broker Positions API - fetches open positions from the connected broker
// In production, this would call the broker's actual positions API
// For now, returns mock positions data

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const broker = searchParams.get("broker");
    const accessToken = searchParams.get("accessToken");

    if (!broker || !accessToken) {
      return NextResponse.json(
        { error: "Missing broker or accessToken parameter" },
        { status: 400 }
      );
    }

    if (broker === "GROWW") {
      return NextResponse.json({
        broker,
        positions: [],
        message: "Groww does not support API trading. No positions available.",
      });
    }

    /*
     * PRODUCTION IMPLEMENTATION:
     *
     * Zerodha:
     *   const positions = await kiteConnect.getPositions();
     *
     * Angel One:
     *   const positions = await smartConnect.getPosition();
     *
     * Upstox:
     *   const response = await fetch("https://api.upstox.com/v2/portfolio/short-term-positions", {
     *     headers: { Authorization: `Bearer ${accessToken}` },
     *   });
     *
     * Dhan:
     *   const response = await fetch("https://api.dhan.co/v2/positions", {
     *     headers: { "access_token": accessToken },
     *   });
     */

    // Mock positions
    const mockPositions = [
      {
        tradingSymbol: "NIFTY24500CE",
        exchange: "NFO",
        transactionType: "BUY",
        quantity: 65,
        averagePrice: 245.5,
        currentPrice: 278.3,
        pnl: (278.3 - 245.5) * 65,
        pnlPercent: ((278.3 - 245.5) / 245.5) * 100,
        product: "MIS",
      },
      {
        tradingSymbol: "NIFTY24400PE",
        exchange: "NFO",
        transactionType: "BUY",
        quantity: 65,
        averagePrice: 182.75,
        currentPrice: 165.4,
        pnl: (165.4 - 182.75) * 65,
        pnlPercent: ((165.4 - 182.75) / 182.75) * 100,
        product: "MIS",
      },
    ];

    return NextResponse.json({
      broker,
      positions: mockPositions,
      count: mockPositions.length,
      totalPnl: mockPositions.reduce((sum, p) => sum + p.pnl, 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Positions fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
