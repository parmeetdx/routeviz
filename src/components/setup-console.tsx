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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="overflow-hidden border border-border bg-panel">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-muted/70">
                <span className="text-accent/40 mr-1">▸</span>CONNECTOR_STATUS
              </p>
              <h2 className="mt-2 font-mono text-base font-bold tracking-tight">
                {readiness
                  ? "Nothing to change on this host"
                  : "Connector access needs attention"}
              </h2>
              <p className="mt-2 font-mono text-xs leading-6 text-muted/80">
                {readiness
                  ? "Recommended: keep DNS drift checks off and run recurring snapshots every 5 minutes."
                  : "Fix connector access first. After that, this page is mostly about optional DNS drift checks and how much local history you want."}
              </p>
            </div>
            <Badge
              label={readiness ? "READY" : "NEEDS_ACTION"}
              tone={readiness ? "success" : "warning"}
            />
          </div>
        </div>

        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="border border-border/60 divide-y divide-border/50">
            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="grid gap-2 px-4 py-3 hover:bg-panel-2/40 transition md:grid-cols-[180px_110px_minmax(0,1fr)] md:items-start"
              >
                <div className="min-w-0 font-mono text-xs font-bold text-foreground">
                  {connector.label}
                </div>
                <div className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-wider text-muted/70">
                  <span
                    className={`h-1.5 w-1.5 ${
                      connector.requiresAction ? "bg-warning" : "bg-success"
                    }`}
                    style={connector.requiresAction
                      ? { boxShadow: "0 0 5px rgba(255,184,0,0.5)" }
                      : { boxShadow: "0 0 5px rgba(57,255,122,0.5)" }}
                  />
                  <span>{formatConnectorStatus(connector.status)}</span>
                </div>
                <p className="min-w-0 font-mono text-xs leading-6 text-muted/80">
                  {getConnectorSummary(connector)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="border border-border/60 divide-y divide-border/50">
            <section className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[210px_minmax(0,1fr)]">
              <div>
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted/70">
                  DNS_DRIFT_CHECKS
                </p>
                <h3 className="mt-2 font-mono text-sm font-bold text-foreground">
                  Optional
                </h3>
                <p className="mt-2 font-mono text-xs leading-6 text-muted/80">
                  Leave this off unless you want alerts when public DNS resolves
                  somewhere unexpected.
                </p>
              </div>

              <div className="min-w-0 space-y-3">
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
                      className={`min-w-0 border px-4 py-3 text-left transition ${
                        baselineMode === option.value
                          ? "border-accent/45 bg-panel-2 shadow-[inset_3px_0_0_0_var(--color-accent)]"
                          : "border-border/50 bg-panel hover:border-accent/25"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {option.label}
                        </span>
                        {option.recommended ? (
                          <span className="font-mono text-[0.58rem] uppercase tracking-wider border border-success/30 bg-success/10 px-1.5 py-0.5 text-success">
                            default
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 font-mono text-[0.62rem] leading-5 text-muted/70">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="min-w-0 border border-border/50 bg-panel-2 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-mono text-xs font-bold text-foreground">
                      {selectedBaselineOption.label}
                    </div>
                    {selectedBaselineOption.recommended ? (
                      <Badge label="RECOMMENDED" tone="success" />
                    ) : null}
                  </div>
                  <p className="mt-2 font-mono text-xs leading-6 text-muted/80">
                    {selectedBaselineOption.helper}
                  </p>

                  {baselineMode === "disabled" ? (
                    <p className="mt-2 font-mono text-xs leading-6 text-foreground/80">
                      Ops Ledger will keep recording DNS answers, but it will not open
                      mismatch findings from them.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {baselineValueLabel}
                        </span>
                        <input
                          className="min-h-10 min-w-0 border border-border/70 bg-background px-4 font-mono text-xs text-foreground outline-none transition focus:border-accent/50 focus:shadow-[0_0_8px_rgba(57,255,122,0.12)] placeholder:text-muted/40"
                          value={baselineValue}
                          onChange={(event) => setBaselineValue(event.target.value)}
                          placeholder={baselinePlaceholder}
                        />
                      </label>
                      <div className="font-mono text-xs leading-6 text-muted/70">
                        {selectedBaselineOption.example}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[210px_minmax(0,1fr)]">
              <div>
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted/70">
                  SNAPSHOT_HISTORY
                </p>
                <h3 className="mt-2 font-mono text-sm font-bold text-foreground">
                  Local history
                </h3>
                <p className="mt-2 font-mono text-xs leading-6 text-muted/80">
                  Five minutes is the default. Change this only if you want denser
                  debugging history or less background scanning.
                </p>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border border-border/50 bg-panel-2 px-4 py-3">
                  <label className="flex items-center gap-3 font-mono text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={intervalEnabled}
                      onChange={(event) => setIntervalEnabled(event.target.checked)}
                    />
                    Enable recurring snapshots
                  </label>
                  <div className="font-mono text-xs text-muted/70">
                    {intervalEnabled ? <span className="text-accent">ON</span> : "OFF"}
                  </div>
                </div>

                <div className="grid gap-1.5 sm:grid-cols-5">
                  {intervalOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!intervalEnabled}
                      onClick={() => setIntervalMinutes(option.value)}
                      className={`border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        intervalMinutes === option.value
                          ? "border-accent/45 bg-panel-2 shadow-[inset_3px_0_0_0_var(--color-accent)]"
                          : "border-border/50 bg-panel hover:border-accent/25"
                      }`}
                    >
                      <div className="font-mono text-xs font-bold text-foreground">
                        {option.label}
                      </div>
                      <div className="mt-1 font-mono text-[0.6rem] text-muted/60">{option.note}</div>
                    </button>
                  ))}
                </div>

                <div className="border border-border/50 bg-panel-2 px-4 py-3 font-mono text-xs leading-6 text-muted/80">
                  <span className="text-accent/40 mr-1">$</span>
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
              className="font-mono text-xs border border-accent/35 bg-accent/10 px-4 py-2 text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
            >
              {status === "saving" ? "saving..." : "[save changes]"}
            </button>
            {status === "saved" ? (
              <span className="font-mono text-xs text-success">
                <span className="mr-1">✓</span>saved.
              </span>
            ) : null}
            {status === "error" ? (
              <span className="font-mono text-xs text-danger">{errorMessage}</span>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="overflow-hidden border border-border bg-panel">
          <div className="border-b border-border/60 px-4 py-2.5">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.26em] text-muted/70">
              <span className="text-accent/40 mr-1">▸</span>CURRENT_CONFIG
            </p>
          </div>
          <div className="divide-y divide-border/50">
            <div className="px-4 py-3">
              <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
                dns_checks
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-foreground">
                {baselineStatus}
              </div>
              <div className="mt-1.5 font-mono text-xs leading-6 text-muted/80">{baselineText}</div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
                snapshot_cadence
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-foreground">
                {scheduleText}
              </div>
              <div className="mt-1.5 font-mono text-xs leading-6 text-muted/80">
                {scheduleDetail}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
                retention_limit
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-foreground">
                {settings.scanConfig.retentionLimit} snapshots
              </div>
              <div className="mt-1.5 font-mono text-xs leading-6 text-muted/80">
                History stays local and survives restarts when app data is persisted.
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
                docker_socket
              </div>
              <div className="mt-2 break-all border border-border/50 bg-panel-2 px-3 py-2 font-mono text-[0.65rem] leading-6 text-foreground/85">
                {settings.dockerSocketPath}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
                npm_source_path
              </div>
              <div className="mt-2 break-all border border-border/50 bg-panel-2 px-3 py-2 font-mono text-[0.65rem] leading-6 text-foreground/85">
                {settings.npmSqlitePath}
              </div>
              <p className="mt-2 font-mono text-[0.62rem] leading-6 text-muted/70">
                Only change these if your local mount layout differs from the default install.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
