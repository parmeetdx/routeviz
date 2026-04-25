import ServiceExplorer from "@/components/service-explorer";
import { getRoutevizState } from "@/lib/routeviz-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ snapshot, snapshots }, params] = await Promise.all([
    getRoutevizState(),
    searchParams,
  ]);
  const model = buildServiceExplorerModel(snapshot, params.service ?? null, snapshots);

  return (
    <ServiceExplorer
      model={model}
      pageLinks={[
        { href: "/", label: "Overview" },
        { href: "/routes", label: "Routes" },
        { href: "/findings", label: "Findings" },
        { href: "/setup", label: "Setup" },
      ]}
    />
  );
}
