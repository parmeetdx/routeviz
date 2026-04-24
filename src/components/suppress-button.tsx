"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SuppressButton({ suppressKey }: { suppressKey: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSuppress() {
    setLoading(true);
    await fetch("/api/suppress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: suppressKey, action: "suppress" }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleSuppress}
      disabled={loading}
      className="font-mono text-[0.6rem] uppercase tracking-wider border border-muted/20 bg-panel-2 px-2 py-1 text-muted/50 transition hover:border-muted/40 hover:text-muted/80 disabled:opacity-40 whitespace-nowrap"
      title="Suppress this finding — it won't appear in future snapshots until unsuppressed"
    >
      {loading ? "…" : "suppress"}
    </button>
  );
}
