"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { Connector, PersistedSettings } from "@/lib/ops-ledger-types";

import { Badge } from "./ops-ledger-ui";

type BaselineMode = PersistedSettings["dnsBaseline"]["mode"];

export function SetupConsole({
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

  const readiness = useMemo(() => {
    const hasBaseline =
      baselineMode === "disabled" || baselineValue.trim().length > 0;

    return hasBaseline;
  }, [baselineMode, baselineValue]);

  const scheduleText = intervalEnabled
    ? `Recurring snapshots run every ${intervalMinutes} minutes. Manual scans stay available at all times.`
    : "Recurring snapshots are disabled. Manual scans stay available at all times.";

  const baselineText =
    baselineMode === "disabled"
      ? "DNS baseline checks are disabled. Ops Ledger still records the answers it sees."
      : baselineMode === "reference_hostname"
        ? `Each route answer will be compared to ${baselineValue}.`
        : `Each route answer will be compared to the explicit endpoint ${baselineValue}.`;

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
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[0.9rem] border border-border bg-panel px-5 py-5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
              Local source setup
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              This host can already read Docker and NPM directly
            </h3>
          </div>
          <Badge
            label={readiness ? "Ready" : "Needs input"}
            tone={readiness ? "success" : "warning"}
          />
        </div>

        <div className="mt-6 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4">
              <div className="text-sm font-medium text-foreground">Docker socket</div>
              <p className="mt-2 break-all font-mono text-xs leading-6 text-muted">
                {settings.dockerSocketPath}
              </p>
            </div>
            <div className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4">
              <div className="text-sm font-medium text-foreground">
                NPM SQLite path
              </div>
              <p className="mt-2 break-all font-mono text-xs leading-6 text-muted">
                {settings.npmSqlitePath}
              </p>
            </div>
          </div>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium text-foreground">
              DNS baseline mode
            </legend>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  value: "reference_hostname",
                  label: "Reference hostname",
                },
                {
                  value: "manual_endpoint",
                  label: "Manual endpoint",
                },
                {
                  value: "disabled",
                  label: "Disabled",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[0.85rem] border border-border bg-panel-2 px-4"
                >
                  <input
                    type="radio"
                    name="baseline-mode"
                    value={option.value}
                    checked={baselineMode === option.value}
                    onChange={() => setBaselineMode(option.value as BaselineMode)}
                  />
                  <span className="text-sm text-foreground">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">
              Baseline value
            </span>
            <input
              disabled={baselineMode === "disabled"}
              className="min-h-11 rounded-[0.85rem] border border-border bg-panel-2 px-4 text-base outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:border-accent/40"
              value={baselineValue}
              onChange={(event) => setBaselineValue(event.target.value)}
              placeholder={
                baselineMode === "manual_endpoint"
                  ? "203.0.113.10"
                  : "edge.example.com"
              }
            />
          </label>

          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
            <label className="flex items-center gap-3 rounded-[0.85rem] border border-border bg-panel-2 px-4 py-3">
              <input
                type="checkbox"
                checked={intervalEnabled}
                onChange={(event) => setIntervalEnabled(event.target.checked)}
              />
              <span className="text-sm text-foreground">
                Enable recurring snapshots
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">
                Interval
              </span>
              <select
                className="min-h-11 rounded-[0.85rem] border border-border bg-panel-2 px-4 text-base outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:border-accent/40"
                value={intervalMinutes}
                disabled={!intervalEnabled}
                onChange={(event) => setIntervalMinutes(event.target.value)}
              >
                <option value="2">2 minutes</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!readiness || status === "saving"}
              onClick={handleSave}
              className="rounded-[0.45rem] border border-accent/25 bg-accent/14 px-4 py-2 text-sm text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "saving" ? "Saving..." : "Save setup"}
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

      <section className="rounded-[0.9rem] border border-border bg-panel px-5 py-5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
          Preview
        </p>
        <div className="mt-5 space-y-4">
          <div className="rounded-[0.85rem] border border-border bg-panel-2 p-4">
            <div className="text-sm font-medium text-foreground">Connector state</div>
            <div className="mt-3 space-y-2">
              {connectors.map((connector) => (
                <div
                  key={connector.id}
                  className="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <span className="text-foreground">{connector.label}</span>
                  <Badge
                    label={connector.status.replaceAll("_", " ")}
                    tone={connector.requiresAction ? "warning" : "success"}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[0.85rem] border border-border bg-panel-2 p-4">
            <div className="text-sm font-medium text-foreground">DNS baseline</div>
            <p className="mt-2 text-sm leading-7 text-muted">{baselineText}</p>
          </div>
          <div className="rounded-[0.85rem] border border-border bg-panel-2 p-4">
            <div className="text-sm font-medium text-foreground">Snapshot cadence</div>
            <p className="mt-2 text-sm leading-7 text-muted">{scheduleText}</p>
          </div>
          <div className="rounded-[0.85rem] border border-border bg-panel-2 p-4">
            <div className="text-sm font-medium text-foreground">
              Storage policy
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">
              Snapshots are appended locally and retained for later comparisons. The
              default retention window is {settings.scanConfig.retentionLimit} stored
              snapshots.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
