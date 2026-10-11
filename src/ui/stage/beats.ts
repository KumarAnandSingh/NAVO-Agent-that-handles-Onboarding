/**
 * The guided demo: 26 beats that tell Anand's story by driving the real engine through
 * the same API the buttons use. Captions read the live view model, so every number on
 * screen is the one the engine produced.
 */
import type { ViewModel } from "@/services/view-model/types";
import type { Screen, Sheet, View } from "@/ui/state/NavoStore";

export interface GuideApi {
  go: (screen: Screen) => void;
  setView: (view: View) => void;
  setSheet: (sheet: Sheet) => void;
  setWhy: (open: boolean) => void;
  demo: (body: Record<string, unknown>) => Promise<ViewModel | null>;
  employee: (body: Record<string, unknown>, toast?: string) => Promise<ViewModel | null>;
  hr: (body: Record<string, unknown>) => Promise<ViewModel | null>;
  latest: () => ViewModel | null;
  openOutro: () => void;
}

export interface Beat {
  chapter: number;
  caption: (vm: ViewModel | null) => string;
  /** How long the beat stays on screen in auto mode, after its action and replay finish. */
  dwellMs: number;
  run: (api: GuideApi) => Promise<void>;
}

/** Thrown when an action fails, so auto-play stops instead of running ahead. */
export class BeatFailed extends Error {}

async function must(result: Promise<ViewModel | null>): Promise<ViewModel> {
  const vm = await result;
  if (!vm) throw new BeatFailed("The demo action failed");
  return vm;
}

const stay = (screen: Screen) => async (api: GuideApi) => {
  api.setView("emp");
  api.go(screen);
};

const name = (vm: ViewModel | null) => vm?.employee.firstName ?? "Anand";

export const BEATS: readonly Beat[] = [
  {
    chapter: 0,
    caption: (vm) => `${vm?.employee.name ?? "Anand Mehta"} accepted an offer at Halden. He opens Navo for the first time.`,
    dwellMs: 3200,
    run: async (api) => {
      await must(api.demo({ action: "reset", scenario: "hr_responds" }));
      api.setView("emp");
      api.go("launch");
    },
  },
  { chapter: 0, caption: () => "He signs in with the mobile number from his application. No company account needed yet.", dwellMs: 3800, run: stay("signin") },
  { chapter: 0, caption: () => "Navo introduces itself, and sets out what it does alone and what it always asks first.", dwellMs: 5200, run: stay("meet") },
  {
    chapter: 1,
    caption: (vm) => {
      const read = vm?.documents.items.filter((d) => d.state !== "Needed").length ?? 5;
      return `Navo has already read ${read} documents. One is missing.`;
    },
    dwellMs: 4200,
    run: stay("docs"),
  },
  {
    chapter: 1,
    caption: () => "Anand uploads it. Navo reads it and checks it against his Aadhaar.",
    dwellMs: 4200,
    run: async (api) => {
      api.go("docs");
      await must(api.employee({ action: "upload_sample", sampleId: "electricity-bill" }, "Read your address proof. It matches your Aadhaar."));
    },
  },
  { chapter: 1, caption: () => "One date is unreadable. Navo asks about that field only, not the whole document.", dwellMs: 4800, run: stay("clarify") },
  {
    chapter: 1,
    caption: (vm) => `${name(vm)} confirms it in one tap. ${vm?.employee.hrName.split(" ")[0] ?? "HR"} in HR is told automatically.`,
    dwellMs: 3600,
    run: async (api) => {
      const suggestion = api.latest()?.documents.clarify?.suggestion;
      if (suggestion) await must(api.employee({ action: "confirm_field", documentType: "relieving_letter", value: suggestion }, "Updated. HR is notified."));
      api.go("docs");
    },
  },
  {
    chapter: 1,
    caption: (vm) => `Forms come pre-filled from his documents. Only ${vm?.forms.missing === 1 || vm?.forms.missing === undefined ? "the emergency contact needs" : `${vm.forms.missing} fields need`} him.`,
    dwellMs: 3800,
    run: stay("forms"),
  },
  {
    chapter: 1,
    caption: () => "He adds it and submits. Navo sends everything to HR and books his Day 1 essentials.",
    dwellMs: 3600,
    run: async (api) => {
      api.go("forms");
      await must(api.employee({ action: "emergency_contact", value: "Kavya Mehta · +91 00000 11223" }));
      await must(api.employee({ action: "submit_forms" }, "Forms sent to HR. I'll take it from here."));
      api.go("home");
    },
  },
  {
    chapter: 2,
    caption: (vm) => `${vm?.clock.day ?? "Thursday"}, ${vm?.employee.daysToDay1 ?? 4} days before Day 1. Navo is watching ${vm?.home.watchedCount ?? 9} items across HR, IT and his manager.`,
    dwellMs: 4600,
    run: async (api) => {
      await must(api.demo({ action: "skip", to: "risk_day" }));
      api.go("home");
    },
  },
  {
    chapter: 2,
    caption: () => "Navo spots that the Employee ID is late. It traces what depends on it, checks the rules, and follows up with HR on its own.",
    dwellMs: 5200,
    run: async (api) => {
      api.go("home");
      await must(api.demo({ action: "advance" }));
    },
  },
  {
    chapter: 2,
    caption: () => "Every action has a reason Anand can see.",
    dwellMs: 4800,
    run: async (api) => {
      api.go("home");
      api.setWhy(true);
    },
  },
  {
    chapter: 2,
    caption: (vm) => `Meanwhile, ${vm?.employee.hrName.split(" ")[0] ?? "Priya"} in HR sees only the exceptions. ${name(vm)}'s ID is at the top of her queue.`,
    dwellMs: 4800,
    run: async (api) => {
      api.setWhy(false);
      api.setView("hr");
    },
  },
  {
    chapter: 2,
    caption: (vm) => `${vm?.employee.hrName.split(" ")[0] ?? "Priya"} issues the ID. Navo raises the laptop and email requests within a minute.`,
    dwellMs: 5000,
    run: async (api) => {
      api.setView("hr");
      await must(api.hr({ action: "generate_id" }));
    },
  },
  { chapter: 2, caption: () => "Back on Anand's phone: blocker cleared, no action needed from him.", dwellMs: 4400, run: stay("home") },
  {
    chapter: 2,
    caption: () => "The one thing only he can do: 15 minutes of security training. Navo tells IT to switch on his access.",
    dwellMs: 4200,
    run: async (api) => {
      api.go("home");
      await must(api.employee({ action: "complete_training" }, "Training complete. I told IT to switch on your access."));
    },
  },
  {
    chapter: 3,
    caption: () => "By Friday: background check cleared, laptop imaged, ID card printed. Navo books one pickup for everything.",
    dwellMs: 5200,
    run: async (api) => {
      api.go("home");
      for (let i = 0; i < 8 && !api.latest()?.day1.pickup; i++) {
        await must(api.demo({ action: "advance" }));
      }
    },
  },
  { chapter: 3, caption: () => "ID card, laptop and kit, all at Building B. HR, IT and Facilities, coordinated by Navo.", dwellMs: 4600, run: stay("pickup") },
  {
    chapter: 4,
    caption: () => "Monday, Day 1. Navo has the plan and reminds him as each step comes up.",
    dwellMs: 4600,
    run: async (api) => {
      await must(api.demo({ action: "skip", to: "day1" }));
      api.go("day1");
    },
  },
  {
    chapter: 4,
    caption: () => "At 11:15 he collects everything in one trip and confirms it in the app.",
    dwellMs: 3600,
    run: async (api) => {
      await must(api.demo({ action: "skip", to: "pickup" }));
      api.go("confirm");
    },
  },
  {
    chapter: 4,
    caption: () => "Navo closes the requests with HR and IT. Day 1 done.",
    dwellMs: 4200,
    run: async (api) => {
      await must(api.employee({ action: "confirm_pickup", collected: ["id", "laptop", "kit"] }, "Closed your pickup requests with HR and IT."));
      await must(api.demo({ action: "skip", to: "day1_end" }));
      api.go("day1done");
    },
  },
  {
    chapter: 5,
    caption: () => "Week 1: Navo spots a health cover deadline that applies to his family, at the right moment.",
    dwellMs: 4600,
    run: async (api) => {
      await must(api.demo({ action: "skip", to: "week1" }));
      api.go("week1");
    },
  },
  {
    chapter: 5,
    caption: (vm) => (vm?.week1.suggestion?.booked ? "It found a free half hour and booked a roadmap walkthrough with his buddy." : "It also suggests a walkthrough with his buddy in a free slot."),
    dwellMs: 4200,
    run: async (api) => {
      api.go("week1");
      if (api.latest()?.week1.suggestion?.booked === false) await must(api.employee({ action: "book_walkthrough" }, "Booked. It's on your calendar."));
    },
  },
  {
    chapter: 5,
    caption: () => "He enrols his family in health cover in one tap.",
    dwellMs: 3800,
    run: async (api) => {
      api.go("benefits");
      if (api.latest()?.week1.benefits?.open) await must(api.employee({ action: "enrol_benefits" }, "Enrolled. HR and the insurer are notified."));
    },
  },
  {
    chapter: 5,
    caption: (vm) => `Day 30. Navo has booked and prepared his check-in with ${vm?.employee.managerName.split(" ")[0] ?? "Rahul"}.`,
    dwellMs: 4400,
    run: async (api) => {
      await must(api.demo({ action: "day30" }));
      api.go("day30");
    },
  },
  {
    chapter: 5,
    caption: () => "",
    dwellMs: 0,
    run: async (api) => {
      api.openOutro();
    },
  },
];
