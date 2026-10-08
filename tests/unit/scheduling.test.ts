import { describe, expect, it } from "vitest";
import { findFreeSlot } from "@/domain/scheduling";
import { addMinutes, atIst, formatDayClock } from "@/domain/time";

const busy = (day: string, start: string, minutes: number) => {
  const startsAt = atIst(day, start);
  return { startsAt, endsAt: addMinutes(startsAt, minutes) };
};

describe("findFreeSlot", () => {
  it("picks the first free half hour today, at least 30 minutes ahead", () => {
    const slot = findFreeSlot(atIst("2026-10-23", "09:00"), []);
    expect(slot && formatDayClock(slot.startsAt)).toBe("Fri 23 Oct · 11:30");
  });

  it("skips slots that overlap the calendar", () => {
    const slot = findFreeSlot(atIst("2026-10-23", "09:00"), [busy("2026-10-23", "11:00", 60), busy("2026-10-23", "14:00", 30)]);
    expect(slot && formatDayClock(slot.startsAt)).toBe("Fri 23 Oct · 15:00");
  });

  it("rolls to the next working day after the last slot, skipping the weekend", () => {
    const slot = findFreeSlot(atIst("2026-10-23", "16:30"), []);
    expect(slot && formatDayClock(slot.startsAt)).toBe("Mon 26 Oct · 11:30");
  });

  it("returns null when a whole week is booked", () => {
    const days = ["2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
    const slot = findFreeSlot(atIst("2026-10-23", "08:00"), days.map((d) => busy(d, "09:00", 9 * 60)));
    expect(slot).toBeNull();
  });
});
