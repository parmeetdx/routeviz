import { ConsoleCard, ConsolePage } from "@/components/console-page";
import { SetupConsole } from "@/components/setup-console";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

const installSteps = [
  "Run Ops Ledger on the same host as Docker if you want zero-config socket access and local NPM discovery.",
  "Keep `/var/run/docker.sock` mounted read-only for runtime discovery.",
  "Persist `.ops-ledger/store.json` or mount the equivalent app data directory so snapshot history survives restarts.",
  "If the NPM data bind mount exists locally, Ops Ledger can read the proxy host SQLite store immediately.",
  "Set DNS baseline rules only after the raw route map looks correct.",
];

const distributionPlan = [
  "GHCR remains the canonical image source for the self-hosted build.",
  "Docker Hub mirrors the same tags for discovery and easier one-click pulls.",
  "Unraid, CasaOS, and TrueNAS wrappers should stay thin and follow the same container contract.",
  "Hosted or multi-node layers stay out of MVP scope until the self-hosted install shows repeat usage.",
];

export default async function SetupPage() {
  const { settings, snapshot } = await getOpsLedgerState();
  const model = buildServiceExplorerModel(snapshot, null);

  return (
    <ConsolePage
      eyebrow="Setup"
      title="Source trust, scan cadence, and local storage"
      description="Ops Ledger is self-hosted, so setup is mostly about where the app reads truth from and how often it captures a new snapshot. This page keeps that contract explicit."
      lastSyncLabel={model.lastSyncLabel}
    >
      <SetupConsole settings={settings} connectors={snapshot.connectors} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ConsoleCard title="Install Contract" eyebrow="One dependable path">
          <div className="space-y-3">
            {installSteps.map((step, index) => (
              <div
                key={step}
                className="flex gap-3 rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/14 font-mono text-xs text-accent">
                  {index + 1}
                </div>
                <p className="text-sm leading-7 text-foreground/92">{step}</p>
              </div>
            ))}
          </div>
        </ConsoleCard>

        <ConsoleCard title="Distribution Phases" eyebrow="Container first">
          <div className="space-y-3">
            {distributionPlan.map((step, index) => (
              <div
                key={step}
                className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4"
              >
                <div className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-accent">
                  Phase {index + 1}
                </div>
                <p className="mt-2 text-sm leading-7 text-muted">{step}</p>
              </div>
            ))}
          </div>
        </ConsoleCard>
      </div>
    </ConsolePage>
  );
}
