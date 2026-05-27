import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "path";
import path from "path";

// ===== Each snapshot is saved as individual JSON file =====
// File naming: snapshot-{timestamp}.json  (e.g. snapshot-2026-05-27T05-09-23-560Z.json)
// Only last 2 snapshots are kept per symbol+expiry, older ones are deleted automatically.
// This avoids the growing CSV problem — no matter how many refreshes, max 2 files on disk.

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

// Convert ISO timestamp to safe filename: "2026-05-27T05:09:23.560Z" → "2026-05-27T05-09-23-560Z"
function timestampToFilename(ts: string) {
  return `snapshot-${ts.replace(/[:.]/g, "-")}.json`;
}

async function listSnapshotFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files
      .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
      .sort(); // chronological order (newest last)
  } catch {
    return [];
  }
}

async function readSnapshotFile(dirPath: string, filename: string, symbol: string): Promise<SnapshotRow | null> {
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
    return NextResponse.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  const dirPath = getDirPath(symbol, expiry);
  const files = await listSnapshotFiles(dirPath);

  // Take last N files (newest)
  const selectedFiles = limit === Infinity ? files : files.slice(-limit);

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

  if (!symbol || !expiry || !timestamp || typeof spotPrice !== "number" || !Array.isArray(strikes)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const dirPath = getDirPath(symbol, expiry);
  await fs.mkdir(dirPath, { recursive: true });

  // 1. Save new snapshot as individual JSON file
  const snapshotData: OISnapshot = { timestamp, expiry, spotPrice, strikes };
  const filename = timestampToFilename(timestamp);
  await fs.writeFile(path.join(dirPath, filename), JSON.stringify(snapshotData), "utf-8");

  // 2. List all snapshot files, delete all except last 2
  const allFiles = await listSnapshotFiles(dirPath);
  if (allFiles.length > 2) {
    const toDelete = allFiles.slice(0, allFiles.length - 2);
    await Promise.all(
      toDelete.map((f) => fs.unlink(path.join(dirPath, f)).catch(() => {}))
    );
  }

  // 3. Read last 2 snapshots and return (caller uses these for delta calculation)
  const remainingFiles = await listSnapshotFiles(dirPath);
  const lastTwoFiles = remainingFiles.slice(-2);

  const snapshots: SnapshotRow[] = [];
  for (const file of lastTwoFiles) {
    const row = await readSnapshotFile(dirPath, file, symbol);
    if (row) snapshots.push(row);
  }

  return NextResponse.json({ success: true, snapshots });
}
