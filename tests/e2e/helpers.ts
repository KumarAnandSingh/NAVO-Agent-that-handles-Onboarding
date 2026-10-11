import { expect, type Page } from "@playwright/test";

export const phone = (page: Page) => page.getByRole("region", { name: "Anand's phone" });

/** Open the stage and close the intro brief. */
export async function openStage(page: Page) {
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: "Explore on my own" }).first().click();
  await expect(page.getByRole("dialog", { name: "About this demo" })).toHaveCount(0);
}

/** Wait until Navo has finished working (request done and tool replay finished). */
export async function settled(page: Page) {
  await expect(page.getByRole("button", { name: /Navo is working/ })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Running", { exact: true })).toHaveCount(0, { timeout: 60_000 });
}

export async function advance(page: Page) {
  await page.getByRole("button", { name: "Advance time ▸" }).click();
  await settled(page);
}

export async function jumpToChapter(page: Page, name: RegExp) {
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name }).click();
  await settled(page);
}
