import { ServiceExplorer } from "@/components/service-explorer";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ snapshot }, params] = await Promise.all([
    getOpsLedgerState(),
    searchParams,
  ]);
  const model = buildServiceExplorerModel(snapshot, params.service ?? null);

  return (
    <ServiceExplorer
      model={model}
      pageLinks={[
        { href: "/", label: "Overview" },
        { href: "/setup", label: "Setup" },
        { href: "/routes", label: "Routes" },
        { href: "/findings", label: "Findings" },
      ]}
    />
  );
}
