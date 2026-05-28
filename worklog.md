---
Task ID: 1
Agent: main
Task: Fix LOT_SIZE and remove unused greeks code

Work Log:
- Changed NIFTY LOT_SIZE from 25 to 65 in strategy-builder.tsx (now consistent with nse-store.ts, signals-panel.tsx, page.tsx)
- Moved daysToExpiry() from greeks.ts to nse.ts and updated import in option-chain/route.ts
- Moved calculateStrategyPayoff(), StrategyLeg, StrategyPayoff to strategies.ts
- Added quantityMultiplier? to StrategyLegDef interface
- Removed unused GreeksCalculator import from page.tsx
- Deleted src/lib/greeks.ts
- Deleted src/components/nse/greeks-calculator.tsx
- Deleted src/components/nse/nse/greeks-calculator.tsx
- Deleted src/components/nse/nse/strategy-builder.tsx (duplicate)
- Deleted src/components/nse/nse/oi-summary.tsx (duplicate)
- Removed empty src/components/nse/nse/ directory
- Verified zero dangling imports remain

Stage Summary:
- LOT_SIZE is now 65 everywhere for NIFTY
- All greeks.ts code removed — daysToExpiry moved to nse.ts, payoff calculator moved to strategies.ts
- No broken imports remaining
- Cleaned up orphaned duplicate files in nse/nse/ subfolder

---
Task ID: 2
Agent: main
Task: Off-market disk-only data loading — no NSE fetch on expiry switch

Work Log:
- Added `reconstructOptionChainFromSnapshot()` helper — converts snapshot (OI+LTP per strike) into full OptionChainState for UI display
- Added `loadFromDisk()` async function — loads snapshots/signals/trades/delta from disk API, then reconstructs optionChain from latest snapshot
- Modified `setExpiry()`: replaced `fetchOptionChain()` call with `loadFromDisk()` — expiry switch now loads from disk ONLY
- Modified `fetchExpiryDates()`: replaced `fetchOptionChain()` call with `void loadFromDisk()` — initial symbol load also uses disk
- Modified `fetchOptionChain()` off-market gate: if `forceRefresh=true` (manual button), calls `loadFromDisk()` before returning
- Modified page.tsx refresh button: removed `!isMarketOpen` from disabled condition — button now works off-market too (loads from disk)
- Updated refresh button tooltip to explain behavior: "Off-market: reloads data from disk (no NSE fetch)"

Stage Summary:
- NSE API fetch ONLY triggers on: (1) manual refresh during live market, (2) countdown auto-refresh during live market
- Expiry switch, symbol switch, and off-market refresh all load from disk snapshots only
- No unnecessary NSE API calls when market is closed or when just switching views
- Snapshots are NOT saved during off-market (existing gate preserved)
- Refresh button always works — live market fetches fresh, off-market reloads disk data

