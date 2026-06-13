import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// ===== Each snapshot is saved as individual JSON file =====
// File naming: snapshot-{timestamp}.json (e.g. snapshot-2026-05-27T05-09-23-560Z.json)
// All snapshots are kept permanently for backtesting.
// For delta calculation, only the last 2 (latest) snapshots are compared.
//
// Why individual files instead of single CSV?
// - CSV grows to ~109 MB/month, reading entire file every 30s kills performance
// - Individual files: POST writes 1 small file + reads only 2 small files for delta
// - GET with ?limit=2 reads only 2 files, not thousands of rows
// - All historical data preserved for backtesting
//
// Disk usage: ~7 KB per snapshot × 750/day × 22 days ≈ 115 MB/month (same as CSV)
// But performance stays constant — always O(1) file reads for delta, never O(n)

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

const SNAPSHOT_ROOT = path.join(process.cwd(), "data", "snapshots");

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getDirPath(symbol: string, expiry: string) {
  return path.join(SNAPSHOT_ROOT, safeName(symbol), safeName(expiry));
}

// "2026-05-27T05:09:23.560Z" → "snapshot-2026-05-27T05-09-23-560Z.json"
function timestampToFilename(ts: string) {
  return `snapshot-${ts.replace(/[:.]/g, "-")}.json`;
}

// List snapshot files sorted chronologically (oldest first, newest last)
async function listSnapshotFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files
      .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

async function readSnapshotFile(
  dirPath: string,
  filename: string,
  symbol: string
): Promise<SnapshotRow | null> {
  try {
    const content = await fs.readFile(path.join(dirPath, filename), "utf-8");
    const data = JSON.parse(content) as OISnapshot;
    return { ...data, symbol };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : Infinity;

  if (!symbol || !expiry) {
    return NextResponse.json(
      { error: "symbol and expiry are required" },
      { status: 400 }
    );
  }

  const dirPath = getDirPath(symbol, expiry);
  const files = await listSnapshotFiles(dirPath);

  // Take last N files (newest first in response)
  const selectedFiles = files.slice(-limit);

  const snapshots: SnapshotRow[] = [];
  for (const file of selectedFiles) {
    const row = await readSnapshotFile(dirPath, file, symbol);
    if (row) snapshots.push(row);
  }

  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const { symbol, expiry, timestamp, spotPrice, strikes } = payload as {
    symbol?: string;
    expiry?: string;
    timestamp?: string;
    spotPrice?: number;
    strikes?: OISnapshot["strikes"];
  };

  if (
    !symbol ||
    !expiry ||
    !timestamp ||
    typeof spotPrice !== "number" ||
    !Array.isArray(strikes)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const dirPath = getDirPath(symbol, expiry);
  await fs.mkdir(dirPath, { recursive: true });

  // 1. Save new snapshot as individual JSON file (append, never overwrite history)
  const snapshotData: OISnapshot = { timestamp, expiry, spotPrice, strikes };
  const filename = timestampToFilename(timestamp);
  await fs.writeFile(
    path.join(dirPath, filename),
    JSON.stringify(snapshotData),
    "utf-8"
  );

  // 2. List all files, pick only last 2 for delta comparison
  // No deletion — all snapshots kept for backtesting
  const allFiles = await listSnapshotFiles(dirPath);
  const lastTwoFiles = allFiles.slice(-2);

  const snapshots: SnapshotRow[] = [];
  for (const file of lastTwoFiles) {
    const row = await readSnapshotFile(dirPath, file, symbol);
    if (row) snapshots.push(row);
  }

  return NextResponse.json({ success: true, snapshots });
}
