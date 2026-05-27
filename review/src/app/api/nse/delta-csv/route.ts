import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type DeltaRow = {
  timestamp: string;
  symbol: string;
  expiry: string;
  strike: number;
  ceOIChange: number;
  peOIChange: number;
  ceLTPChange: number;
  peLTPChange: number;
};

const CSV_ROOT = path.join(process.cwd(), "data", "delta-history");
const CSV_HEADER = "timestamp,symbol,expiry,strike,ceOIChange,peOIChange,ceLTPChange,peLTPChange\n";

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getCsvPath(symbol: string, expiry: string) {
  return path.join(CSV_ROOT, safeName(symbol), safeName(expiry), "delta-history.csv");
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

function parseCsvLine(line: string): DeltaRow | null {
  const parts = line.split(",");
  if (parts.length !== 8) return null;
  const [timestamp, symbol, expiry, strike, ceOIChange, peOIChange, ceLTPChange, peLTPChange] = parts;
  return {
    timestamp,
    symbol,
    expiry,
    strike: Number(strike),
    ceOIChange: Number(ceOIChange),
    peOIChange: Number(peOIChange),
    ceLTPChange: Number(ceLTPChange),
    peLTPChange: Number(peLTPChange),
  };
}

async function readCsvRows(symbol: string, expiry: string): Promise<DeltaRow[]> {
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
      .filter((row): row is DeltaRow => row !== null);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";

  if (!symbol || !expiry) {
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  const rows = await readCsvRows(symbol, expiry);
  const latestByStrike = new Map<number, DeltaRow>();
  let latestTime: string | null = null;

  for (const row of rows) {
    latestByStrike.set(row.strike, row);
    latestTime = row.timestamp;
  }

  const snapshotDelta: Record<number, Omit<DeltaRow, "timestamp" | "symbol" | "expiry">> = {};
  for (const row of latestByStrike.values()) {
    snapshotDelta[row.strike] = {
      ceOIChange: row.ceOIChange,
      peOIChange: row.peOIChange,
      ceLTPChange: row.ceLTPChange,
      peLTPChange: row.peLTPChange,
    };
  }

  return NextResponse.json({ symbol, expiry, snapshotDelta, snapshotDeltaTime: latestTime });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { symbol, expiry, timestamp, snapshotDelta } = body as {
    symbol?: string;
    expiry?: string;
    timestamp?: string;
    snapshotDelta?: Record<number, { ceOIChange: number; peOIChange: number; ceLTPChange: number; peLTPChange: number }>;
  };

  if (!symbol || !expiry || !timestamp || typeof snapshotDelta !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const rows = Object.entries(snapshotDelta)
    .map(([strike, values]) => {
      return [
        timestamp,
        symbol,
        expiry,
        strike,
        String(values.ceOIChange),
        String(values.peOIChange),
        String(values.ceLTPChange),
        String(values.peLTPChange),
      ].join(",");
    })
    .join("\n");

  if (rows.length > 0) {
    await ensureCsvFile(symbol, expiry);
    const csvPath = getCsvPath(symbol, expiry);
    await fs.appendFile(csvPath, `${rows}\n`, "utf-8");
  }

  return NextResponse.json({ success: true, stored: Object.keys(snapshotDelta).length });
}
