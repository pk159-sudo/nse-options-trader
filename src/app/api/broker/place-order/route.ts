import { NextRequest, NextResponse } from "next/server";
import {
  zerodhaPlaceOrder,
  upstoxPlaceOrder,
  angelOnePlaceOrder,
  dhanPlaceOrder,
} from "@/lib/broker-api";

// Broker Place Order API — places a real order on the connected broker

interface PlaceOrderRequest {
  broker: string;
  accessToken: string;
  apiKey?: string;
  symbol: string;
  strikePrice: number;
  optionType: "CE" | "PE";
  transactionType: "BUY" | "SELL";
  quantity: number;
  price: number;
  orderType?: "MARKET" | "LIMIT";
  product?: "MIS" | "NRML";
}

export async function POST(request: NextRequest) {
  try {
    const body: PlaceOrderRequest = await request.json();
    const {
      broker,
      accessToken,
      apiKey,
      symbol,
      strikePrice,
      optionType,
      transactionType,
      quantity,
      price,
      orderType = "MARKET",
      product = "MIS",
    } = body;

    // Validate required fields
    if (!broker || !accessToken || !symbol || !strikePrice || !optionType || !transactionType || !quantity) {
      return NextResponse.json(
        { error: "Missing required order fields" },
        { status: 400 }
      );
    }

    // Groww doesn't support API trading
    if (broker === "GROWW") {
      return NextResponse.json(
        { error: "Groww does not support API trading. Use paper trade mode." },
        { status: 400 }
      );
    }

    const params = { symbol, strikePrice, optionType, transactionType, quantity, price, orderType, product };

    let result;

    switch (broker) {
      case "ZERODHA": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Zerodha" }, { status: 400 });
        }
        result = await zerodhaPlaceOrder(apiKey, accessToken, params);
        break;
      }

      case "UPSTOX": {
        result = await upstoxPlaceOrder(accessToken, params);
        break;
      }

      case "ANGEL_ONE": {
        if (!apiKey) {
          return NextResponse.json({ error: "Missing apiKey for Angel One" }, { status: 400 });
        }
        // Angel One uses apiSecret as clientCode
        const clientCode = body.apiSecret || "";
        result = await angelOnePlaceOrder(apiKey, accessToken, clientCode, params);
        break;
      }

      case "DHAN": {
        // Dhan needs clientId — use apiSecret as clientId
        const clientId = body.apiSecret || apiKey || "";
        result = await dhanPlaceOrder(accessToken, clientId, params);
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported broker: ${broker}` }, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Place order error:", error);
    const msg = error instanceof Error ? error.message : "Failed to place order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
