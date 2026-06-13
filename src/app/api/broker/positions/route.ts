import { NextRequest, NextResponse } from "next/server";
import {
  zerodhaPositions,
  upstoxPositions,
  angelOnePositions,
  dhanPositions,
  type BrokerPosition,
} from "@/lib/broker-api";

// Broker Positions API — fetches real open positions from the connected broker

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const broker = searchParams.get("broker");
    const accessToken = searchParams.get("accessToken");
    const apiKey = searchParams.get("apiKey");

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
        count: 0,
        totalPnl: 0,
        message: "Groww does not support API trading. No positions available.",
      });
    }

    let positions: BrokerPosition[] = [];

    switch (broker) {
      case "ZERODHA": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Zerodha" }, { status: 400 });
        }
        positions = await zerodhaPositions(apiKey, accessToken);
        break;
      }

      case "UPSTOX": {
        positions = await upstoxPositions(accessToken);
        break;
      }

      case "ANGEL_ONE": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Angel One" }, { status: 400 });
        }
        const clientCode = searchParams.get("apiSecret") || "";
        positions = await angelOnePositions(apiKey, accessToken, clientCode);
        break;
      }

      case "DHAN": {
        positions = await dhanPositions(accessToken);
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported broker: ${broker}` }, { status: 400 });
    }

    // Only return NFO (F&O) positions for this app
    const fnoPositions = positions.filter(
      (p) => p.exchange === "NFO" || p.tradingSymbol.includes("CE") || p.tradingSymbol.includes("PE")
    );

    const totalPnl = fnoPositions.reduce((sum, p) => sum + p.pnl, 0);

    return NextResponse.json({
      broker,
      positions: fnoPositions,
      count: fnoPositions.length,
      totalPnl: Math.round(totalPnl * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Positions fetch error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
