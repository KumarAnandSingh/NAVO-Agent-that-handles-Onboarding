import { expect, test } from "@playwright/test";
import { advance, jumpToChapter, openStage, phone, settled } from "./helpers";

test("Ask Navo answers from live state and cites the policy it retrieved", async ({ page }) => {
  await openStage(page);
  await jumpToChapter(page, /Pre-joining/);
  await advance(page);
  const app = phone(page);
  await app.getByRole("button", { name: "What if HR doesn't respond?" }).first().click();
  const sheet = app.getByRole("dialog", { name: "Ask Navo" });
  await expect(sheet.getByText(/I reminded Priya Nair at 09:17 today/)).toBeVisible();
  await expect(sheet.getByText(/\(§4\.2\)/)).toBeVisible();
  await expect(sheet.getByText(/Checked Onboarding standards and escalation §4\.2/)).toBeVisible();
  await expect(sheet.getByText("Answered from Navo's rules (no AI key connected)")).toBeVisible();
  await settled(page);
  await expect(page.getByRole("complementary", { name: "Agent runtime" }).getByText("search_policies")).toBeVisible();

  // A typed question outside the policy library gets an honest "I don't know".
  await sheet.getByRole("textbox", { name: "Question for Navo" }).fill("What is the airport shuttle schedule?");
  await sheet.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(sheet.getByText(/I don't see that there/)).toBeVisible();
});
