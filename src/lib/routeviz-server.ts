import http from "node:http";
import https from "node:https";

import { diffSnapshots } from "@/lib/snapshot-differ";
import {
  dbGetActiveSnapshot,
  dbGetSettings,
  dbGetSnapshots,
  dbGetSuppressedFindings,
  dbInsertSnapshot,
  dbPruneSnapshots,
  dbRequestScan,
  dbSetActiveSnapshot,
  dbSuppressFinding,
  dbUnsuppressFinding,
  dbUpsertSettings,
  runMigrations,
} from "@/lib/db";
import type { Finding, PersistedSettings, RoutevizSnapshot, RoutevizState } from "@/lib/routeviz-types";
import { getHistoryPoints } from "@/lib/routeviz.mjs";

import { attachCurrentSettings, getFallbackSnapshot, normalizeSettings } from "@/lib/settings";
import { buildSnapshot } from "@/lib/snapshot";
import { suppressionKey } from "@/lib/analysis/route-findings";

export type { SettingsUpdate } from "@/lib/settings";
export { suppressionKey };

// ── Types ─────────────────────────────────────────────────────────────────────
import type { SettingsUpdate } from "@/lib/settings";

// ── DB bootstrap ──────────────────────────────────────────────────────────────

const globalRouteViz = globalThis as typeof globalThis & {
  __routevizDbReady?: Promise<void>;
};

export async function ensureDb(): Promise<void> {
  if (!globalRouteViz.__routevizDbReady) {
    globalRouteViz.__routevizDbReady = runMigrations();
  }
  return globalRouteViz.__routevizDbReady;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<PersistedSettings> {
  const settings = await dbGetSettings();
  return settings ?? normalizeSettings();
}

// ── Scheduling (used by worker) ───────────────────────────────────────────────

export function isDue(snapshot: RoutevizSnapshot | null, settings: PersistedSettings): boolean {
  if (!snapshot) return true;
  if (!settings.scanConfig.intervalEnabled) return false;
  const dueAt = new Date(snapshot.generatedAt);
  dueAt.setTime(dueAt.getTime() + settings.scanConfig.intervalMinutes * 60 * 1000);
  return Date.now() >= dueAt.getTime();
}

// ── Webhook ───────────────────────────────────────────────────────────────────

function httpsRequest(
  url: string,
  body: string,
  resolve: () => void,
  reject: (err: unknown) => void,
) {
  const parsed = new URL(url);
  const mod = parsed.protocol === "https:" ? https : http;
  const req = mod.request(
    {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    (res: { resume: () => void }) => { res.resume(); resolve(); },
  );
  req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
  req.on("error", reject);
  req.write(body);
  req.end();
}

function fireWebhook(url: string, payload: object): Promise<{ success: boolean }> {
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    try {
      httpsRequest(url, body, () => resolve({ success: true }), () => resolve({ success: false }));
    } catch {
      resolve({ success: false });
    }
  });
}

// ── Scan + persist ────────────────────────────────────────────────────────────

export async function runScanAndPersist(settings: PersistedSettings): Promise<void> {
  const suppressedKeys = await dbGetSuppressedFindings();
  const settingsWithSuppressed = { ...settings, suppressedFindings: suppressedKeys };
  const snapshot = await buildSnapshot(settingsWithSuppressed);
  const previous = await dbGetActiveSnapshot();
  const changes = previous ? diffSnapshots(previous, snapshot) : [];
  const snapshotWithChanges = { ...snapshot, changes };

  await dbInsertSnapshot(snapshotWithChanges);
  await dbSetActiveSnapshot(snapshotWithChanges.id);
  await dbPruneSnapshots(settings.scanConfig.retentionLimit);

  const wh = settings.webhookConfig;
  if (wh.enabled && wh.url) {
    const prevFindingIds = new Set((previous?.findings ?? []).map((f: Finding) => f.id));
    const threshold = wh.severityThreshold === "high_medium" ? ["high", "medium"] : ["high"];
    const newFindings = snapshotWithChanges.findings.filter(
      (f: Finding) => !prevFindingIds.has(f.id) && threshold.includes(f.severity),
    );
    if (newFindings.length > 0) {
      const result = await fireWebhook(wh.url, {
        timestamp: snapshotWithChanges.generatedAt,
        hostLabel: snapshotWithChanges.hostLabel,
        hostAddress: snapshotWithChanges.hostAddress,
        newFindingCount: newFindings.length,
        findings: newFindings.map((f: Finding) => ({
          id: f.id, routeSlug: f.routeSlug, type: f.type,
          severity: f.severity, title: f.title, evidence: f.evidence,
        })),
      });
      await dbUpsertSettings({
        ...settings,
        webhookConfig: {
          ...wh,
          lastDeliveryAt: snapshotWithChanges.generatedAt,
          lastDeliveryStatus: result.success ? "success" : "failed",
        },
      });
    }
  }
}

// ── State reader ──────────────────────────────────────────────────────────────

function getRecentChanges(snapshots: RoutevizSnapshot[]) {
  const seen = new Map<string, RoutevizSnapshot["changes"][0]>();
  for (const snap of snapshots.slice(-5)) {
    for (const change of snap.changes ?? []) {
      if (!seen.has(change.id)) seen.set(change.id, change);
    }
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...seen.values()].sort((a, b) => order[a.severity] - order[b.severity]);
}

async function loadState(): Promise<RoutevizState> {
  await ensureDb();
  const [settings, rawSnapshot, allSnapshots, suppressedKeys] = await Promise.all([
    getSettings(),
    dbGetActiveSnapshot(),
    dbGetSnapshots(576),
    dbGetSuppressedFindings(),
  ]);

  const suppressedSet = new Set(suppressedKeys);
  const settingsWithSuppressed = { ...settings, suppressedFindings: suppressedKeys };

  if (!rawSnapshot) {
    return {
      snapshot: getFallbackSnapshot(settingsWithSuppressed),
      snapshots: [],
      history: [],
      settings: settingsWithSuppressed,
      recentChanges: [],
    };
  }

  const snapshot = attachCurrentSettings(rawSnapshot, settingsWithSuppressed);
  const filtered = {
    ...snapshot,
    findings: snapshot.findings.filter(
      (f) => !suppressedSet.has(suppressionKey(f.type, f.routeSlug)),
    ),
    workloadFindings: (snapshot.workloadFindings ?? []).filter(
      (f) => !suppressedSet.has(suppressionKey(f.type, f.workloadName)),
    ),
  };

  return {
    snapshot: filtered,
    snapshots: allSnapshots,
    history: getHistoryPoints(allSnapshots),
    settings: settingsWithSuppressed,
    recentChanges: getRecentChanges(allSnapshots),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getRoutevizState(): Promise<RoutevizState> {
  await ensureDb();
  return loadState();
}

export async function triggerManualScan(): Promise<RoutevizState> {
  await ensureDb();
  await dbRequestScan();
  return loadState();
}

export async function saveSettings(input: SettingsUpdate): Promise<RoutevizState> {
  await ensureDb();
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...input,
    dnsBaseline: { ...current.dnsBaseline, ...input.dnsBaseline },
    scanConfig: { ...current.scanConfig, ...input.scanConfig },
    webhookConfig: { ...current.webhookConfig, ...input.webhookConfig },
    authOverrides: input.authOverrides ?? current.authOverrides,
  });
  await dbUpsertSettings(next);
  return loadState();
}

export async function suppressFinding(key: string): Promise<void> {
  await ensureDb();
  await dbSuppressFinding(key);
}

export async function unsuppressFinding(key: string): Promise<void> {
  await ensureDb();
  await dbUnsuppressFinding(key);
}

export async function getSuppressedFindings(): Promise<string[]> {
  await ensureDb();
  return dbGetSuppressedFindings();
}
