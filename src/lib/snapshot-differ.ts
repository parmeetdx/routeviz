import type {
  ChangeKind,
  FindingSeverity,
  RoutevizSnapshot,
  SnapshotChange,
} from "./routeviz-types";

function change(
  kind: ChangeKind,
  severity: FindingSeverity,
  routeSlug: string,
  routeLabel: string,
  description: string,
): SnapshotChange {
  return { id: `${routeSlug}-${kind}`, kind, severity, routeSlug, routeLabel, description };
}

export function diffSnapshots(
  prev: RoutevizSnapshot,
  curr: RoutevizSnapshot,
): SnapshotChange[] {
  const changes: SnapshotChange[] = [];

  const prevRoutes = new Map(prev.routes.map((r) => [r.slug, r]));
  const currRoutes = new Map(curr.routes.map((r) => [r.slug, r]));

  const prevFindings = new Set(prev.findings.map((f) => f.id));
  const currFindings = new Set(curr.findings.map((f) => f.id));

  // Route added / removed
  for (const [slug, route] of currRoutes) {
    if (!prevRoutes.has(slug)) {
      changes.push(change("route_added", "low", slug, route.entrypoint, `New proxy route appeared: ${route.entrypoint}`));
    }
  }
  for (const [slug, route] of prevRoutes) {
    if (!currRoutes.has(slug)) {
      changes.push(change("route_removed", "high", slug, route.entrypoint, `Route removed: ${route.entrypoint}`));
    }
  }

  // Per-route diffs
  for (const [slug, curr_r] of currRoutes) {
    const prev_r = prevRoutes.get(slug);
    if (!prev_r) continue;

    const label = curr_r.entrypoint;

    // matchState transitions
    const wasDown = prev_r.matchState === "unmatched" || prev_r.matchState === "ambiguous";
    const isDown  = curr_r.matchState === "unmatched" || curr_r.matchState === "ambiguous";
    if (wasDown && !isDown) {
      changes.push(change("match_recovered", "low", slug, label, `${label} is back — route now resolves to a live target`));
    } else if (!wasDown && isDown) {
      changes.push(change("match_lost", "high", slug, label, `${label} lost its live target (${curr_r.matchState})`));
    }

    // Certificate crossed the 30-day warning threshold
    const prevDays = prev_r.tlsDaysRemaining;
    const currDays = curr_r.tlsDaysRemaining;
    if (
      currDays !== null &&
      currDays >= 0 &&
      currDays <= 30 &&
      (prevDays === null || prevDays > 30)
    ) {
      changes.push(change("cert_expiry_warning", "medium", slug, label, `${label} cert expires in ${currDays} day${currDays === 1 ? "" : "s"}`));
    }

    // Container went down
    const prevRunning = prev_r.relatedWorkloads.filter((w) => w.state.toLowerCase() === "running").map((w) => w.name);
    const currStopped = curr_r.relatedWorkloads.filter(
      (w) => w.state.toLowerCase() !== "running" && prevRunning.includes(w.name),
    );
    for (const w of currStopped) {
      changes.push(change("container_down", "high", slug, label, `Container ${w.name} stopped on ${label}`));
    }
  }

  // Findings appeared / resolved (high-severity only to reduce noise)
  for (const f of curr.findings) {
    if (!prevFindings.has(f.id) && f.severity === "high") {
      const route = currRoutes.get(f.routeSlug);
      changes.push(change("finding_appeared", "high", f.routeSlug, route?.entrypoint ?? f.routeSlug, `New finding: ${f.title}`));
    }
  }
  for (const f of prev.findings) {
    if (!currFindings.has(f.id) && f.severity === "high") {
      const route = currRoutes.get(f.routeSlug);
      changes.push(change("finding_resolved", "low", f.routeSlug, route?.entrypoint ?? f.routeSlug, `Resolved: ${f.title}`));
    }
  }

  // Sort: high → medium → low
  const order: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };
  return changes.sort((a, b) => order[a.severity] - order[b.severity]);
}
