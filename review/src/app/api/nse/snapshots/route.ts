import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type OISnapshot = {
  timestamp: string;
  expiry: string;
  spotPrice: number;
  strikes: {
    strike: number;
    ceOI: number;
    peOI: number;
    ceLTP: number;
    peLTP: number;
  }[];
};

type SnapshotRow = OISnapshot & { symbol: string };

const CSV_ROOT = path.join(process.cwd(), "data", "snapshots");
const CSV_HEADER = "timestamp,symbol,expiry,spotPrice,strikesJson\n";

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getCsvPath(symbol: string, expiry: string) {
  return path.join(CSV_ROOT, safeName(symbol), safeName(expiry), "snapshots.csv");
}

async function ensureCsvFile(symbol: string, expiry: string) {
  const csvPath = getCsvPath(symbol, expiry);
  await fs.mkdir(path.dirname(csvPath), { recursive: true });
  try {
    await fs.access(csvPath);
  } catch {
    await fs.writeFile(csvPath, CSV_HEADER, "utf-8");
  }
}

function parseCsvLine(line: string): SnapshotRow | null {
  const parts = line.split(",");
  if (parts.length < 5) return null;
  const [timestamp, symbol, expiry, spotPrice, ...rest] = parts;
  const strikesJson = rest.join(",");
  try {
    const strikes = JSON.parse(strikesJson);
    return {
      timestamp,
      symbol,
      expiry,
      spotPrice: Number(spotPrice),
      strikes,
    };
  } catch {
    return null;
  }
}

async function readCsvRows(symbol: string, expiry: string): Promise<SnapshotRow[]> {
  try {
    const csvPath = getCsvPath(symbol, expiry);
    await ensureCsvFile(symbol, expiry);
    const content = await fs.readFile(csvPath, "utf-8");
    return content
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseCsvLine)
      .filter((row): row is SnapshotRow => row !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : Infinity;

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  const rows = await readCsvRows(symbol, expiry);
  const snapshots = limit === Infinity ? rows : rows.slice(-limit);
  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const { symbol, expiry, timestamp, spotPrice, strikes } = payload as {
    symbol?: string;
    expiry?: string;
    timestamp?: string;
    spotPrice?: number;
    strikes?: SnapshotRow["strikes"];
  };

  if (!symbol || !expiry || !timestamp || typeof spotPrice !== "number" || !Array.isArray(strikes)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const csvPath = getCsvPath(symbol, expiry);
  await ensureCsvFile(symbol, expiry);

  const line = [
    timestamp,
    symbol,
    expiry,
    String(spotPrice),
    JSON.stringify(strikes),
  ].join(",");

  await fs.appendFile(csvPath, `${line}\n`, "utf-8");

  // Read back the last two snapshots and return them to caller to avoid
  // race conditions where the client posts then immediately reads.
  const allRows = await readCsvRows(symbol, expiry);
  const lastTwo = allRows.slice(-2);
  return NextResponse.json({ success: true, snapshots: lastTwo });
}
