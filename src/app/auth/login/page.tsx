"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup-status")
      .then((r) => r.json())
      .then((d: { hasUsers?: boolean }) => {
        if (!d.hasUsers) router.replace("/auth/register");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="font-mono text-muted/50 text-xs animate-pulse">
        <span className="text-accent/40 mr-2">▸</span>loading...
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="font-mono text-accent text-2xl font-bold tracking-widest mb-1"
          style={{ textShadow: "0 0 16px rgba(57,255,122,0.5)" }}>
          NETCANARY
        </div>
        <div className="font-mono text-muted text-xs tracking-widest uppercase">
          <span className="text-accent/40 mr-1">##</span>sign in
        </div>
      </div>

      {/* Card */}
      <div className="border border-border bg-panel px-6 py-6 shadow-[0_0_40px_rgba(57,255,122,0.05)]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="identifier" className="font-mono text-xs text-muted/80 uppercase tracking-widest">
              <span className="text-accent/50 mr-1">▸</span>username or email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="font-mono text-sm bg-panel-2 border border-border px-3 py-2 text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="font-mono text-xs text-muted/80 uppercase tracking-widest">
              <span className="text-accent/50 mr-1">▸</span>password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono text-sm bg-panel-2 border border-border px-3 py-2 pr-10 text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors w-full"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted/60 hover:text-accent/80 transition-colors uppercase tracking-wider"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "hide" : "show"}
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="font-mono text-xs text-danger border border-danger/30 bg-danger/5 px-3 py-2">
              <span className="mr-1">✗</span>{error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 font-mono text-xs uppercase tracking-widest border border-accent/40 bg-accent/10 text-accent px-4 py-2.5 hover:bg-accent/20 hover:border-accent/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ textShadow: loading ? "none" : "0 0 8px rgba(57,255,122,0.3)" }}
          >
            {success ? "✓ authenticated — loading..." : loading ? "authenticating..." : "sign in →"}
          </button>
        </form>
      </div>

      <p className="mt-4 text-center font-mono text-xs text-muted/60">
        no account?{" "}
        <Link href="/auth/register" className="text-accent/70 hover:text-accent transition-colors underline underline-offset-2">
          register
        </Link>
      </p>
    </div>
  );
}
