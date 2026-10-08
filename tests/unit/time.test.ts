import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  atIst,
  dateKeyOf,
  formatDay,
  formatDayClock,
  formatLongDate,
  formatRelative,
  formatTime,
  isWorkingDay,
  lastSafeStart,
  leadTimeCompletion,
  leadTimeFinishDay,
  nextWorkingDay,
  nextWorkingTime,
  previousWorkingDay,
  workingDaysBetween,
} from "@/domain/time";

describe("IST time helpers", () => {
  it("converts IST wall time to UTC and back", () => {
    const d = atIst("2026-10-16", "09:15");
    expect(d.toISOString()).toBe("2026-10-16T03:45:00.000Z");
    expect(dateKeyOf(d)).toBe("2026-10-16");
    expect(formatTime(d)).toBe("09:15");
  });

  it("keeps the IST date when UTC is still on the previous day", () => {
    expect(dateKeyOf(atIst("2026-10-20", "01:00"))).toBe("2026-10-20");
  });

  it("rejects malformed input", () => {
    expect(() => atIst("2026-10", "09:00")).toThrow();
  });

  it("formats days the way the product copy does", () => {
    const d = atIst("2026-10-15", "10:43");
    expect(formatDay(d)).toBe("Thu 15 Oct");
    expect(formatDayClock(d)).toBe("Thu 15 Oct · 10:43");
    expect(formatLongDate(atIst("2026-10-19"))).toBe("Mon, 19 Oct 2026");
  });

  it("formats relative times", () => {
    const now = atIst("2026-10-15", "11:00");
    expect(formatRelative(atIst("2026-10-15", "10:43"), now)).toBe("10:43");
    expect(formatRelative(atIst("2026-10-14", "09:17"), now)).toBe("Wed");
    expect(formatRelative(atIst("2026-10-14", "09:17"), now, true)).toBe("Wed 09:17");
    expect(formatRelative(atIst("2026-10-06", "09:17"), now)).toBe("6 Oct");
  });
});

describe("working days", () => {
  it("skips weekends and company holidays", () => {
    expect(isWorkingDay("2026-10-15")).toBe(true);
    expect(isWorkingDay("2026-10-17")).toBe(false);
    expect(isWorkingDay("2026-10-02")).toBe(false);
    expect(nextWorkingDay("2026-10-16")).toBe("2026-10-19");
    expect(nextWorkingDay("2026-10-01")).toBe("2026-10-05");
    expect(previousWorkingDay("2026-10-19")).toBe("2026-10-16");
  });

  it("adds working days", () => {
    expect(addWorkingDays("2026-10-07", 4)).toBe("2026-10-13");
    expect(addWorkingDays("2026-10-16", 0)).toBe("2026-10-16");
    expect(() => addWorkingDays("2026-10-16", -1)).toThrow();
  });

  it("counts working days strictly between two dates", () => {
    expect(workingDaysBetween("2026-10-16", "2026-10-19")).toBe(0);
    expect(workingDaysBetween("2026-10-15", "2026-10-19")).toBe(1);
    expect(workingDaysBetween("2026-10-19", "2026-10-15")).toBe(0);
  });

  it("counts the request day only before the noon cut-off", () => {
    expect(leadTimeFinishDay(atIst("2026-10-15", "10:44"), 2)).toBe("2026-10-16");
    expect(leadTimeFinishDay(atIst("2026-10-15", "13:00"), 2)).toBe("2026-10-19");
    expect(leadTimeFinishDay(atIst("2026-10-17", "10:00"), 1)).toBe("2026-10-19");
    expect(leadTimeCompletion(atIst("2026-10-15", "10:44"), 2).toISOString()).toBe(atIst("2026-10-16", "18:00").toISOString());
    expect(leadTimeCompletion(atIst("2026-10-15", "10:44"), 0).toISOString()).toBe(atIst("2026-10-15", "10:44").toISOString());
  });

  it("finds the last safe start for a lead time before Day 1", () => {
    expect(lastSafeStart(atIst("2026-10-19", "09:00"), 2).toISOString()).toBe(atIst("2026-10-15", "12:00").toISOString());
    expect(lastSafeStart(atIst("2026-10-19", "19:00"), 1).toISOString()).toBe(atIst("2026-10-19", "12:00").toISOString());
  });

  it("finds the next working time slot", () => {
    expect(nextWorkingTime(atIst("2026-10-07", "18:00"), "09:15").toISOString()).toBe(atIst("2026-10-08", "09:15").toISOString());
    expect(nextWorkingTime(atIst("2026-10-16", "10:00"), "09:15").toISOString()).toBe(atIst("2026-10-19", "09:15").toISOString());
    expect(nextWorkingTime(atIst("2026-10-15", "08:00"), "09:15").toISOString()).toBe(atIst("2026-10-15", "09:15").toISOString());
  });
});
