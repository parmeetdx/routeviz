"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="font-mono text-xs border border-border/50 bg-panel-2 px-3 py-1.5 text-muted/70 hover:border-danger/40 hover:text-danger/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="mr-1 opacity-60">⏻</span>
      {loading ? "..." : "logout"}
    </button>
  );
}
