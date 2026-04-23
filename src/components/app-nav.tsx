"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Overview" },
  { href: "/setup", label: "Setup" },
  { href: "/routes", label: "Routes" },
  { href: "/findings", label: "Findings" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "rounded-full border px-3 py-1.5 text-sm transition",
              active
                ? "border-accent/30 bg-accent/12 text-foreground"
                : "border-border bg-panel-2 text-muted hover:border-accent/25 hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
