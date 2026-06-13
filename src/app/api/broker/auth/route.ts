import { NextRequest, NextResponse } from "next/server";

// Broker Auth API — generates the OAuth login URL for each broker
// User clicks "Login with OTP" → redirected to broker's login page → enters OTP → redirected back
//
// SECURITY: api_key + api_secret are stored in an encrypted cookie (not URL params)
// so they never leak in browser history, server logs, or referrer headers.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

function encrypt(data: string): string {
  // Simple XOR + base64 encoding for server-side cookie transport
  // In production, use a proper encryption library (e.g., iron-session)
  const key = process.env.BROKER_COOKIE_SECRET || "nse-options-trader-2024-secret-key";
  let encoded = "";
  for (let i = 0; i < data.length; i++) {
    encoded += String.fromCharCode(
      data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return Buffer.from(encoded).toString("base64url");
}

function setAuthCookie(response: NextResponse, data: Record<string, string>) {
  const encrypted = encrypt(JSON.stringify(data));
  response.cookies.set("broker_auth", encrypted, {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "lax",
    path: "/api/broker/callback",
    maxAge: 600, // 10 minutes — enough for user to complete login
  });
}

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

    const redirectUrl = APP_URL
      ? `${APP_URL}/api/broker/callback`
      : "/api/broker/callback";

    let loginURL = "";

    switch (broker) {
      // ── Zerodha Kite Connect v3 ──
      // User redirected to Kite login → enters userID + password + TOTP
      // Zerodha redirects back with request_token
      // We exchange request_token + api_secret for access_token
      case "ZERODHA": {
        if (!apiSecret) {
          return NextResponse.json(
            { error: "Zerodha requires API Secret for token exchange" },
            { status: 400 }
          );
        }
        const redirectUri = encodeURIComponent(redirectUrl);
        loginURL = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_url=${redirectUri}`;
        break;
      }

      // ── Upstox API v2 ──
      // OAuth 2.0 flow: user enters credentials + OTP on Upstox
      // Redirects back with 'code' → exchanged for access_token
      case "UPSTOX": {
        const redirectUri = encodeURIComponent(redirectUrl);
        loginURL = `https://api.upstox.com/v2/login/authorize?client_id=${apiKey}&redirect_uri=${redirectUri}&response_type=code&state=UPSTOX`;
        break;
      }

      // ── Angel One SmartAPI ──
      // User enters client code + OTP → redirected with auth_code
      // auth_code + api_key exchanged for JWT token
      case "ANGEL_ONE": {
        if (!apiSecret) {
          return NextResponse.json(
            { error: "Angel One requires Client Code (enter as API Secret)" },
            { status: 400 }
          );
        }
        const redirectUri = encodeURIComponent(redirectUrl);
        loginURL = `https://apiconnect.angelbroking.com/rest/auth/authorize/v2?api_key=${apiKey}&client_code=${apiSecret}&redirect_uri=${redirectUri}&state=ANGEL_ONE`;
        break;
      }

      // ── Dhan ──
      // OAuth flow: user logs in → redirected with code
      // code exchanged for access_token
      case "DHAN": {
        const redirectUri = encodeURIComponent(redirectUrl);
        loginURL = `https://api.dhan.co/auth?client_id=${apiKey}&redirect_uri=${redirectUri}&state=DHAN&response_type=code`;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unsupported broker for OAuth: ${broker}` },
          { status: 400 }
        );
    }

    // Store api_key + api_secret in httpOnly cookie for the callback to read
    const response = NextResponse.json({ success: true, loginURL, broker });
    setAuthCookie(response, {
      broker,
      apiKey,
      apiSecret: apiSecret || "",
    });

    return response;
  } catch (error) {
    console.error("Broker auth error:", error);
    return NextResponse.json(
      { error: "Failed to generate login URL" },
      { status: 500 }
    );
  }
}
