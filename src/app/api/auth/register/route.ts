import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { dbCreateUser, dbGetUserByEmail, dbGetUserByUsername, dbGetUserCount } from "@/lib/db";
import { ensureDb, triggerManualScan } from "@/lib/ops-ledger-server";

export async function POST(req: Request) {
  try {
    await ensureDb();
    const body = await req.json() as {
      name?: string;
      username?: string;
      email?: string | null;
      password?: string;
    };
    const { name, username, email, password } = body;

    if (!name || !username || !password) {
      return NextResponse.json({ error: "Name, username, and password are required." }, { status: 400 });
    }
    if (username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]+$/i.test(username)) {
      return NextResponse.json({ error: "Username may only contain letters, numbers, hyphens, and underscores." }, { status: 400 });
    }

    const existingUsername = await dbGetUserByUsername(username.trim().toLowerCase());
    if (existingUsername) {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }

    if (email) {
      const existingEmail = await dbGetUserByEmail(email.trim().toLowerCase());
      if (existingEmail) {
        return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
      }
    }

    const userCount = await dbGetUserCount();
    const isAdmin = userCount === 0;

    const passwordHash = await hash(password, 12);
    const user = await dbCreateUser(
      username.trim().toLowerCase(),
      email ? email.trim().toLowerCase() : null,
      passwordHash,
      isAdmin,
    );

    await createSession(user.id);

    // Kick off the first scan in the background so the dashboard loads fast
    void triggerManualScan();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/register]", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
