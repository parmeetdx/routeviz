import Link from "next/link";
import type { ReactNode } from "react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ConsolePage({
  title,
  description,
  eyebrow,
  lastSyncLabel,
  actions,
  compactIntro = false,
  hideIntro = false,
  children,
}: {
  title: string;
  description: string;
  eyebrow: string;
  lastSyncLabel?: string | null;
  actions?: ReactNode;
  compactIntro?: boolean;
  hideIntro?: boolean;
  children: ReactNode;
}) {
  const navItems = [
    { href: "/", label: "Overview", active: eyebrow === "Overview" },
    { href: "/setup", label: "Setup", active: eyebrow === "Setup" },
    { href: "/routes", label: "Routes", active: eyebrow === "Routes" },
    { href: "/findings", label: "Findings", active: eyebrow === "Findings" },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-panel/96 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-10">
            <Link href="/" className="text-[1.95rem] font-semibold tracking-[-0.04em]">
              Ops Ledger
            </Link>
            <nav className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 lg:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm transition",
                    item.active
                      ? "bg-[#121922] text-foreground shadow-[inset_0_0_0_1px_rgba(66,153,225,0.24)]"
                      : "text-muted hover:bg-[#121922] hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted sm:justify-end">
            {actions}
            {lastSyncLabel ? (
              <span className="inline-flex rounded-full border border-border/80 bg-[#121922] px-3 py-2 text-muted">
                Last sync {lastSyncLabel}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-6 sm:px-6 lg:px-7">
        {hideIntro ? null : compactIntro ? (
          <section className="px-1 py-1">
            <div className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-muted">
              {eyebrow}
            </div>
            <h1 className="mt-3 text-[1.65rem] font-semibold tracking-[-0.05em] sm:text-[2rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          </section>
        ) : (
          <section className="rounded-[0.95rem] border border-border bg-panel px-5 py-5 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
            <div className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-muted">
              {eyebrow}
            </div>
            <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.05em] text-balance sm:text-[2.5rem] lg:text-[3rem]">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">{description}</p>
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
    <section className="rounded-[0.9rem] border border-border bg-panel px-5 py-5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      {eyebrow ? (
        <div className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-muted">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mt-3 text-[1.35rem] font-semibold tracking-[-0.03em]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
