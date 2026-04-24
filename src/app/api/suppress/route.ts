import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { suppressFinding, unsuppressFinding } from "@/lib/ops-ledger-server";

export const dynamic = "force-dynamic";

type SuppressPayload = {
  key: string;
  action: "suppress" | "unsuppress";
};

export async function POST(request: Request) {
  const { key, action } = (await request.json()) as SuppressPayload;

  if (!key || (action !== "suppress" && action !== "unsuppress")) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (action === "suppress") {
    await suppressFinding(key);
  } else {
    await unsuppressFinding(key);
  }

  revalidatePath("/findings");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
