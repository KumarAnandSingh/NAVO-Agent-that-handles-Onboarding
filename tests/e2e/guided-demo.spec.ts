import { expect, test } from "@playwright/test";

test("the guided demo plays the whole story on the live engine and ends on real figures", async ({ page }) => {
  test.setTimeout(330_000);
  await page.goto("/");
  await page.getByRole("dialog", { name: "About this demo" }).getByRole("button", { name: "▶ Play guided demo" }).first().click();
  const impact = page.getByRole("dialog", { name: "Impact" });
  await expect(impact).toBeVisible({ timeout: 300_000 });
  await expect(impact.getByText(/completed tasks closed by Navo/)).toBeVisible();
  await expect(impact.getByText(/before Day 1 Navo acted on the Day-1 risk/)).toBeVisible();
  await expect(impact.getByText("Figures computed from this simulated run.")).toBeVisible();
});
