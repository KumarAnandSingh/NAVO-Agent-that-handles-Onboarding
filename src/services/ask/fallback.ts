/**
 * Ask Navo without Claude: recognise the common questions and answer from live state and
 * retrieved policy, through the same audited registry tools. Used offline, over budget,
 * or when Claude fails or times out. It only cites sections search_policies returned.
 * A question written in Hindi (Devanagari) gets the same facts in Hindi.
 */
import type { AgentContext } from "@/agent/context";
import { calculateDay1Risk, getCalendar, getEmployeeContext, getFollowUps, getOnboardingState, searchPolicyLibrary } from "@/agent/tools";
import { callTool } from "@/agent/tools/registry";
import { COMPANY } from "@/content/company";
import { calendarDaysUntil, formatDayClock, formatTime, spokenTime } from "@/domain/time";
import type { PolicyHit } from "@/services/policy-retrieval";
import { listPeople } from "@/services/onboarding-state/repository";

export interface DraftAnswer {
  text: string;
  checked: string[];
  sections: PolicyHit[];
  showActivity: boolean;
}

export type Intent = "hr_silent" | "bring" | "health_cover" | "laptop" | "general";
export type Language = "en" | "hi";

/** English keywords use word boundaries; Hindi ones can't (Devanagari isn't a \w character). */
const INTENTS: [Intent, RegExp, RegExp][] = [
  ["hr_silent", /\b(hr|respond|reply|replied|escalat\w*|employee id|chase|ignored?)\b/i, /जवाब|उत्तर|याद दिला|कर्मचारी आईडी/],
  ["bring", /\b(bring|carry|monday|day ?1|day one|first day|pick ?up|collect)\b/i, /लाना|लाऊँ|लाऊं|लेकर आ|पहले दिन|पहला दिन|सोमवार/],
  ["health_cover", /\b(parents?|insurance|health|cover|medical|benefits?)\b/i, /बीमा|माता|पिता|स्वास्थ्य|मेडिकल|इलाज/],
  ["laptop", /\b(laptop|vpn|e-?mail|access|computer)\b/i, /लैपटॉप|ईमेल|कंप्यूटर/],
];

export function intentOf(question: string): Intent {
  return INTENTS.find(([, en, hi]) => en.test(question) || hi.test(question))?.[0] ?? "general";
}

export function languageOf(question: string): Language {
  return /[ऀ-ॿ]/.test(question) ? "hi" : "en";
}

/** "आज 09:17 बजे", "कल 09:17 बजे", or the day and time. */
function hindiTime(date: Date, now: Date): string {
  const days = calendarDaysUntil(now, date);
  if (days === 0) return `आज ${formatTime(date)} बजे`;
  if (days === 1) return `कल ${formatTime(date)} बजे`;
  if (days === -1) return `कल ${formatTime(date)} बजे`;
  return formatDayClock(date);
}

export async function fallbackAnswer(ctx: AgentContext, question: string): Promise<DraftAnswer> {
  const hi = languageOf(question) === "hi";
  const checked: string[] = [];
  const sections: PolicyHit[] = [];
  const search = async (query: string) => {
    const result = await callTool(ctx, searchPolicyLibrary, { query, limit: 3 });
    for (const hit of result.data) if (!sections.some((s) => s.ref === hit.ref)) sections.push(hit);
    return result.data;
  };
  /** " (Section 4.2)" when that section was retrieved, else nothing: never cite what wasn't read. */
  const cite = (ref: string) => (sections.some((s) => s.ref === ref) ? ` (${ref})` : "");
  const when = (date: Date) => (hi ? hindiTime(date, ctx.clock) : spokenTime(date, ctx.clock));
  const end = hi ? "।" : ".";
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
      const noChase = hi ? " आपको किसी के पीछे नहीं पड़ना है।" : " You don't need to chase anyone.";
      showActivity = Boolean(reminder || escalation);
      if (escalation && escalation.status !== "resolved") {
        const lead = nameOf(escalation.toPersonId);
        text = hi
          ? `HR ने 24 घंटे में जवाब नहीं दिया, इसलिए मैंने ${when(escalation.sentAt)} HR Ops lead ${lead} को escalate किया${cite("Section 4.2")}।${noChase}`
          : `HR didn't reply within 24 hours, so I escalated to ${lead}, the HR Ops lead, at ${when(escalation.sentAt)}${cite("Section 4.2")}.${noChase}`;
      } else if (reminder && reminder.status !== "resolved") {
        const owner = nameOf(reminder.toPersonId);
        const loanerDue = safe && safe.getTime() > ctx.clock.getTime() ? safe : null;
        const loaner = loanerDue
          ? hi
            ? ` अगर ${when(loanerDue)} तक ID नहीं आती, तो मैं आपसे loaner laptop के बारे में पूछूँगा ताकि Day 1 पर असर न पड़े।`
            : ` If the ID still isn't there by ${when(loanerDue)}, I'll ask you about a loaner laptop so Day 1 isn't affected.`
          : "";
        text = hi
          ? `मैंने ${when(reminder.sentAt)} ${owner} को याद दिलाया है। अगर ${when(reminder.slaDueAt)} तक जवाब नहीं आता, तो मैं HR Ops lead को escalate करूँगा${cite("Section 4.2")}।${loaner}${noChase}`
          : `I reminded ${owner} at ${when(reminder.sentAt)}. If there's no reply by ${when(reminder.slaDueAt)}, I escalate to the HR Ops lead${cite("Section 4.2")}.${loaner}${noChase}`;
      } else if (reminder || escalation) {
        text = hi
          ? `HR जवाब दे चुका है, इसलिए उन पर कुछ बाकी नहीं है। अगर कभी किसी reminder का 24 घंटे में जवाब नहीं आता, तो मैं HR Ops lead को escalate करता हूँ${cite("Section 4.2")}।`
          : `HR has already answered, so nothing is waiting on them. If a reminder ever goes unanswered for 24 hours, I escalate to the HR Ops lead${cite("Section 4.2")}.`;
      } else {
        text = hi
          ? `अगर HR किसी चीज़ में देर करता है, तो मैं उन्हें अपने आप याद दिलाता हूँ। 24 घंटे में जवाब न आए तो मैं HR Ops lead को escalate करता हूँ${cite("Section 4.2")}।${noChase}`
          : `If HR is late with anything, I remind them automatically. If a reminder isn't answered within 24 hours, I escalate to the HR Ops lead${cite("Section 4.2")}.${noChase}`;
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
      if (hi) {
        const start = induction ? ` Induction ${formatDayClock(induction.startsAt)} को है, ${induction.location}।` : "";
        const collect = pickup
          ? ` आपका ID card, laptop और kit ${pickup.location} पर ${formatDayClock(pickup.startsAt)} को एक ही बार में मिलेंगे${cite("Section 6.2")}।`
          : ` आपका ID card, laptop और kit ${COMPANY.pickupSite} पर एक साथ मिलते हैं; तैयार होते ही मैं एक pickup slot book करूँगा${cite("Section 6.2")}।`;
        text = `Building access के लिए अपना PAN card और एक photo ID लाएँ${cite("Section 6.1")}।${start}${collect}`;
      } else {
        const start = induction ? ` Induction is ${formatDayClock(induction.startsAt)}, ${induction.location}.` : "";
        const collect = pickup
          ? ` Your ID card, laptop and kit are waiting at ${pickup.location}, ${formatDayClock(pickup.startsAt)}, all in one trip${cite("Section 6.2")}.`
          : ` Your ID card, laptop and kit are collected together at ${COMPANY.pickupSite}, and I'll book one pickup slot once they're ready${cite("Section 6.2")}.`;
        text = `Bring your PAN card and one photo ID for building access${cite("Section 6.1")}.${start}${collect}`;
      }
      break;
    }
    case "health_cover": {
      const { data: profile } = await callTool(ctx, getEmployeeContext, { employeeId: ctx.employeeId });
      checked.push("your profile");
      await search("health cover parents spouse children enrol");
      const family = profile.family;
      const married = family?.maritalStatus === "married";
      const covered = hi
        ? married
          ? family.children
            ? "आप, आपके जीवनसाथी और आपका बच्चा"
            : "आप और आपके जीवनसाथी"
          : "आप"
        : married
          ? family.children
            ? "You, your spouse and your child"
            : "You and your spouse"
          : "You";
      const askedParents = /parents?|माता|पिता/i.test(question);
      if (!sections.some((s) => s.ref === "Section 3.2")) {
        text = hi ? `अभी मुझे health cover policy नहीं मिली। ${COMPANY.name} HR इसकी जानकारी दे सकता है।` : `I couldn't find the health cover policy just now. ${COMPANY.name} HR can confirm the details.`;
      } else if (hi) {
        const enrol = " Joining के 7 दिनों के अंदर enrol करें; enrolment खुलते ही मैं याद दिलाऊँगा।";
        text = askedParents
          ? `हाँ। माता-पिता को ₹1,200 प्रति माह में जोड़ा जा सकता है, जो salary से कटता है${cite("Section 3.2")}। ${covered} ₹5,00,000 के sum insured के साथ covered हैं।${enrol}`
          : `${covered} ₹5,00,000 के sum insured के साथ covered हैं${cite("Section 3.2")}। माता-पिता optional हैं, ₹1,200 प्रति माह।${enrol}`;
      } else {
        text = askedParents
          ? `Yes. Parents can be added for ₹1,200 a month, deducted from salary${cite("Section 3.2")}. ${covered} are covered with a sum insured of ₹5,00,000. Enrol within 7 days of joining; I'll bring it up when it opens.`
          : `${covered} are covered with a sum insured of ₹5,00,000${cite("Section 3.2")}. Parents are optional at ₹1,200 a month. Enrol within 7 days of joining; I'll bring it up when it opens.`;
      }
      break;
    }
    case "laptop": {
      const { data: tasks } = await callTool(ctx, getOnboardingState, { employeeId: ctx.employeeId });
      checked.push("your onboarding");
      await search("laptop Employee ID working days");
      const laptop = tasks.find((t) => t.key === "laptop");
      const ready = laptop?.status === "completed";
      const note = laptop?.statusNote ?? "waiting on your Employee ID";
      text = hi
        ? `आपका laptop: ${ready ? "तैयार है" : note}। Laptop के लिए आपकी Employee ID और फिर 2 working days लगते हैं${cite("Section 5.1")}, और मैं दोनों पर नज़र रखता हूँ।`
        : `Your laptop: ${ready ? "ready" : `${note.charAt(0).toLowerCase()}${note.slice(1)}`}. A laptop needs your Employee ID plus 2 working days${cite("Section 5.1")}, and I track both for you.`;
      break;
    }
    default: {
      const hits = await search(question);
      const top = hits[0];
      if (top) {
        const firstTwo = top.body.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
        text = hi ? `${top.documentTitle} के अनुसार: ${firstTwo}${cite(top.ref)}` : `${top.documentTitle} says: ${firstTwo}${cite(top.ref)}`;
      } else {
        text = hi
          ? `मैं सिर्फ़ आपके onboarding record और ${COMPANY.name} की policies से जवाब दे सकता हूँ, और यह मुझे वहाँ नहीं मिला${end} आपका HR owner मदद कर सकता है।`
          : `I can only answer from your onboarding record and ${COMPANY.name}'s policies, and I don't see that there${end} Your HR owner can help.`;
      }
    }
  }

  const cited = sections.filter((s) => text.includes(`(${s.ref})`));
  return { text, checked: [...cited.map((s) => `${s.documentTitle}, ${s.ref}`), ...checked], sections: cited, showActivity };
}
