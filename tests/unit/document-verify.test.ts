import { describe, expect, it } from "vitest";
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import { displayDate, parseDate, suggestDate, verifyAddressProof, verifyRelievingLetter } from "@/services/documents/verify";

const sample = (id: string) => SAMPLE_DOCUMENTS.find((s) => s.id === id)!.expected;
const WINDOW = { notBefore: "2026-10-06", before: "2026-10-19" };

describe("document verification", () => {
  it("verifies an address proof in the joiner's name", () => {
    expect(verifyAddressProof(sample("electricity-bill"), "Anand Mehta")).toMatchObject({ status: "verified" });
  });

  it("rejects an address proof in someone else's name", () => {
    const verdict = verifyAddressProof(sample("electricity-bill-other-name"), "Anand Mehta");
    expect(verdict).toMatchObject({ status: "rejected" });
    expect(verdict.note).toMatch(/Kavya Mehta/);
  });

  it("rejects an unreadable address proof", () => {
    expect(verifyAddressProof([{ name: "holder_name", value: "Anand Mehta", confidence: 0.3 }], "Anand Mehta")).toMatchObject({ status: "rejected" });
  });

  it("asks about the one unclear date and proposes the most likely value", () => {
    const verdict = verifyRelievingLetter(sample("relieving-letter"), WINDOW);
    expect(verdict).toMatchObject({ status: "clarify", field: "last_working_day", raw: "1? Oct 2026", suggestion: "2026-10-16" });
  });

  it("verifies a clear relieving date before Day 1 and rejects an overlap", () => {
    expect(verifyRelievingLetter([{ name: "last_working_day", value: "16 Oct 2026", confidence: 0.95 }], WINDOW)).toMatchObject({ status: "verified" });
    expect(verifyRelievingLetter([{ name: "last_working_day", value: "20 Oct 2026", confidence: 0.95 }], WINDOW)).toMatchObject({ status: "rejected" });
    expect(verifyRelievingLetter([], WINDOW)).toMatchObject({ status: "rejected" });
  });

  it("parses and suggests dates", () => {
    expect(parseDate("16 October 2026")).toBe("2026-10-16");
    expect(parseDate("2026-10-16")).toBe("2026-10-16");
    expect(parseDate("31 Feb 2026")).toBeNull();
    expect(parseDate("someday")).toBeNull();
    expect(suggestDate("2? Oct 2026", WINDOW)).toBeNull();
    expect(suggestDate("16 Oct 2026", WINDOW)).toBeNull();
    expect(displayDate("2026-10-16")).toBe("16 Oct 2026");
  });
});
