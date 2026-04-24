import https from "node:https";
import http from "node:http";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function httpPost(url: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function POST(request: Request) {
  const body = await request.json() as { url?: string; email?: string; password?: string };
  const { url, email, password } = body;

  if (!url || !email || !password) {
    return NextResponse.json({ error: "URL, email and password are required." }, { status: 400 });
  }

  try {
    const base = url.replace(/\/$/, "");
    const payload = JSON.stringify({ identity: email, secret: password });
    const res = await httpPost(`${base}/api/tokens`, payload);

    if (res.status >= 400) {
      return NextResponse.json(
        { error: `NPM returned ${res.status}: ${res.body.slice(0, 120)}` },
        { status: 400 },
      );
    }

    const data = JSON.parse(res.body) as { token?: string };
    if (!data.token) {
      return NextResponse.json({ error: "NPM did not return a token." }, { status: 400 });
    }

    return NextResponse.json({ token: data.token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach NPM." },
      { status: 500 },
    );
  }
}
