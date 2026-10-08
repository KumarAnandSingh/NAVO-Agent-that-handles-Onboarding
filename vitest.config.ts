import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/app/**", "src/ui/**", "src/content/**", "src/**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      // Floors, not targets: CI fails if coverage drops below what the suite has today.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 70,
        "src/domain/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
      },
    },
  },
});
