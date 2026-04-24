import { NextResponse } from "next/server";

import { dbGetSettings, dbGetUserCount } from "@/lib/db";
import { ensureDb } from "@/lib/routeviz-server";

export async function GET() {
  try {
    await ensureDb();
    const [count, settings] = await Promise.all([dbGetUserCount(), dbGetSettings()]);
    const npmConfigured = settings
      ? (settings.npmConnectorMode === "api" ? !!(settings.npmApiUrl && settings.npmApiToken) : !!settings.npmSqlitePath)
      : false;
    return NextResponse.json({ hasUsers: count > 0, npmConfigured });
  } catch {
    return NextResponse.json({ hasUsers: false, npmConfigured: false });
  }
}
