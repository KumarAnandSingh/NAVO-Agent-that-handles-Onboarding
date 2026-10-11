import { expect, test } from "@playwright/test";
import { openStage } from "./helpers";

const KEY = `sk-ant-api03-${"e2e".repeat(14)}`;

test("a visitor connects their own Claude key, which stays in the tab and goes only to Navo's API", async ({ page }) => {
  // The free key check is answered here, so the test needs no real key and makes no paid call.
  await page.route("**/api/ai", (route) =>
    route.fulfill({
      json: {
        ok: true,
        models: [
          { id: "claude-haiku-5-5", name: "Haiku 5.5", available: true },
          { id: "claude-sonnet-5-5", name: "Sonnet 5.5", available: true },
          { id: "claude-opus-5-5", name: "Opus 5.5", available: true },
        ],
      },
    }),
  );
  const sentTo = new Set<string>();
  page.on("request", (request) => {
    if (request.headers()["x-navo-claude-key"]) sentTo.add(new URL(request.url()).pathname);
  });

  await openStage(page);
  const runtime = page.getByRole("complementary", { name: "Agent runtime" });
  const ai = runtime.getByRole("region", { name: "AI models and usage" });
  await expect(ai.getByText("Offline · Navo's rules, no AI key")).toBeVisible();
  await expect(ai.getByText("Ask Navo")).toBeVisible();
  await expect(ai.getByText(/Sonnet 5\.5/).first()).toBeVisible();

  await ai.getByRole("button", { name: "Try it with your own Claude key" }).click();
  const dialog = page.getByRole("dialog", { name: "Try Navo with live Claude" });
  const input = dialog.getByLabel("Anthropic API key");
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("not-a-key");
  await expect(dialog.getByRole("button", { name: "Test connection" })).toBeDisabled();
  await input.fill(KEY);
  await dialog.getByRole("button", { name: "Test connection" }).click();
  await expect(dialog.getByRole("status")).toContainText("Haiku 5.5, Sonnet 5.5, Opus 5.5");
  await dialog.getByRole("button", { name: "Use this key" }).click();

  await expect(ai.getByText("Claude live · your key")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("navo.claudeKey"))).toBe(KEY);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect([...sentTo].every((path) => path.startsWith("/api/"))).toBe(true);

  await ai.getByRole("button", { name: "Disconnect your key" }).click();
  await expect(ai.getByText("Offline · Navo's rules, no AI key")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("navo.claudeKey"))).toBeNull();
});
