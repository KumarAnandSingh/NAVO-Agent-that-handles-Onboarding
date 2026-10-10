/**
 * Halden is a fictional company. Every person, place, document and policy in this
 * prototype is synthetic and exists only to demonstrate the onboarding agent.
 */
export const COMPANY = {
  name: "Halden",
  product: "Navo",
  tagline: "AI That Handles Onboarding",
  descriptor: "your AI onboarding agent",
  supportingLine: "Navo understands what's next, coordinates the work and steps in when needed.",
  office: "Tower B, BKC, Mumbai",
  pickupSite: "Twin Tower · Building B",
  emailDomain: "halden.example",
  disclaimer: "Halden is a fictional company. All data is synthetic.",
} as const;

/** The featured joiner whose phone the demo shows. */
export const FEATURED_EMPLOYEE_ID = "anand.mehta";

/** Seed data version. Bump when seed content changes so stale workspaces are rebuilt. */
export const SEED_VERSION = 4;
