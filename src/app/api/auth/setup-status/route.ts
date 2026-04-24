import { NextResponse } from "next/server";

import { dbGetUserCount } from "@/lib/db";
import { ensureDb } from "@/lib/ops-ledger-server";

export async function GET() {
  try {
    await ensureDb();
    const count = await dbGetUserCount();
    return NextResponse.json({ hasUsers: count > 0 });
  } catch {
    return NextResponse.json({ hasUsers: false });
  }
}
