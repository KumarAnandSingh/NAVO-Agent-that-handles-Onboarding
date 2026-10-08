import type { GuardVM, Tone } from "@/services/view-model/types";

/** Ink and background for each semantic tone, matching the prototype palette. */
export const TONE: Record<Tone, { ink: string; bg: string; dot: string }> = {
  done: { ink: "#13795B", bg: "#E3F2EC", dot: "#13795B" },
  agent: { ink: "#2F5BEA", bg: "#E4EAFB", dot: "#2F5BEA" },
  wait: { ink: "#B45309", bg: "#FEF3E2", dot: "#D19A14" },
  risk: { ink: "#C2410C", bg: "#FFF7EB", dot: "#C2410C" },
  you: { ink: "#C8372D", bg: "#FDECEC", dot: "#E5484D" },
  calm: { ink: "#0B1530", bg: "#F6F8FC", dot: "#0B1530" },
  muted: { ink: "#5B6474", bg: "#F1F3F7", dot: "#8A93A3" },
};

export const GUARD: Record<GuardVM, { ink: string; bg: string; label: string }> = {
  read: { ink: "#4A5363", bg: "#EEF1F5", label: "read" },
  policy: { ink: "#6A4A00", bg: "#FBF1D9", label: "policy" },
  auto: { ink: "#13795B", bg: "#E3F2EC", label: "auto" },
  approval: { ink: "#C8372D", bg: "#FBE7E5", label: "approval" },
  event: { ink: "#2F5BEA", bg: "#E4EAFB", label: "event" },
  denied: { ink: "#C8372D", bg: "#FBE7E5", label: "denied" },
};

export const PHASE_INK: Record<string, string> = {
  Noticed: "#5B6474",
  Decided: "#0B1530",
  Acted: "#2F5BEA",
  Reported: "#13795B",
  Asked: "#C8372D",
  Planned: "#687182",
  Resolved: "#13795B",
  NOTICED: "#5B6474",
  DECIDED: "#0B1530",
  ACTED: "#2F5BEA",
  REPORTED: "#13795B",
  ASKED: "#C8372D",
  PLANNED: "#687182",
  RESOLVED: "#13795B",
};
