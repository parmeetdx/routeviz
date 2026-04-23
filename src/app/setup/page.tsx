import { ConsolePage } from "@/components/console-page";
import SetupConsole from "@/components/setup-console";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { settings, snapshot } = await getOpsLedgerState();
  const model = buildServiceExplorerModel(snapshot, null);

  return (
    <ConsolePage
      eyebrow="Setup"
      title="Ready to scan"
      description="This page is mostly optional once your connectors are green."
      lastSyncLabel={model.lastSyncLabel}
      hideIntro
    >
      <SetupConsole settings={settings} connectors={snapshot.connectors} />
    </ConsolePage>
  );
}
