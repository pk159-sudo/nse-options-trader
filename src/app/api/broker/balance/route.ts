import { NextRequest, NextResponse } from "next/server";
import {
  zerodhaBalance,
  upstoxBalance,
  angelOneBalance,
  dhanBalance,
} from "@/lib/broker-api";

// Broker Balance API — fetches real margin/funds from the connected broker

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
        balance: 0,
        availableMargin: 0,
        usedMargin: 0,
        currency: "INR",
        message: "Groww does not support API trading. Balance not available.",
      });
    }

    let result;

    switch (broker) {
      case "ZERODHA": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Zerodha" }, { status: 400 });
        }
        result = await zerodhaBalance(apiKey, accessToken);
        break;
      }

      case "UPSTOX": {
        result = await upstoxBalance(accessToken);
        break;
      }

      case "ANGEL_ONE": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Angel One" }, { status: 400 });
        }
        // apiSecret is passed as clientCode for Angel One
        const clientCode = searchParams.get("apiSecret") || "";
        result = await angelOneBalance(apiKey, accessToken, clientCode);
        break;
      }

      case "DHAN": {
        result = await dhanBalance(accessToken);
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported broker: ${broker}` }, { status: 400 });
    }

    return NextResponse.json({
      broker,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
