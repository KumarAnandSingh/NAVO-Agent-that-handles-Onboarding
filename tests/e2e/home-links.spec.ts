import { expect, test, type Page } from "@playwright/test";
import { openStage, settled } from "./helpers";

const intro = (page: Page) => page.getByRole("dialog", { name: "About this demo" });

test("every page outside the stage links back to Home", async ({ page }) => {
  for (const path of ["/hr", "/phone", "/persona", "/no-such-page"]) {
    await page.goto(path);
    await page.getByRole("link", { name: "← Back to Home" }).click();
    await expect(intro(page), path).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
});

test("Home on the stage pauses the tour, and Resume carries on from there", async ({ page }) => {
  await openStage(page);
  await page.getByRole("complementary", { name: "Presenter controls" }).getByRole("button", { name: "⌂ Home" }).click();
  await expect(intro(page)).toBeVisible();

  await intro(page).getByRole("button", { name: /Documents and forms/ }).click();
  const caption = page.getByRole("region", { name: "Guided demo" });
  await expect(caption.getByText(/^\d+ \/ \d+$/)).toBeVisible({ timeout: 60_000 });
  await settled(page);
  const step = await caption.getByText(/^\d+ \/ \d+$/).textContent();
  await caption.getByRole("button", { name: "⌂ Home" }).click();
  await expect(intro(page)).toBeVisible();

  await intro(page).getByRole("button", { name: "▶ Resume guided demo" }).click();
  await expect(intro(page)).toHaveCount(0);
  // It resumes at the step it stopped on (or the next one), not at step 1.
  const resumed = Number((await caption.getByText(/^\d+ \/ \d+$/).textContent())!.split(" / ")[0]);
  expect(resumed).toBeGreaterThanOrEqual(Number(step!.split(" / ")[0]));
  await expect(caption.getByRole("button", { name: "❚❚ Pause" })).toBeVisible();
});
