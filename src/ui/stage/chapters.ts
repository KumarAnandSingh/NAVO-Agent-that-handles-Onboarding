import { TIMELINE, WORKSPACE_START } from "@/content/timeline";
import { atIst, formatDay, formatShortDate } from "@/domain/time";
import type { Screen } from "@/ui/state/NavoStore";

export interface ChapterMeta {
  name: string;
  when: string;
  /** Where the phone opens when the presenter jumps to this chapter. */
  screen: Screen;
  notice: string;
}

/** The six chapters of the story, as the presenter panel shows them. */
export const CHAPTERS: readonly ChapterMeta[] = [
  {
    name: "First launch",
    when: "Sign in · meet Navo",
    screen: "launch",
    notice: "Navo introduces itself and its limits: what it does alone, and what it always asks first.",
  },
  {
    name: "Documents and forms",
    when: formatDay(WORKSPACE_START),
    screen: "docs",
    notice: "Navo reads the documents itself. It asks Anand about one unclear date and one missing file, then pre-fills the forms.",
  },
  {
    name: "Pre-joining: Navo at work",
    when: formatDay(atIst(TIMELINE.riskDay, "09:00")),
    screen: "home",
    notice: "Press Advance time. Watch the face, the status line and the tool calls as Navo catches the late Employee ID and acts. Try the HR owner view too.",
  },
  {
    name: "Ready for Day 1",
    when: formatDay(atIst(TIMELINE.readyDay, "09:00")),
    screen: "idcard",
    notice: "One trip for ID card, laptop and kit. Navo coordinated HR, IT and Facilities.",
  },
  {
    name: "Day 1",
    when: formatDay(atIst(TIMELINE.day1, "09:00")),
    screen: "day1",
    notice: "Navo runs the day and closes the requests once Anand confirms what he collected.",
  },
  {
    name: "Week 1 to Day 30",
    when: `${formatShortDate(atIst(TIMELINE.week1End, "09:00"))} – ${formatShortDate(atIst(TIMELINE.first30End, "09:00"))}`,
    screen: "week1",
    notice: "Navo keeps going after Day 1: a benefits deadline at the right moment, a booked walkthrough, the 30-day check-in.",
  },
];

const SCREEN_CHAPTER: Record<Screen, number> = {
  launch: 0,
  signin: 0,
  meet: 0,
  docs: 1,
  privacy: 1,
  clarify: 1,
  forms: 1,
  home: 2,
  culture: 2,
  idtrack: 2,
  journey: 2,
  updates: 2,
  idcard: 3,
  pickup: 3,
  day1: 4,
  confirm: 4,
  day1done: 4,
  week1: 5,
  benefits: 5,
  day30: 5,
};

export function chapterOfScreen(screen: Screen): number {
  return SCREEN_CHAPTER[screen];
}

export const HR_NOTICE = "Priya sees only exceptions. Press Generate ID: Navo raises the IT requests and Anand's app updates.";
