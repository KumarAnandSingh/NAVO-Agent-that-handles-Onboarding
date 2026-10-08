/**
 * Simulated time helpers. All demo times are Asia/Kolkata (IST, UTC+05:30, no DST),
 * so a fixed offset is exact and keeps the arithmetic dependency-free and testable.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 18;
/** Requests raised before this local hour count today as their first working day. */
export const SAME_DAY_CUTOFF_HOUR = 12;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A calendar date in IST, formatted YYYY-MM-DD. */
export type DateKey = string;

export interface IstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export function istParts(date: Date): IstParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Build a Date from an IST calendar date and wall-clock time ("09:15"). */
export function atIst(dateKey: DateKey, time = "00:00"): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error(`Invalid IST date/time: ${dateKey} ${time}`);
  }
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS);
}

export function dateKeyOf(date: Date): DateKey {
  const p = istParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addCalendarDays(dateKey: DateKey, days: number): DateKey {
  return dateKeyOf(new Date(atIst(dateKey, "12:00").getTime() + days * DAY_MS));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}

export function weekdayOf(dateKey: DateKey): number {
  return istParts(atIst(dateKey, "12:00")).weekday;
}

export interface WorkingCalendar {
  /** Company holidays (YYYY-MM-DD) on which no work happens. */
  holidays: ReadonlySet<DateKey>;
}

export const HALDEN_CALENDAR: WorkingCalendar = {
  holidays: new Set(["2026-10-02", "2026-12-25"]),
};

export function isWorkingDay(dateKey: DateKey, calendar: WorkingCalendar = HALDEN_CALENDAR): boolean {
  const weekday = weekdayOf(dateKey);
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.has(dateKey);
}

export function nextWorkingDay(dateKey: DateKey, calendar: WorkingCalendar = HALDEN_CALENDAR): DateKey {
  let key = addCalendarDays(dateKey, 1);
  while (!isWorkingDay(key, calendar)) key = addCalendarDays(key, 1);
  return key;
}

/** The n-th working day after dateKey (n >= 1). */
export function addWorkingDays(dateKey: DateKey, n: number, calendar: WorkingCalendar = HALDEN_CALENDAR): DateKey {
  if (n < 0) throw new Error("addWorkingDays expects n >= 0");
  let key = dateKey;
  for (let i = 0; i < n; i++) key = nextWorkingDay(key, calendar);
  return key;
}

/** Number of working days strictly between two dates (exclusive of both ends). */
export function workingDaysBetween(fromKey: DateKey, toKey: DateKey, calendar: WorkingCalendar = HALDEN_CALENDAR): number {
  if (toKey <= fromKey) return 0;
  let count = 0;
  let key = addCalendarDays(fromKey, 1);
  while (key < toKey) {
    if (isWorkingDay(key, calendar)) count++;
    key = addCalendarDays(key, 1);
  }
  return count;
}

/**
 * First working day that counts towards a lead time for work requested at `requestedAt`.
 * Requests made on a working day before the cut-off count that day; otherwise the next working day.
 */
export function firstLeadDay(requestedAt: Date, calendar: WorkingCalendar = HALDEN_CALENDAR): DateKey {
  const key = dateKeyOf(requestedAt);
  const { hour } = istParts(requestedAt);
  if (isWorkingDay(key, calendar) && hour < SAME_DAY_CUTOFF_HOUR) return key;
  return nextWorkingDay(key, calendar);
}

/**
 * The working day on which work with a lead time of `leadDays` finishes, counting the
 * request day when it was raised before the cut-off.
 */
export function leadTimeFinishDay(requestedAt: Date, leadDays: number, calendar: WorkingCalendar = HALDEN_CALENDAR): DateKey {
  if (leadDays <= 0) return dateKeyOf(requestedAt);
  return addWorkingDays(firstLeadDay(requestedAt, calendar), leadDays - 1, calendar);
}

/** Conservative completion estimate: end of business on the finishing working day. */
export function leadTimeCompletion(requestedAt: Date, leadDays: number, calendar: WorkingCalendar = HALDEN_CALENDAR): Date {
  if (leadDays <= 0) return requestedAt;
  return atIst(leadTimeFinishDay(requestedAt, leadDays, calendar), `${WORKDAY_END_HOUR}:00`);
}

/** Latest moment work with this lead time can start and still finish before `deadline`. */
export function lastSafeStart(deadline: Date, leadDays: number, calendar: WorkingCalendar = HALDEN_CALENDAR): Date {
  // The finishing day must end before the deadline: walk back from the last working day before it.
  let finishDay = dateKeyOf(deadline);
  if (istParts(deadline).hour < WORKDAY_END_HOUR || !isWorkingDay(finishDay, calendar)) {
    finishDay = previousWorkingDay(finishDay, calendar);
  }
  let firstDay = finishDay;
  for (let i = 1; i < leadDays; i++) firstDay = previousWorkingDay(firstDay, calendar);
  return atIst(firstDay, `${pad(SAME_DAY_CUTOFF_HOUR)}:00`);
}

export function previousWorkingDay(dateKey: DateKey, calendar: WorkingCalendar = HALDEN_CALENDAR): DateKey {
  let key = addCalendarDays(dateKey, -1);
  while (!isWorkingDay(key, calendar)) key = addCalendarDays(key, -1);
  return key;
}

/** Next occurrence of a wall-clock time on a working day, strictly after `after`. */
export function nextWorkingTime(after: Date, time: string, calendar: WorkingCalendar = HALDEN_CALENDAR): Date {
  let key = dateKeyOf(after);
  for (let i = 0; i < 30; i++) {
    const candidate = atIst(key, time);
    if (candidate.getTime() > after.getTime() && isWorkingDay(key, calendar)) return candidate;
    key = addCalendarDays(key, 1);
  }
  throw new Error("No working time found within 30 days");
}

/* ---------- Formatting (IST) ---------- */

export function formatTime(date: Date): string {
  const p = istParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Thu 16 Oct" */
export function formatDay(date: Date): string {
  const p = istParts(date);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "16 Oct" */
export function formatShortDate(date: Date): string {
  const p = istParts(date);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "Mon, 20 Oct 2026" */
export function formatLongDate(date: Date): string {
  const p = istParts(date);
  return `${WEEKDAYS[p.weekday]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[istParts(date).weekday] ?? "";
}

/** "Thu 16 Oct · 09:15" */
export function formatDayClock(date: Date): string {
  return `${formatDay(date)} · ${formatTime(date)}`;
}

/**
 * Time label relative to "now" in the simulation: "10:43" today, "Wed" this week,
 * "Wed 18:20" when `withTime`, otherwise "8 Oct".
 */
export function formatRelative(date: Date, now: Date, withTime = false): string {
  const dayDiff = Math.round((atIst(dateKeyOf(now)).getTime() - atIst(dateKeyOf(date)).getTime()) / DAY_MS);
  if (dayDiff === 0) return formatTime(date);
  if (dayDiff > 0 && dayDiff < 7) return withTime ? `${weekdayName(date)} ${formatTime(date)}` : weekdayName(date);
  return formatShortDate(date);
}

/** How a person says a time near `now`: "09:17 today", "tomorrow at 09:17", else "Fri 16 Oct · 09:17". */
export function spokenTime(date: Date, now: Date): string {
  const days = calendarDaysUntil(now, date);
  if (days === 0) return `${formatTime(date)} today`;
  if (days === 1) return `tomorrow at ${formatTime(date)}`;
  if (days === -1) return `yesterday at ${formatTime(date)}`;
  return formatDayClock(date);
}

export function calendarDaysUntil(from: Date, to: Date): number {
  return Math.round((atIst(dateKeyOf(to)).getTime() - atIst(dateKeyOf(from)).getTime()) / DAY_MS);
}
