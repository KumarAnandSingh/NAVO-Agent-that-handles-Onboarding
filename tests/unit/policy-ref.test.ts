import { describe, expect, it } from "vitest";
import { refNumber, refRange } from "@/domain/policy-ref";

describe("policy refs", () => {
  it("shortens a ref for a column already headed Sections", () => {
    expect(refNumber("Section 4.2")).toBe("4.2");
    expect(refNumber("4.2")).toBe("4.2");
  });

  it("writes a run of refs as prose", () => {
    expect(refRange([])).toBe("");
    expect(refRange(["Section 9.1"])).toBe("Section 9.1");
    expect(refRange(["Section 9.1", "Section 9.2", "Section 9.4"])).toBe("Sections 9.1–9.4");
  });
});
