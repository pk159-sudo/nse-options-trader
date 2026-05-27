import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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
};

const ROOT = path.join(process.cwd(), "data", "signals");

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getFilePath(symbol: string, expiry: string) {
  return path.join(ROOT, safeName(symbol), safeName(expiry), "signals.jsonl");
}

async function ensureFile(symbol: string, expiry: string) {
  const filePath = getFilePath(symbol, expiry);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
}

async function readSignals(symbol: string, expiry: string): Promise<TradingSignal[]> {
  try {
    await ensureFile(symbol, expiry);
    const filePath = getFilePath(symbol, expiry);
    const content = await fs.readFile(filePath, "utf-8");
    return content
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
      .filter((signal): signal is TradingSignal => signal !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limit = Number(url.searchParams.get("limit") || "10");

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  const records = await readSignals(symbol, expiry);
  const latestById = new Map<string, TradingSignal>();
  for (const record of records) {
    latestById.set(record.id, record);
  }

  const signals = Array.from(latestById.values())
    .sort((a, b) => (new Date(b.time).getTime() - new Date(a.time).getTime()))
    .slice(0, limit);

  return NextResponse.json({ signals });
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const payload = await request.json();
  const signal = payload as TradingSignal;

  if (!symbol || !signal?.id || !signal?.time || !signal?.expiry || typeof signal?.fromStrike !== "number") {
    return NextResponse.json({ error: "Invalid signal payload or missing symbol" }, { status: 400 });
  }

  await ensureFile(symbol, signal.expiry);
  const filePath = getFilePath(symbol, signal.expiry);
  await fs.appendFile(filePath, `${JSON.stringify(signal)}\n`, "utf-8");

  return NextResponse.json({ success: true });
}
