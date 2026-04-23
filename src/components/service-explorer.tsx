"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import type {
  ExplorerBadge,
  ExplorerChainCard,
  ExplorerRiskCheck,
  ExplorerService,
  ServiceExplorerModel,
} from "@/lib/service-explorer";
import {
  compactFindingHeadline,
  compactFindingNextCheck,
  compactFindingTypeLabel,
} from "@/lib/finding-copy";
import type { Finding, FindingSeverity } from "@/lib/ops-ledger-types";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

interface ServiceSection {
  id: string;
  label: string;
  description: string;
  services: ExplorerService[];
}

interface PriorityFinding {
  id: string;
  serviceLabel: string;
  secondaryLabel: string;
  severity: FindingSeverity;
  type: string;
  title: string;
  evidence: string;
  nextCheck: string;
  href: string;
}

interface OverviewStatus {
  criticalCount: number;
  expiredCertificateCount: number;
  unmatchedTargetCount: number;
  managementSurfaceCount: number;
}

export function ServiceExplorer({
  model,
  pageLinks,
}: {
  model: ServiceExplorerModel;
  pageLinks?: Array<{ href: string; label: string }>;
}) {
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
  const priorityFindings = buildPriorityFindings(visibleServices);
  const overviewStatus = buildOverviewStatus(visibleServices);
  const activeService =
    visibleServices.find((service) => service.id === model.activeService?.id) ??
    model.activeService;

  useEffect(() => {
    if (!activeService || window.location.hash !== "#service-detail") {
      return;
    }

    requestAnimationFrame(() => {
      document
        .getElementById("service-detail")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeService?.id]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="grid min-h-dvh grid-rows-[auto_1fr]">
        <header className="border-b border-border bg-panel/96 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
              <div className="text-[1.95rem] font-semibold tracking-[-0.04em]">
                Ops Ledger
              </div>

              {pageLinks?.length ? (
                <nav className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 lg:pb-0">
                  {pageLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-full px-3 py-2 text-sm transition",
                        item.href === "/"
                          ? "bg-[#121922] text-foreground shadow-[inset_0_0_0_1px_rgba(66,153,225,0.24)]"
                          : "text-muted hover:bg-[#121922] hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>

            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="inline-flex rounded-full border border-border/80 bg-[#121922] px-3 py-2 text-muted">
                Last sync {model.lastSyncLabel}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-6 lg:px-7">
          <div className="space-y-6">
            {priorityFindings.length > 0 ? (
              <PriorityBoard findings={priorityFindings} status={overviewStatus} />
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
              <aside className="hidden rounded-[1rem] border border-border bg-panel/92 shadow-[0_18px_48px_rgba(0,0,0,0.2)] xl:block xl:h-[calc(100dvh-11rem)] xl:overflow-hidden xl:sticky xl:top-6">
                <ServiceRail
                  sections={serviceSections}
                  activeServiceId={activeService?.id ?? null}
                  query={query}
                  onQueryChange={setQuery}
                  visibleCount={visibleServices.length}
                />
              </aside>

              <section className="min-h-0">
                {activeService ? (
                  <ServiceDetail service={activeService} />
                ) : (
                  <div className="rounded-[0.95rem] border border-border bg-panel px-5 py-5 text-sm text-muted">
                    No services are available in the current snapshot yet.
                  </div>
                )}

                <div className="mt-6 xl:hidden">
                  <div className="rounded-[1rem] border border-border bg-panel/92 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
                    <button
                      type="button"
                      onClick={() => setMobileInventoryOpen((value) => !value)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
                    >
                      <div>
                        <div className="font-mono text-[0.76rem] uppercase tracking-[0.2em] text-muted">
                          Browse Services
                        </div>
                        <div className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                          Exposure inventory
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          Search every route and switch the current service view.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="rounded-full border border-border/80 bg-[#111820] px-3 py-1.5 text-sm text-muted">
                          {visibleServices.length}
                        </span>
                        <span className="text-lg text-muted">
                          {mobileInventoryOpen ? "−" : "+"}
                        </span>
                      </div>
                    </button>

                    {mobileInventoryOpen ? (
                      <div className="border-t border-border/80">
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
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PriorityBoard({
  findings,
  status,
}: {
  findings: PriorityFinding[];
  status: OverviewStatus;
}) {
  const statTiles = [
    {
      label: "Critical",
      value: String(status.criticalCount),
      note: "needs action",
      tone: status.criticalCount > 0 ? "danger" : "muted",
    },
    {
      label: "Expired certs",
      value: String(status.expiredCertificateCount),
      note: "renew now",
      tone: status.expiredCertificateCount > 0 ? "danger" : "muted",
    },
    {
      label: "Broken routes",
      value: String(status.unmatchedTargetCount),
      note: "no live target",
      tone: status.unmatchedTargetCount > 0 ? "warning" : "muted",
    },
    {
      label: "Mgmt surfaces",
      value: String(status.managementSurfaceCount),
      note: "public consoles",
      tone: status.managementSurfaceCount > 0 ? "warning" : "muted",
    },
  ] as const;

  return (
    <section className="rounded-[1rem] border border-border bg-panel px-5 py-5 shadow-[0_18px_44px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[0.78rem] uppercase tracking-[0.2em] text-muted">
            Overview
          </div>
          <h2 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.04em] sm:text-[1.5rem]">
            Exposure status
          </h2>
        </div>
        <Link
          href="/findings"
          className="inline-flex items-center rounded-full border border-border bg-panel-2 px-3 py-2 text-sm text-muted transition hover:border-accent/28 hover:text-foreground"
        >
          Open all findings
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statTiles.map((tile) => (
          <OverviewStatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="mt-5 rounded-[0.95rem] border border-border bg-panel-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="font-medium text-foreground">Priority queue</div>
          <div className="flex flex-wrap gap-2">
            <FindingToneBadge
              label={`${status.criticalCount} critical`}
              severity="high"
              compact
            />
            <FindingToneBadge
              label={`${findings.length} shown`}
              severity="medium"
              compact
            />
          </div>
        </div>
        <div className="divide-y divide-border/80">
          {findings.map((finding) => (
            <Link
              key={finding.id}
              href={toDetailHref(finding.href)}
              className="flex flex-col gap-3 px-4 py-4 transition hover:bg-[#1a212a] lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {finding.serviceLabel}
                  </div>
                  <FindingToneBadge
                    label={compactFindingTypeLabel(finding.type)}
                    severity={finding.severity}
                    compact
                  />
                </div>
                <div className="mt-1 truncate text-xs text-muted">
                  {finding.secondaryLabel}
                </div>
                <div className="mt-2 max-w-3xl text-sm text-foreground/92">
                  {compactFindingHeadline(finding.type)}
                </div>
                <div className="mt-1 line-clamp-1 text-sm text-muted">
                  {finding.evidence}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <FindingToneBadge
                  label={severityLabel(finding.severity)}
                  severity={finding.severity}
                  compact
                />
                <span className="text-sm text-accent">Open</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewStatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "danger" | "warning" | "muted";
}) {
  return (
    <div className="rounded-[0.95rem] border border-border bg-panel-2 px-4 py-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[0.75rem] text-sm font-semibold sm:h-11 sm:w-11",
            tone === "danger" && "bg-danger/16 text-danger",
            tone === "warning" && "bg-warning/16 text-warning",
            tone === "muted" && "bg-[#1a2129] text-[#95a2b3]",
          )}
        >
          {value}
        </span>
        <div>
          <div className="text-[0.98rem] font-medium text-foreground sm:text-base">
            {label}
          </div>
          <div className="mt-1 hidden text-sm text-muted sm:block">{note}</div>
        </div>
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
      <div className="border-b border-border/80 px-4 py-4 sm:px-5">
        <div className="font-mono text-[0.76rem] uppercase tracking-[0.2em] text-muted">
          Service Map
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em]">
              Exposure inventory
            </h2>
            <p className="mt-1 text-sm text-muted">
              {visibleCount} service{visibleCount === 1 ? "" : "s"} in the current
              snapshot
            </p>
          </div>
        </div>
        <label className="relative mt-4 block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search services..."
            className="h-11 w-full rounded-[0.8rem] border border-border bg-[#0f1418] pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/60"
          />
        </label>
      </div>

      <div
        className={cn(
          "min-h-0 space-y-5 px-3 py-3 sm:px-4",
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
          <div className="rounded-[0.85rem] border border-dashed border-border px-4 py-5 text-sm text-muted">
            No services match the current search.
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
          <div className="font-mono text-[0.72rem] uppercase tracking-[0.18em] text-muted">
            {section.label}
          </div>
          <div className="mt-1 text-xs text-muted">{section.description}</div>
        </div>
        <span className="rounded-full border border-border/80 bg-[#111820] px-2.5 py-1 text-xs text-muted">
          {section.services.length}
        </span>
      </div>

      <div className="space-y-2">
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
        "group block rounded-[0.9rem] border border-border/80 px-4 py-3.5 transition",
        active
          ? "border-accent/30 bg-[#10171d] shadow-[inset_2px_0_0_0_var(--color-accent)]"
          : "bg-[#171d24] hover:bg-[#141b22]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                service.status === "online"
                  ? "bg-success"
                  : service.status === "warning"
                    ? "bg-warning"
                    : "bg-danger",
              )}
            />
            <div className="min-w-0">
              <div className="truncate text-[1rem] font-medium tracking-[-0.02em]">
                {service.label}
              </div>
              <div className="mt-1 truncate text-sm text-muted">
                {service.secondaryLabel}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {topFinding ? (
                  <FindingToneBadge
                    label={compactFindingTypeLabel(topFinding.type)}
                    severity={topFinding.severity}
                    compact
                  />
                ) : null}
                <span className="text-xs text-muted">{metaLabel}</span>
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

function buildPriorityFindings(services: ExplorerService[]): PriorityFinding[] {
  const ranked = services.flatMap((service) =>
    service.findings.map((finding) => ({
      id: finding.id,
      serviceLabel: service.label,
      secondaryLabel: service.secondaryLabel,
      severity: finding.severity,
      type: finding.type,
      title: finding.title,
      evidence: finding.evidence,
      nextCheck: finding.nextCheck,
      href: service.href,
      routeSlug: finding.routeSlug,
    })),
  );

  ranked.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));

  const seenRoutes = new Set<string>();
  const result: PriorityFinding[] = [];

  for (const finding of ranked) {
    if (seenRoutes.has(finding.routeSlug)) {
      continue;
    }

    seenRoutes.add(finding.routeSlug);
    result.push(finding);

    if (result.length === 4) {
      break;
    }
  }

  return result;
}

function ServiceDetail({ service }: { service: ExplorerService }) {
  const visibleImpactItems = service.impactItems.slice(0, 6);
  const hiddenImpactCount = service.impactItems.length - visibleImpactItems.length;

  return (
    <div id="service-detail" className="space-y-6 lg:space-y-7">
      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-balance sm:text-[2.4rem] lg:text-[3rem]">
              {service.label}
            </h1>
            {service.titleLinkHref ? (
              <a
                href={service.titleLinkHref}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block break-all font-mono text-[0.9rem] text-accent transition hover:text-accent/80 sm:text-[1rem]"
              >
                {service.titleLinkLabel}
              </a>
            ) : (
              <div className="mt-4 break-all font-mono text-[0.9rem] text-accent sm:text-[1rem]">
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

        <div className="mt-5 rounded-[0.85rem] border border-border bg-panel px-4 py-3 text-sm text-muted">
          {service.summary}
        </div>
      </section>

      {service.findings.length > 0 ? (
        <section>
          <DetailCard title="Current Findings">
            <div className="space-y-3">
              {service.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-[0.8rem] border border-border bg-panel-2 px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold tracking-[-0.02em]">
                        {compactFindingHeadline(finding.type)}
                      </div>
                      <div className="mt-1 line-clamp-1 text-sm text-muted">
                        {finding.evidence}
                      </div>
                    </div>
                    <FindingToneBadge
                      label={compactFindingTypeLabel(finding.type)}
                      severity={finding.severity}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground/92">
                    {compactFindingNextCheck(finding.type)}
                  </p>
                </div>
              ))}
            </div>
          </DetailCard>
        </section>
      ) : null}

      <section>
        <SectionLabel>Exposure Chain</SectionLabel>

        {service.introLabel ? (
          <div className="mt-4 flex items-center gap-3 text-base text-muted">
            <span className="text-lg leading-none">◎</span>
            <span>{service.introLabel}</span>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {service.chainCards.map((card, index) => (
            <ChainRow
              key={card.id}
              card={card}
              isLast={index === service.chainCards.length - 1}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5">
        <DetailCard title="Risk Checks">
          <div className="space-y-3">
            {service.riskChecks.map((item) => (
              <RiskCheckRow key={item.label} item={item} />
            ))}
          </div>
        </DetailCard>

        <DetailCard title="Change Impact">
          <div className="space-y-3 text-sm leading-7 text-foreground/92">
            <p className="text-muted">{service.impactHeading}</p>
            <ul className="space-y-1 pl-5 text-foreground/92">
              {visibleImpactItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {hiddenImpactCount > 0 ? (
              <p className="text-muted">
                +{hiddenImpactCount} more service
                {hiddenImpactCount === 1 ? "" : "s"} on this host in the current
                snapshot.
              </p>
            ) : null}
          </div>
        </DetailCard>

        <DetailCard title="Notes">
          <div className="space-y-3 text-sm leading-7 text-muted">
            {service.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </DetailCard>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-muted">
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
  return (
    <div className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2 sm:grid-cols-[1.05rem_minmax(0,1fr)] sm:gap-4">
      <div className="flex flex-col items-center pt-2">
        <span className="h-2 w-2 rounded-full bg-[#455161]" />
        {!isLast ? (
          <>
            <span className="my-1 h-8 border-l border-dashed border-[#4b5766]" />
            <span className="h-2 w-2 rounded-full bg-[#455161]" />
          </>
        ) : null}
      </div>
      <div className="rounded-[0.8rem] border border-border bg-panel px-3 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)] sm:px-4">
        <div className="text-sm text-muted">{card.title}</div>
        <div
          className={cn(
            "mt-3 space-y-2 break-words text-[0.92rem] leading-7 text-foreground/94 sm:text-[1rem]",
            card.mono && "font-mono text-[0.84rem] leading-6 sm:text-[0.96rem]",
          )}
        >
          {card.lines.map((line) => (
            <div key={line} className={card.mono ? "break-all" : "break-words"}>
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
    <section className="rounded-[0.85rem] border border-border bg-panel px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.14)] sm:px-5">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RiskCheckRow({ item }: { item: ExplorerRiskCheck }) {
  return (
    <div className="flex items-start gap-3 text-sm leading-6 sm:leading-7">
      <span
        className={cn(
          "mt-0.5 block h-5 w-5 text-center text-base leading-5",
          item.state === "ok"
            ? "text-success"
            : item.state === "danger"
              ? "text-danger"
              : "text-warning",
        )}
      >
        {item.state === "ok" ? "✓" : "!"}
      </span>
      <span className="text-foreground/94">{item.label}</span>
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
        "inline-flex rounded-[0.45rem] border leading-none",
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        severity === "high" && "border-danger/25 bg-danger/14 text-danger",
        severity === "medium" && "border-warning/25 bg-warning/14 text-warning",
        severity === "low" && "border-accent/25 bg-accent/16 text-accent",
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
        "inline-flex rounded-[0.45rem] border leading-none",
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        tone === "info" && "border-accent/25 bg-accent/16 text-accent",
        tone === "success" && "border-success/25 bg-success/14 text-success",
        tone === "warning" && "border-warning/25 bg-warning/14 text-warning",
        tone === "danger" && "border-danger/25 bg-danger/14 text-danger",
        tone === "muted" && "border-border bg-[#202731] text-[#c5ced8]",
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

function buildOverviewStatus(services: ExplorerService[]): OverviewStatus {
  const findings = services.flatMap((service) => service.findings);

  return {
    criticalCount: findings.filter((finding) => finding.severity === "high").length,
    expiredCertificateCount: findings.filter(
      (finding) => finding.type === "certificate_expired",
    ).length,
    unmatchedTargetCount: findings.filter(
      (finding) => finding.type === "unmatched_target",
    ).length,
    managementSurfaceCount: findings.filter((finding) =>
      ["management_surface", "docker_socket_write_mount"].includes(finding.type),
    ).length,
  };
}
