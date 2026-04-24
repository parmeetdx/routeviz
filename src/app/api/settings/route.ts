import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveSettings } from "@/lib/routeviz-server";
import type { PersistedSettings } from "@/lib/routeviz-types";

export const dynamic = "force-dynamic";

type SettingsPayload = {
  npmConnectorMode?: "sqlite" | "api";
  npmSqlitePath?: string;
  npmApiUrl?: string;
  npmApiToken?: string;
  dnsBaseline?: PersistedSettings["dnsBaseline"];
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
  webhookConfig?: Partial<PersistedSettings["webhookConfig"]>;
  authOverrides?: string[];
};

export async function POST(request: Request) {
  const payload = (await request.json()) as SettingsPayload;
  const state = await saveSettings({
    npmConnectorMode: payload.npmConnectorMode,
    npmSqlitePath: payload.npmSqlitePath,
    npmApiUrl: payload.npmApiUrl,
    npmApiToken: payload.npmApiToken,
    dnsBaseline: payload.dnsBaseline,
    scanConfig: payload.scanConfig,
    webhookConfig: payload.webhookConfig as PersistedSettings["webhookConfig"] | undefined,
    authOverrides: payload.authOverrides,
  });

  revalidatePath("/");
  revalidatePath("/routes");
  revalidatePath("/findings");
  revalidatePath("/setup");

  return NextResponse.json({
    ok: true,
    settings: state.settings,
  });
}
