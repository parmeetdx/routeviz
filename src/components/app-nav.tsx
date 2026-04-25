"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "overview" },
  { href: "/routes", label: "routes" },
  { href: "/findings", label: "findings" },
  { href: "/setup", label: "setup" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "font-mono text-xs border px-3 py-1.5 transition",
              active
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border/50 bg-panel-2 text-muted/80 hover:border-accent/30 hover:text-foreground/80",
            ].join(" ")}
          >
            {active ? <span className="text-accent/60 mr-1">&gt;</span> : <span className="text-muted/30 mr-1">_</span>}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
