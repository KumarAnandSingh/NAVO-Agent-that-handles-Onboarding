import { expect, test } from "@playwright/test";
import { advance, openStage, phone, settled } from "./helpers";

test("first launch to blocker cleared: documents, forms, Day-1 risk and HR issuing the ID", async ({ page }) => {
  await openStage(page);
  const app = phone(page);

  // First launch: sign in and meet Navo.
  await expect(app.getByRole("heading", { name: "Welcome to Halden." })).toBeVisible();
  await app.getByRole("button", { name: "Continue" }).click();
  await expect(app.getByRole("heading", { name: /Meet Navo/ })).toBeVisible();
  await app.getByRole("button", { name: /Let's start/ }).click();

  // Documents: upload the missing address proof, then clarify one unreadable date.
  await expect(app.getByRole("heading", { name: "Your address proof is missing." })).toBeVisible();
  await app.getByRole("button", { name: "Upload address proof" }).click();
  await app.getByRole("button", { name: "Electricity bill (Sep 2026)" }).click();
  await settled(page);
  await expect(app.getByRole("heading", { name: "One thing to clarify." })).toBeVisible();
  await app.getByRole("button", { name: "Clarify relieving letter" }).click();
  await expect(app.getByText("1? Oct 2026")).toBeVisible();
  await app.getByRole("button", { name: "Yes, 16 Oct" }).click();
  await settled(page);
  await expect(app.getByRole("heading", { name: "All documents verified." })).toBeVisible();

  // Forms: pre-filled, one field needs Anand.
  await app.getByRole("button", { name: "Continue to forms" }).click();
  await expect(app.getByText("From address proof")).toBeVisible();
  await app.getByRole("button", { name: "Add emergency contact" }).click();
  await app.getByRole("button", { name: "Save" }).click();
  await settled(page);
  await app.getByRole("button", { name: "Confirm and submit" }).click();
  await settled(page);
  await expect(app.getByRole("heading", { name: /You join Halden in 12 days/ })).toBeVisible();

  // Advance time: Navo notices on Wednesday, then acts on Thursday.
  await advance(page);
  await advance(page);
  await expect(app.getByRole("heading", { name: "One risk to Monday. I'm on it." })).toBeVisible();
  const runtime = page.getByRole("complementary", { name: "Agent runtime" });
  await expect(runtime.getByText(/^send_reminder\(to="priya.nair"/)).toBeVisible();
  await expect(runtime.getByText("reminder R-1: created")).toBeVisible();

  // Priya generates the ID from the HR console; Navo raises the IT requests.
  await page.getByRole("tab", { name: "HR owner" }).click();
  const console_ = page.getByRole("region", { name: "HR console" });
  await expect(console_.getByText("Employee ID not generated")).toBeVisible();
  await console_.getByRole("button", { name: "Generate ID" }).click();
  await settled(page);
  await page.getByRole("tab", { name: "Employee" }).click();
  await expect(app.getByRole("heading", { name: "Blocker cleared. You're on track for Monday." })).toBeVisible();
  await expect(runtime.getByText(/create_it_request/).first()).toBeVisible();
});
