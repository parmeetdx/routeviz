import { lookup } from "node:dns/promises";

import type { DnsBaselineMode, PersistedSettings } from "@/lib/routeviz-types";

export async function lookupAnswersForDomain(domain: string | null): Promise<string[]> {
  if (!domain) return [];
  try {
    const answers = await lookup(domain, { all: true });
    return [...new Set(answers.map((answer) => answer.address))];
  } catch {
    return [];
  }
}

export async function getDnsBaselineAnswers(settings: PersistedSettings): Promise<string[]> {
  if (settings.dnsBaseline.mode === "disabled" || settings.dnsBaseline.value === "") return [];
  try {
    const answers = await lookup(settings.dnsBaseline.value, { all: true });
    return [...new Set(answers.map((answer) => answer.address))];
  } catch {
    if (
      /^\d+\.\d+\.\d+\.\d+$/.test(settings.dnsBaseline.value) ||
      settings.dnsBaseline.value.includes(":")
    ) {
      return [settings.dnsBaseline.value];
    }
    return [];
  }
}

export function getDnsStatus(
  answers: string[],
  baselineMode: DnsBaselineMode,
  baselineAnswers: string[],
): string {
  if (answers.length === 0) return "unresolved";
  if (baselineMode === "disabled") return "observed";
  if (baselineAnswers.length === 0) return "unknown";
  return answers.some((answer) => baselineAnswers.includes(answer)) ? "ok" : "mismatch";
}

export function getTlsDaysRemaining(expiresOn: string | null): number | null {
  if (!expiresOn) return null;
  const expiresAt = new Date(expiresOn).getTime();
  if (Number.isNaN(expiresAt)) return null;
  return Math.ceil((expiresAt - Date.now()) / 86_400_000);
}
