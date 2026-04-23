import Link from "next/link";

import { ConsoleCard, ConsolePage } from "@/components/console-page";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { getRoutesWithFindings } from "@/lib/ops-ledger.mjs";
import { buildServiceExplorerModel } from "@/lib/service-explorer";
import type { RouteWithFindings } from "@/lib/ops-ledger-types";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const { snapshot } = await getOpsLedgerState();
  const routes = getRoutesWithFindings(snapshot);
  const model = buildServiceExplorerModel(snapshot, null);

  return (
    <ConsolePage
      eyebrow="Routes"
      title="Live proxy inventory"
      description="This is the raw public route map from the latest snapshot. Use it when you want the inventory view first, then jump back into the overview explorer for the exposure chain."
      lastSyncLabel={model.lastSyncLabel}
    >
      <ConsoleCard title="Public Route Inventory" eyebrow="Current snapshot">
        <div className="space-y-3 md:hidden">
          {routes.map((route: RouteWithFindings) => (
            <article
              key={route.slug}
              className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4"
            >
              <Link
                href={`/?service=${route.slug}`}
                className="break-words text-base font-semibold tracking-[-0.02em] text-foreground transition hover:text-accent"
              >
                {route.entrypoint}
              </Link>
              <div className="mt-1 text-xs text-muted">{route.edgeSource}</div>
              <div className="mt-3 space-y-2 text-sm leading-6">
                <div className="font-mono break-all text-foreground/92">{route.target}</div>
                <div className="break-words text-foreground/92">{route.workloadLabel}</div>
                <div className="text-muted">
                  {route.findings.length} finding{route.findings.length === 1 ? "" : "s"}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[0.85rem] border border-border bg-panel-2 md:block">
          <div className="grid grid-cols-[1.3fr_1fr_0.95fr_0.72fr] gap-3 border-b border-border px-4 py-3 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-muted">
            <span>Entrypoint</span>
            <span>Target</span>
            <span>Workload</span>
            <span>Findings</span>
          </div>
          <div className="divide-y divide-border">
            {routes.map((route: RouteWithFindings) => (
              <div
                key={route.slug}
                className="grid grid-cols-[1.3fr_1fr_0.95fr_0.72fr] gap-3 px-4 py-4 text-sm leading-6"
              >
                <div>
                  <Link
                    href={`/?service=${route.slug}`}
                    className="break-words text-foreground transition hover:text-accent"
                  >
                    {route.entrypoint}
                  </Link>
                  <div className="mt-1 text-xs text-muted">{route.edgeSource}</div>
                </div>
                <div className="break-all font-mono text-xs text-foreground/92">
                  {route.target}
                </div>
                <div className="break-words text-foreground/92">{route.workloadLabel}</div>
                <div className="text-foreground/92">{route.findings.length}</div>
              </div>
            ))}
          </div>
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}
