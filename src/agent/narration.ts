/**
 * Navo's voice: plain, short sentences. Facts, owners, dates. No exclamation marks.
 * Templates are the source of truth; a Claude narrator may rephrase them (with the
 * same facts) when an API key is configured, and falls back to these on any failure.
 */

export type UpdateKind =
  | "risk_detected"
  | "blocker_cleared"
  | "escalated"
  | "needs_approval"
  | "covered_by_loaner"
  | "ready_for_day1"
  | "relevant_now";

export interface UpdateFacts {
  kind: UpdateKind;
  /** Short facts the message must stay faithful to. */
  facts: Record<string, string>;
}

export interface Narration {
  text: string;
  composedBy: "claude" | "template";
}

export interface Narrator {
  employeeUpdate(update: UpdateFacts): Promise<Narration>;
}

export function templateUpdate({ kind, facts }: UpdateFacts): string {
  switch (kind) {
    case "risk_detected":
      return `Your ${facts.blocker} is ${facts.lateBy} late, and the ${facts.dependent} needs it plus ${facts.leadTime}. I followed up with ${facts.owner}. You don't need to do anything.`;
    case "blocker_cleared":
      return `Your ${facts.blocker} is ready. I've sent the ${facts.requests} to IT. No action needed from you.`;
    case "escalated":
      return `${facts.owner} hasn't replied in 24 hours. I escalated to ${facts.escalatedTo}.${facts.backup ? ` ${facts.backup}` : ""}`;
    case "needs_approval":
      return `${facts.question} ${facts.detail}`;
    case "covered_by_loaner":
      return `Day 1 is covered. A loaner laptop will be at ${facts.site} on Monday 9:00. I'm still chasing your ${facts.blocker}.`;
    case "ready_for_day1":
      return `You're ready for Monday. Your ID card, laptop and kit are waiting at ${facts.site}, ${facts.when}.`;
    case "relevant_now":
      return `${facts.headline} ${facts.detail}`;
  }
}

export const templateNarrator: Narrator = {
  async employeeUpdate(update) {
    return { text: templateUpdate(update), composedBy: "template" };
  },
};
