import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type Trade = {
  id: string;
  time: string;
  signalType: "BULLISH" | "BEARISH";
  strike: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  expiry: string;
  status: "OPEN" | "CLOSED";
  currentStop: number;
  highestProfitPct: number;
  maxDrawdownPct: number;
  priceHistory: { time: string; price: number }[];
  signalId?: string;
  isRealTrade?: boolean;
  brokerOrderId?: string;
  brokerName?: string;
};

const ROOT = path.join(process.cwd(), "data", "trades");

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Single file per symbol: data/trades/NIFTY/trades.jsonl (no expiry sub-dir)
function getFilePath(symbol: string) {
  return path.join(ROOT, safeName(symbol), "trades.jsonl");
}

async function ensureFile(symbol: string) {
  const filePath = getFilePath(symbol);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
}

async function readAllTrades(symbol: string): Promise<Trade[]> {
  try {
    await ensureFile(symbol);
    const filePath = getFilePath(symbol);
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Trade;
        } catch {
          return null;
        }
      })
      .filter((trade): trade is Trade => trade !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitClosed = Number(url.searchParams.get("limitClosed") || "10");

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  let records = await readAllTrades(symbol);

  // Filter by expiry if provided
  if (expiry) {
    records = records.filter((t) => t.expiry === expiry);
  }

  // Deduplicate by id (latest wins)
  const latestById = new Map<string, Trade>();
  for (const record of records) {
    latestById.set(record.id, record);
  }

  const allTrades = Array.from(latestById.values());
  const openTrades = allTrades.filter((t) => t.status === "OPEN");
  const closedTrades = allTrades
    .filter((t) => t.status === "CLOSED")
    .sort((a, b) => (new Date(b.time).getTime() - new Date(a.time).getTime()))
    .slice(0, limitClosed);

  return NextResponse.json({ openTrades, closedTrades });
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const trade = await request.json() as Trade;

  if (!symbol || !trade?.id || !trade?.time || !trade?.expiry) {
    return NextResponse.json({ error: "symbol, trade id, time, and expiry are required" }, { status: 400 });
  }

  await ensureFile(symbol);
  const filePath = getFilePath(symbol);
  await fs.appendFile(filePath, `${JSON.stringify(trade)}\n`, "utf-8");

  return NextResponse.json({ success: true });
}
