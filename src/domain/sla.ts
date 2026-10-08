import { addHours } from "./time";

export const REMINDER_SLA_HOURS = 24;

export interface FollowUpLike {
  sentAt: Date;
  slaDueAt: Date;
  status: "open" | "resolved" | "breached";
}

export function slaDueAt(sentAt: Date, hours = REMINDER_SLA_HOURS): Date {
  return addHours(sentAt, hours);
}

export function hoursOpen(followUp: Pick<FollowUpLike, "sentAt">, now: Date): number {
  return Math.max(0, (now.getTime() - followUp.sentAt.getTime()) / 3_600_000);
}

/** An open follow-up whose response window has passed. */
export function isBreached(followUp: FollowUpLike, now: Date): boolean {
  return followUp.status !== "resolved" && now.getTime() >= followUp.slaDueAt.getTime();
}
