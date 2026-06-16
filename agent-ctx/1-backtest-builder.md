# Task 1 — backtest-builder

## What was built
Complete NSE Options Backtest System for the NSE Options Trader Next.js app. The system reads 1-minute CSV candle data (94 files, ~15 lakh rows, 132 MB) and simulates the OI-unwind signal strategy with trailing stop loss, producing full trade statistics.

## Key Files Created

### 1. `/home/z/my-project/src/lib/backtest-engine.ts`
- Pure TypeScript module (no React/Next.js deps)
- Exports `runBacktest(csvDir, config?)` → `BacktestResult`
- Parses CSV files one-by-one (file-by-file, memory efficient)
- Groups 1-min candles into configurable 15-min snapshots
- Signal scanning logic exactly matches `scanSignalsImproved` from nse-store
- Exit conditions exactly match `checkExitConditions` from nse-store
- Computes: win rate, P&L, profit factor, max drawdown, monthly breakdown, daily PnL

### 2. `/home/z/my-project/src/app/api/nse/backtest/route.ts`
- POST endpoint accepting config params
- 120s maxDuration, returns full BacktestResult as JSON

### 3. `/home/z/my-project/src/components/nse/backtest-panel.tsx`
- Dark theme styling matching existing panels
- Config controls, stat cards, equity curve, monthly breakdown, trade log

### 4. `/home/z/my-project/src/app/page.tsx` (modified)
- Added Backtest tab between OI Charts and Account

## Test Results
- 94 days processed in 3.1 seconds
- 1,306 trades, 26.7% win rate, +₹46,784 total P&L, 1.07 profit factor
