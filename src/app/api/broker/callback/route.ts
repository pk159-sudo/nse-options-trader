import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// Broker Callback API — handles OAuth redirect back from broker
// Each broker sends back different params → we exchange for access_token
// Then redirect user back to the app with token info
//
// SECURITY: api_key + api_secret come from encrypted httpOnly cookie (set by /api/broker/auth)
// They are NEVER exposed in URL params, browser history, or server logs.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

function decrypt(encoded: string): string {
  const key = process.env.BROKER_COOKIE_SECRET || "nse-options-trader-2024-secret-key";
  const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(
      decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

function readAuthCookie(request: NextRequest): Record<string, string> | null {
  const cookie = request.cookies.get("broker_auth");
  if (!cookie?.value) return null;
  try {
    return JSON.parse(decrypt(cookie.value));
  } catch {
    return null;
  }
}

function clearAuthCookie(response: NextResponse) {
  response.cookies.set("broker_auth", "", {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "lax",
    path: "/api/broker/callback",
    maxAge: 0, // Delete immediately after use
  });
}

function redirectWithToken(
  response: NextResponse,
  broker: string,
  accessToken: string,
  userId: string,
  balance: number
): NextResponse {
  const params = new URLSearchParams({
    broker,
    accessToken,
    userId,
    balance: String(balance),
    status: "connected",
  });
  return NextResponse.redirect(`${APP_URL || "/"}?${params.toString()}`);
}

function redirectWithError(response: NextResponse, error: string): NextResponse {
  const params = new URLSearchParams({ error, status: "error" });
  return NextResponse.redirect(`${APP_URL || "/"}?${params.toString()}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brokerFromState = searchParams.get("state") || "";

  // Read encrypted credentials from httpOnly cookie
  const authData = readAuthCookie(request);
  if (!authData) {
    return redirectWithError(
      new NextResponse(),
      "Session expired. Please try logging in again."
    );
  }

  const { apiKey, apiSecret } = authData;
  const response = new NextResponse();

  try {
    // ──────────────────────────────────────────────────────
    //  ZERODHA Kite Connect v3
    //  Params: request_token (from Zerodha redirect)
    // ──────────────────────────────────────────────────────
    if (
      brokerFromState === "ZERODHA" ||
      searchParams.get("request_token")
    ) {
      clearAuthCookie(response);

      const requestToken = searchParams.get("request_token");
      if (!requestToken || !apiKey || !apiSecret) {
        return redirectWithError(
          response,
          "Missing request_token or credentials for Zerodha"
        );
      }

      // Generate checksum: SHA256(api_key + request_token + api_secret)
      const checksum = createHash("sha256")
        .update(`${apiKey}${requestToken}${apiSecret}`)
        .digest("hex");

      // Exchange request_token → access_token via Kite session API
      const res = await fetch(
        "https://api.kite.trade/session/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Kite-Version": "3",
          },
          body: new URLSearchParams({
            api_key: apiKey,
            request_token: requestToken,
            checksum: checksum,
          }).toString(),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          response,
          (err as { message?: string }).message ||
            `Zerodha token exchange failed (${res.status})`
        );
      }

      const data = (await res.json()) as {
        data?: { access_token?: string; user_id?: string };
      };
      const accessToken = data.data?.access_token || "";
      const userId = data.data?.user_id || "";

      if (!accessToken) {
        return redirectWithError(
          response,
          "No access_token received from Zerodha"
        );
      }

      // Fetch margin/balance
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
          const marginData = (await marginRes.json()) as {
            equity?: Array<{ net?: number }>;
          };
          balance = marginData.equity?.[0]?.net || 0;
        }
      } catch {
        // Balance fetch failed — still connect with 0
      }

      return redirectWithToken(
        response,
        "ZERODHA",
        accessToken,
        userId,
        balance
      );
    }

    // ──────────────────────────────────────────────────────
    //  UPSTOX v2
    //  Params: code (authorization code from Upstox redirect)
    // ──────────────────────────────────────────────────────
    if (brokerFromState === "UPSTOX" || searchParams.get("code")) {
      clearAuthCookie(response);

      const code = searchParams.get("code");
      if (!code || !apiKey) {
        return redirectWithError(
          response,
          "Missing authorization code or API key for Upstox"
        );
      }

      const redirectUri =
        `${APP_URL}/api/broker/callback`;

      // Exchange authorization code → access_token
      const res = await fetch(
        "https://api.upstox.com/v2/login/authorization-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            client_id: apiKey,
            client_secret: apiSecret || "",
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errors = (err as { errors?: Array<{ message?: string }> }).errors;
        return redirectWithError(
          response,
          errors?.[0]?.message ||
            `Upstox token exchange failed (${res.status})`
        );
      }

      const data = (await res.json()) as {
        data?: { access_token?: string; user_id?: string; user_name?: string };
      };
      const accessToken = data.data?.access_token || "";
      const userId = data.data?.user_id || data.data?.user_name || "";

      if (!accessToken) {
        return redirectWithError(
          response,
          "No access_token received from Upstox"
        );
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
          const fundData = (await fundRes.json()) as {
            data?: {
              equity?: { available_margin?: number; net?: number };
            };
          };
          balance =
            Number(fundData.data?.equity?.available_margin) ||
            Number(fundData.data?.equity?.net) ||
            0;
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken(
        response,
        "UPSTOX",
        accessToken,
        userId,
        balance
      );
    }

    // ──────────────────────────────────────────────────────
    //  ANGEL ONE SmartAPI
    //  Params: auth_code (from Angel One redirect)
    // ──────────────────────────────────────────────────────
    if (brokerFromState === "ANGEL_ONE" || searchParams.get("auth_code")) {
      clearAuthCookie(response);

      const authCode =
        searchParams.get("auth_code") || searchParams.get("code");
      if (!authCode || !apiKey || !apiSecret) {
        return redirectWithError(
          response,
          "Missing auth_code or credentials for Angel One"
        );
      }

      // Exchange auth_code → session token
      // Angel One requires: authorization_code in body, api_key in header
      const res = await fetch(
        "https://apiconnect.angelbroking.com/rest/auth/authorize/v2",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SourceID": apiKey,
            "X-ClientCode": apiSecret, // client_code = apiSecret in our convention
          },
          body: JSON.stringify({
            authorization_code: authCode,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return redirectWithError(
          response,
          (err as { message?: string }).message ||
            `Angel One token exchange failed (${res.status})`
        );
      }

      const data = (await res.json()) as {
        data?: { jwtToken?: string; access_token?: string; clientCode?: string };
      };
      const accessToken = data.data?.jwtToken || data.data?.access_token || "";
      const userId = data.data?.clientCode || apiSecret;

      if (!accessToken) {
        return redirectWithError(
          response,
          "No token received from Angel One"
        );
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
          const rmsData = (await rmsRes.json()) as {
            data?: { net?: number; cash?: number };
          };
          balance = Number(rmsData.data?.net) || Number(rmsData.data?.cash) || 0;
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken(
        response,
        "ANGEL_ONE",
        accessToken,
        userId,
        balance
      );
    }

    // ──────────────────────────────────────────────────────
    //  DHAN v2 — Consent-based OAuth (3-step flow)
    //  Step 1 (auth route): POST generate-consent → consentId
    //  Step 2: Browser → consent-login → user logs in + 2FA
    //         Dhan redirects back with tokenId (NOT consentId)
    //  Step 3: POST consumeApp-consent with tokenId → access_token
    // ──────────────────────────────────────────────────────
    if (brokerFromState === "DHAN" || searchParams.get("tokenId")) {
      // We need apiKey + apiSecret to consume consent, so read cookie BEFORE clearing
      const dhanApiKey = apiKey;
      const dhanApiSecret = apiSecret;

      clearAuthCookie(response);

      const tokenId = searchParams.get("tokenId");
      if (!tokenId || !dhanApiKey || !dhanApiSecret) {
        return redirectWithError(
          response,
          "Missing tokenId, API Key, or API Secret from Dhan. Check that your Dhan app has the correct redirect URL configured."
        );
      }

      // Step 3: Consume consent → exchange tokenId for access_token
      // Requires client_id + app_secret in headers (same as generate-consent)
      const consumeUrl = `https://auth.dhan.co/app/consumeApp-consent?tokenId=${tokenId}`;
      const res = await fetch(consumeUrl, {
        method: "POST",
        headers: {
          "client_id": dhanApiKey,
          "app_secret": dhanApiSecret,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return redirectWithError(
          response,
          `Dhan consent exchange failed (${res.status}). ${errText.substring(0, 200)}`
        );
      }

      let accessToken = "";
      let data: Record<string, unknown>;
      try {
        const resText = await res.text();
        data = JSON.parse(resText) as Record<string, unknown>;
        // Dhan returns access_token in the response
        accessToken = String(data.access_token || data.accessToken || "");
      } catch {
        return redirectWithError(
          response,
          "Invalid response from Dhan during consent exchange. Please try again."
        );
      }

      const userId = dhanApiKey;

      if (!accessToken) {
        return redirectWithError(
          response,
          "No access_token received from Dhan after consent exchange."
        );
      }

      // Fetch balance
      let balance = 0;
      try {
        const fundRes = await fetch("https://api.dhan.co/v2/user/funds", {
          headers: { "access-token": accessToken },
        });
        if (fundRes.ok) {
          const fundText = await fundRes.text();
          if (!fundText.trimStart().startsWith("<")) {
            const fundData = JSON.parse(fundText) as { equity_amount?: { available_balance?: number } };
            balance = Number(fundData.equity_amount?.available_balance) || 0;
          }
        }
      } catch {
        // Balance fetch failed
      }

      return redirectWithToken(
        response,
        "DHAN",
        accessToken,
        userId,
        balance
      );
    }

    // No broker matched
    clearAuthCookie(response);
    return redirectWithError(
      response,
      "Unknown broker or missing callback parameters"
    );
  } catch (error) {
    console.error("Broker callback error:", error);
    return redirectWithError(
      response,
      error instanceof Error ? error.message : "OAuth callback failed"
    );
  }
}
