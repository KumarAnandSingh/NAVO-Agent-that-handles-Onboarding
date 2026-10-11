import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { claudeNarrator, keepsFacts, salientTokens } from "@/agent/claude-narrator";
import { templateUpdate, type UpdateFacts } from "@/agent/narration";
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";
import { claudeReader } from "@/services/documents/claude-reader";
import { verifyAddressProof, verifyRelievingLetter } from "@/services/documents/verify";
import { createWorkspace } from "@/services/workspace";
import { fakeClaude, text } from "./fake-claude";

let db: Db;
let ws: string;

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_responds")).id;
});

const cleared: UpdateFacts = { kind: "blocker_cleared", facts: { blocker: "Employee ID", requests: "laptop request (IT-55231)" } };

describe("fact-preserving narration", () => {
  it("finds the facts a rewrite must keep", () => {
    expect(salientTokens("I reminded Priya Nair at 09:17 about IT-55231, due in 2 days.")).toEqual(["09:17", "IT-55231", "2", "Priya Nair"]);
  });

  it("rejects rewrites that drop a fact, invent a number or shout", () => {
    expect(keepsFacts(cleared, "Good news: your Employee ID is here and I've sent the laptop request (IT-55231) to IT.")).toBe(true);
    expect(keepsFacts(cleared, "Your Employee ID is here and IT has your laptop request.")).toBe(false);
    expect(keepsFacts(cleared, "Your Employee ID is here. IT-55231 will be ready in 3 days.")).toBe(false);
    expect(keepsFacts(cleared, "Your Employee ID is here! IT-55231 is with IT.")).toBe(false);
  });

  it("uses Claude's wording when it keeps the facts, and charges the budget", async () => {
    const claude = fakeClaude([[text("Your Employee ID came through, so I've sent the laptop request (IT-55231) to IT. Nothing needed from you.")]]);
    const narration = await claudeNarrator(claude.llm).employeeUpdate(cleared, { db, workspaceId: ws });
    expect(narration).toEqual({ text: "Your Employee ID came through, so I've sent the laptop request (IT-55231) to IT. Nothing needed from you.", composedBy: "claude" });
    const rows = await db.select().from(llmUsage).where(eq(llmUsage.workspaceId, ws));
    expect(rows.map((r) => [r.feature, r.status])).toEqual([["narrate", "ok"]]);
  });

  it("falls back to the template when Claude drops a fact or fails", async () => {
    const dropped = await claudeNarrator(fakeClaude([[text("Good news, your ID is here.")]]).llm).employeeUpdate(cleared, { db, workspaceId: ws });
    expect(dropped).toEqual({ text: templateUpdate(cleared), composedBy: "template" });
    const failed = await claudeNarrator(fakeClaude([new Error("timeout")]).llm).employeeUpdate(cleared, { db, workspaceId: ws });
    expect(failed.composedBy).toBe("template");
  });
});

describe("Claude document reading", () => {
  const bill = SAMPLE_DOCUMENTS.find((s) => s.id === "electricity-bill-other-name")!;
  const letter = SAMPLE_DOCUMENTS.find((s) => s.id === "relieving-letter")!;

  it("sends the image and asks for structured fields; deterministic rules still decide", async () => {
    const claude = fakeClaude([
      [
        text(
          JSON.stringify({
            fields: [
              { name: "document_kind", value: "Electricity bill", raw: "Electricity bill", confidence: 0.98 },
              { name: "holder_name", value: "Kavya Mehta", raw: "Kavya Mehta", confidence: 0.97 },
              { name: "address", value: "14 Sea Breeze Apartments, Andheri West, Mumbai 400058", raw: "14 Sea Breeze Apartments, Andheri West, Mumbai 400058", confidence: 0.95 },
              { name: "issue_date", value: "02 Sep 2026", raw: "02 Sep 2026", confidence: 0.96 },
            ],
          }),
        ),
      ],
    ]);
    const reading = await claudeReader(claude.llm).read(bill, { db, workspaceId: ws });
    expect(reading.readBy).toBe("claude");
    const content = claude.calls[0]!.messages[0]!.content as { type: string; source?: { media_type: string } }[];
    expect(content[0]).toMatchObject({ type: "image", source: { media_type: "image/png" } });
    expect(claude.calls[0]!.output_config?.format?.type).toBe("json_schema");
    // Claude read the name correctly; the rule (name must match the joiner) rejects the bill.
    expect(verifyAddressProof(reading.fields, "Anand Mehta").status).toBe("rejected");
  });

  it("keeps an unreadable date as raw text so Navo asks about that one field", async () => {
    const claude = fakeClaude([
      [
        text(
          JSON.stringify({
            fields: [
              { name: "employee_name", value: "Anand Mehta", raw: "Anand Mehta", confidence: 0.97 },
              { name: "employer", value: "Northwind Freight Pvt. Ltd.", raw: "Northwind Freight Pvt. Ltd.", confidence: 0.95 },
              { name: "last_working_day", value: "", raw: "1? Oct 2026", confidence: 0.3 },
            ],
          }),
        ),
      ],
    ]);
    const reading = await claudeReader(claude.llm).read(letter, { db, workspaceId: ws });
    const verdict = verifyRelievingLetter(reading.fields, { notBefore: "2026-10-06", before: "2026-10-19" });
    expect(verdict).toMatchObject({ status: "clarify", raw: "1? Oct 2026", suggestion: "2026-10-16" });
  });

  it("falls back to the recorded reading when Claude's output can't be parsed", async () => {
    const reading = await claudeReader(fakeClaude([[text("I think it says Kavya.")]]).llm).read(bill, { db, workspaceId: ws });
    expect(reading.readBy).toBe("fixture");
    expect(reading.fields).toEqual(bill.expected);
  });
});
