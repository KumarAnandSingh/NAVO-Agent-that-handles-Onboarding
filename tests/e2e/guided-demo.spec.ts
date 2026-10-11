import { expect, test } from "@playwright/test";

test("the guided demo plays the whole story on the live engine and ends on real figures", async ({ page }) => {
  test.setTimeout(330_000);
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: "▶ Play guided demo" }).click();
  const impact = page.getByRole("dialog", { name: "Impact" });
  await expect(impact).toBeVisible({ timeout: 300_000 });
  await expect(impact.getByText(/completed tasks closed by Navo/)).toBeVisible();
  await expect(impact.getByText(/before Day 1 Navo acted on the Day-1 risk/)).toBeVisible();
  await expect(impact.getByText("Figures computed from this simulated run.")).toBeVisible();
});

test("a chapter in the intro brief starts the guided demo there and plays on to the end", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: /Ready for Day 1/ }).click();
  const caption = page.getByRole("region", { name: "Guided demo" });
  await expect(caption.getByText(/Navo books one pickup for everything/)).toBeVisible({ timeout: 60_000 });
  const impact = page.getByRole("dialog", { name: "Impact" });
  await expect(impact).toBeVisible({ timeout: 200_000 });
  await expect(impact.getByText(/completed tasks closed by Navo/)).toBeVisible();
});

test("the Watch for card jumps straight to the late Employee ID", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: "▶ Jump to this moment" }).click();
  const caption = page.getByRole("region", { name: "Guided demo" });
  await expect(caption.getByText(/days before Day 1\. Navo is watching/)).toBeVisible({ timeout: 60_000 });
  await caption.getByRole("button", { name: "❚❚ Pause" }).click();
  await expect(caption.getByRole("button", { name: "▶ Play" })).toBeVisible();
  // The engine was replayed to Thursday, the morning Navo catches the late ID.
  await expect(page.getByRole("complementary", { name: "Presenter controls" }).getByText(/^Thu 15 Oct/).first()).toBeVisible();
});
