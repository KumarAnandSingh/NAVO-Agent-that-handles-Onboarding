import { expect, test } from "@playwright/test";
import { jumpToChapter, openStage, phone } from "./helpers";

test("HR publishes a policy, Navo splits it into citable sections, and Ask Navo answers from it", async ({ page }) => {
  await openStage(page);
  // Jumping to a chapter resets the demo, so do it before publishing.
  await jumpToChapter(page, /Pre-joining/);
  await page.getByRole("tab", { name: "HR owner" }).click();
  const hr = page.getByRole("region", { name: "HR console" });
  await hr.getByRole("navigation", { name: "HR navigation" }).getByRole("button", { name: "Policies and rules" }).click();
  const library = hr.getByRole("table", { name: "Policy library" });
  await expect(library.getByText("Onboarding standards and escalation")).toBeVisible();

  await hr.getByRole("button", { name: "Load a sample policy" }).click();
  await expect(hr.getByLabel("Title")).toHaveValue("Relocation support");
  await expect(hr.getByRole("button", { name: "Publish" })).toBeDisabled();
  await hr.getByRole("button", { name: "Preview sections" }).click();
  const sections = hr.getByRole("list", { name: "Sections Navo found" });
  await expect(sections.getByRole("listitem")).toHaveCount(4);
  await expect(sections.getByText("9.3", { exact: true })).toBeVisible();
  await hr.getByRole("button", { name: "Publish" }).click();
  await expect(hr.getByRole("status")).toContainText("Navo can cite Sections 9.1–9.4 from now on");
  await expect(library.getByRole("row", { name: /Relocation support.*Added by HR/ })).toBeVisible();

  // The joiner can now ask about it, and the answer cites the new section.
  await page.getByRole("tab", { name: "Employee" }).click();
  const app = phone(page);
  await app.getByRole("button", { name: /Ask Navo/ }).first().click();
  const sheet = app.getByRole("dialog", { name: "Ask Navo" });
  await sheet.getByRole("textbox", { name: "Question for Navo" }).fill("How many nights of temporary housing do I get?");
  await sheet.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(sheet.getByText(/14 nights/)).toBeVisible();
  await expect(sheet.getByText(/Checked Relocation support, Section 9\.3/)).toBeVisible();
});
