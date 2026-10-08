import { describe, expect, it } from "vitest";
import { hoursOpen, isBreached, slaDueAt } from "@/domain/sla";
import { atIst } from "@/domain/time";

describe("reminder SLA", () => {
  const sentAt = atIst("2026-10-15", "09:17");
  const followUp = { sentAt, slaDueAt: slaDueAt(sentAt), status: "open" as const };

  it("gives owners 24 hours", () => {
    expect(followUp.slaDueAt.toISOString()).toBe(atIst("2026-10-16", "09:17").toISOString());
  });

  it("is breached only once the window has passed and the reminder is unresolved", () => {
    expect(isBreached(followUp, atIst("2026-10-16", "09:00"))).toBe(false);
    expect(isBreached(followUp, atIst("2026-10-16", "09:17"))).toBe(true);
    expect(isBreached({ ...followUp, status: "resolved" }, atIst("2026-10-17", "09:00"))).toBe(false);
  });

  it("measures how long a reminder has been open", () => {
    expect(hoursOpen(followUp, atIst("2026-10-15", "21:17"))).toBe(12);
    expect(hoursOpen(followUp, atIst("2026-10-15", "08:00"))).toBe(0);
  });
});
