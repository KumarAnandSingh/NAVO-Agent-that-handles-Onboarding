import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { advance, runUntil } from "@/agent/runtime";
import { atIst } from "@/domain/time";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { askNavo } from "@/services/ask";
import { intentOf, languageOf } from "@/services/ask/fallback";
import { jumpToChapter } from "@/services/demo-director";
import { hrGenerateEmployeeId } from "@/services/employee-actions";
import { createWorkspace } from "@/services/workspace";
import { ANAND, deps } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

const ask = (ws: string, q: string) => askNavo(db, ws, q, { llm: null });
const fresh = async (scenario: "hr_responds" | "hr_silent" = "hr_responds") => (await createWorkspace(db, scenario)).id;

describe("Navo's offline answers follow the live state", () => {
  it("recognises intents and language", () => {
    expect(intentOf("Can I carry my own laptop on day one?")).toBe("bring");
    expect(intentOf("मेरा लैपटॉप कब आएगा?")).toBe("laptop");
    expect(intentOf("What is the dress code?")).toBe("general");
    expect(languageOf("मेरा लैपटॉप")).toBe("hi");
    expect(languageOf("my laptop")).toBe("en");
  });

  it("explains reminders and escalation before anything is late", async () => {
    const ws = await fresh();
    expect((await ask(ws, "What if HR doesn't respond?")).text).toMatch(/^If HR is late with anything, I remind them automatically\..*\(Section 4\.2\)/);
    expect((await ask(ws, "अगर HR जवाब न दे तो क्या होगा?")).text).toMatch(/^अगर HR किसी चीज़ में देर करता है/);
  });

  it("says who it escalated to once HR has been silent for 24 hours", async () => {
    const ws = await fresh("hr_silent");
    await jumpToChapter(db, ws, 2);
    await runUntil(db, ws, atIst("2026-10-16", "10:00"), deps);
    const en = await ask(ws, "Has HR replied about my Employee ID?");
    expect(en.text).toMatch(/^HR didn't reply within 24 hours, so I escalated to Neha Kapoor, the HR Ops lead/);
    expect((await ask(ws, "क्या HR ने जवाब दिया?")).text).toMatch(/^HR ने 24 घंटे में जवाब नहीं दिया, इसलिए मैंने .* HR Ops lead Neha Kapoor को escalate किया/);
  });

  it("says nothing is waiting on HR once they have answered", async () => {
    const ws = await fresh();
    await jumpToChapter(db, ws, 2);
    await advance(db, ws, deps);
    await hrGenerateEmployeeId(db, ws, ANAND, deps);
    expect((await ask(ws, "What if HR doesn't respond?")).text).toMatch(/^HR has already answered/);
    expect((await ask(ws, "अगर HR जवाब न दे तो?")).text).toMatch(/^HR जवाब दे चुका है/);
    const laptop = await ask(ws, "When will my laptop arrive?");
    expect(laptop.text).toMatch(/^Your laptop: .*\(Section 5\.1\)/);
    expect((await ask(ws, "मेरा लैपटॉप कब आएगा?")).text).toMatch(/^आपका laptop: .*\(Section 5\.1\)/);
  });

  it("gives the booked pickup, in both languages, once it is arranged", async () => {
    const ws = await fresh();
    await jumpToChapter(db, ws, 3);
    expect((await ask(ws, "What should I bring Monday?")).text).toContain("Your ID card, laptop and kit are waiting at Twin Tower · Building B");
    expect((await ask(ws, "सोमवार को क्या लाना है?")).text).toContain("एक ही बार में मिलेंगे (Section 6.2)");
    expect((await ask(ws, "When will my laptop be ready?")).text).toMatch(/^Your laptop: ready\./);
    expect((await ask(ws, "मेरा लैपटॉप कब आएगा?")).text).toMatch(/^आपका laptop: तैयार है।/);
  });

  it("answers health cover from the joiner's own family details", async () => {
    const ws = await fresh();
    const setFamily = (family: { maritalStatus: "single" | "married"; children: number } | null) =>
      db.update(employees).set({ family }).where(and(eq(employees.workspaceId, ws), eq(employees.personId, ANAND)));
    expect((await ask(ws, "Who is covered by my medical insurance?")).text).toMatch(/^You, your spouse and your child are covered/);
    expect((await ask(ws, "मेरे स्वास्थ्य बीमा में कौन है?")).text).toMatch(/^आप, आपके जीवनसाथी और आपका बच्चा/);
    await setFamily({ maritalStatus: "married", children: 0 });
    expect((await ask(ws, "Who is covered by my medical insurance?")).text).toMatch(/^You and your spouse are covered/);
    expect((await ask(ws, "क्या मेरे माता-पिता बीमा में आ सकते हैं?")).text).toMatch(/^हाँ।.*आप और आपके जीवनसाथी/);
    await setFamily(null);
    expect((await ask(ws, "Can my parents be added to insurance?")).text).toMatch(/You are covered with a sum insured/);
    expect((await ask(ws, "मेरे स्वास्थ्य बीमा में कौन है?")).text).toMatch(/^आप ₹5,00,000/);
  });
});
