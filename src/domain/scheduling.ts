/** Finding a free half hour on the joiner's calendar. Pure: no I/O. */
import { addMinutes, atIst, dateKeyOf, HALDEN_CALENDAR, isWorkingDay, nextWorkingDay, type WorkingCalendar } from "./time";

const WALKTHROUGH_TIMES = ["11:30", "14:00", "15:00", "16:30"] as const;
export const WALKTHROUGH_MINUTES = 30;

/**
 * First half-hour slot today or the next working day that is at least 30 minutes away
 * and doesn't overlap anything on the joiner's calendar.
 */
export function findFreeSlot(now: Date, busy: readonly { startsAt: Date; endsAt: Date }[], calendar: WorkingCalendar = HALDEN_CALENDAR): { startsAt: Date; endsAt: Date } | null {
  const earliest = addMinutes(now, 30).getTime();
  let day = isWorkingDay(dateKeyOf(now), calendar) ? dateKeyOf(now) : nextWorkingDay(dateKeyOf(now), calendar);
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const time of WALKTHROUGH_TIMES) {
      const startsAt = atIst(day, time);
      const endsAt = addMinutes(startsAt, WALKTHROUGH_MINUTES);
      if (startsAt.getTime() < earliest) continue;
      if (busy.some((e) => e.startsAt.getTime() < endsAt.getTime() && startsAt.getTime() < e.endsAt.getTime())) continue;
      return { startsAt, endsAt };
    }
    day = nextWorkingDay(day, calendar);
  }
  return null;
}
