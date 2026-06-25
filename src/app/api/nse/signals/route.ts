import { NextRequest, NextResponse } from "next/server";
import { getFile, putFile } from "@/lib/github-storage";

type TradingSignal = {
  id: string;
  time: string;
  fromStrike: number;
  toStrike: number;
  type: "BULLISH" | "BEARISH";
  strength: number;
  reason: string;
  entryPrice: number;
  oiChange: number;
  expiry: string;
  tradeId?: string;
  executed: boolean;
  skipReason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  brokerOrderId?: string;
  isRealTrade?: boolean;
  createdAt?: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getFilePath(symbol: string, expiry: string) {
  return `data/signals/${safeName(symbol)}/${safeName(expiry)}/signals.jsonl`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limit = Number(url.searchParams.get("limit") || "10");

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  try {
    const filePath = getFilePath(symbol, expiry);
    const file = await getFile(filePath);

    if (!file) {
      return NextResponse.json({ signals: [] });
    }

    const records: TradingSignal[] = file.content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TradingSignal;
        } catch {
          return null;
        }
      })
      .filter((s): s is TradingSignal => s !== null);

    // Deduplicate by id (keep latest)
    const latestById = new Map<string, TradingSignal>();
    for (const record of records) {
      latestById.set(record.id, record);
    }

    const signals = Array.from(latestById.values())
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit);

    return NextResponse.json({ signals });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const signal = (await request.json()) as TradingSignal;

    if (!signal?.id || !signal?.time || !signal?.expiry || typeof signal?.fromStrike !== "number") {
      return NextResponse.json({ error: "Invalid signal payload" }, { status: 400 });
    }

    const filePath = getFilePath(symbol, signal.expiry);
    const existing = await getFile(filePath);
    let content = existing ? existing.content : "";
    let sha = existing?.sha;

    // Append line
    content += JSON.stringify(signal) + "\n";
    await putFile(filePath, content, sha);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}