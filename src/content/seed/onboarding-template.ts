import type { DependencyType, OwnerType, Phase } from "@/domain/types";

export const TASK_KEYS = [
  "offer_accept",
  "documents",
  "forms",
  "background_check",
  "employee_id",
  "laptop",
  "email",
  "vpn",
  "id_card",
  "onboarding_kit",
  "manager_1on1",
  "buddy",
  "induction",
  "security_training",
  "access_activation",
  "pickup",
  "day1_induction",
  "day1_collect",
  "day1_manager",
  "day1_buddy",
  "product_induction",
  "mandatory_training",
  "team_intros",
  "tool_access",
  "feedback_checkin",
  "benefits_enrolment",
  "checkin_30",
] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

/** How the agent gets a task done once it becomes eligible. */
export type Fulfilment =
  | { kind: "employee" }
  | { kind: "navo" }
  | { kind: "vendor" }
  | { kind: "facilities"; item: string }
  | { kind: "hr_request"; type: "employee_id" | "id_card" }
  | { kind: "it_ticket"; type: "laptop" | "email" | "vpn" | "tool_access"; detail: string }
  | { kind: "training"; course: string; minutes: number }
  | { kind: "meeting"; slot: MeetingSlot }
  | { kind: "booking"; slot: MeetingSlot; bookedLabel: string };

export interface MeetingSlot {
  /** Calendar days relative to Day 1 (0 = Day 1). */
  dayOffset: number;
  start: string;
  end: string;
  title: string;
  location: string;
  with?: "manager" | "buddy" | "hr";
  kind: string;
}

export interface TaskTemplate {
  key: TaskKey;
  name: string;
  description: string;
  phase: Phase;
  ownerType: OwnerType;
  leadWorkingDays: number;
  requiredForDay1: boolean;
  watched: boolean;
  fulfilment: Fulfilment;
}

export const DAY1_LOCATION = "Auditorium, Tower B";

export const ONBOARDING_TEMPLATE: readonly TaskTemplate[] = [
  t("offer_accept", "Review and accept offer", "Sign the offer letter.", "offer", "employee", { kind: "employee" }),
  t("documents", "Documents", "Identity, education, previous employment, address and bank documents, read and verified by Navo.", "documents", "navo", { kind: "navo" }, { watched: true }),
  t("forms", "Confirm your details", "Personal details, emergency contact and nominee, pre-filled from documents.", "documents", "employee", { kind: "employee" }),
  t("background_check", "Background check", "Education and employment verification by the vendor.", "pre_joining", "vendor", { kind: "vendor" }, { watched: true }),
  t("employee_id", "Employee ID", "HR generates the employee number that unlocks equipment and accounts.", "pre_joining", "hr", { kind: "hr_request", type: "employee_id" }, { watched: true, requiredForDay1: true }),
  t("laptop", "Laptop", "Laptop imaged and ready for Day 1.", "pre_joining", "it", { kind: "it_ticket", type: "laptop", detail: "Laptop · standard PM image" }, { watched: true, requiredForDay1: true, leadWorkingDays: 2 }),
  t("email", "Email", "Halden email account.", "pre_joining", "it", { kind: "it_ticket", type: "email", detail: "Email account" }, { watched: true, requiredForDay1: true, leadWorkingDays: 1 }),
  t("vpn", "VPN", "VPN profile configured on the laptop.", "pre_joining", "it", { kind: "it_ticket", type: "vpn", detail: "VPN profile on laptop" }, { watched: true, requiredForDay1: true }),
  t("id_card", "ID card", "Photo ID card for building access.", "pre_joining", "hr", { kind: "hr_request", type: "id_card" }, { requiredForDay1: true, leadWorkingDays: 1 }),
  t("onboarding_kit", "Onboarding kit", "Welcome kit prepared by Facilities.", "pre_joining", "facilities", { kind: "facilities", item: "Onboarding kit" }, { requiredForDay1: true }),
  t("manager_1on1", "Manager 1:1", "First 1:1 with the hiring manager on Day 1.", "pre_joining", "navo", { kind: "booking", bookedLabel: "Manager 1:1 booked", slot: { dayOffset: 0, start: "12:00", end: "12:30", title: "1:1 with Rahul Iyer", location: "Room 4A", with: "manager", kind: "one_on_one" } }, { watched: true }),
  t("buddy", "Buddy", "A buddy from the same team for the first weeks.", "pre_joining", "navo", { kind: "booking", bookedLabel: "Buddy assigned", slot: { dayOffset: 0, start: "14:00", end: "14:30", title: "Meet Meera, your buddy", location: "Cafeteria, 2nd floor", with: "buddy", kind: "buddy" } }, { watched: true }),
  t("induction", "Induction", "Company induction on Day 1.", "pre_joining", "navo", { kind: "booking", bookedLabel: "Induction booked", slot: { dayOffset: 0, start: "09:30", end: "11:00", title: "Company induction", location: DAY1_LOCATION, with: "hr", kind: "induction" } }, { watched: true }),
  t("security_training", "Security training", "15-minute security awareness course and a 5-minute check.", "pre_joining", "employee", { kind: "training", course: "Security awareness", minutes: 15 }, { requiredForDay1: true }),
  t("access_activation", "Email and VPN access", "IT switches on email, VPN and core tools once training is done.", "pre_joining", "it", { kind: "navo" }, { requiredForDay1: true }),
  t("pickup", "Day 1 pickup", "One pickup for ID card, laptop and kit.", "pre_joining", "navo", { kind: "navo" }),
  t("day1_induction", "Company induction", "Day 1 induction session.", "day1", "hr", { kind: "navo" }),
  t("day1_collect", "Collect ID card, laptop and kit", "Confirm what you collected at the pickup.", "day1", "employee", { kind: "employee" }),
  t("day1_manager", "Meet Rahul, your manager", "Day 1 1:1.", "day1", "manager", { kind: "navo" }),
  t("day1_buddy", "Meet Meera, your buddy", "Day 1 buddy meeting.", "day1", "buddy", { kind: "navo" }),
  t("product_induction", "Product induction", "Walkthrough of Halden's products.", "week1", "manager", { kind: "meeting", slot: { dayOffset: 1, start: "10:00", end: "11:30", title: "Product induction", location: "Room 4A", with: "manager", kind: "product_induction" } }),
  t("mandatory_training", "Mandatory training", "Code of conduct and data protection.", "week1", "employee", { kind: "meeting", slot: { dayOffset: 1, start: "14:00", end: "15:00", title: "Mandatory training", location: "Learning portal", kind: "training" } }),
  t("team_intros", "Team introductions", "Meet the product team.", "week1", "manager", { kind: "meeting", slot: { dayOffset: 2, start: "11:00", end: "12:00", title: "Team introductions", location: "Room 4A", with: "manager", kind: "team_intros" } }),
  t("tool_access", "First project setup", "Jira and Figma access for the first project.", "week1", "it", { kind: "it_ticket", type: "tool_access", detail: "Jira and Figma access" }, { leadWorkingDays: 3 }),
  t("feedback_checkin", "Feedback check-in with Rahul", "First-week check-in.", "week1", "manager", { kind: "meeting", slot: { dayOffset: 4, start: "16:00", end: "16:30", title: "First-week check-in with Rahul", location: "Room 4A", with: "manager", kind: "check_in" } }),
  t("benefits_enrolment", "Health cover enrolment", "Choose health cover within 7 days of joining.", "week1", "employee", { kind: "employee" }),
  t("checkin_30", "30-day check-in", "Goals and feedback with the manager.", "day30", "manager", { kind: "meeting", slot: { dayOffset: 31, start: "11:00", end: "11:45", title: "30-day check-in with Rahul", location: "Room 4A", with: "manager", kind: "check_in_30" } }),
];

function t(
  key: TaskKey,
  name: string,
  description: string,
  phase: Phase,
  ownerType: OwnerType,
  fulfilment: Fulfilment,
  options: Partial<Pick<TaskTemplate, "leadWorkingDays" | "requiredForDay1" | "watched">> = {},
): TaskTemplate {
  return {
    key,
    name,
    description,
    phase,
    ownerType,
    fulfilment,
    leadWorkingDays: options.leadWorkingDays ?? 0,
    requiredForDay1: options.requiredForDay1 ?? false,
    watched: options.watched ?? false,
  };
}

export interface DependencyTemplate {
  prerequisite: TaskKey;
  dependent: TaskKey;
  type: DependencyType;
}

export const DEPENDENCY_TEMPLATE: readonly DependencyTemplate[] = [
  d("offer_accept", "documents"),
  d("documents", "forms"),
  d("documents", "background_check", "informs"),
  d("documents", "employee_id"),
  d("documents", "manager_1on1"),
  d("documents", "buddy"),
  d("documents", "induction"),
  d("documents", "security_training"),
  d("employee_id", "laptop"),
  d("employee_id", "email"),
  d("employee_id", "id_card"),
  d("laptop", "vpn"),
  d("email", "access_activation"),
  d("vpn", "access_activation"),
  d("security_training", "access_activation"),
  d("id_card", "pickup"),
  d("laptop", "pickup"),
  d("onboarding_kit", "pickup"),
  d("induction", "day1_induction"),
  d("pickup", "day1_collect"),
  d("manager_1on1", "day1_manager"),
  d("buddy", "day1_buddy"),
  d("access_activation", "tool_access"),
  d("day1_induction", "product_induction"),
  d("day1_induction", "mandatory_training"),
  d("day1_manager", "team_intros"),
  d("forms", "benefits_enrolment", "informs"),
  d("day1_manager", "feedback_checkin"),
  d("feedback_checkin", "checkin_30"),
];

function d(prerequisite: TaskKey, dependent: TaskKey, type: DependencyType = "blocks"): DependencyTemplate {
  return { prerequisite, dependent, type };
}

export const taskId = (employeeId: string, key: TaskKey) => `${employeeId}/${key}`;
