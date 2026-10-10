import { describe, expect, it } from "vitest";
import { atIst } from "@/domain/time";
import { expectedReadyAt } from "@/mock-systems/it";

const DAY1 = atIst("2026-10-19", "09:00");
const iso = (d: Date) => d.toISOString();

describe("mock IT service desk lead times", () => {
  it("follows the provisioning policy for each kind of request", () => {
    const thursday = atIst("2026-10-15", "10:44");
    expect(iso(expectedReadyAt("laptop", thursday, DAY1))).toBe(iso(atIst("2026-10-16", "10:05")));
    expect(iso(expectedReadyAt("email", thursday, DAY1))).toBe(iso(atIst("2026-10-15", "15:00")));
    expect(iso(expectedReadyAt("tool_access", thursday, DAY1))).toBe(iso(atIst("2026-10-19", "16:00")));
    expect(iso(expectedReadyAt("vpn", thursday, DAY1))).toBe(iso(atIst("2026-10-15", "10:49")));
  });

  it("switches accounts on at 09:00 on Day 1, or straight away once Day 1 has started", () => {
    expect(iso(expectedReadyAt("access", atIst("2026-10-15", "10:44"), DAY1))).toBe(iso(DAY1));
    expect(iso(expectedReadyAt("access", atIst("2026-10-19", "11:00"), DAY1))).toBe(iso(atIst("2026-10-19", "11:05")));
  });

  it("issues a loaner from stock by 16:00, or within 30 minutes on Day 1", () => {
    expect(iso(expectedReadyAt("loaner", atIst("2026-10-15", "11:30"), DAY1))).toBe(iso(atIst("2026-10-15", "16:00")));
    expect(iso(expectedReadyAt("loaner", atIst("2026-10-15", "13:30"), DAY1))).toBe(iso(atIst("2026-10-16", "16:00")));
    expect(iso(expectedReadyAt("loaner", atIst("2026-10-19", "10:00"), DAY1))).toBe(iso(atIst("2026-10-19", "10:30")));
  });
});
