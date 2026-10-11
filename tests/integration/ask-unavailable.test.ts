import { describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/lib/db/client";
import { askNavo } from "@/services/ask";
import { createWorkspace } from "@/services/workspace";

vi.mock("@/services/ask/fallback", async (original) => ({
  ...(await original<object>()),
  fallbackAnswer: async () => {
    throw new Error("calculate_day1_risk: timed out after 5000ms");
  },
}));

describe("Ask Navo under heavy load", () => {
  it("answers honestly instead of failing when even the rules can't read the state", async () => {
    const db = await createMemoryDb();
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const answer = await askNavo(db, ws, "What if HR doesn't respond?", { llm: null });
    expect(answer).toMatchObject({ composedBy: "fallback", citations: [], text: "I couldn't check your onboarding just now. Try again in a moment, or ask Halden HR." });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
    warn.mockRestore();
  });
});
