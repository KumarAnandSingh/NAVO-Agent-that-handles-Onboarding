import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/components/**/*.test.{ts,tsx}"],
    // Real view models for component tests, built once per run.
    globalSetup: ["tests/components/view-models.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      // The UI counts too: component tests render it from real engine state.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/**", "src/content/**", "src/**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      // Floors, not targets: CI fails if coverage drops below what the suite has today.
      thresholds: {
        lines: 88,
        statements: 87,
        functions: 82,
        branches: 78,
        "src/domain/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "src/{agent,services,eval,server,lib,mock-systems}/**": { lines: 94, statements: 93, branches: 82 },
        "src/ui/**": { lines: 68, statements: 65, branches: 60 },
      },
    },
  },
});
