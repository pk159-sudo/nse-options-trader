import { NextRequest, NextResponse } from "next/server";

// Broker Balance API - fetches account balance from the connected broker
// In production, this would call the broker's actual margin/funds API
// For now, returns mock balance data

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
        balance: 0,
        message: "Groww does not support API trading. Balance not available.",
      });
    }

    /*
     * PRODUCTION IMPLEMENTATION:
     *
     * Zerodha:
     *   const margins = await kiteConnect.getMargins();
     *   return margins.equity.net;
     *
     * Angel One:
     *   const balance = await smartConnect.getBalance();
     *   return balance.data.net;
     *
     * Upstox:
     *   const response = await fetch("https://api.upstox.com/v2/user/get-funds-and-margin", {
     *     headers: { Authorization: `Bearer ${accessToken}` },
     *   });
     *   return response.data.equity.available_margin;
     *
     * Dhan:
     *   const response = await fetch("https://api.dhan.co/v2/funds", {
     *     headers: { "access_token": accessToken },
     *   });
     *   return response.data.availabelBalance;
     */

    // Mock balance with slight randomization
    const baseBalances: Record<string, number> = {
      ZERODHA: 125000,
      ANGEL_ONE: 98000,
      UPSTOX: 75000,
      DHAN: 112000,
    };

    const baseBalance = baseBalances[broker] || 100000;
    const balance = baseBalance + Math.floor((Math.random() - 0.5) * 10000);

    return NextResponse.json({
      broker,
      balance,
      availableMargin: balance * 0.8, // 80% available for trading
      usedMargin: balance * 0.2,
      currency: "INR",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
