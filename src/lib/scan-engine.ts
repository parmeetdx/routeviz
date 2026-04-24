import { dbCheckAndClearScanRequest, dbGetActiveSnapshot } from "./db";
import { ensureDb, getSettings, isDue, runScanAndPersist } from "./routeviz-server";

export async function runScanIfDue(): Promise<void> {
  await ensureDb();
  const settings = await getSettings();
  const latest = await dbGetActiveSnapshot();
  const requested = await dbCheckAndClearScanRequest();
  if (!requested && !isDue(latest, settings)) return;
  console.log("[worker] scan running" + (requested ? " (manual request)" : ""));
  await runScanAndPersist(settings);
  console.log("[worker] scan complete");
}
