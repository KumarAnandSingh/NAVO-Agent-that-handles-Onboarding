import { describe, expect, it } from "vitest";
import { expandQuery, rankBm25, tokenize } from "@/services/policy-retrieval/bm25";
import { compareVersions, currentSections, rankSections, type PolicySection } from "@/services/policy-retrieval";
import { POLICIES } from "@/content/policies";
import { atIst } from "@/domain/time";

const SECTIONS: PolicySection[] = POLICIES.flatMap((p) =>
  p.sections.map((s) => ({
    id: `${p.id}@${p.version}${s.ref}`,
    ref: s.ref,
    title: s.title,
    body: s.body,
    documentId: p.id,
    documentTitle: p.title,
    version: p.version,
    effectiveDate: p.effectiveDate,
  })),
);
const NOW = atIst("2026-10-15", "10:00");

describe("policy retrieval", () => {
  it("tokenizes, stems and drops stop words", () => {
    expect(tokenize("What are the Reminders for laptops?")).toEqual(["reminder", "laptop"]);
    expect(expandQuery("Can I WFH")).toContain("remote");
  });

  it("finds the matching policy section", () => {
    const [top] = rankSections(currentSections(SECTIONS, NOW), "Can I work from home on Friday?");
    expect(top?.ref).toBe("§2.1");
    expect(top?.version).toBe("2.1");
  });

  it("returns nothing when no policy is relevant", () => {
    expect(rankSections(currentSections(SECTIONS, NOW), "stock options vesting cliff")).toEqual([]);
  });

  it("excludes superseded versions", () => {
    const current = currentSections(SECTIONS, NOW);
    expect(current.some((s) => s.documentId === "hybrid-work" && s.version === "2.0")).toBe(false);
  });

  it("uses the older version before the new one takes effect", () => {
    const before = currentSections(SECTIONS, atIst("2026-03-01", "10:00"));
    expect(before.find((s) => s.documentId === "hybrid-work")?.version).toBe("2.0");
  });

  it("answers escalation and benefits questions from the right sections", () => {
    const current = currentSections(SECTIONS, NOW);
    expect(rankSections(current, "What if HR doesn't respond?")[0]?.ref).toBe("§4.2");
    expect(rankSections(current, "Can I add my parents to insurance?")[0]?.ref).toBe("§3.2");
    expect(rankSections(current, "What should I bring on Day 1?")[0]?.ref).toBe("§6.1");
  });

  it("compares versions numerically", () => {
    expect(compareVersions("2.10", "2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1")).toBe(0);
  });

  it("ranks deterministically", () => {
    const docs = [{ id: "b", text: "laptop loaner" }, { id: "a", text: "laptop loaner" }];
    expect(rankBm25(docs, "laptop").map((d) => d.id)).toEqual(["a", "b"]);
    expect(rankBm25([], "laptop")).toEqual([]);
  });
});
