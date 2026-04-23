import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { saveSettings } from "@/lib/ops-ledger-server";
import type { PersistedSettings } from "@/lib/ops-ledger-types";

export const dynamic = "force-dynamic";

type SettingsPayload = {
  dnsBaseline?: PersistedSettings["dnsBaseline"];
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as SettingsPayload;
  const state = await saveSettings({
    dnsBaseline: payload.dnsBaseline,
    scanConfig: payload.scanConfig,
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
