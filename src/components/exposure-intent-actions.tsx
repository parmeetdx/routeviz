"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ExposureIntentMode } from "@/lib/routeviz-types";

type IntentOption = {
  mode: ExposureIntentMode;
  label: string;
  description: string;
};

const ALL_OPTIONS: IntentOption[] = [
  { mode: "public_ok",        label: "allow public",   description: "Intentionally public — no auth required" },
  { mode: "auth_required",    label: "require auth",   description: "Must have an auth layer" },
  { mode: "private_only",     label: "private only",   description: "Should never be publicly reachable" },
  { mode: "temporary_public", label: "allow 7 days",   description: "Temporary exception, re-review after 7d" },
];

const OPTIONS_BY_TYPE: Record<string, ExposureIntentMode[]> = {
  no_auth_layer:              ["public_ok", "auth_required", "temporary_public"],
  management_surface:         ["private_only", "auth_required"],
  docker_socket_write_mount:  ["private_only", "auth_required"],
};

const MODE_LABELS: Record<ExposureIntentMode, string> = {
  public_ok:        "public ok",
  auth_required:    "auth req",
  private_only:     "private",
  temporary_public: "7d allow",
};

export function ExposureIntentActions({
  routeSlug,
  findingType,
  activeMode,
}: {
  routeSlug: string;
  findingType: string;
  activeMode?: ExposureIntentMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ExposureIntentMode | null>(activeMode ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync when the server re-renders with updated props
  useEffect(() => {
    setCurrent(activeMode ?? null);
  }, [activeMode]);

  const visibleModes = OPTIONS_BY_TYPE[findingType];
  if (!visibleModes) return null;

  const options = ALL_OPTIONS.filter((o) => visibleModes.includes(o.mode));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function select(mode: ExposureIntentMode) {
    if (busy) return;

    // Toggle off if already active
    const isDeselect = current === mode;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/exposure-intents", {
        method: isDeselect ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeSlug, mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "request failed");
      }
      setCurrent(isDeselect ? null : mode);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setError(null); }}
        disabled={busy}
        aria-expanded={open}
        className={[
          "flex w-full items-center justify-between gap-1.5 border px-2.5 py-1.5 font-mono text-[0.56rem] uppercase tracking-wider transition whitespace-nowrap",
          current
            ? "border-success/35 bg-success/8 text-success/90 hover:border-success/55 hover:text-success"
            : "border-accent/25 bg-accent/5 text-accent/70 hover:border-accent/45 hover:text-accent",
          busy ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
      >
        {busy ? (
          <span className="opacity-60">···</span>
        ) : current ? (
          <>
            <span className="h-1 w-1 rounded-full bg-success/80 shrink-0" />
            <span>{MODE_LABELS[current]}</span>
            <span className="text-current/40">▾</span>
          </>
        ) : (
          <>
            <span>resolve</span>
            <span className="text-current/40">▾</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 border border-border/70 bg-background shadow-[0_10px_28px_rgba(0,0,0,0.55)]">
          <div className="border-b border-border/50 px-3 py-1.5">
            <span className="font-mono text-[0.52rem] uppercase tracking-[0.25em] text-muted/50">
              exposure intent
            </span>
          </div>
          <div className="p-1">
            {options.map((option) => {
              const active = current === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => select(option.mode)}
                  disabled={busy}
                  className={[
                    "flex w-full items-start gap-2.5 px-2.5 py-2 text-left transition",
                    active
                      ? "bg-success/8 hover:bg-success/12"
                      : "hover:bg-accent/8",
                    busy ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                >
                  {/* Radio dot */}
                  <span className={[
                    "mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border",
                    active ? "border-success/70 bg-success/20" : "border-muted/30 bg-transparent",
                  ].join(" ")}>
                    {active ? <span className="h-1.5 w-1.5 rounded-full bg-success" /> : null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className={[
                      "font-mono text-[0.6rem] uppercase tracking-wider",
                      active ? "text-success" : "text-foreground/80",
                    ].join(" ")}>
                      {option.label}
                      {active ? <span className="ml-1.5 text-muted/50 normal-case tracking-normal">tap to remove</span> : null}
                    </span>
                    <span className="font-mono text-[0.56rem] text-muted/55 normal-case tracking-normal">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {error ? (
            <div className="border-t border-border/50 px-3 py-1.5 font-mono text-[0.55rem] uppercase tracking-wider text-danger/80">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
