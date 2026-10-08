import { expect, test } from "@playwright/test";
import { advance, jumpToChapter, openStage, phone, settled } from "./helpers";

test("HR stays silent: Navo asks before ordering a loaner, then Day 1 is covered", async ({ page }) => {
  await openStage(page);
  await page.getByRole("radio", { name: "HR silent" }).click();
  await settled(page);
  await jumpToChapter(page, /Pre-joining/);
  const app = phone(page);

  await advance(page); // 09:15 reminder to HR
  await expect(app.getByRole("heading", { name: "One risk to Monday. I'm on it." })).toBeVisible();
  await advance(page); // 12:00 last safe start: asks Anand
  await expect(app.getByRole("heading", { name: "I need one decision from you." })).toBeVisible();
  await expect(app.getByText("Use a loaner laptop for Day 1?")).toBeVisible();
  await expect(app.getByText(/ready at Building B by Fri 16:00/)).toBeVisible();
  const runtime = page.getByRole("complementary", { name: "Agent runtime" });
  await expect(runtime.getByText("request_approval")).toBeVisible();

  await app.getByRole("button", { name: "Approve" }).click();
  await settled(page);
  await expect(app.getByRole("heading", { name: "Day 1 is covered." })).toBeVisible();
  await expect(runtime.getByText(/type="loaner"/)).toBeVisible();
});
