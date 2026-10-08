/** "Meet Halden": five short slides shown before mandatory training. Fictional company. */
export interface CultureSlide {
  kicker: string;
  title: string;
  body: string;
  /** Gradient used in place of a photo. */
  art: [string, string];
}

export const CULTURE_SLIDES: readonly CultureSlide[] = [
  {
    kicker: "Culture",
    title: "Curious people, building useful things.",
    body: "Halden makes software for logistics teams across India. People stay because the problems are real and the teams are small.",
    art: ["#1B2D63", "#38BDF8"],
  },
  {
    kicker: "How we work",
    title: "Small teams, fast decisions, close to the customer.",
    body: "Your product team ships every two weeks. Rahul runs planning on Monday mornings.",
    art: ["#13214A", "#2F5BEA"],
  },
  {
    kicker: "Your team",
    title: "Rahul, Meera and six others.",
    body: "Meera Shah is your buddy. She's been on the team two years and will walk you through the board on Day 1.",
    art: ["#0F3B4A", "#34D399"],
  },
  {
    kicker: "Office",
    title: "Tower B, BKC, Mumbai.",
    body: "Hybrid: 3 days in office. Cafeteria on the 2nd floor, quiet rooms on every floor.",
    art: ["#2A1B4A", "#A78BFA"],
  },
  {
    kicker: "Day 1",
    title: "Induction, pickup, your manager, your buddy.",
    body: "I'll guide you through each step on the day. Next up: security training.",
    art: ["#13214A", "#7DD3FC"],
  },
];
