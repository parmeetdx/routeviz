/**
 * Standalone scan worker — runs in its own container.
 * Polls the DB for due scans and writes results back.
 * Never imports anything from Next.js.
 */
import { runMigrations } from "../lib/db";
import { runScanIfDue } from "../lib/scan-engine";

const POLL_INTERVAL_MS = 10_000;

async function main() {
  console.log("[worker] starting");
  await runMigrations();
  console.log("[worker] migrations ok");

  // Run immediately on boot, then on interval
  await runScanIfDue();

  setInterval(() => {
    void runScanIfDue();
  }, POLL_INTERVAL_MS);

  console.log(`[worker] polling every ${POLL_INTERVAL_MS / 1000}s`);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
