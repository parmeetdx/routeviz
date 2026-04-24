import { ConsolePage } from "@/components/console-page";
import SetupConsole from "@/components/setup-console";
import { getRoutevizState } from "@/lib/routeviz-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { settings, snapshot } = await getRoutevizState();
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
