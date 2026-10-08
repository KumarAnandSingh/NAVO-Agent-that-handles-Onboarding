import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * End-to-end tests run against a production build (`npm run build` first). Each test gets
 * a fresh browser context, so a fresh cookie and an isolated demo workspace. Live Claude
 * calls are switched off so runs are deterministic and free.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1720, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1720, height: 1000 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/state`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NAVO_LIVE_AI: "off" },
  },
});
