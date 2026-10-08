/**
 * Captures the README and design-doc screenshots (docs/images/*.png) from a running build.
 * Each shot uses a fresh browser context, so it gets its own freshly seeded workspace.
 *
 *   npm run build && NAVO_LIVE_AI=off npx next start -p 3200
 *   npm run screenshots            # or BASE_URL=https://… npm run screenshots
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = path.join(process.cwd(), "docs", "images");
const VIEWPORT = { width: 1600, height: 1000 };

const phone = (page: Page) => page.getByRole("region", { name: "Anand's phone" });

async function open(browser: Browser, scale = 1) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT, deviceScaleFactor: scale, reducedMotion: "reduce" });
  return context.newPage();
}

async function settled(page: Page) {
  await expect(page.getByRole("button", { name: /Navo is working/ })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Running", { exact: true })).toHaveCount(0, { timeout: 60_000 });
}

async function openStage(page: Page) {
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: "Explore on my own" }).click();
  await expect(page.getByRole("dialog", { name: "About this demo" })).toHaveCount(0);
}

async function jumpToChapter(page: Page, name: RegExp) {
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name }).click();
  await settled(page);
}

async function advance(page: Page) {
  await page.getByRole("button", { name: "Advance time ▸" }).click();
  await settled(page);
}

async function shot(page: Page, name: string, target?: ReturnType<typeof phone>, height?: number) {
  // Let toasts clear so they don't cover the screen being shown.
  await expect(page.locator('[role="status"]:not([aria-live])')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${name}.png`);
  if (target) await target.screenshot({ path: file });
  else await page.screenshot({ path: file, clip: height ? { x: 0, y: 0, width: VIEWPORT.width, height } : undefined });
  console.warn(`captured ${path.relative(process.cwd(), file)}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    // The brief a judge sees first.
    {
      const page = await open(browser);
      await page.goto("/");
      await expect(page.getByRole("dialog", { name: "About this demo" })).toBeVisible();
      await shot(page, "intro-brief");
    }

    // Navo catches the late Employee ID and acts; then the HR owner's view of the same moment.
    {
      const page = await open(browser);
      await openStage(page);
      await jumpToChapter(page, /Pre-joining/);
      await advance(page);
      await expect(phone(page).getByRole("heading", { name: "One risk to Monday. I'm on it." })).toBeVisible();
      await phone(page).getByRole("button", { name: "Why?" }).click();
      await shot(page, "stage-day1-risk");
      await page.getByRole("tab", { name: "HR owner" }).click();
      await shot(page, "hr-console");
    }

    // Document reading: one unreadable date, asked about on its own.
    {
      const page = await open(browser, 2);
      await openStage(page);
      const app = phone(page);
      await app.getByRole("button", { name: "Continue" }).click();
      await app.getByRole("button", { name: /Let's start/ }).click();
      await app.getByRole("button", { name: "Upload address proof" }).click();
      await app.getByRole("button", { name: "Electricity bill (Sep 2026)" }).click();
      await settled(page);
      await app.getByRole("button", { name: "Clarify relieving letter" }).click();
      await expect(app.getByText("1? Oct 2026")).toBeVisible();
      await shot(page, "phone-clarify", app);
    }

    // HR stays silent: Navo asks before an asset change.
    {
      const page = await open(browser, 2);
      await openStage(page);
      await page.getByRole("radio", { name: "HR silent" }).click();
      await settled(page);
      await jumpToChapter(page, /Pre-joining/);
      await advance(page);
      await advance(page);
      await expect(phone(page).getByText("Use a loaner laptop for Day 1?")).toBeVisible();
      await shot(page, "phone-loaner-approval", phone(page));
    }

    // Ask Navo: answered from live state and policy, with what it checked.
    {
      const page = await open(browser, 2);
      await openStage(page);
      await jumpToChapter(page, /Pre-joining/);
      await advance(page);
      const app = phone(page);
      // The home screen's suggestion chip opens the sheet and asks in one tap.
      await app.getByRole("button", { name: "What if HR doesn't respond?" }).first().click();
      const sheet = app.getByRole("dialog", { name: "Ask Navo" });
      await expect(sheet.getByText(/Offline answer from Navo's rules|Answered by Claude/)).toBeVisible({ timeout: 60_000 });
      await settled(page);
      await shot(page, "phone-ask-navo", app);
    }

    // Day 30 and the impact summary computed from the run.
    {
      const page = await open(browser);
      await openStage(page);
      await jumpToChapter(page, /Week 1/);
      await phone(page).getByRole("button", { name: "Skip to Day 30 ▸" }).click();
      await settled(page);
      await phone(page).getByRole("button", { name: "See the impact →" }).click();
      await expect(page.getByRole("dialog", { name: "Impact" })).toBeVisible();
      await shot(page, "impact", undefined, 640);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
