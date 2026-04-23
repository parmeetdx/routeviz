import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { triggerManualScan } from "@/lib/ops-ledger-server";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = await triggerManualScan();

  revalidatePath("/");
  revalidatePath("/routes");
  revalidatePath("/findings");
  revalidatePath("/setup");

  return NextResponse.json({
    ok: true,
    snapshot: state.snapshot,
  });
}
