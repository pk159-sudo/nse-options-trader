import { NextRequest, NextResponse } from "next/server";

// Broker Auth API — generates the OAuth login URL for each broker
// User clicks "Login" → redirected to broker's login page → enters OTP → redirected back

const REDIRECT_BASE = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/broker/callback`
  : "/api/broker/callback";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { broker, apiKey, apiSecret } = body;

    if (!broker || !apiKey) {
      return NextResponse.json(
        { error: "Missing broker or apiKey" },
        { status: 400 }
      );
    }

    let loginURL = "";

    switch (broker) {
      // ── Zerodha Kite Connect v3 ──
      // User is redirected to Kite login, enters userID + password + TOTP/OTP
      // After auth, Zerodha redirects back with request_token as query param
      case "ZERODHA": {
        if (!apiSecret) {
          return NextResponse.json(
            { error: "Zerodha requires API Secret for checksum generation" },
            { status: 400 }
          );
        }
        const redirectUrl = encodeURIComponent(REDIRECT_BASE);
        loginURL = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_url=${redirectUrl}`;
        break;
      }

      // ── Upstox API v2 ──
      // User is redirected to Upstox login, enters credentials + OTP
      // Upstox redirects back with 'code' query param
      case "UPSTOX": {
        const redirectUri = encodeURIComponent(REDIRECT_BASE);
        loginURL = `https://api.upstox.com/v2/login/authorize?client_id=${apiKey}&redirect_uri=${redirectUri}&response_type=code&state=${broker}`;
        break;
      }

      // ── Angel One SmartAPI ──
      // User is redirected to Angel One login, enters client code + OTP
      // Angel One redirects back with 'auth_code' query param
      case "ANGEL_ONE": {
        if (!apiSecret) {
          return NextResponse.json(
            { error: "Angel One requires Client Code (entered as API Secret)" },
            { status: 400 }
          );
        }
        const redirectUri = encodeURIComponent(REDIRECT_BASE);
        loginURL = `https://apiconnect.angelbroking.com/rest/auth/authorize/v2?api_key=${apiKey}&client_code=${apiSecret}&redirect_uri=${redirectUri}&state=${broker}`;
        break;
      }

      // ── Dhan ──
      // User is redirected to Dhan login, enters credentials + OTP
      // Dhan redirects back with 'access_token' in fragment
      case "DHAN": {
        const redirectUri = encodeURIComponent(REDIRECT_BASE);
        loginURL = `https://api.dhan.co/auth?client_id=${apiKey}&redirect_uri=${redirectUri}&state=${broker}&response_type=code`;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unsupported broker for OAuth: ${broker}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, loginURL, broker });
  } catch (error) {
    console.error("Broker auth error:", error);
    return NextResponse.json(
      { error: "Failed to generate login URL" },
      { status: 500 }
    );
  }
}
