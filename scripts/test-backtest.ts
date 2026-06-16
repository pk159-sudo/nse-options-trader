/**
 * Test backtest runner script
 * Runs backtest on uploaded CSV data and prints results
 */
import { runBacktest } from "../src/lib/backtest-engine";

const csvDir = "/home/z/my-project/upload/csv_data/2026-01-01_to_2026-05-20";

async function main() {
  console.log("🚀 Starting Backtest...");
  console.log("📁 Data dir:", csvDir);
  console.log("");
  console.log("⚙️  Config: interval=15min, OI threshold=25000, maxOpenTrades=3");
  console.log("🛡️  3 PM Entry Guard: ACTIVE (no new entries after 15:00)");
  console.log("📈 Trailing SL: -15% → BE@15% → +15%@30% → +30%@45% → Target@50%");
  console.log("");

  const startTime = Date.now();
  const result = await runBacktest(csvDir, {
    intervalMinutes: 15,
    oiThreshold: 25000,
    maxOpenTrades: 3,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("✅ Backtest Complete!");
  console.log(`⏱️  Processing time: ${elapsed}s`);
  console.log(`📅 Days processed: ${result.daysProcessed}`);
  console.log(`📊 Snapshots processed: ${result.snapshotsProcessed}`);
  console.log(`⚡ Signals generated: ${result.signalsGenerated}`);
  console.log(`💼 Total trades: ${result.stats.totalTrades}`);
  console.log("");

  const s = result.stats;
  console.log("══════════════════════════════════════════");
  console.log("           BACKTEST RESULTS               ");
  console.log("══════════════════════════════════════════");
  console.log(`  Win Rate:       ${s.winRate.toFixed(1)}% (${s.wins}W / ${s.losses}L)`);
  console.log(`  Total P&L:      ₹${s.totalPnl.toFixed(0)}`);
  console.log(`  Avg Win:        ₹${s.avgWin.toFixed(0)}`);
  console.log(`  Avg Loss:       ₹${s.avgLoss.toFixed(0)}`);
  console.log(`  Max Win:         ₹${s.maxWin.toFixed(0)}`);
  console.log(`  Max Loss:        ₹${s.maxLoss.toFixed(0)}`);
  console.log(`  Profit Factor:   ${s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)}`);
  console.log(`  Max Drawdown:   ₹${s.maxDrawdown.toFixed(0)} (${s.maxDrawdownPct.toFixed(1)}%)`);
  console.log(`  Avg Holding:    ${s.avgHoldingTime}`);
  console.log("══════════════════════════════════════════");

  // Monthly breakdown
  console.log("");
  console.log("📅 Monthly Breakdown:");
  console.log("──────────────────────────────────────────");
  for (const m of s.monthlyBreakdown) {
    const pnlSign = m.pnl >= 0 ? "+" : "";
    console.log(
      `  ${m.month}: ${String(m.trades).padStart(3)} trades | ` +
        `${String(m.wins).padStart(2)}W ${String(m.trades - m.wins).padStart(2)}L | ` +
        `WR ${(m.winRate).toFixed(0).padStart(3)}% | ` +
        `P&L ${pnlSign}₹${m.pnl.toFixed(0)}`
    );
  }

  // Exit reason breakdown
  const trades = result.trades;
  const targets = trades.filter(t => t.exitReason === "TARGET").length;
  const sls = trades.filter(t => t.exitReason === "STOP_LOSS").length;
  const eods = trades.filter(t => t.exitReason === "EOD_CLOSE").length;
  console.log("");
  console.log("📋 Exit Reasons:");
  console.log(`  🎯 Target Hit:  ${targets} (${(targets / s.totalTrades * 100).toFixed(1)}%)`);
  console.log(`  🛡️ Stop Loss:   ${sls} (${(sls / s.totalTrades * 100).toFixed(1)}%)`);
  console.log(`  ⏰ EOD Close:   ${eods} (${(eods / s.totalTrades * 100).toFixed(1)}%)`);

  // Entry time distribution
  console.log("");
  console.log("⏰ Entry Time Distribution:");
  const timeSlots = new Map<string, number>();
  for (const t of trades) {
    const h = parseInt(t.entryTime.split(":")[0], 10);
    const slot = `${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00`;
    timeSlots.set(slot, (timeSlots.get(slot) ?? 0) + 1);
  }
  for (const [slot, count] of Array.from(timeSlots.entries()).sort()) {
    const blocked = slot.startsWith("15") ? " 🚫 BLOCKED" : "";
    console.log(`  ${slot}: ${String(count).padStart(3)} trades${blocked}`);
  }

  // Show last 5 trades
  console.log("");
  console.log("📝 Last 5 Trades:");
  for (const t of trades.slice(-5)) {
    const pnlSign = t.pnl >= 0 ? "+" : "";
    const type = t.signalType === "BULLISH" ? "🟢" : "🔴";
    const reason = t.exitReason === "TARGET" ? "🎯" : t.exitReason === "STOP_LOSS" ? "🛡️" : "⏰";
    console.log(
      `  ${type} ${t.date} ${t.entryTime}→${t.exitTime} | ` +
        `${t.strike}${t.signalType === "BULLISH" ? "CE" : "PE"} | ` +
        `₹${t.entryPrice.toFixed(0)}→₹${t.exitPrice.toFixed(0)} | ` +
        `${reason} ${pnlSign}₹${t.pnl.toFixed(0)} (${t.profitPct.toFixed(1)}%)`
    );
  }
}

main().catch((err) => {
  console.error("❌ Backtest failed:", err);
  process.exit(1);
});
