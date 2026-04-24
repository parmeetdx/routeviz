export type ConnectorStatus = "connected" | "degraded" | "disconnected";
export type RouteMatchState =
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "off_host"
  | "direct";
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";
export type FindingSeverity = "high" | "medium" | "low";
export type DnsBaselineMode =
  | "reference_hostname"
  | "manual_endpoint"
  | "disabled";

export interface Connector {
  id: string;
  label: string;
  kind: string;
  status: ConnectorStatus;
  requiresAction: boolean;
  hint: string;
  details: string;
  lastSyncAt?: string | null;
}

export interface Finding {
  id: string;
  routeSlug: string;
  type: string;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  nextCheck: string;
}

export interface RelatedWorkload {
  name: string;
  image: string;
  latestImageTag: string | null;
  state: string;
  role: string;
  createdAt: string | null;
  composeProject: string | null;
  serviceName: string | null;
  composePath: string | null;
  publishedPorts: string[];
  exposedPorts: number[];
  networks: string[];
  mounts: string[];
  networkMode: string;
  dockerSocketMount: "read_only" | "read_write" | "none";
}

export interface WorkloadRecord extends RelatedWorkload {
  id: string;
  aliases: string[];
  internalIps: string[];
}

export interface WorkloadFinding {
  id: string;
  workloadId: string;
  workloadName: string;
  type: string;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  nextCheck: string;
}

export interface RouteRecord {
  slug: string;
  entrypoint: string;
  primaryDomain: string | null;
  edgeSource: string;
  target: string;
  workloadLabel: string;
  matchState: RouteMatchState;
  confidence: ConfidenceLevel;
  dnsStatus: string;
  dnsAnswers: string[];
  tlsDaysRemaining: number | null;
  certificateLabel: string | null;
  certificateProvider: string | null;
  notes: string;
  publicPort: number | null;
  privatePort: number | null;
  composeProject: string | null;
  serviceName: string | null;
  containerName: string | null;
  hostAddress: string | null;
  sourceRecordId: number | null;
  duplicateDomainCount: number;
  sharedTargetCount: number;
  npmAccessListId: number;
  npmAdvancedConfig: string | null;
  selfAuthDetected: boolean;
  chain: string[];
  relatedWorkloads: RelatedWorkload[];
}

export interface DnsBaseline {
  mode: DnsBaselineMode;
  value: string;
  helper: string;
}

export interface ScanConfig {
  manualEnabled: boolean;
  intervalEnabled: boolean;
  intervalMinutes: number;
  retentionLimit: number;
  lastCompletedAt: string | null;
  nextScheduledAt: string | null;
}

export type ChangeKind =
  | "route_added"
  | "route_removed"
  | "match_recovered"
  | "match_lost"
  | "finding_appeared"
  | "finding_resolved"
  | "cert_expiry_warning"
  | "container_down";

export interface SnapshotChange {
  id: string;
  kind: ChangeKind;
  severity: FindingSeverity;
  routeSlug: string;
  routeLabel: string;
  description: string;
}

export interface RoutevizSnapshot {
  id: string;
  generatedAt: string;
  generatedLabel: string;
  hostLabel: string;
  hostAddress: string;
  dnsBaseline: DnsBaseline;
  scanConfig: ScanConfig;
  connectors: Connector[];
  workloads: WorkloadRecord[];
  routes: RouteRecord[];
  findings: Finding[];
  workloadFindings: WorkloadFinding[];
  changes: SnapshotChange[];
}

export interface OverviewStats {
  publicEntrypoints: number;
  matchedRoutes: number;
  unresolvedRoutes: number;
  expiringCertificates: number;
  connectorWarnings: number;
}

export interface RouteDetail {
  route: RouteRecord;
  findings: Finding[];
}

export interface ConnectorSummary {
  total: number;
  needsAttention: number;
  items: Connector[];
}

export interface RouteWithFindings extends RouteRecord {
  findings: Finding[];
}

export interface SnapshotHistoryPoint {
  id: string;
  generatedAt: string;
  label: string;
  publicEntrypoints: number;
  matchedRoutes: number;
  findingCount: number;
  highSeverityCount: number;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  severityThreshold: "high" | "high_medium";
  lastDeliveryAt: string | null;
  lastDeliveryStatus: "success" | "failed" | null;
}

export interface PersistedSettings {
  dockerSocketPath: string;
  hostAddress: string | null;
  hostLabel: string;
  npmSqlitePath: string;
  dnsBaseline: {
    mode: DnsBaselineMode;
    value: string;
  };
  scanConfig: {
    intervalEnabled: boolean;
    intervalMinutes: number;
    retentionLimit: number;
  };
  webhookConfig: WebhookConfig;
  authOverrides: string[];
  suppressedFindings: string[];
}

export interface RoutevizState {
  snapshot: RoutevizSnapshot;
  snapshots: RoutevizSnapshot[];
  history: SnapshotHistoryPoint[];
  settings: PersistedSettings;
  recentChanges: SnapshotChange[];
}
