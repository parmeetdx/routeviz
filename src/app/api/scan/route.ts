import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { dbRequestScan } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  await dbRequestScan();

  revalidatePath("/");
  revalidatePath("/routes");
  revalidatePath("/findings");
  revalidatePath("/setup");

  return NextResponse.json({ ok: true });
}
