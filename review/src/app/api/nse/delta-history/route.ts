import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// ===== Delta persistence — individual JSON files per calculation =====
// File naming: delta-{timestamp}.json (same pattern as snapshots)
// Each delta represents the difference between two consecutive snapshots.
// All deltas kept for backtesting; latest one used for immediate display.
//
// Why separate from snapshots?
// - App restart → delta loads instantly from last file (no need to fetch NSE + calculate)
// - Closing 3:30 PM delta persists overnight → next morning reference available
// - Historical delta for backtesting strategies

type DeltaSnapshot = {
  timestamp: string;
  symbol: string;
  expiry: string;
  spotPrice: number;
  prevTimestamp: string;
  snapshotDelta: Record<number, {
    ceOIChange: number;
    peOIChange: number;
    ceLTPChange: number;
    peLTPChange: number;
  }>;
};

const DELTA_ROOT = path.join(process.cwd(), "data", "delta-history");

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getDirPath(symbol: string, expiry: string) {
  return path.join(DELTA_ROOT, safeName(symbol), safeName(expiry));
}

// "2026-05-27T05:09:23.560Z" → "delta-2026-05-27T05-09-23-560Z.json"
function timestampToFilename(ts: string) {
  return `delta-${ts.replace(/[:.]/g, "-")}.json`;
}

// List delta files sorted chronologically (oldest first, newest last)
async function listDeltaFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files
      .filter((f) => f.startsWith("delta-") && f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 1; // Default: only latest

  if (!symbol || !expiry) {
    return NextResponse.json(
      { error: "symbol and expiry are required" },
      { status: 400 }
    );
  }

  const dirPath = getDirPath(symbol, expiry);
  const files = await listDeltaFiles(dirPath);

  if (files.length === 0) {
    return NextResponse.json({ snapshotDelta: {}, snapshotDeltaTime: null });
  }

  // Read last N files (newest)
  const selectedFiles = files.slice(-limit);

  if (limit === 1 && selectedFiles.length === 1) {
    // Most common case: return latest delta in the format store expects
    try {
      const content = await fs.readFile(
        path.join(dirPath, selectedFiles[0]),
        "utf-8"
      );
      const data = JSON.parse(content) as DeltaSnapshot;
      return NextResponse.json({
        snapshotDelta: data.snapshotDelta,
        snapshotDeltaTime: data.timestamp,
        spotPrice: data.spotPrice,
        prevTimestamp: data.prevTimestamp,
      });
    } catch {
      return NextResponse.json({ snapshotDelta: {}, snapshotDeltaTime: null });
    }
  }

  // Multiple files: return array for backtesting
  const deltas: DeltaSnapshot[] = [];
  for (const file of selectedFiles) {
    try {
      const content = await fs.readFile(path.join(dirPath, file), "utf-8");
      deltas.push(JSON.parse(content) as DeltaSnapshot);
    } catch {}
  }

  return NextResponse.json({ deltas });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const {
    symbol,
    expiry,
    timestamp,
    spotPrice,
    prevTimestamp,
    snapshotDelta,
  } = payload as {
    symbol?: string;
    expiry?: string;
    timestamp?: string;
    spotPrice?: number;
    prevTimestamp?: string;
    snapshotDelta?: Record<
      number,
      { ceOIChange: number; peOIChange: number; ceLTPChange: number; peLTPChange: number }
    >;
  };

  if (
    !symbol ||
    !expiry ||
    !timestamp ||
    typeof snapshotDelta !== "object" ||
    Object.keys(snapshotDelta).length === 0
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const dirPath = getDirPath(symbol, expiry);
  await fs.mkdir(dirPath, { recursive: true });

  // Save delta as individual JSON file
  const deltaData: DeltaSnapshot = {
    timestamp,
    symbol,
    expiry,
    spotPrice: spotPrice || 0,
    prevTimestamp: prevTimestamp || "",
    snapshotDelta,
  };

  const filename = timestampToFilename(timestamp);
  await fs.writeFile(
    path.join(dirPath, filename),
    JSON.stringify(deltaData),
    "utf-8"
  );

  return NextResponse.json({
    success: true,
    stored: Object.keys(snapshotDelta).length,
    file: filename,
  });
}
