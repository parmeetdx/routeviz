import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ops_session";

// Routes that never require authentication
const UNPROTECTED_PATHS = ["/auth/login", "/auth/register", "/api/auth/"];
// Auth pages (not API) — redirect away if already logged in
const AUTH_PAGES = ["/auth/login", "/auth/register"];

function isUnprotected(pathname: string): boolean {
  return UNPROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and Next.js internals are never protected
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = Boolean(token);

  // Redirect authenticated users away from login/register pages
  if (isAuthPage(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to login (except unprotected paths)
  if (!isUnprotected(pathname) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
