import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { dbCreateSession, dbDeleteSession, dbGetSession, getPool, type UserRow } from "./db";

export const SESSION_COOKIE = "ops_session";
const SESSION_TTL_DAYS = 30;

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await dbCreateSession(token, userId, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: false, // HTTP-only self-hosted install, never served over HTTPS directly
  });
}

export async function getSessionUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await dbGetSession(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await dbDeleteSession(token);
    return null;
  }

  const pool = getPool();
  const { rows } = await pool.query<UserRow>("select * from users where id = $1", [session.userId]);
  return rows[0] ?? null;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await dbDeleteSession(token);
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function validateSessionToken(token: string): Promise<{ userId: string } | null> {
  const session = await dbGetSession(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await dbDeleteSession(token);
    return null;
  }
  return { userId: session.userId };
}
