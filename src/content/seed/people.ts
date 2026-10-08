import type { FamilyDetails } from "@/lib/db/schema";
import type { OwnerType } from "@/domain/types";

export interface PersonSeed {
  id: string;
  name: string;
  title: string;
  kind: OwnerType | "joiner";
  team?: string;
}

/** Halden staff who own parts of onboarding. All fictional. */
export const STAFF: readonly PersonSeed[] = [
  { id: "rahul.iyer", name: "Rahul Iyer", title: "Director of Product", kind: "manager", team: "Product" },
  { id: "meera.shah", name: "Meera Shah", title: "Senior Product Manager", kind: "buddy", team: "Product" },
  { id: "priya.nair", name: "Priya Nair", title: "HR Onboarding Partner · Mumbai", kind: "hr", team: "People" },
  { id: "neha.kapoor", name: "Neha Kapoor", title: "HR Operations Lead", kind: "hr_ops", team: "People" },
  { id: "it.desk", name: "IT Service Desk", title: "IT Service Desk", kind: "it", team: "IT" },
  { id: "facilities.desk", name: "Facilities", title: "Workplace & Facilities", kind: "facilities", team: "Facilities" },
  { id: "trustcheck", name: "TrustCheck Verification", title: "Background verification vendor", kind: "vendor" },
];

export interface JoinerSeed extends PersonSeed {
  role: string;
  department: string;
  joiningDate: string;
  managerId: string;
  buddyId: string | null;
  location: string;
  workMode: "hybrid" | "office" | "remote";
  homeArea?: string;
  family?: FamilyDetails;
  featured?: boolean;
  /** Where this joiner is in onboarding when the demo starts. */
  profile: "featured" | "bgv_late" | "docs_pending" | "early" | "on_track";
}

export const JOINERS: readonly JoinerSeed[] = [
  {
    id: "anand.mehta",
    name: "Anand Mehta",
    title: "Senior Product Manager",
    kind: "joiner",
    role: "Senior Product Manager",
    department: "Product",
    joiningDate: "2026-10-19",
    managerId: "rahul.iyer",
    buddyId: "meera.shah",
    location: "Mumbai",
    workMode: "hybrid",
    homeArea: "Andheri West",
    family: { maritalStatus: "married", children: 1, spouseName: "Kavya Mehta" },
    featured: true,
    profile: "featured",
  },
  joiner("priya.sharma", "Priya Sharma", "Data Analyst", "Analytics", "2026-10-26", "bgv_late"),
  joiner("rohit.mehta", "Rohit Mehta", "Engineer II", "Engineering", "2026-10-27", "early"),
  joiner("neha.verma", "Neha Verma", "Product Designer", "Design", "2026-11-02", "early"),
  joiner("karan.gupta", "Karan Gupta", "Sales Lead", "Sales", "2026-11-09", "docs_pending"),
  joiner("aditi.rao", "Aditi Rao", "Engineer II", "Engineering", "2026-10-26", "on_track"),
  joiner("vikram.sethi", "Vikram Sethi", "Logistics Analyst", "Operations", "2026-10-27", "on_track"),
  joiner("sana.qureshi", "Sana Qureshi", "QA Engineer", "Engineering", "2026-11-02", "early"),
  joiner("dev.malhotra", "Dev Malhotra", "Account Executive", "Sales", "2026-11-02", "early"),
  joiner("ishaan.bose", "Ishaan Bose", "Data Engineer", "Analytics", "2026-11-04", "early"),
  joiner("tanvi.kulkarni", "Tanvi Kulkarni", "Content Designer", "Design", "2026-11-09", "early"),
  joiner("farhan.ali", "Farhan Ali", "Support Specialist", "Customer Success", "2026-11-09", "early"),
  joiner("lakshmi.menon", "Lakshmi Menon", "Finance Associate", "Finance", "2026-11-11", "early"),
  joiner("rohan.das", "Rohan Das", "Site Reliability Engineer", "Engineering", "2026-11-16", "early"),
];

function joiner(
  id: string,
  name: string,
  role: string,
  department: string,
  joiningDate: string,
  profile: JoinerSeed["profile"],
): JoinerSeed {
  return {
    id,
    name,
    title: role,
    kind: "joiner",
    role,
    department,
    joiningDate,
    managerId: "rahul.iyer",
    buddyId: null,
    location: "Mumbai",
    workMode: "hybrid",
    profile,
  };
}
