import type {
  Connector,
  ConnectorSummary,
  DnsBaseline,
  Finding,
  OpsLedgerSnapshot,
  OverviewStats,
  PersistedSettings,
  RouteDetail,
  RouteWithFindings,
  ScanConfig,
  SnapshotHistoryPoint,
} from "./ops-ledger-types";

export function formatTimestampLabel(iso: string): string;
export function getDnsBaselineHelper(dnsBaseline: {
  mode: PersistedSettings["dnsBaseline"]["mode"];
  value: string;
}): string;
export function createFallbackSnapshot(
  settings: PersistedSettings,
  message?: string,
): OpsLedgerSnapshot;
export function getOverviewStats(snapshot: OpsLedgerSnapshot): OverviewStats;
export function getRouteDetailBySlug(
  snapshot: OpsLedgerSnapshot,
  slug: string,
): RouteDetail | null;
export function getConnectorSummary(items: Connector[]): ConnectorSummary;
export function getScanSummary(scanConfig: ScanConfig): string;
export function getRoutesWithFindings(
  snapshot: OpsLedgerSnapshot,
): RouteWithFindings[];
export function getFindingsBySeverity(snapshot: OpsLedgerSnapshot): Finding[];
export function getSeverityCounts(
  findings: Finding[],
): { high: number; medium: number; low: number };
export function getHistoryPoints(
  snapshots: OpsLedgerSnapshot[],
): SnapshotHistoryPoint[];
export function slugify(value: string): string;
