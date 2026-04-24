import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "./logout-button";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ConsolePage({
  title,
  description,
  eyebrow,
  lastSyncLabel,
  actions,
  titleSlot,
  compactIntro = false,
  hideIntro = false,
  children,
}: {
  title: string;
  description: string;
  eyebrow: string;
  lastSyncLabel?: string | null;
  actions?: ReactNode;
  titleSlot?: ReactNode;
  compactIntro?: boolean;
  hideIntro?: boolean;
  children: ReactNode;
}) {
  const navItems = [
    { href: "/", label: "overview", active: eyebrow === "Overview" },
    { href: "/setup", label: "setup", active: eyebrow === "Setup" },
    { href: "/routes", label: "routes", active: eyebrow === "Routes" },
    { href: "/findings", label: "findings", active: eyebrow === "Findings" },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-panel/98 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
            {/* Logo / brand */}
            <Link href="/" className="flex items-center gap-2 select-none">
              <span className="font-mono text-accent text-lg font-bold tracking-widest" style={{ textShadow: "0 0 12px rgba(57,255,122,0.6)" }}>
                ROUTEVIZ
              </span>
              <span className="blink font-mono text-accent text-lg leading-none">▋</span>
            </Link>

            {/* Nav */}
            <nav className="flex gap-1 overflow-x-auto whitespace-nowrap pb-1 lg:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "font-mono text-xs px-3 py-1.5 transition-all duration-150 border",
                    item.active
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-transparent text-muted hover:border-border hover:text-foreground/80",
                  )}
                >
                  {item.active ? <span className="text-accent/60 mr-1">&gt;</span> : <span className="text-muted/40 mr-1">_</span>}
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side: actions + sync time + logout */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted sm:justify-end">
            {actions}
            {lastSyncLabel ? (
              <span className="font-mono text-xs border border-border/60 bg-panel-2 px-3 py-1.5 text-muted/80">
                <span className="text-accent/50 mr-1">✓</span>sync {lastSyncLabel}
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-5 py-5 sm:px-6 lg:px-7">
        {hideIntro ? null : compactIntro ? (
          <section className="px-1 py-2">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-muted/70">
              <span className="text-accent/50 mr-1">##</span>{eyebrow.toLowerCase()}
            </div>
            <h1 className="mt-2 font-mono text-[1.4rem] font-bold tracking-tight text-foreground sm:text-[1.75rem]"
              style={{ textShadow: "0 0 20px rgba(57,255,122,0.15)" }}>
              {title}
            </h1>
            {titleSlot}
            <p className="mt-1.5 max-w-2xl font-mono text-xs leading-6 text-muted">{description}</p>
          </section>
        ) : (
          <section className="border border-border bg-panel px-5 py-5 shadow-[0_0_30px_rgba(57,255,122,0.04)]">
            {/* Top rule line */}
            <div className="mb-4 flex items-center gap-3">
              <span className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-muted/70">
                <span className="text-accent/50 mr-1">##</span>{eyebrow.toLowerCase()}
              </span>
              <div className="flex-1 border-t border-border/60" />
            </div>
            <h1 className="font-mono text-[1.8rem] font-bold tracking-tight text-foreground text-balance sm:text-[2.2rem] lg:text-[2.8rem]"
              style={{ textShadow: "0 0 24px rgba(57,255,122,0.18)" }}>
              {title}
            </h1>
            <p className="mt-3 max-w-3xl font-mono text-xs leading-7 text-muted">{description}</p>
          </section>
        )}

        {children}
      </main>
    </div>
  );
}

export function ConsoleCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-border bg-panel px-5 py-4 shadow-[0_0_24px_rgba(57,255,122,0.03)]">
      {/* Card header row */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/60">
        <span className="font-mono text-accent/50 text-xs">▸</span>
        <div>
          {eyebrow ? (
            <div className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-muted/70">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="font-mono text-sm font-bold text-foreground/90 tracking-tight">{title}</h2>
        </div>
        <div className="flex-1 border-t border-border/40" />
      </div>
      {children}
    </section>
  );
}
