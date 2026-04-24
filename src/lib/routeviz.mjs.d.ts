import type {
  Connector,
  ConnectorSummary,
  DnsBaseline,
  Finding,
  RoutevizSnapshot,
  OverviewStats,
  PersistedSettings,
  RouteDetail,
  RouteWithFindings,
  ScanConfig,
  SnapshotHistoryPoint,
} from "./routeviz-types";

export function formatTimestampLabel(iso: string): string;
export function getDnsBaselineHelper(dnsBaseline: {
  mode: PersistedSettings["dnsBaseline"]["mode"];
  value: string;
}): string;
export function createFallbackSnapshot(
  settings: PersistedSettings,
  message?: string,
): RoutevizSnapshot;
export function getOverviewStats(snapshot: RoutevizSnapshot): OverviewStats;
export function getRouteDetailBySlug(
  snapshot: RoutevizSnapshot,
  slug: string,
): RouteDetail | null;
export function getConnectorSummary(items: Connector[]): ConnectorSummary;
export function getScanSummary(scanConfig: ScanConfig): string;
export function getRoutesWithFindings(
  snapshot: RoutevizSnapshot,
): RouteWithFindings[];
export function getFindingsBySeverity(snapshot: RoutevizSnapshot): Finding[];
export function getSeverityCounts(
  findings: Finding[],
): { high: number; medium: number; low: number };
export function getHistoryPoints(
  snapshots: RoutevizSnapshot[],
): SnapshotHistoryPoint[];
export function slugify(value: string): string;
