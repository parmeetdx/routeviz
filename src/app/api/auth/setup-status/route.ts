import { NextResponse } from "next/server";

import { dbGetSettings, dbGetUserCount } from "@/lib/db";
import { ensureDb } from "@/lib/routeviz-server";

export async function GET() {
  try {
    await ensureDb();
    const [count, settings] = await Promise.all([dbGetUserCount(), dbGetSettings()]);
    const npmCfg = settings?.connectors.find((c) => c.type === "npm");
    const npmOpts = npmCfg?.options as { mode?: string; sqlitePath?: string; apiUrl?: string; apiToken?: string } | undefined;
    const npmConfigured = npmOpts
      ? (npmOpts.mode === "api" ? !!(npmOpts.apiUrl && npmOpts.apiToken) : !!npmOpts.sqlitePath)
      : false;
    return NextResponse.json({ hasUsers: count > 0, npmConfigured });
  } catch {
    return NextResponse.json({ hasUsers: false, npmConfigured: false });
  }
}
