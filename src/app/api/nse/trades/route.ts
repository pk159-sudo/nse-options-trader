import { NextRequest, NextResponse } from "next/server";
import { getFile, putFile } from "@/lib/github-storage";

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
  createdAt?: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getFilePath(symbol: string, expiry: string) {
  return `data/trades/${safeName(symbol)}/${safeName(expiry)}/trades.jsonl`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitClosed = Number(url.searchParams.get("limitClosed") || "5");

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  try {
    const filePath = getFilePath(symbol, expiry);
    const file = await getFile(filePath);

    if (!file) {
      return NextResponse.json({ openTrades: [], closedTrades: [] });
    }

    const records: Trade[] = file.content
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
      .filter((t): t is Trade => t !== null);

    // Deduplicate by id (keep latest version)
    const latestById = new Map<string, Trade>();
    for (const record of records) {
      latestById.set(record.id, record);
    }

    const allTrades = Array.from(latestById.values());
    const openTrades = allTrades.filter((t) => t.status === "OPEN");
    const closedTrades = allTrades
      .filter((t) => t.status === "CLOSED")
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limitClosed);

    return NextResponse.json({ openTrades, closedTrades });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  try {
    const trade = (await request.json()) as Trade;

    if (!trade?.id || !trade?.time) {
      return NextResponse.json({ error: "Invalid trade payload" }, { status: 400 });
    }

    const filePath = getFilePath(symbol, expiry);
    const existing = await getFile(filePath);
    let content = existing ? existing.content : "";
    let sha = existing?.sha;

    // Append line
    content += JSON.stringify(trade) + "\n";
    await putFile(filePath, content, sha);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}