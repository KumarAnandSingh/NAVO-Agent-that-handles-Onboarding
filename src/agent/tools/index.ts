/** Every tool Navo can call, each defined once with its guard level and audit summary (see registry.ts). */
export * from "./act";
export * from "./read";
export * from "./schedule";
export * from "./state";

import { getEmployeeContext, getOnboardingState, getDependencies, calculateDay1Risk, searchPolicyLibrary, getCalendar, getFollowUps } from "./read";

/** Read-only tools Claude may call from Ask Navo. */
export const READ_TOOLS = [getEmployeeContext, getOnboardingState, getDependencies, calculateDay1Risk, searchPolicyLibrary, getCalendar, getFollowUps];
