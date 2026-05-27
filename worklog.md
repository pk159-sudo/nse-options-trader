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

