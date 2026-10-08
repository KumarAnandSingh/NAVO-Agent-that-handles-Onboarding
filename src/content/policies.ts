/**
 * Synthetic Halden policy library. Fictional content written for this prototype;
 * Navo's answers must be grounded in these sections and cite their refs.
 * The superseded hybrid-work 2.0 version exists to prove outdated policy is excluded.
 */

export interface PolicySectionSeed {
  ref: string;
  title: string;
  body: string;
}

export interface PolicySeed {
  id: string;
  version: string;
  title: string;
  category: string;
  effectiveDate: string;
  supersededBy?: string;
  sections: PolicySectionSeed[];
}

export const POLICIES: readonly PolicySeed[] = [
  {
    id: "hybrid-work",
    version: "2.0",
    title: "Hybrid work policy",
    category: "Ways of working",
    effectiveDate: "2025-01-01",
    supersededBy: "2.1",
    sections: [
      {
        ref: "§2.1",
        title: "Remote days",
        body: "Hybrid roles may work remotely one day a week. Remote work is not allowed on Fridays.",
      },
    ],
  },
  {
    id: "hybrid-work",
    version: "2.1",
    title: "Hybrid work policy",
    category: "Ways of working",
    effectiveDate: "2026-04-01",
    sections: [
      {
        ref: "§2.1",
        title: "Remote days",
        body: "Hybrid roles may work remotely up to 2 days a week, and Fridays are allowed. Team rituals such as planning sessions take priority over remote days. Agree remote days with your manager by adding them to the team calendar.",
      },
      {
        ref: "§2.2",
        title: "First week",
        body: "New joiners are expected in the office on Day 1 for induction and equipment pickup. From the second day the standard hybrid pattern applies, unless the manager has scheduled in-person sessions.",
      },
      {
        ref: "§2.3",
        title: "Office days",
        body: "Hybrid roles spend at least 3 days a week in the office. The Mumbai office is Tower B, BKC. Quiet rooms are on every floor and the cafeteria is on the 2nd floor.",
      },
    ],
  },
  {
    id: "onboarding-standards",
    version: "4.0",
    title: "Onboarding standards and escalation",
    category: "Onboarding",
    effectiveDate: "2026-01-15",
    sections: [
      {
        ref: "§4.0",
        title: "Service levels",
        body: "HR issues the Employee ID within 4 working days of a joiner's documents being verified. IT, Facilities and HR requests for a joiner are owned by the named team until closed.",
      },
      {
        ref: "§4.1",
        title: "Reminders",
        body: "Navo may remind HR, IT, Facilities or the hiring manager automatically when an onboarding item is overdue or puts Day 1 at risk. Each reminder states the deadline and what depends on the item.",
      },
      {
        ref: "§4.2",
        title: "Escalation",
        body: "If a reminder is not answered within 24 hours, Navo may escalate to the HR Operations lead, copying the original owner. Asset changes such as a loaner laptop need the joiner's approval before they are requested.",
      },
      {
        ref: "§4.3",
        title: "What Navo may do",
        body: "Navo acts on its own for reminders, IT and HR requests, scheduling and tracking deadlines. It always asks first before anything involving personal data, bank details or equipment changes. Decisions about start dates belong to HR.",
      },
    ],
  },
  {
    id: "it-provisioning",
    version: "3.2",
    title: "IT provisioning",
    category: "IT",
    effectiveDate: "2026-02-01",
    sections: [
      {
        ref: "§5.1",
        title: "Laptops",
        body: "A laptop needs the Employee ID plus 2 working days. Requests raised before 12:00 count that day as the first working day. Laptops are imaged with VPN and collected at the IT service desk or a scheduled pickup.",
      },
      {
        ref: "§5.2",
        title: "Email and access",
        body: "Email accounts are created within 1 working day of the Employee ID. Email, VPN and core tools are switched on at 09:00 on Day 1, once security training is complete.",
      },
      {
        ref: "§5.3",
        title: "Loaner laptops",
        body: "If a joiner's own laptop cannot be ready for Day 1, IT can provide a loaner laptop the same day. A loaner is an asset change and needs the joiner's approval.",
      },
      {
        ref: "§5.4",
        title: "Tool access",
        body: "Project tools (the tracker and the design workspace) are requested by the manager or Navo after Day 1 and take up to 3 working days.",
      },
    ],
  },
  {
    id: "benefits",
    version: "3.0",
    title: "Benefits",
    category: "Benefits",
    effectiveDate: "2026-04-01",
    sections: [
      {
        ref: "§3.1",
        title: "Eligibility",
        body: "Benefits start on Day 1 for all permanent employees.",
      },
      {
        ref: "§3.2",
        title: "Health cover",
        body: "Health cover includes the employee, spouse and children with a sum insured of ₹5,00,000. Parents can be added for ₹1,200 a month, deducted from salary. Enrol within 7 days of joining.",
      },
      {
        ref: "§3.3",
        title: "Leave",
        body: "Employees get 18 days of paid leave a year, accrued monthly from Day 1, plus company holidays. Leave during the first week needs the manager's agreement.",
      },
    ],
  },
  {
    id: "day1-guide",
    version: "1.4",
    title: "Day 1 guide",
    category: "Facilities",
    effectiveDate: "2026-03-01",
    sections: [
      {
        ref: "§6.1",
        title: "Arrival",
        body: "Arrive at Tower B reception, BKC, Mumbai, by 9:15 on Day 1. Bring your PAN card and one photo ID for building access.",
      },
      {
        ref: "§6.2",
        title: "Pickup",
        body: "ID card, laptop and onboarding kit are collected together at Twin Tower, Building B. Navo books one pickup slot so it is a single trip.",
      },
      {
        ref: "§6.3",
        title: "Getting there",
        body: "Tower B, BKC is about 40 minutes from Andheri by road in the morning. Visitor parking is limited; public transport is recommended.",
      },
    ],
  },
  {
    id: "security-training",
    version: "2.0",
    title: "Security awareness training",
    category: "Learning",
    effectiveDate: "2026-01-01",
    sections: [
      {
        ref: "§7.1",
        title: "Requirement",
        body: "Every joiner completes the 15-minute security awareness course and a 5-minute check before Day 1. IT switches on email, VPN and core tools only after it is complete.",
      },
    ],
  },
  {
    id: "document-handling",
    version: "1.2",
    title: "Joiner document handling",
    category: "Privacy",
    effectiveDate: "2026-01-01",
    sections: [
      {
        ref: "§8.1",
        title: "Use and storage",
        body: "Joiner documents are used only for onboarding. They are encrypted in transit and at rest in Halden's HR systems.",
      },
      {
        ref: "§8.2",
        title: "Access",
        body: "Only the HR onboarding owner and the verification vendor can view documents. Every access is logged and visible to the joiner.",
      },
      {
        ref: "§8.3",
        title: "Clarifications",
        body: "When a document is unclear, Navo asks only about the unclear field instead of requesting the whole document again. Documents are kept as policy requires, then deleted.",
      },
    ],
  },
];
