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

function getFilePath(symbol: string, expiry: string) {
  return path.join(ROOT, safeName(symbol), safeName(expiry), "trades.jsonl");
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

async function readTrades(symbol: string, expiry: string): Promise<Trade[]> {
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
  const limitClosed = Number(url.searchParams.get("limitClosed") || "5");

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  const records = await readTrades(symbol, expiry);
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
  const expiry = url.searchParams.get("expiry") || "";
  const trade = await request.json() as Trade;

  if (!symbol || !expiry || !trade?.id || !trade?.time) {
    return NextResponse.json({ error: "symbol, expiry, and trade payload are required" }, { status: 400 });
  }

  await ensureFile(symbol, expiry);
  const filePath = getFilePath(symbol, expiry);
  await fs.appendFile(filePath, `${JSON.stringify(trade)}\n`, "utf-8");

  return NextResponse.json({ success: true });
}
