"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { Connector, PersistedSettings } from "@/lib/ops-ledger-types";

import { Badge } from "./ops-ledger-ui";

type BaselineMode = PersistedSettings["dnsBaseline"]["mode"];

function formatRetentionWindow(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  }

  const totalHours = totalMinutes / 60;

  if (totalHours < 48) {
    return `${Math.round(totalHours)} hours`;
  }

  const totalDays = totalHours / 24;

  if (totalDays < 14) {
    return `${Math.round(totalDays)} days`;
  }

  const totalWeeks = totalDays / 7;
  return `${totalWeeks.toFixed(1)} weeks`;
}

function formatConnectorStatus(status: string) {
  return status.replaceAll("_", " ");
}

function getConnectorSummary(connector: Connector) {
  if (connector.requiresAction) {
    return connector.hint;
  }

  if (connector.id === "docker") {
    return "Reads live Docker state for workload matching.";
  }

  if (connector.id === "npm") {
    return "Reads proxy hosts and certificate metadata from the local NPM source.";
  }

  if (connector.id === "dns") {
    return "Resolves public DNS answers during each snapshot.";
  }

  return connector.details;
}

export default function SetupConsole({
  settings,
  connectors,
}: {
  settings: PersistedSettings;
  connectors: Connector[];
}) {
  const router = useRouter();
  const [baselineMode, setBaselineMode] = useState<BaselineMode>(
    settings.dnsBaseline.mode,
  );
  const [baselineValue, setBaselineValue] = useState(settings.dnsBaseline.value);
  const [intervalEnabled, setIntervalEnabled] = useState(
    settings.scanConfig.intervalEnabled,
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    String(settings.scanConfig.intervalMinutes),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  const requiredConnectors = useMemo(
    () => connectors.filter((connector) => connector.requiresAction),
    [connectors],
  );

  const readiness = useMemo(() => {
    const hasBaseline =
      baselineMode === "disabled" || baselineValue.trim().length > 0;

    return hasBaseline && requiredConnectors.length === 0;
  }, [baselineMode, baselineValue, requiredConnectors.length]);

  const baselineOptions: Array<{
    value: BaselineMode;
    label: string;
    description: string;
    helper: string;
    example: string;
    recommended?: boolean;
  }> = [
    {
      value: "disabled",
      label: "Off",
      description: "No DNS mismatch alerts",
      helper:
        "Ops Ledger records DNS answers, but it does not compare them against an expected endpoint.",
      example: "Best for most installs when you only want exposure findings.",
      recommended: true,
    },
    {
      value: "reference_hostname",
      label: "DDNS host",
      description: "Compare against one trusted hostname",
      helper:
        "Use this when a single DDNS hostname is your source of truth for the expected public endpoint.",
      example: "Example: edge.example.com or your Synology DDNS hostname.",
    },
    {
      value: "manual_endpoint",
      label: "Fixed IP",
      description: "Compare against one explicit endpoint",
      helper:
        "Use this when your expected public IP or endpoint is stable and you want exact mismatch checks.",
      example: "Example: 203.0.113.10",
    },
  ];

  const selectedBaselineOption =
    baselineOptions.find((option) => option.value === baselineMode) ??
    baselineOptions[0];

  const intervalOptions = [
    { value: "2", label: "2m", note: "dense" },
    { value: "5", label: "5m", note: "default" },
    { value: "15", label: "15m", note: "lighter" },
    { value: "30", label: "30m", note: "low noise" },
    { value: "60", label: "60m", note: "minimal" },
  ];

  const retentionWindow = intervalEnabled
    ? formatRetentionWindow(
        Number(intervalMinutes) * settings.scanConfig.retentionLimit,
      )
    : "manual snapshots only";

  const scheduleText = intervalEnabled
    ? `Every ${intervalMinutes} minutes`
    : "Manual only";
  const scheduleDetail = intervalEnabled
    ? `Keeps about ${retentionWindow} of local history.`
    : "History only grows when you run scans manually.";

  const baselineStatus =
    baselineMode === "disabled"
      ? "Off"
      : baselineMode === "reference_hostname"
        ? "DDNS host"
        : "Fixed IP";

  const baselineText =
    baselineMode === "disabled"
      ? "DNS mismatch checks are off. Ops Ledger still records answers it sees."
      : baselineMode === "reference_hostname"
        ? `Comparing public routes against ${baselineValue || "your trusted hostname"}.`
        : `Comparing public routes against ${baselineValue || "your explicit endpoint"}.`;

  const baselineValueLabel =
    baselineMode === "manual_endpoint"
      ? "Expected public IP or endpoint"
      : "Trusted reference hostname";
  const baselinePlaceholder =
    baselineMode === "manual_endpoint" ? "203.0.113.10" : "edge.example.com";

  async function handleSave() {
    setStatus("saving");
    setErrorMessage("");

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dnsBaseline: {
            mode: baselineMode,
            value: baselineValue.trim(),
          },
          scanConfig: {
            intervalEnabled,
            intervalMinutes: Number(intervalMinutes),
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Saving setup failed.");
      }

      setStatus("saved");
      router.refresh();
      window.setTimeout(() => {
        setStatus("idle");
      }, 1500);
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Saving setup failed.",
      );
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
      <section className="overflow-hidden rounded-[0.9rem] border border-border bg-panel shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
                Setup
              </p>
              <h2 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.04em]">
                {readiness
                  ? "Nothing to change on this host"
                  : "Connector access needs attention"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                {readiness
                  ? "Recommended for this host: keep DNS drift checks off and run recurring snapshots every 5 minutes."
                  : "Fix connector access first. After that, this page is mostly about optional DNS drift checks and how much local history you want."}
              </p>
            </div>
            <Badge
              label={readiness ? "Ready" : "Needs action"}
              tone={readiness ? "success" : "warning"}
            />
          </div>
        </div>

        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="overflow-hidden rounded-[0.72rem] border border-border bg-panel-2">
            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[180px_110px_minmax(0,1fr)] md:items-start"
              >
                <div className="min-w-0 text-sm font-medium text-foreground">
                  {connector.label}
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connector.requiresAction ? "bg-warning" : "bg-success"
                    }`}
                  />
                  <span>{formatConnectorStatus(connector.status)}</span>
                </div>
                <p className="min-w-0 text-sm leading-6 text-muted">
                  {getConnectorSummary(connector)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="overflow-hidden rounded-[0.8rem] border border-border bg-panel-2">
            <section className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[210px_minmax(0,1fr)]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  DNS drift checks
                </p>
                <h3 className="mt-2 text-base font-semibold text-foreground">
                  Optional
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Leave this off unless you want alerts when public DNS resolves
                  somewhere unexpected.
                </p>
              </div>

              <div className="min-w-0 space-y-4">
                <div
                  role="radiogroup"
                  aria-label="DNS baseline mode"
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {baselineOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBaselineMode(option.value)}
                      className={`min-w-0 rounded-[0.7rem] border px-4 py-3 text-left transition ${
                        baselineMode === option.value
                          ? "border-accent/45 bg-[#111820] shadow-[inset_0_0_0_1px_rgba(76,139,245,0.12)]"
                          : "border-border bg-panel hover:border-accent/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.recommended ? (
                          <span className="rounded-full border border-success/25 bg-success/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-success">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="min-w-0 rounded-[0.7rem] border border-border bg-[#111820] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">
                      {selectedBaselineOption.label}
                    </div>
                    {selectedBaselineOption.recommended ? (
                      <Badge label="Recommended" tone="success" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {selectedBaselineOption.helper}
                  </p>

                  {baselineMode === "disabled" ? (
                    <p className="mt-3 text-sm leading-6 text-foreground/90">
                      Ops Ledger will keep recording DNS answers, but it will not open
                      mismatch findings from them.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {baselineValueLabel}
                        </span>
                        <input
                          className="min-h-11 min-w-0 rounded-[0.7rem] border border-border bg-panel px-4 text-base outline-none transition focus:border-accent/40"
                          value={baselineValue}
                          onChange={(event) => setBaselineValue(event.target.value)}
                          placeholder={baselinePlaceholder}
                        />
                      </label>
                      <div className="text-sm leading-6 text-muted">
                        {selectedBaselineOption.example}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-5 border-t border-border px-4 py-5 sm:px-5 lg:grid-cols-[210px_minmax(0,1fr)]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  Snapshot history
                </p>
                <h3 className="mt-2 text-base font-semibold text-foreground">
                  Local history
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Five minutes is the default. Change this only if you want denser
                  debugging history or less background scanning.
                </p>
              </div>

              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.7rem] border border-border bg-[#111820] px-4 py-3">
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={intervalEnabled}
                      onChange={(event) => setIntervalEnabled(event.target.checked)}
                    />
                    Enable recurring snapshots
                  </label>
                  <div className="text-sm text-muted">
                    {intervalEnabled ? "On" : "Off"}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-5">
                  {intervalOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!intervalEnabled}
                      onClick={() => setIntervalMinutes(option.value)}
                      className={`rounded-[0.7rem] border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        intervalMinutes === option.value
                          ? "border-accent/45 bg-[#111820] shadow-[inset_0_0_0_1px_rgba(76,139,245,0.12)]"
                          : "border-border bg-panel hover:border-accent/20"
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground">
                        {option.label}
                      </div>
                      <div className="mt-1 text-xs text-muted">{option.note}</div>
                    </button>
                  ))}
                </div>

                <div className="rounded-[0.7rem] border border-border bg-[#111820] px-4 py-3 text-sm leading-6 text-muted">
                  {scheduleDetail}
                </div>
              </div>
            </section>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!readiness || status === "saving"}
              onClick={handleSave}
              className="rounded-[0.55rem] border border-accent/25 bg-accent/14 px-4 py-2 text-sm text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "saving" ? "Saving..." : "Save changes"}
            </button>
            {status === "saved" ? (
              <span className="text-sm text-success">Saved.</span>
            ) : null}
            {status === "error" ? (
              <span className="text-sm text-danger">{errorMessage}</span>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="overflow-hidden rounded-[0.85rem] border border-border bg-panel shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Current setup
            </p>
          </div>
          <div className="divide-y divide-border">
            <div className="px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                DNS checks
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {baselineStatus}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted">{baselineText}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                Snapshot cadence
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {scheduleText}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted">
                {scheduleDetail}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                Retention limit
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {settings.scanConfig.retentionLimit} snapshots
              </div>
              <div className="mt-2 text-sm leading-6 text-muted">
                Snapshot history stays local and survives restarts when app data is
                persisted.
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                Docker socket
              </div>
              <div className="mt-2 break-all rounded-[0.65rem] border border-border bg-[#111820] px-3 py-2 font-mono text-xs leading-6 text-foreground/92">
                {settings.dockerSocketPath}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                NPM source path
              </div>
              <div className="mt-2 break-all rounded-[0.65rem] border border-border bg-[#111820] px-3 py-2 font-mono text-xs leading-6 text-foreground/92">
                {settings.npmSqlitePath}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                Only change these if your local mount layout is different from the
                default install contract.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
