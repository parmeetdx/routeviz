import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.mjs"],
    exclude: ["src/app/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/collectors/npm.ts",
        "src/lib/collectors/dns.ts",
        "src/lib/analysis/route-findings.ts",
        "src/lib/analysis/workload-findings.ts",
        "src/lib/analysis/route-match.ts",
        "src/lib/snapshot-differ.ts",
        "src/lib/finding-copy.ts",
        "src/lib/settings.ts",
        "src/lib/routeviz.mjs",
      ],
      exclude: [
        "src/lib/db.ts",
        "src/lib/auth.ts",
        "src/lib/routeviz-server.ts",
        "src/lib/scan-engine.ts",
        "src/app/**",
        "src/components/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
