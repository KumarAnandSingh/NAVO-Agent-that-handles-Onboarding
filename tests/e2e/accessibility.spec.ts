import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openStage, settled } from "./helpers";

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("intro brief has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "About this demo" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("demo stage and home screen have no serious accessibility violations", async ({ page }) => {
  await openStage(page);
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name: /Pre-joining/ }).click();
  await settled(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("HR console has no serious accessibility violations", async ({ page }) => {
  await page.goto("/hr");
  await expect(page.getByRole("region", { name: "HR console" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await seriousViolations(page)).toEqual([]);
  for (const name of ["All joiners", "Policies and rules"]) {
    await page.getByRole("navigation", { name: "HR navigation" }).getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    expect(await seriousViolations(page), name).toEqual([]);
  }
});

test("the connect-your-key dialog has no serious accessibility violations", async ({ page }) => {
  await openStage(page);
  await page.getByRole("button", { name: "Try it with your own Claude key" }).click();
  await expect(page.getByRole("dialog", { name: "Try Navo with live Claude" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the stage is usable by keyboard: shortcuts and focusable controls", async ({ page }) => {
  await openStage(page);
  await page.keyboard.press("h");
  await expect(page.getByRole("region", { name: "HR console" })).toBeVisible();
  await page.keyboard.press("h");
  await page.keyboard.press("b");
  await expect(page.getByRole("dialog", { name: "About this demo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "About this demo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Advance time ▸" }).focus();
  await expect(page.getByRole("button", { name: "Advance time ▸" })).toBeFocused();
});

test("the joiner's phone on its own has no serious accessibility violations", async ({ page }) => {
  await page.goto("/phone");
  await expect(page.getByRole("heading", { name: "Your address proof is missing." })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
