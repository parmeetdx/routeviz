import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground">{children}</div>;
}
