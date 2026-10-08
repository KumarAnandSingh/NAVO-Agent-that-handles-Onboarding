import { atIst } from "@/domain/time";

/**
 * The demo calendar, in one place. The story keeps the design's weekdays (risk spotted on
 * a Thursday, Friday is the last working day, Day 1 is a Monday) on real 2026 dates.
 */
export const TIMELINE = {
  application: "2026-09-17",
  assessment: "2026-09-28",
  interview: "2026-10-01",
  offerSigned: "2026-10-05",
  offerAccepted: "2026-10-06",
  /** Wednesday evening Anand first opens Navo. */
  firstLaunch: "2026-10-07",
  day1: "2026-10-19",
  trainingDue: "2026-10-18",
  week1End: "2026-10-23",
  benefitsDeadline: "2026-10-26",
  first30End: "2026-11-18",
  first90End: "2027-01-17",
} as const;

export const WORKSPACE_START = atIst(TIMELINE.firstLaunch, "18:00");
export const DAY1_START = atIst(TIMELINE.day1, "09:00");
