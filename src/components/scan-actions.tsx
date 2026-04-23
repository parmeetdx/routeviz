"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ScanActionsProps = {
  generatedLabel: string;
};

export function ScanActions({ generatedLabel }: ScanActionsProps) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleScan() {
    setIsScanning(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Manual scan failed.");
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Manual scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-accent/30 bg-accent/12 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
          {generatedLabel}
        </span>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          className="rounded-full border border-border bg-panel px-3 py-1.5 text-sm text-foreground transition hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isScanning ? "Scanning..." : "Run scan now"}
        </button>
      </div>
      {errorMessage ? (
        <p className="text-sm text-danger">{errorMessage}</p>
      ) : null}
    </div>
  );
}
