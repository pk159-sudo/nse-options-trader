import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest-engine";
import path from "path";

export const maxDuration = 120; // 2 minutes timeout for Vercel/serverless

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intervalMinutes, oiThreshold, maxOpenTrades } = body ?? {};

    const csvDir = path.join(
      process.cwd(),
      "upload",
      "csv_data",
      "2026-01-01_to_2026-05-20"
    );

    const result = await runBacktest(csvDir, {
      intervalMinutes: intervalMinutes ?? 15,
      oiThreshold: oiThreshold ?? 25000,
      maxOpenTrades: maxOpenTrades ?? 3,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Backtest error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error running backtest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}