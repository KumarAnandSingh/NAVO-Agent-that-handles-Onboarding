/**
 * Ask Navo without Claude: recognise the common questions and answer from live state and
 * retrieved policy, through the same audited registry tools. Used offline, over budget,
 * or when Claude fails or times out. It only cites sections search_policies returned.
 */
import type { AgentContext } from "@/agent/context";
import { calculateDay1Risk, getCalendar, getEmployeeContext, getFollowUps, getOnboardingState, searchPolicyLibrary } from "@/agent/tools";
import { callTool } from "@/agent/tools/registry";
import { COMPANY } from "@/content/company";
import { formatDayClock, spokenTime } from "@/domain/time";
import type { PolicyHit } from "@/services/policy-retrieval";
import { listPeople } from "@/services/onboarding-state/repository";

export interface DraftAnswer {
  text: string;
  checked: string[];
  sections: PolicyHit[];
  showActivity: boolean;
}

export type Intent = "hr_silent" | "bring" | "health_cover" | "laptop" | "general";

const INTENTS: [Intent, RegExp][] = [
  ["hr_silent", /\b(hr|respond|reply|replied|escalat\w*|employee id|chase|ignored?)\b/i],
  ["bring", /\b(bring|carry|monday|day ?1|day one|first day|pick ?up|collect)\b/i],
  ["health_cover", /\b(parents?|insurance|health|cover|medical|benefits?)\b/i],
  ["laptop", /\b(laptop|vpn|e-?mail|access|computer)\b/i],
];

export function intentOf(question: string): Intent {
  return INTENTS.find(([, pattern]) => pattern.test(question))?.[0] ?? "general";
}

export async function fallbackAnswer(ctx: AgentContext, question: string): Promise<DraftAnswer> {
  const checked: string[] = [];
  const sections: PolicyHit[] = [];
  const search = async (query: string) => {
    const result = await callTool(ctx, searchPolicyLibrary, { query, limit: 3 });
    for (const hit of result.data) if (!sections.some((s) => s.ref === hit.ref)) sections.push(hit);
    return result.data;
  };
  /** " (§4.2)" when that section was retrieved, else nothing: never cite what wasn't read. */
  const cite = (ref: string) => (sections.some((s) => s.ref === ref) ? ` (${ref})` : "");
  const people = await listPeople(ctx.db, ctx.workspace.id);
  const nameOf = (id: string) => people.get(id)?.name ?? id;

  let text: string;
  let showActivity = false;

  switch (intentOf(question)) {
    case "hr_silent": {
      const { data } = await callTool(ctx, getFollowUps, { employeeId: ctx.employeeId });
      const risk = await callTool(ctx, calculateDay1Risk, { employeeId: ctx.employeeId });
      checked.push("Navo's follow-ups", "Day 1 risk");
      await search("reminder not answered 24 hours escalate HR operations lead");
      const reminder = data.followUps.find((f) => f.kind === "reminder");
      const escalation = data.followUps.find((f) => f.kind === "escalation");
      const safe = risk.data.driverLastSafeStart;
      showActivity = Boolean(reminder || escalation);
      if (escalation && escalation.status !== "resolved") {
        text = `HR didn't reply within 24 hours, so I escalated to ${nameOf(escalation.toPersonId)}, the HR Ops lead, at ${spokenTime(escalation.sentAt, ctx.clock)}${cite("§4.2")}. You don't need to chase anyone.`;
      } else if (reminder && reminder.status !== "resolved") {
        const loaner = safe && safe.getTime() > ctx.clock.getTime() ? ` If the ID still isn't there by ${spokenTime(safe, ctx.clock)}, I'll ask you about a loaner laptop so Day 1 isn't affected.` : "";
        text = `I reminded ${nameOf(reminder.toPersonId)} at ${spokenTime(reminder.sentAt, ctx.clock)}. If there's no reply by ${spokenTime(reminder.slaDueAt, ctx.clock)}, I escalate to the HR Ops lead${cite("§4.2")}.${loaner} You don't need to chase anyone.`;
      } else if (reminder || escalation) {
        text = `HR has already answered, so nothing is waiting on them. If a reminder ever goes unanswered for 24 hours, I escalate to the HR Ops lead${cite("§4.2")}.`;
      } else {
        text = `If HR is late with anything, I remind them automatically. If a reminder isn't answered within 24 hours, I escalate to the HR Ops lead${cite("§4.2")}. You don't need to chase anyone.`;
      }
      break;
    }
    case "bring": {
      const { data: events } = await callTool(ctx, getCalendar, { employeeId: ctx.employeeId });
      checked.push("your calendar");
      await search("Day 1 arrival bring PAN photo ID");
      await search("pickup ID card laptop kit Building B");
      const induction = events.find((e) => e.kind === "induction");
      const pickup = events.find((e) => e.kind === "pickup");
      const start = induction ? ` Induction is ${formatDayClock(induction.startsAt)}, ${induction.location}.` : "";
      const collect = pickup
        ? ` Your ID card, laptop and kit are waiting at ${pickup.location}, ${formatDayClock(pickup.startsAt)}, all in one trip${cite("§6.2")}.`
        : ` Your ID card, laptop and kit are collected together at ${COMPANY.pickupSite}, and I'll book one pickup slot once they're ready${cite("§6.2")}.`;
      text = `Bring your PAN card and one photo ID for building access${cite("§6.1")}.${start}${collect}`;
      break;
    }
    case "health_cover": {
      const { data: profile } = await callTool(ctx, getEmployeeContext, { employeeId: ctx.employeeId });
      checked.push("your profile");
      await search("health cover parents spouse children enrol");
      const family = profile.family;
      const covered = family?.maritalStatus === "married" ? (family.children ? "You, your spouse and your child" : "You and your spouse") : "You";
      if (sections.some((s) => s.ref === "§3.2")) {
        text = /parents?/i.test(question)
          ? `Yes. Parents can be added for ₹1,200 a month, deducted from salary${cite("§3.2")}. ${covered} are covered with a sum insured of ₹5,00,000. Enrol within 7 days of joining; I'll bring it up when it opens.`
          : `${covered} are covered with a sum insured of ₹5,00,000${cite("§3.2")}. Parents are optional at ₹1,200 a month. Enrol within 7 days of joining; I'll bring it up when it opens.`;
      } else {
        text = `I couldn't find the health cover policy just now. ${COMPANY.name} HR can confirm the details.`;
      }
      break;
    }
    case "laptop": {
      const { data: tasks } = await callTool(ctx, getOnboardingState, { employeeId: ctx.employeeId });
      checked.push("your onboarding");
      await search("laptop Employee ID working days");
      const laptop = tasks.find((t) => t.key === "laptop");
      const status = laptop?.status === "completed" ? "ready" : (laptop?.statusNote ?? "waiting on your Employee ID");
      text = `Your laptop: ${status.charAt(0).toLowerCase()}${status.slice(1)}. A laptop needs your Employee ID plus 2 working days${cite("§5.1")}, and I track both for you.`;
      break;
    }
    default: {
      const hits = await search(question);
      const top = hits[0];
      if (top) {
        const firstTwo = top.body.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
        text = `${top.documentTitle} says: ${firstTwo}${cite(top.ref)}`;
      } else {
        text = `I can only answer from your onboarding record and ${COMPANY.name}'s policies, and I don't see that there. Your HR owner can help.`;
      }
    }
  }

  const cited = sections.filter((s) => text.includes(`(${s.ref})`));
  return { text, checked: [...cited.map((s) => `${s.documentTitle} ${s.ref}`), ...checked], sections: cited, showActivity };
}
