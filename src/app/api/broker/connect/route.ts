import { NextRequest, NextResponse } from "next/server";
import {
  zerodhaProfile,
  zerodhaBalance,
  upstoxProfile,
  upstoxBalance,
  angelOneProfile,
  angelOneBalance,
  dhanProfile,
  dhanBalance,
} from "@/lib/broker-api";

// Broker Connect API — validates credentials against real broker APIs

interface ConnectRequest {
  broker: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
}

const VALID_BROKERS = ["ZERODHA", "ANGEL_ONE", "UPSTOX", "DHAN", "GROWW"];

export async function POST(request: NextRequest) {
  try {
    const body: ConnectRequest = await request.json();
    const { broker, apiKey, apiSecret, accessToken } = body;

    // Validate required fields
    if (!broker || !apiKey || !apiSecret || !accessToken) {
      return NextResponse.json(
        { error: "Missing required fields: broker, apiKey, apiSecret, accessToken" },
        { status: 400 }
      );
    }

    // Validate broker name
    if (!VALID_BROKERS.includes(broker)) {
      return NextResponse.json(
        { error: `Invalid broker. Supported: ${VALID_BROKERS.join(", ")}` },
        { status: 400 }
      );
    }

    // Groww doesn't have an API — paper trade only
    if (broker === "GROWW") {
      return NextResponse.json({
        success: true,
        broker,
        userId: "GROWW_PAPER",
        balance: 0,
        message: "Groww does not support API trading. Connected in paper-trade mode only.",
        paperTradeOnly: true,
        connectedAt: new Date().toISOString(),
      });
    }

    // ── Real broker validation ──
    let userId = "";
    let balance = 0;
    let errorMsg = "";

    try {
      switch (broker) {
        case "ZERODHA": {
          // Validate credentials by fetching profile + margins
          const [profile, margins] = await Promise.all([
            zerodhaProfile(apiKey, accessToken),
            zerodhaBalance(apiKey, accessToken),
          ]);
          userId = profile.userId;
          balance = margins.balance;
          break;
        }

        case "UPSTOX": {
          // Upstox only needs accessToken; apiKey is stored but not sent to their API
          const [profile, funds] = await Promise.all([
            upstoxProfile(accessToken),
            upstoxBalance(accessToken),
          ]);
          userId = profile.userId;
          balance = funds.balance;
          break;
        }

        case "ANGEL_ONE": {
          // Angel One needs clientCode = apiSecret (user ID), apiKey = app key
          const clientCode = apiSecret; // Angel One uses client code as the "secret"
          const [profile, rms] = await Promise.all([
            angelOneProfile(apiKey, accessToken, clientCode),
            angelOneBalance(apiKey, accessToken, clientCode),
          ]);
          userId = profile.userId;
          balance = rms.balance;
          break;
        }

        case "DHAN": {
          const [profile, funds] = await Promise.all([
            dhanProfile(accessToken),
            dhanBalance(accessToken),
          ]);
          userId = profile.userId;
          balance = funds.balance;
          break;
        }
      }
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : "Authentication failed";
      console.error(`Broker connect [${broker}] error:`, errorMsg);
      return NextResponse.json(
        { error: `Connection failed: ${errorMsg}` },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      broker,
      userId,
      balance,
      message: `Successfully connected to ${broker.replace("_", " ")}`,
      paperTradeOnly: false,
      connectedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Broker connect error:", error);
    return NextResponse.json(
      { error: "Failed to connect broker account" },
      { status: 500 }
    );
  }
}
