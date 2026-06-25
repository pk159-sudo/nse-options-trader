import { NextRequest, NextResponse } from "next/server";
import { getFile, putFile } from "@/lib/github-storage";

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

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Single file per symbol/expiry holding only the LATEST delta
function getLatestPath(symbol: string, expiry: string) {
  return `data/delta-history/${safeName(symbol)}/${safeName(expiry)}/latest.json`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 1;

  if (!symbol || !expiry) {
    return NextResponse.json(
      { error: "symbol and expiry are required" },
      { status: 400 }
    );
  }

  try {
    const filePath = getLatestPath(symbol, expiry);
    const file = await getFile(filePath);

    if (!file) {
      return NextResponse.json({ snapshotDelta: {}, snapshotDeltaTime: null });
    }

    const data = JSON.parse(file.content) as DeltaSnapshot;
    return NextResponse.json({
      snapshotDelta: data.snapshotDelta,
      snapshotDeltaTime: data.timestamp,
      spotPrice: data.spotPrice,
      prevTimestamp: data.prevTimestamp,
    });
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

    const deltaData: DeltaSnapshot = {
      timestamp,
      symbol,
      expiry,
      spotPrice: spotPrice || 0,
      prevTimestamp: prevTimestamp || "",
      snapshotDelta,
    };

    const filePath = getLatestPath(symbol, expiry);
    const existing = await getFile(filePath);

    await putFile(
      filePath,
      JSON.stringify(deltaData),
      existing?.sha
    );

    return NextResponse.json({
      success: true,
      stored: Object.keys(snapshotDelta).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}