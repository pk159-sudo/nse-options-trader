import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";

// Broker Callback API — handles OAuth redirect back from broker
// Each broker sends back different params → we exchange for access_token
// Then redirect user back to the app with token info

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

function redirectWithToken(
  broker: string,
  accessToken: string,
  userId: string,
  balance: number
): NextResponse {
  // Redirect back to the main app with token info in query params
  // The frontend AccountConnector will pick these up and connect
  const params = new URLSearchParams({
    broker,
    accessToken,
    userId,
    balance: String(balance),
    status: "connected",
  });

  return NextResponse.redirect(`${APP_URL || "/"}?${params.toString()}`);
}

function redirectWithError(error: string): NextResponse {
  const params = new URLSearchParams({ error, status: "error" });
  return NextResponse.redirect(`${APP_URL || "/"}?${params.toString()}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const broker = searchParams.get("state") || searchParams.get("broker") || "";

  try {
    // ──────────────────────────────
    //  ZERODHA: request_token in query param
    // ──────────────────────────────
    if (broker === "ZERODHA" || searchParams.get("request_token")) {
      const requestToken = searchParams.get("request_token");
      const apiKey = searchParams.get("api_key");

      if (!requestToken || !apiKey) {
        return redirectWithError("Missing request_token or api_key from Zerodha");
      }

      // We need the API Secret for checksum — stored temporarily in the auth flow
      // For now, we use the apiKey from the callback URL params
      // The checksum = SHA256(api_key + request_token + api_secret)
      // Since we can't securely pass api_secret through URL, we store it
      // temporarily and retrieve it here

      // Exchange request_token for access_token via Kite session API
      const checksumUrl = `https://api.kite.trade/session/token`;

      // Read apiSecret from a temp storage (passed via hidden state in URL-encoded form)
      // In production, use server-side session/DB. For now, we pass it encoded.
      const apiSecret = searchParams.get("api_secret") || "";

      if (!apiSecret) {
        return redirectWithError(
          "API Secret required for Zerodha token exchange. Please ensure it was entered."
        );
      }

      const checksum = createHash("sha256")
        .update(`${apiKey}${requestToken}${apiSecret}`)
        .digest("hex");

      const res = await fetch(checksumUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Kite-Version": "3",
        },
        body: `api_key=${encodeURIComponent(apiKey)}&request_token=${encodeURIComponent(requestToken)}&checksum=${checksum}`,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          err.message || `Zerodha token exchange failed (${res.status})`
        );
      }

      const data = await res.json();
      const accessToken = data.data?.access_token || "";
      const userId = data.data?.user_id || "";

      if (!accessToken) {
        return redirectWithError("No access_token received from Zerodha");
      }

      // Fetch balance
      let balance = 0;
      try {
        const marginRes = await fetch(
          "https://api.kite.trade/user/margins?segment=EQ",
          {
            headers: {
              "X-Kite-Version": "3",
              Authorization: `token ${apiKey}:${accessToken}`,
            },
          }
        );
        if (marginRes.ok) {
          const marginData = await marginRes.json();
          balance = marginData.equity?.[0]?.net || 0;
        }
      } catch {
        // Balance fetch failed — still connect with 0
      }

      return redirectWithToken("ZERODHA", accessToken, userId, balance);
    }

    // ──────────────────────────────
    //  UPSTOX: code in query param
    // ──────────────────────────────
    if (broker === "UPSTOX" || searchParams.get("code")) {
      const code = searchParams.get("code");
      const apiKey = searchParams.get("api_key");

      if (!code) {
        return redirectWithError("Missing authorization code from Upstox");
      }

      const redirectUri = encodeURIComponent(
        `${APP_URL}/api/broker/callback`
      );

      // Exchange code for access_token
      const res = await fetch("https://api.upstox.com/v2/login/authorization-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client_id: apiKey,
          client_secret: "", // Upstox doesn't use client_secret for web flow
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          err.errors?.[0]?.message || `Upstox token exchange failed (${res.status})`
        );
      }

      const data = await res.json();
      const accessToken = data.data?.access_token || "";
      const userId = data.data?.user_id || "";

      if (!accessToken) {
        return redirectWithError("No access_token received from Upstox");
      }

      // Fetch balance
      let balance = 0;
      try {
        const fundRes = await fetch(
          "https://api.upstox.com/v2/user/get-funds-and-margin",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          }
        );
        if (fundRes.ok) {
          const fundData = await fundRes.json();
          balance =
            Number(fundData.data?.equity?.available_margin) ||
            Number(fundData.data?.equity?.net) ||
            0;
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken("UPSTOX", accessToken, userId, balance);
    }

    // ──────────────────────────────
    //  ANGEL ONE: auth_code in query param
    // ──────────────────────────────
    if (broker === "ANGEL_ONE" || searchParams.get("auth_code")) {
      const authCode = searchParams.get("auth_code") || searchParams.get("code");
      const apiKey = searchParams.get("api_key");
      const clientCode = searchParams.get("client_code") || "";

      if (!authCode || !apiKey) {
        return redirectWithError(
          "Missing auth_code or api_key from Angel One"
        );
      }

      // Exchange auth_code for session token
      const res = await fetch(
        "https://apiconnect.angelbroking.com/rest/auth/authorize/v2",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            authorization_code: authCode,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          err.message || `Angel One token exchange failed (${res.status})`
        );
      }

      const data = await res.json();
      const accessToken = data.data?.jwtToken || data.data?.access_token || "";
      const userId = clientCode || data.data?.clientCode || "";

      if (!accessToken) {
        return redirectWithError("No token received from Angel One");
      }

      // Fetch balance
      let balance = 0;
      try {
        const rmsRes = await fetch(
          "https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getRmsLimits",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-ClientCode": userId,
              "X-SourceID": apiKey,
            },
          }
        );
        if (rmsRes.ok) {
          const rmsData = await rmsRes.json();
          balance =
            Number(rmsData.data?.net) || Number(rmsData.data?.cash) || 0;
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken("ANGEL_ONE", accessToken, userId, balance);
    }

    // ──────────────────────────────
    //  DHAN: code in query param
    // ──────────────────────────────
    if (broker === "DHAN") {
      const code = searchParams.get("code");
      const apiKey = searchParams.get("api_key");

      if (!code) {
        return redirectWithError("Missing authorization code from Dhan");
      }

      // Exchange code for access_token
      const res = await fetch("https://api.dhan.co/v2/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          authorization_code: code,
          grant_type: "authorization_code",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          err.error_message || `Dhan token exchange failed (${res.status})`
        );
      }

      const data = await res.json();
      const accessToken = data.access_token || "";
      const userId = apiKey || "";

      if (!accessToken) {
        return redirectWithError("No access_token received from Dhan");
      }

      // Fetch balance
      let balance = 0;
      try {
        const fundRes = await fetch("https://api.dhan.co/v2/user/funds", {
          headers: { "access-token": accessToken },
        });
        if (fundRes.ok) {
          const fundData = await fundRes.json();
          balance =
            Number(fundData.equity_amount?.available_balance) || 0;
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken("DHAN", accessToken, userId, balance);
    }

    return redirectWithError("Unknown broker or missing callback parameters");
  } catch (error) {
    console.error("Broker callback error:", error);
    return redirectWithError(
      error instanceof Error ? error.message : "OAuth callback failed"
    );
  }
}
