import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveSettings } from "@/lib/routeviz-server";
import type { ConnectorConfig, PersistedSettings } from "@/lib/routeviz-types";

export const dynamic = "force-dynamic";

type SettingsPayload = {
  connectors?: ConnectorConfig[];
  dnsBaseline?: PersistedSettings["dnsBaseline"];
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
  webhookConfig?: Partial<PersistedSettings["webhookConfig"]>;
  authOverrides?: string[];
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SettingsPayload;
    const state = await saveSettings({
      connectors: payload.connectors,
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
  } catch (err) {
    console.error("[settings] POST failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
