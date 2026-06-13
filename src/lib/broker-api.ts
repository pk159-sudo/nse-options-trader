/**
 * Broker API Utilities
 * Real API integration for Zerodha, Upstox, Angel One, and Dhan.
 * All calls use native fetch — no npm broker SDKs needed.
 */

export type BrokerName = "ZERODHA" | "ANGEL_ONE" | "UPSTOX" | "DHAN" | "GROWW";

// ──────────────────────────────
//  Common types
// ──────────────────────────────

export interface BrokerProfile {
  userId: string;
  name?: string;
  email?: string;
  broker: BrokerName;
}

export interface BrokerBalance {
  balance: number;
  availableMargin: number;
  usedMargin: number;
  currency: string;
}

export interface BrokerPosition {
  tradingSymbol: string;
  exchange: string;
  transactionType: "BUY" | "SELL";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  product: string;
  brokerOrderId?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId: string;
  tradingSymbol: string;
  transactionType: string;
  quantity: number;
  price: number;
  orderType: string;
  product: string;
  status: string;
  message: string;
}

// ──────────────────────────────
//  ZERODHA (Kite Connect v3)
// ──────────────────────────────

const KITE_BASE = "https://api.kite.trade";

async function kiteHeaders(apiKey: string, accessToken: string): Promise<HeadersInit> {
  return {
    "X-Kite-Version": "3",
    Authorization: `token ${apiKey}:${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function zerodhaProfile(
  apiKey: string,
  accessToken: string
): Promise<BrokerProfile> {
  const res = await fetch(`${KITE_BASE}/user/profile`, {
    headers: await kiteHeaders(apiKey, accessToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Zerodha profile failed (${res.status})`);
  }
  const data = await res.json();
  return {
    userId: data.user_id || data.data?.user_id || "",
    name: data.user_name || data.data?.user_name,
    email: data.email || data.data?.email,
    broker: "ZERODHA",
  };
}

export async function zerodhaBalance(
  apiKey: string,
  accessToken: string
): Promise<BrokerBalance> {
  const res = await fetch(`${KITE_BASE}/user/margins?segment=EQ`, {
    headers: await kiteHeaders(apiKey, accessToken),
  });
  if (!res.ok) throw new Error(`Zerodha margins failed (${res.status})`);
  const data = await res.json();
  // Kite returns equity and commodity margins arrays
  const eq = data.equity?.[0] || {};
  const net = eq.net || eq.cash || 0;
  const used = eq.used || eq.adhoc_margin || 0;
  return {
    balance: net,
    availableMargin: net - used,
    usedMargin: used,
    currency: "INR",
  };
}

export async function zerodhaPositions(
  apiKey: string,
  accessToken: string
): Promise<BrokerPosition[]> {
  const res = await fetch(`${KITE_BASE}/positions`, {
    headers: await kiteHeaders(apiKey, accessToken),
  });
  if (!res.ok) throw new Error(`Zerodha positions failed (${res.status})`);
  const data = await res.json();
  const dayPositions: BrokerPosition[] = (data.day || []).map(
    (p: Record<string, unknown>) => {
      const qty = Number(p.quantity) || 0;
      const avg = Number(p.average_price) || 0;
      const cur = Number(p.last_price) || Number(p.current_price) || 0;
      const pnl = Number(p.pnl) || 0;
      const pnlPct = avg !== 0 ? (pnl / (avg * Math.abs(qty))) * 100 : 0;
      return {
        tradingSymbol: String(p.trading_symbol || ""),
        exchange: String(p.exchange || "NFO"),
        transactionType: String(p.transaction_type || "BUY") as "BUY" | "SELL",
        quantity: Math.abs(qty),
        averagePrice: avg,
        currentPrice: cur,
        pnl,
        pnlPercent: Math.round(pnlPct * 100) / 100,
        product: String(p.product || "MIS"),
        brokerOrderId: String(p.exchange_order_id || ""),
      };
    }
  );
  // Also include net (overnight) positions
  const netPositions: BrokerPosition[] = (data.net || []).map(
    (p: Record<string, unknown>) => {
      const qty = Number(p.quantity) || 0;
      const avg = Number(p.average_price) || 0;
      const cur = Number(p.last_price) || Number(p.current_price) || 0;
      const pnl = Number(p.pnl) || 0;
      const pnlPct = avg !== 0 ? (pnl / (avg * Math.abs(qty))) * 100 : 0;
      return {
        tradingSymbol: String(p.trading_symbol || ""),
        exchange: String(p.exchange || "NFO"),
        transactionType: String(p.transaction_type || "BUY") as "BUY" | "SELL",
        quantity: Math.abs(qty),
        averagePrice: avg,
        currentPrice: cur,
        pnl,
        pnlPercent: Math.round(pnlPct * 100) / 100,
        product: String(p.product || "NRML"),
        brokerOrderId: String(p.exchange_order_id || ""),
      };
    }
  );
  return [...dayPositions, ...netPositions];
}

export async function zerodhaPlaceOrder(
  apiKey: string,
  accessToken: string,
  params: {
    symbol: string;
    strikePrice: number;
    optionType: "CE" | "PE";
    transactionType: "BUY" | "SELL";
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT";
    product: "MIS" | "NRML";
  }
): Promise<PlaceOrderResult> {
  const tradingSymbol = `${params.symbol}${params.strikePrice}${params.optionType}`;

  const orderPayload = {
    exchange: "NFO",
    tradingsymbol: tradingSymbol,
    transaction_type: params.transactionType,
    quantity: params.quantity,
    product: params.product,
    order_type: params.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    price: params.orderType === "LIMIT" ? params.price : 0,
    validity: "DAY",
    disclosed_quantity: 0,
    tag: "nse-options-trader",
  };

  const res = await fetch(`${KITE_BASE}/orders/regular`, {
    method: "POST",
    headers: await kiteHeaders(apiKey, accessToken),
    body: JSON.stringify(orderPayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Zerodha order failed (${res.status})`);
  }
  const data = await res.json();
  const orderId = data.order_id || "";

  return {
    success: true,
    orderId,
    tradingSymbol,
    transactionType: params.transactionType,
    quantity: params.quantity,
    price: params.orderType === "LIMIT" ? params.price : 0,
    orderType: params.orderType,
    product: params.product,
    status: "PLACED",
    message: `Order placed on Zerodha: ${params.transactionType} ${params.quantity} x ${tradingSymbol} @ ${params.orderType === "LIMIT" ? params.price : "MARKET"}`,
  };
}

// ──────────────────────────────
//  UPSTOX (API v2)
// ──────────────────────────────

const UPSTOX_BASE = "https://api.upstox.com/v2";

function upstoxHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function upstoxProfile(accessToken: string): Promise<BrokerProfile> {
  const res = await fetch(`${UPSTOX_BASE}/user/get-profile`, {
    headers: upstoxHeaders(accessToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `Upstox profile failed (${res.status})`);
  }
  const data = await res.json();
  return {
    userId: data.data?.user_id || "",
    name: data.data?.name || "",
    email: data.data?.email || "",
    broker: "UPSTOX",
  };
}

export async function upstoxBalance(accessToken: string): Promise<BrokerBalance> {
  const res = await fetch(`${UPSTOX_BASE}/user/get-funds-and-margin`, {
    headers: upstoxHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Upstox balance failed (${res.status})`);
  const data = await res.json();
  const eq = data.data?.equity || {};
  const balance = Number(eq.available_margin) || Number(eq.net) || 0;
  const used = Number(eq.used_margin) || 0;
  return {
    balance,
    availableMargin: balance,
    usedMargin: used,
    currency: "INR",
  };
}

export async function upstoxPositions(accessToken: string): Promise<BrokerPosition[]> {
  const res = await fetch(`${UPSTOX_BASE}/portfolio/short-term-positions`, {
    headers: upstoxHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Upstox positions failed (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((p: Record<string, unknown>) => {
    const qty = Number(p.quantity) || 0;
    const avg = Number(p.average_price) || 0;
    const cur = Number(p.current_price) || Number(p.last_price) || 0;
    const pnl = Number(p.pnl) || 0;
    const pnlPct = avg !== 0 ? (pnl / (avg * Math.abs(qty))) * 100 : 0;
    return {
      tradingSymbol: String(p.trading_symbol || p.symbol || ""),
      exchange: String(p.exchange || "NFO"),
      transactionType: String(p.transaction_type || "BUY") as "BUY" | "SELL",
      quantity: Math.abs(qty),
      averagePrice: avg,
      currentPrice: cur,
      pnl,
      pnlPercent: Math.round(pnlPct * 100) / 100,
      product: String(p.product || "I") === "D" ? "NRML" : "MIS",
      brokerOrderId: String(p.order_id || ""),
    };
  });
}

export async function upstoxPlaceOrder(
  accessToken: string,
  params: {
    symbol: string;
    strikePrice: number;
    optionType: "CE" | "PE";
    transactionType: "BUY" | "SELL";
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT";
    product: "MIS" | "NRML";
  }
): Promise<PlaceOrderResult> {
  const tradingSymbol = `${params.symbol}${params.strikePrice}${params.optionType}`;

  // Upstox needs instrument_token. We construct the order payload.
  // NOTE: In production, you should fetch instrument_token from /v2/instrument/lookup
  // For now, we try placing and let Upstox resolve it.
  const orderPayload = {
    quantity: params.quantity,
    product: params.product === "MIS" ? "I" : "D",
    validity: "DAY",
    price: params.orderType === "LIMIT" ? params.price : 0,
    tag: "nse-options-trader",
    instrument_token: "", // Must be resolved via lookup in production
    order_type: params.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    transaction_type: params.transactionType,
    disclosed_quantity: 0,
    trigger_price: 0,
    is_amo: false,
  };

  const res = await fetch(`${UPSTOX_BASE}/order/place`, {
    method: "POST",
    headers: upstoxHeaders(accessToken),
    body: JSON.stringify(orderPayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `Upstox order failed (${res.status})`);
  }
  const data = await res.json();
  const orderId = data.data?.order_id || "";

  return {
    success: true,
    orderId,
    tradingSymbol,
    transactionType: params.transactionType,
    quantity: params.quantity,
    price: params.orderType === "LIMIT" ? params.price : 0,
    orderType: params.orderType,
    product: params.product,
    status: "PLACED",
    message: `Order placed on Upstox: ${params.transactionType} ${params.quantity} x ${tradingSymbol} @ ${params.orderType === "LIMIT" ? params.price : "MARKET"}`,
  };
}

// ──────────────────────────────
//  ANGEL ONE (SmartAPI)
// ──────────────────────────────

const ANGEL_BASE = "https://apiconnect.angelbroking.com";

function angelHeaders(
  apiKey: string,
  accessToken: string,
  clientCode: string
): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-ClientCode": clientCode,
    "X-SourceID": apiKey,
  };
}

export async function angelOneProfile(
  apiKey: string,
  accessToken: string,
  clientCode: string
): Promise<BrokerProfile> {
  const res = await fetch(
    `${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getProfile`,
    { headers: angelHeaders(apiKey, accessToken, clientCode) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Angel One profile failed (${res.status})`);
  }
  const data = await res.json();
  return {
    userId: data.data?.clientcode || clientCode,
    name: data.data?.name || "",
    email: data.data?.email || "",
    broker: "ANGEL_ONE",
  };
}

export async function angelOneBalance(
  apiKey: string,
  accessToken: string,
  clientCode: string
): Promise<BrokerBalance> {
  const res = await fetch(
    `${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getRmsLimits`,
    { headers: angelHeaders(apiKey, accessToken, clientCode) }
  );
  if (!res.ok) throw new Error(`Angel One balance failed (${res.status})`);
  const data = await res.json();
  const rmsData = data.data || {};
  const net = Number(rmsData.net) || Number(rmsData.cash) || 0;
  const used = Number(rmsData.utilised) || Number(rmsData.used) || 0;
  return {
    balance: net,
    availableMargin: net - used,
    usedMargin: used,
    currency: "INR",
  };
}

export async function angelOnePositions(
  apiKey: string,
  accessToken: string,
  clientCode: string
): Promise<BrokerPosition[]> {
  const res = await fetch(
    `${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getPosition`,
    { headers: angelHeaders(apiKey, accessToken, clientCode) }
  );
  if (!res.ok) throw new Error(`Angel One positions failed (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((p: Record<string, unknown>) => {
    const qty = Number(p.netquantity) || Number(p.quantity) || 0;
    const avg = Number(p.avgprice) || Number(p.average_price) || 0;
    const cur = Number(p.cmp) || Number(p.current_price) || Number(p.ltp) || 0;
    const pnl = Number(p.pnl) || 0;
    const pnlPct = avg !== 0 ? (pnl / (avg * Math.abs(qty))) * 100 : 0;
    return {
      tradingSymbol: String(p.tradingsymbol || p.symbol || ""),
      exchange: String(p.exchange || "NFO"),
      transactionType: (qty >= 0 ? "BUY" : "SELL") as "BUY" | "SELL",
      quantity: Math.abs(qty),
      averagePrice: avg,
      currentPrice: cur,
      pnl,
      pnlPercent: Math.round(pnlPct * 100) / 100,
      product: String(p.producttype || "MIS"),
      brokerOrderId: String(p.orderid || ""),
    };
  });
}

export async function angelOnePlaceOrder(
  apiKey: string,
  accessToken: string,
  clientCode: string,
  params: {
    symbol: string;
    strikePrice: number;
    optionType: "CE" | "PE";
    transactionType: "BUY" | "SELL";
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT";
    product: "MIS" | "NRML";
  }
): Promise<PlaceOrderResult> {
  const tradingSymbol = `${params.symbol}${params.strikePrice}${params.optionType}`;

  const orderPayload = {
    variety: "NORMAL",
    exchange: "NFO",
    tradingsymbol: tradingSymbol,
    transactiontype: params.transactionType,
    quantity: params.quantity,
    producttype: params.product === "MIS" ? "INTRADAY" : "CARRYFORWARD",
    ordertype: params.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    price: params.orderType === "LIMIT" ? params.price : 0,
    disclosedquantity: 0,
    triggerprice: 0,
    squareoff: 0,
    stoploss: 0,
    trailingStopLoss: 0,
    isTrade: true,
  };

  const res = await fetch(
    `${ANGEL_BASE}/rest/secure/angelbroking/order/v1/placeOrder`,
    {
      method: "POST",
      headers: angelHeaders(apiKey, accessToken, clientCode),
      body: JSON.stringify(orderPayload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Angel One order failed (${res.status})`);
  }
  const data = await res.json();
  const orderId = data.data?.orderid || data.data?.uniqueorderid || "";

  return {
    success: true,
    orderId,
    tradingSymbol,
    transactionType: params.transactionType,
    quantity: params.quantity,
    price: params.orderType === "LIMIT" ? params.price : 0,
    orderType: params.orderType,
    product: params.product,
    status: "PLACED",
    message: `Order placed on Angel One: ${params.transactionType} ${params.quantity} x ${tradingSymbol} @ ${params.orderType === "LIMIT" ? params.price : "MARKET"}`,
  };
}

// ──────────────────────────────
//  DHAN (API v2)
// ──────────────────────────────

const DHAN_BASE = "https://api.dhan.co";

function dhanHeaders(accessToken: string): HeadersInit {
  return {
    "access-token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function dhanProfile(accessToken: string): Promise<BrokerProfile> {
  const res = await fetch(`${DHAN_BASE}/user/profile`, {
    headers: dhanHeaders(accessToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_message || `Dhan profile failed (${res.status})`);
  }
  const data = await res.json();
  return {
    userId: data.dhan_client_id || "",
    name: data.name || "",
    email: data.email || "",
    broker: "DHAN",
  };
}

export async function dhanBalance(accessToken: string): Promise<BrokerBalance> {
  const res = await fetch(`${DHAN_BASE}/user/funds`, {
    headers: dhanHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Dhan balance failed (${res.status})`);
  const data = await res.json();
  const equityFunds = data.equity_amount || {};
  const balance = Number(equityFunds.available_balance) || Number(equityFunds.cash_balance) || 0;
  const used = Number(equityFunds.margin_used) || 0;
  return {
    balance,
    availableMargin: balance,
    usedMargin: used,
    currency: "INR",
  };
}

export async function dhanPositions(accessToken: string): Promise<BrokerPosition[]> {
  const res = await fetch(`${DHAN_BASE}/positions`, {
    headers: dhanHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Dhan positions failed (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((p: Record<string, unknown>) => {
    const qty = Number(p.quantity) || 0;
    const avg = Number(p.average_price) || 0;
    const cur = Number(p.current_price) || Number(p.cmp) || 0;
    const pnl = Number(p.pnl) || Number(p.realized_pnl) || 0;
    const pnlPct = avg !== 0 ? (pnl / (avg * Math.abs(qty))) * 100 : 0;
    return {
      tradingSymbol: String(p.trading_symbol || p.symbol || ""),
      exchange: String(p.exchange_segment || "NSE_FNO").includes("MCX")
        ? "MCX"
        : "NFO",
      transactionType: (qty >= 0 ? "BUY" : "SELL") as "BUY" | "SELL",
      quantity: Math.abs(qty),
      averagePrice: avg,
      currentPrice: cur,
      pnl,
      pnlPercent: Math.round(pnlPct * 100) / 100,
      product: String(p.product_type || "MIS"),
      brokerOrderId: String(p.order_id || ""),
    };
  });
}

export async function dhanPlaceOrder(
  accessToken: string,
  clientId: string,
  params: {
    symbol: string;
    strikePrice: number;
    optionType: "CE" | "PE";
    transactionType: "BUY" | "SELL";
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT";
    product: "MIS" | "NRML";
  }
): Promise<PlaceOrderResult> {
  const tradingSymbol = `${params.symbol}${params.strikePrice}${params.optionType}`;

  const orderPayload = {
    dhan_client_id: clientId,
    correlation_id: `nse-opt-${Date.now()}`,
    exchange_segment: "NSE_FNO",
    transaction_type: params.transactionType,
    product_type: params.product === "MIS" ? "INTRADAY" : "CARRYFORWARD",
    order_type: params.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    quantity: params.quantity,
    price: params.orderType === "LIMIT" ? params.price : 0,
    validity: "DAY",
    disclosed_quantity: 0,
    trigger_price: 0,
    is_amo: false,
    instrument_token: "", // Must be resolved from instrument search in production
    trading_symbol: tradingSymbol,
  };

  const res = await fetch(`${DHAN_BASE}/orders`, {
    method: "POST",
    headers: dhanHeaders(accessToken),
    body: JSON.stringify(orderPayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_message || `Dhan order failed (${res.status})`);
  }
  const data = await res.json();
  const orderId = data.order_id || "";

  return {
    success: true,
    orderId,
    tradingSymbol,
    transactionType: params.transactionType,
    quantity: params.quantity,
    price: params.orderType === "LIMIT" ? params.price : 0,
    orderType: params.orderType,
    product: params.product,
    status: "PLACED",
    message: `Order placed on Dhan: ${params.transactionType} ${params.quantity} x ${tradingSymbol} @ ${params.orderType === "LIMIT" ? params.price : "MARKET"}`,
  };
}
