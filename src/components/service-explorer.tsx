"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

import type {
  ExplorerBadge,
  ExplorerChainCard,
  ExplorerRiskCheck,
  ExplorerService,
  ServiceExplorerModel,
  SparklinePoint,
} from "@/lib/service-explorer";
import {
  compactFindingHeadline,
  compactFindingNextCheck,
  compactFindingTypeLabel,
} from "@/lib/finding-copy";
import type { Finding, FindingSeverity } from "@/lib/routeviz-types";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

interface ServiceSection {
  id: string;
  label: string;
  description: string;
  services: ExplorerService[];
}

export default function ServiceExplorer({
  model,
  pageLinks,
}: {
  model: ServiceExplorerModel;
  pageLinks?: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [mobileInventoryOpen, setMobileInventoryOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const visibleServices =
    normalizedQuery === ""
      ? model.services
      : model.services.filter((service) =>
          [service.label, service.secondaryLabel]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        );
  const serviceSections = buildServiceSections(visibleServices, normalizedQuery);
  const activeService =
    visibleServices.find((service) => service.id === model.activeService?.id) ??
    model.activeService;

  useEffect(() => {
    if (!activeService) return;
    setMobileInventoryOpen(false);
    if (window.location.hash !== "#service-detail") return;
    requestAnimationFrame(() => {
      document
        .getElementById("service-detail")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeService?.id]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="grid min-h-dvh grid-rows-[auto_1fr]">
        {/* ── Header ── */}
        <header className="border-b border-border bg-panel/98 backdrop-blur sticky top-0 z-50">
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
              <Link href="/overview" className="flex items-center gap-2 select-none">
                <span className="font-mono text-accent text-lg font-bold tracking-widest"
                  style={{ textShadow: "0 0 12px rgba(57,255,122,0.6)" }}>
                  ROUTEVIZ
                </span>
                <span className="blink font-mono text-accent text-lg leading-none">▋</span>
              </Link>

              {pageLinks?.length ? (
                <nav className="flex gap-1 overflow-x-auto whitespace-nowrap pb-1 lg:pb-0">
                  {pageLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "font-mono text-xs px-3 py-1.5 transition border",
                        item.href === pathname
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-transparent text-muted hover:border-border hover:text-foreground/80",
                      )}
                    >
                      {item.href === pathname
                        ? <span className="text-accent/60 mr-1">&gt;</span>
                        : <span className="text-muted/40 mr-1">_</span>}
                      {item.label.toLowerCase()}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-xs border border-border/60 bg-panel-2 px-3 py-1.5 text-muted/80">
                <span className="text-accent/50 mr-1">✓</span>sync {model.lastSyncLabel}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-5 sm:px-6 lg:px-7">
          <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
            {/* ── Sidebar ── */}
            <aside className="hidden border border-border bg-panel/95 shadow-[0_0_30px_rgba(57,255,122,0.04)] xl:block xl:h-[calc(100dvh-10rem)] xl:overflow-hidden xl:sticky xl:top-[4.5rem]">
              <ServiceRail
                sections={serviceSections}
                activeServiceId={activeService?.id ?? null}
                query={query}
                onQueryChange={setQuery}
                visibleCount={visibleServices.length}
              />
            </aside>

            {/* ── Detail panel ── */}
            <section className="min-h-0">
              {/* Mobile inventory toggle */}
              <div className="mb-5 xl:hidden">
                <div className="border border-border bg-panel/95">
                  <button
                    type="button"
                    onClick={() => setMobileInventoryOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left sm:px-5"
                  >
                    <div>
                      <div className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted/70">
                        <span className="text-accent/50 mr-1">▸</span>
                        SERVICE_MAP
                      </div>
                      <div className="mt-1.5 font-mono text-sm font-bold tracking-tight">
                        Exposure inventory
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted/70">
                        Search routes and switch the service view.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-xs border border-border/60 bg-panel-2 px-2.5 py-1 text-muted/70 tabular-nums">
                        {visibleServices.length}
                      </span>
                      <span className="font-mono text-base text-muted">
                        {mobileInventoryOpen ? "−" : "+"}
                      </span>
                    </div>
                  </button>

                  {mobileInventoryOpen ? (
                    <div className="border-t border-border/60">
                      <ServiceRail
                        sections={serviceSections}
                        activeServiceId={activeService?.id ?? null}
                        query={query}
                        onQueryChange={setQuery}
                        visibleCount={visibleServices.length}
                        mobile
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {activeService ? (
                <ServiceDetail service={activeService} />
              ) : (
                <div className="border border-border bg-panel px-5 py-5 font-mono text-xs text-muted/70">
                  <span className="text-accent/40 mr-1">$</span>
                  No services available in current snapshot.
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function ServiceRail({
  sections,
  activeServiceId,
  query,
  onQueryChange,
  visibleCount,
  mobile = false,
}: {
  sections: ServiceSection[];
  activeServiceId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  visibleCount: number;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Rail header */}
      <div className="border-b border-border/60 px-4 py-3 sm:px-4">
        <div className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-muted/70">
          <span className="text-accent/50 mr-1">▸</span>
          SERVICE_MAP
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-mono text-sm font-bold tracking-tight">
              Exposure inventory
            </h2>
            <p className="mt-0.5 font-mono text-[0.62rem] text-muted/70">
              {visibleCount} service{visibleCount === 1 ? "" : "s"} in snapshot
            </p>
          </div>
        </div>
        {/* Search input */}
        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-accent/50">
            $
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search services..."
            className="h-9 w-full border border-border/70 bg-panel-2 pl-7 pr-4 font-mono text-xs text-foreground outline-none transition placeholder:text-muted/40 focus:border-accent/50 focus:shadow-[0_0_8px_rgba(57,255,122,0.12)]"
          />
        </label>
      </div>

      {/* Rail items */}
      <div
        className={cn(
          "min-h-0 space-y-4 px-3 py-3",
          mobile ? "overflow-visible" : "overflow-y-auto",
        )}
      >
        {sections.map((section) => (
          <ServiceSectionBlock
            key={section.id}
            section={section}
            activeServiceId={activeServiceId}
          />
        ))}

        {visibleCount === 0 ? (
          <div className="border border-dashed border-border/50 px-4 py-4 font-mono text-xs text-muted/70">
            <span className="text-accent/40 mr-1">$</span>
            No services match current search.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ServiceSectionBlock({
  section,
  activeServiceId,
}: {
  section: ServiceSection;
  activeServiceId: string | null;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-muted/60">
            <span className="text-accent/40 mr-1">{"//"}</span>
            {section.label}
          </div>
        </div>
        <span className="font-mono text-[0.6rem] border border-border/50 bg-panel-2 px-2 py-0.5 text-muted/60 tabular-nums">
          {section.services.length}
        </span>
      </div>

      <div className="space-y-1">
        {section.services.map((service) => (
          <ServiceRailItem
            key={service.id}
            service={service}
            active={service.id === activeServiceId}
          />
        ))}
      </div>
    </section>
  );
}

function ServiceRailItem({
  service,
  active,
}: {
  service: ExplorerService;
  active: boolean;
}) {
  const topFinding = getTopFinding(service.findings);
  const metaLabel = topFinding
    ? `${severityLabel(topFinding.severity)} · ${service.findings.length}`
    : service.summary;

  return (
    <Link
      href={toDetailHref(service.href)}
      className={cn(
        "group block border px-3 py-2.5 transition",
        active
          ? "border-accent/45 bg-panel-2 shadow-[inset_3px_0_0_0_var(--color-accent)]"
          : "border-border/50 bg-panel/60 hover:border-accent/25 hover:bg-panel-2/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0",
                service.status === "online"
                  ? "bg-success"
                  : service.status === "warning"
                    ? "bg-warning"
                    : "bg-danger",
              )}
              style={
                service.status === "online"
                  ? { boxShadow: "0 0 5px rgba(57,255,122,0.5)" }
                  : service.status === "warning"
                    ? { boxShadow: "0 0 5px rgba(255,184,0,0.5)" }
                    : { boxShadow: "0 0 5px rgba(255,59,59,0.5)" }
              }
            />
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold tracking-tight truncate">
                {service.label}
              </div>
              <div className="mt-0.5 font-mono text-[0.6rem] text-muted/70 truncate">
                {service.secondaryLabel}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {topFinding ? (
                  <FindingToneBadge
                    label={compactFindingTypeLabel(topFinding.type)}
                    severity={topFinding.severity}
                    compact
                  />
                ) : null}
                <span className="font-mono text-[0.58rem] text-muted/60">{metaLabel}</span>
              </div>
            </div>
          </div>
        </div>
        <Badge
          label={service.kind}
          tone={service.kind === "public" ? "info" : "muted"}
          compact
        />
      </div>
    </Link>
  );
}

function buildServiceSections(
  services: ExplorerService[],
  query: string,
): ServiceSection[] {
  if (query) {
    return [
      {
        id: "results",
        label: "Search Results",
        description: "Filtered from the current snapshot.",
        services,
      },
    ];
  }

  const attention = services.filter(
    (service) =>
      service.findings.length > 0 ||
      service.status !== "online" ||
      service.warningCount >= 3,
  );
  const attentionIds = new Set(attention.map((service) => service.id));
  const publicExposure = services.filter(
    (service) => service.kind === "public" && !attentionIds.has(service.id),
  );
  const internalOnly = services.filter((service) => service.kind === "internal");

  return [
    {
      id: "attention",
      label: "Needs Attention",
      description: "Routes with findings, warnings, or degraded state.",
      services: attention,
    },
    {
      id: "public",
      label: "Public Exposure",
      description: "Healthy routes currently exposed through the edge.",
      services: publicExposure,
    },
    {
      id: "internal",
      label: "Internal Only",
      description: "Services publishing locally without an internet edge.",
      services: internalOnly,
    },
  ].filter((section) => section.services.length > 0);
}

function ServiceDetail({ service }: { service: ExplorerService }) {
  const visibleImpactItems = service.impactItems.slice(0, 6);
  const hiddenImpactCount = service.impactItems.length - visibleImpactItems.length;

  return (
    <div id="service-detail" className="space-y-5">
      {/* ── Service title block ── */}
      <section className="border border-border bg-panel px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-mono text-[1.6rem] font-bold tracking-tight text-balance sm:text-[2rem] lg:text-[2.4rem]"
              style={{ textShadow: "0 0 24px rgba(57,255,122,0.18)" }}>
              {service.label}
            </h1>
            {service.titleLinkHref ? (
              <a
                href={service.titleLinkHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all font-mono text-sm text-accent transition hover:text-accent/75"
                style={{ textShadow: "0 0 8px rgba(57,255,122,0.35)" }}
              >
                {service.titleLinkLabel}
              </a>
            ) : (
              <div className="mt-3 break-all font-mono text-sm text-accent"
                style={{ textShadow: "0 0 8px rgba(57,255,122,0.35)" }}>
                {service.titleLinkLabel}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {service.badges.map((badge) => (
              <Badge key={`${badge.label}-${badge.tone}`} {...badge} />
            ))}
          </div>
        </div>

        <div className="mt-4 border border-border/60 bg-panel-2 px-4 py-2.5 font-mono text-xs text-muted/80">
          <span className="text-accent/40 mr-1">$</span>
          {service.summary}
        </div>

        {service.availabilitySparkline.length > 0 && (
          <div className="mt-3">
            <AvailabilitySparkline points={service.availabilitySparkline} />
          </div>
        )}
      </section>

      {/* ── Findings ── */}
      {service.findings.length > 0 ? (
        <section>
          <DetailCard title="CURRENT_FINDINGS">
            <div className="border border-border/50 divide-y divide-border/40">
              {service.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="px-4 py-3 hover:bg-panel-2/40 transition"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold tracking-tight">
                        {compactFindingHeadline(finding.type)}
                      </div>
                      <div className="mt-0.5 font-mono text-[0.65rem] text-muted/70 line-clamp-1">
                        {finding.evidence}
                      </div>
                    </div>
                    <FindingToneBadge
                      label={compactFindingTypeLabel(finding.type)}
                      severity={finding.severity}
                    />
                  </div>
                  <p className="mt-2 font-mono text-xs leading-6 text-foreground/80">
                    {compactFindingNextCheck(finding.type)}
                  </p>
                </div>
              ))}
            </div>
          </DetailCard>
        </section>
      ) : null}

      {/* ── Exposure chain ── */}
      <section>
        <SectionLabel>EXPOSURE_CHAIN</SectionLabel>

        {service.introLabel ? (
          <div className="mt-3 flex items-center gap-2 font-mono text-sm text-muted/80">
            <span className="text-accent/50">◎</span>
            <span>{service.introLabel}</span>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {service.chainCards.map((card, index) => (
            <ChainRow
              key={card.id}
              card={card}
              isLast={index === service.chainCards.length - 1}
            />
          ))}
        </div>
      </section>

      {/* ── Risk + Impact + Notes ── */}
      <section className="grid gap-4">
        <DetailCard title="RISK_CHECKS">
          <div className="space-y-2">
            {service.riskChecks.map((item) => (
              <RiskCheckRow key={item.label} item={item} />
            ))}
          </div>
        </DetailCard>

        <DetailCard title="CHANGE_IMPACT">
          <div className="space-y-2 font-mono text-xs leading-7 text-foreground/85">
            <p className="text-muted/70">{service.impactHeading}</p>
            <ul className="space-y-1 pl-5 list-none">
              {visibleImpactItems.map((item) => (
                <li key={item} className="before:content-['>'] before:mr-2 before:text-accent/40">
                  {item}
                </li>
              ))}
            </ul>
            {hiddenImpactCount > 0 ? (
              <p className="text-muted/70">
                +{hiddenImpactCount} more service
                {hiddenImpactCount === 1 ? "" : "s"} on this host in current snapshot.
              </p>
            ) : null}
          </div>
        </DetailCard>

        <DetailCard title="NOTES">
          <div className="space-y-2 font-mono text-xs leading-7 text-muted/70">
            {service.notes.map((note) => (
              <p key={note}>
                <span className="text-accent/30 mr-1">#</span>
                {note}
              </p>
            ))}
          </div>
        </DetailCard>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted/70">
      <span className="text-accent/40 mr-1">▸</span>
      {children}
    </div>
  );
}

function ChainRow({
  card,
  isLast,
}: {
  card: ExplorerChainCard;
  isLast: boolean;
}) {
  const isBareMetalCard = card.id === "bare-metal";

  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)] sm:gap-4">
      {/* ── Connector column ── */}
      <div className="flex flex-col items-center">
        {/* top dot */}
        <div
          className="mt-2 h-3 w-3 shrink-0 border-2 border-accent/70 bg-accent/25"
          style={{ boxShadow: "0 0 6px rgba(57,255,122,0.45)" }}
        />
        {/* dashed line to next row */}
        {!isLast ? (
          <div
            className="mt-1 flex-1 w-px"
            style={{
              background: "repeating-linear-gradient(to bottom, rgba(57,255,122,0.5) 0px, rgba(57,255,122,0.5) 4px, transparent 4px, transparent 8px)",
              minHeight: "1.5rem",
            }}
          />
        ) : null}
      </div>

      {/* ── Card column ── */}
      <div
        className={cn(
          "mb-2 border px-3 py-3 sm:px-4",
          isBareMetalCard
            ? "border-warning/30 bg-warning/5"
            : "border-border/60 bg-panel",
        )}
      >
        <div className={cn(
          "font-mono text-[0.62rem] uppercase tracking-wider",
          isBareMetalCard ? "text-warning/70" : "text-muted/60",
        )}>
          {card.title}
        </div>
        <div
          className={cn(
            "mt-2 space-y-1.5 break-words text-xs leading-6 text-foreground/90",
            card.mono && "font-mono text-[0.72rem] leading-5",
          )}
        >
          {card.lines.map((line) => (
            <div key={line} className={card.mono ? "break-all" : "break-words"}>
              {card.mono ? (
                <span className={cn("mr-1", isBareMetalCard ? "text-warning/40" : "text-accent/30")}>$</span>
              ) : null}
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-panel px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-border/50">
        <span className="font-mono text-accent/40 text-xs">▸</span>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted/70">{title}</span>
        <div className="flex-1 border-t border-border/40" />
      </div>
      {children}
    </section>
  );
}

function RiskCheckRow({ item }: { item: ExplorerRiskCheck }) {
  return (
    <div className="flex items-start gap-2 font-mono text-xs leading-6">
      <span
        className={cn(
          "mt-0.5 shrink-0 font-bold",
          item.state === "ok"
            ? "text-success"
            : item.state === "danger"
              ? "text-danger"
              : "text-warning",
        )}
        style={
          item.state === "ok"
            ? { textShadow: "0 0 5px rgba(57,255,122,0.5)" }
            : item.state === "danger"
              ? { textShadow: "0 0 5px rgba(255,59,59,0.5)" }
              : { textShadow: "0 0 5px rgba(255,184,0,0.5)" }
        }
      >
        {item.state === "ok" ? "✓" : "!"}
      </span>
      <span className="text-foreground/85">{item.label}</span>
    </div>
  );
}

function FindingToneBadge({
  label,
  severity,
  compact = false,
}: {
  label: string;
  severity: FindingSeverity;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex border font-mono uppercase tracking-wider leading-none",
        compact ? "px-2 py-0.5 text-[0.58rem]" : "px-2.5 py-1 text-[0.65rem]",
        severity === "high" && "border-danger/40 bg-danger/10 text-danger",
        severity === "medium" && "border-warning/40 bg-warning/10 text-warning",
        severity === "low" && "border-accent/30 bg-accent/10 text-accent",
      )}
    >
      {label}
    </span>
  );
}

function Badge({
  label,
  tone,
  compact = false,
}: ExplorerBadge & { tone: ExplorerBadge["tone"]; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex border font-mono uppercase tracking-wider leading-none",
        compact ? "px-2 py-0.5 text-[0.58rem]" : "px-2.5 py-1 text-[0.65rem]",
        tone === "info" && "border-accent/35 bg-accent/10 text-accent",
        tone === "success" && "border-success/35 bg-success/10 text-success",
        tone === "warning" && "border-warning/35 bg-warning/10 text-warning",
        tone === "danger" && "border-danger/35 bg-danger/10 text-danger",
        tone === "muted" && "border-border/60 bg-panel-2 text-muted/70",
      )}
    >
      {label}
    </span>
  );
}

function severityRank(value: FindingSeverity) {
  if (value === "high") {
    return 0;
  }

  if (value === "medium") {
    return 1;
  }

  return 2;
}

function severityLabel(value: FindingSeverity) {
  if (value === "high") {
    return "High";
  }

  if (value === "medium") {
    return "Medium";
  }

  return "Low";
}

function getTopFinding(findings: Finding[]) {
  return [...findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity))[0];
}

function toDetailHref(href: string) {
  return href.includes("#service-detail") ? href : `${href}#service-detail`;
}

function sparklineColor(state: string) {
  if (state === "matched" || state === "direct") return "bg-accent";
  if (state === "ambiguous" || state === "off_host") return "bg-warning";
  return "bg-danger";
}

function sparklineLabel(state: string) {
  if (state === "matched") return "matched";
  if (state === "direct") return "direct (bare-metal)";
  if (state === "ambiguous") return "ambiguous";
  if (state === "off_host") return "off-host target";
  if (state === "unmatched") return "unmatched";
  return state;
}

function AvailabilitySparkline({ points }: { points: SparklinePoint[] }) {
  // Show last 48 points max, display as thin bars
  const visible = points.slice(-48);
  const matchedCount = visible.filter((p) => p.state === "matched" || p.state === "direct").length;
  const pct = Math.round((matchedCount / visible.length) * 100);

  return (
    <div className="border border-border/40 bg-panel-2 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-muted/50">
          AVAILABILITY · LAST {visible.length} SCANS
        </span>
        <span className={`font-mono text-[0.65rem] tabular-nums ${pct === 100 ? "text-accent" : pct >= 80 ? "text-warning" : "text-danger"}`}>
          {pct}% UP
        </span>
      </div>
      <div className="flex items-end gap-px h-5">
        {visible.map((point, i) => (
          <div
            key={i}
            title={`${point.generatedAt.slice(0, 16).replace("T", " ")} — ${sparklineLabel(point.state)}`}
            className={`flex-1 min-w-0 rounded-sm transition-opacity ${sparklineColor(point.state)} ${i === visible.length - 1 ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
            style={{ height: point.state === "matched" || point.state === "direct" ? "100%" : "40%" }}
          />
        ))}
      </div>
    </div>
  );
}
