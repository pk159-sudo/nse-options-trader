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
    if (!broker || !accessToken) {
      return NextResponse.json(
        { error: "Missing required fields: broker, accessToken" },
        { status: 400 }
      );
    }

    // apiKey is required for Zerodha (sent in auth header), Upstox (client_id), Angel One (source ID)
    // Dhan only needs accessToken for API calls, but apiKey is needed for OAuth
    if (!apiKey && broker !== "DHAN" && broker !== "GROWW") {
      return NextResponse.json(
        { error: "Missing required field: apiKey" },
        { status: 400 }
      );
    }

    // apiSecret is required for Zerodha (checksum), Angel One (client code), and Dhan (app_secret for OAuth)
    // But for manual token connect, Dhan + Upstox can work without it
    const needsSecret = broker === "ZERODHA" || broker === "ANGEL_ONE";
    if (needsSecret && !apiSecret) {
      return NextResponse.json(
        { error: `${broker === "ZERODHA" ? "Zerodha" : "Angel One"} requires API Secret / Client Code` },
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

      // Give user-friendly error messages
      let userError = errorMsg;
      if (errorMsg.includes("Invalid response") || errorMsg.includes("HTML page")) {
        userError = `Could not reach ${broker}. Possible reasons: wrong API key, expired access token, or broker is under maintenance.`;
      } else if (errorMsg.includes("401") || errorMsg.includes("403")) {
        userError = `Authentication failed. Your API key or access token is invalid/expired.`;
      }

      return NextResponse.json(
        { error: userError },
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
