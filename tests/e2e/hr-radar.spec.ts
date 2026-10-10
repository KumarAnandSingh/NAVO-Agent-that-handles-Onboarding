import { expect, test } from "@playwright/test";
import { jumpToChapter, openStage } from "./helpers";

test("the cohort radar shows every joiner's Day 1, and a what-if shows where it would break", async ({ page }) => {
  await openStage(page);
  await jumpToChapter(page, /Ready for Day 1/);
  await page.getByRole("tab", { name: "HR owner" }).click();
  const hr = page.getByRole("region", { name: "HR console" });
  await hr.getByRole("navigation", { name: "HR navigation" }).getByRole("button", { name: /All joiners/ }).click();
  await expect(hr.getByText("No Day 1 at risk.")).toBeVisible();
  await expect(hr.getByRole("table", { name: "Joiners by Day-1 risk" }).getByRole("row")).toHaveCount(15);

  await hr.getByRole("group", { name: "What if" }).getByRole("button", { name: "IT takes a week longer" }).click();
  await expect(hr.getByText("3 joiners at risk of a broken Day 1; IT drives all of them.")).toBeVisible();
  await expect(hr.getByRole("list", { name: "Bottlenecks by team" }).getByText("IT")).toBeVisible();
  await expect(hr.getByText("changed")).toHaveCount(3);
});
