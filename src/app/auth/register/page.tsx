"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email: email || null, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      router.push("/overview");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="font-mono text-accent text-2xl font-bold tracking-widest mb-1"
          style={{ textShadow: "0 0 16px rgba(57,255,122,0.5)" }}>
          ROUTEVIZ
        </div>
        <div className="font-mono text-muted text-xs tracking-widest uppercase">
          <span className="text-accent/40 mr-1">##</span>create account
        </div>
      </div>

      {/* Card */}
      <div className="border border-border bg-panel px-6 py-6 shadow-[0_0_40px_rgba(57,255,122,0.05)]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="font-mono text-xs text-muted/80 uppercase tracking-widest">
              <span className="text-accent/50 mr-1">▸</span>name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="font-mono text-sm bg-panel-2 border border-border px-3 py-2 text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
              placeholder="Your Name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="font-mono text-xs text-muted/80 uppercase tracking-widest">
              <span className="text-accent/50 mr-1">▸</span>username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="font-mono text-sm bg-panel-2 border border-border px-3 py-2 text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
              placeholder="yourusername"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="font-mono text-xs text-muted/80 uppercase tracking-widest">
              <span className="text-accent/50 mr-1">▸</span>email{" "}
              <span className="text-muted/40 normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
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
            {success ? "✓ account created — loading..." : loading ? "creating account..." : "create account →"}
          </button>
        </form>
      </div>

      <p className="mt-4 text-center font-mono text-xs text-muted/60">
        already have an account?{" "}
        <Link href="/auth/login" className="text-accent/70 hover:text-accent transition-colors underline underline-offset-2">
          sign in
        </Link>
      </p>
    </div>
  );
}
