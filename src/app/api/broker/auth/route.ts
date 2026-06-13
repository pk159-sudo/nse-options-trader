import { NextRequest, NextResponse } from "next/server";

// Broker Auth API — generates the OAuth login URL for each broker
// User clicks "Login with OTP" → redirected to broker's login page → enters OTP → redirected back
//
// SECURITY: api_key + api_secret are stored in an encrypted cookie (not URL params)
// so they never leak in browser history, server logs, or referrer headers.

// IMPORTANT: Set NEXT_PUBLIC_APP_URL in .env.local to your deployed URL
// e.g. NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
// For localhost testing: NEXT_PUBLIC_APP_URL=http://localhost:3000
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

    // apiSecret is required for Zerodha, Angel One, and Dhan
    if ((broker === "ZERODHA" || broker === "ANGEL_ONE" || broker === "DHAN") && !apiSecret) {
      const label = broker === "ZERODHA" ? "Zerodha requires API Secret" : broker === "ANGEL_ONE" ? "Angel One requires Client Code" : "Dhan requires API Secret (app_secret)";
      return NextResponse.json(
        { error: `${label} for token exchange` },
        { status: 400 }
      );
    }

    if (!APP_URL) {
      return NextResponse.json(
        { error: "App URL not configured. Set NEXT_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 or https://your-app.vercel.app)" },
        { status: 400 }
      );
    }
    const redirectUrl = `${APP_URL}/api/broker/callback`;

    let loginURL = "";

    switch (broker) {
      // ── Zerodha Kite Connect v3 ──
      // User redirected to Kite login → enters userID + password + TOTP
      // Zerodha redirects back with request_token
      // We exchange request_token + api_secret for access_token
      case "ZERODHA": {
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
        const redirectUri = encodeURIComponent(redirectUrl);
        loginURL = `https://apiconnect.angelbroking.com/rest/auth/authorize/v2?api_key=${apiKey}&client_code=${apiSecret}&redirect_uri=${redirectUri}&state=ANGEL_ONE`;
        break;
      }

      // ── DHAN (Consent-based OAuth — 3 steps) ──
      // Step 1: Server calls generate-consent with client_id + app_secret → gets consentId
      // Step 2: Browser redirects to consent-login?consentId=... → user logs in + 2FA
      //         Dhan redirects back to our callback with tokenId
      // Step 3: Callback exchanges tokenId for access_token
      case "DHAN": {
        // Generate consent server-side (requires API key + secret in headers)
        const consentRes = await fetch("https://auth.dhan.co/app/generate-consent", {
          method: "POST",
          headers: {
            "client_id": apiKey,
            "app_secret": apiSecret,
            "Content-Type": "application/json",
          },
        });

        if (!consentRes.ok) {
          const errText = await consentRes.text().catch(() => "");
          return NextResponse.json(
            { error: `Dhan consent generation failed (${consentRes.status}). ${errText.substring(0, 200)}. Check your API Key and Secret.` },
            { status: consentRes.status }
          );
        }

        let consentData: Record<string, unknown>;
        try {
          consentData = await consentRes.json() as Record<string, unknown>;
        } catch {
          return NextResponse.json(
            { error: "Invalid response from Dhan consent API. Check your credentials." },
            { status: 502 }
          );
        }

        const consentId = String(consentData.consentId || consentData.consent_id || "");
        if (!consentId) {
          return NextResponse.json(
            { error: `Dhan did not return a consentId. Response: ${JSON.stringify(consentData).substring(0, 200)}` },
            { status: 502 }
          );
        }

        // Step 2: Redirect browser to Dhan login page
        // Dhan will redirect back to our callback URL with tokenId
        loginURL = `https://auth.dhan.co/consent-login?consentId=${consentId}`;
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
