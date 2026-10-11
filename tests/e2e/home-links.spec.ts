import { expect, test, type Page } from "@playwright/test";
import { openStage, settled } from "./helpers";

const intro = (page: Page) => page.getByRole("dialog", { name: "About this demo" });
const homeButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "← Back to Home" });

test("every page outside the stage links back to Home", async ({ page }) => {
  for (const path of ["/hr", "/phone", "/persona", "/no-such-page"]) {
    await page.goto(path);
    await page.getByRole("banner").getByRole("link", { name: "← Back to Home" }).click();
    await expect(intro(page), path).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
});

test("Home on the stage pauses the tour, and Resume carries on from there", async ({ page }) => {
  await openStage(page);
  await homeButton(page).click();
  await expect(intro(page)).toBeVisible();

  await intro(page).getByRole("button", { name: /Documents and forms/ }).click();
  const caption = page.getByRole("region", { name: "Guided demo" });
  await expect(caption.getByText(/^\d+ \/ \d+$/)).toBeVisible({ timeout: 60_000 });
  await settled(page);
  const step = await caption.getByText(/^\d+ \/ \d+$/).textContent();
  await homeButton(page).click();
  await expect(intro(page)).toBeVisible();

  await intro(page).getByRole("button", { name: "▶ Resume guided demo" }).click();
  await expect(intro(page)).toHaveCount(0);
  // It resumes at the step it stopped on (or the next one), not at step 1.
  const resumed = Number((await caption.getByText(/^\d+ \/ \d+$/).textContent())!.split(" / ")[0]);
  expect(resumed).toBeGreaterThanOrEqual(Number(step!.split(" / ")[0]));
  await expect(caption.getByRole("button", { name: "❚❚ Pause" })).toBeVisible();
});

test.describe("in a narrower window, where the stage stacks into one column", () => {
  test.use({ viewport: { width: 1368, height: 800 } });

  test("Back to Home stays in view on every screen the intro opens", async ({ page }) => {
    const opens: [string, (p: Page) => Promise<void>][] = [
      ["Priya's card", (p) => intro(p).getByRole("button", { name: /Open her HR console/ }).click()],
      ["Anand's card", (p) => intro(p).getByRole("button", { name: /Open his app/ }).click()],
      ["a chapter row", (p) => intro(p).getByRole("button", { name: /Ready for Day 1/ }).click()],
      ["Jump to this moment", (p) => intro(p).getByRole("button", { name: "▶ Jump to this moment" }).click()],
    ];
    await page.goto("/");
    for (const [from, open] of opens) {
      await open(page);
      await expect(intro(page), from).toHaveCount(0);
      await page.mouse.wheel(0, 3000);
      await expect(homeButton(page), from).toBeInViewport();
      await homeButton(page).click();
      await expect(intro(page), from).toBeVisible();
      await settled(page);
    }
  });
});
