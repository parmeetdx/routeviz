import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { dbGetUserByIdentifier } from "@/lib/db";
import { ensureDb } from "@/lib/ops-ledger-server";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const body = await req.json() as { identifier?: string; password?: string };
    const { identifier, password } = body;

    if (!identifier || !password) {
      return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
    }

    const user = await dbGetUserByIdentifier(identifier.trim());
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const valid = await compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
