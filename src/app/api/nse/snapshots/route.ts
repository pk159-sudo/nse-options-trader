import { NextRequest, NextResponse } from "next/server";
import { getFile, putFile, listFiles } from "@/lib/github-storage";

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

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// "2026-05-27T05:09:23.560Z" → "snapshot-2026-05-27T05-09-23-560Z.json"
function timestampToFilename(ts: string) {
  return `snapshot-${ts.replace(/[:.]/g, "-")}.json`;
}

// We use a "head" file per symbol/expiry that stores ONLY the last 2 snapshots
// as a JSON array. This keeps the file tiny (~14KB) and fast to read/write.
// For backtesting, all snapshots are also saved as individual files.
function getHeadPath(symbol: string, expiry: string) {
  return `data/snapshots/${safeName(symbol)}/${safeName(expiry)}/head.json`;
}

function getArchivePath(symbol: string, expiry: string, filename: string) {
  return `data/snapshots/${safeName(symbol)}/${safeName(expiry)}/${filename}`;
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

  try {
    const headPath = getHeadPath(symbol, expiry);
    const file = await getFile(headPath);

    if (!file) {
      return NextResponse.json({ snapshots: [] });
    }

    const snapshots: SnapshotRow[] = JSON.parse(file.content);
    // Add symbol
    for (const s of snapshots) {
      s.symbol = symbol;
    }

    // Return last N
    const sliced = limit < Infinity ? snapshots.slice(-limit) : snapshots;
    return NextResponse.json({ snapshots: sliced });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const newSnapshot: OISnapshot = { timestamp, expiry, spotPrice, strikes };

    // 1. Read current head (last 2 snapshots)
    const headPath = getHeadPath(symbol, expiry);
    const existing = await getFile(headPath);
    let currentSnapshots: OISnapshot[] = [];
    let sha: string | undefined;

    if (existing) {
      try {
        currentSnapshots = JSON.parse(existing.content);
        sha = existing.sha;
      } catch {
        currentSnapshots = [];
      }
    }

    // 2. Append new snapshot, keep only last 2
    currentSnapshots.push(newSnapshot);
    if (currentSnapshots.length > 2) {
      currentSnapshots = currentSnapshots.slice(-2);
    }

    // 3. Write head file back
    const headContent = JSON.stringify(currentSnapshots, null, 0);
    await putFile(headPath, headContent, sha);

    // 4. Save individual archive file for backtesting (fire & forget)
    const archivePath = getArchivePath(symbol, expiry, timestampToFilename(timestamp));
    putFile(archivePath, JSON.stringify(newSnapshot)).catch(() => {});

    // 5. Return last 2 with symbol
    const snapshots: SnapshotRow[] = currentSnapshots.map((s) => ({
      ...s,
      symbol,
    }));

    return NextResponse.json({ success: true, snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}