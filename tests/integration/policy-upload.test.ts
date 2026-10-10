import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { atIst } from "@/domain/time";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { askNavo } from "@/services/ask";
import { reset } from "@/services/demo-director";
import { searchPolicies } from "@/services/policy-retrieval";
import { PolicyUploadError, listPolicies, previewPolicy, publishPolicy, splitPolicy } from "@/services/policy-retrieval/upload";
import { createWorkspace } from "@/services/workspace";

let db: Db;
let sample: string;
const NOW = atIst("2026-10-07", "18:00");

beforeAll(async () => {
  db = await createMemoryDb();
  sample = await readFile(path.join(process.cwd(), "public/samples/policies/relocation-support.md"), "utf8");
});

const fresh = async () => (await createWorkspace(db, "hr_responds")).id;

describe("splitting a policy into sections", () => {
  it("uses Markdown headings, takes the H1 as the title and ignores comments", () => {
    const { title, sections } = splitPolicy(sample);
    expect(title).toBe("Relocation support");
    expect(sections.map((s) => s.title)).toEqual(["Who is eligible", "What Halden pays for", "Temporary housing", "How to claim"]);
    expect(sections[1]!.body).toContain("₹75,000");
    expect(JSON.stringify(sections)).not.toContain("Synthetic sample");
  });

  it("recognises numbered headings, but not numbered list items", () => {
    const { sections } = splitPolicy(
      ["1. Scope", "Applies to all joiners.", "", "2 Steps", "1. Bring your PAN card.", "2. Collect your laptop.", "", "§3 Exceptions", "HR can approve exceptions."].join("\n"),
    );
    expect(sections.map((s) => s.title)).toEqual(["Scope", "Steps", "Exceptions"]);
    expect(sections[1]!.body).toBe("1. Bring your PAN card. 2. Collect your laptop.");
  });

  it("splits plain paragraphs when there are no headings, and keeps text before the first heading", () => {
    expect(splitPolicy("Parking is free for joiners in week one.\n\nBikes go in the basement rack.").sections).toEqual([
      { title: "Parking is free for joiners in", body: "Parking is free for joiners in week one." },
      { title: "Bikes go in the basement rack", body: "Bikes go in the basement rack." },
    ]);
    expect(splitPolicy("Intro line.\n\n## Rules\n- One rule.").sections).toEqual([
      { title: "Overview", body: "Intro line." },
      { title: "Rules", body: "One rule." },
    ]);
  });

  it("cuts a long section at sentence boundaries so each part stays focused", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Rule ${i + 1} applies to every joiner in every office.`).join(" ");
    const { sections } = splitPolicy(`## Office rules\n${long}`);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[1]!.title).toBe("Office rules (part 2)");
    expect(sections.every((s) => s.body.length <= 1_200 && /\.$/.test(s.body))).toBe(true);
  });
});

describe("publishing a policy", () => {
  it("numbers a new policy after the library, makes it searchable at once, and only in that workspace", async () => {
    const ws = await fresh();
    const other = await fresh();
    const preview = await previewPolicy(db, ws, NOW, { title: "Relocation support", version: "1.0", text: sample });
    expect(preview.sections.map((s) => s.ref)).toEqual(["§9.1", "§9.2", "§9.3", "§9.4"]);
    expect(preview.effectiveDate).toBe("2026-10-07");
    expect(await searchPolicies(db, "moving household goods costs", { asOf: NOW, workspaceId: ws })).toEqual([]);

    await publishPolicy(db, ws, NOW, { title: "Relocation support", version: "1.0", text: sample });
    const [hit] = await searchPolicies(db, "Who pays for moving my household goods?", { asOf: NOW, workspaceId: ws });
    expect(hit).toMatchObject({ ref: "§9.2", title: "What Halden pays for", source: "hr" });
    expect(await searchPolicies(db, "Who pays for moving my household goods?", { asOf: NOW, workspaceId: other })).toEqual([]);
    expect((await listPolicies(db, ws, NOW)).at(-1)).toMatchObject({ title: "Relocation support", refs: "§9.1–§9.4", sections: 4, source: "hr", status: "in force" });
  });

  it("lets Ask Navo answer from the new policy and cite it", async () => {
    const ws = await fresh();
    await publishPolicy(db, ws, NOW, { title: "Relocation support", version: "1.0", text: sample });
    const answer = await askNavo(db, ws, "How many nights of temporary housing do I get?", { llm: null });
    expect(answer.text).toContain("14 nights");
    expect(answer.citations).toEqual([{ ref: "§9.3", title: "Temporary housing", document: "Relocation support" }]);
  });

  it("publishes a newer version of a library policy that supersedes it in this workspace only", async () => {
    const ws = await fresh();
    const other = await fresh();
    const text = "## Remote days\nUp to three remote days a week, any weekday.\n\n## Office days\nTuesdays are team days in the office.";
    await expect(previewPolicy(db, ws, NOW, { title: "Hybrid work policy", version: "2.1", replaces: "hybrid-work", text })).rejects.toThrow("higher than 2.1");
    const preview = await publishPolicy(db, ws, NOW, { title: "Hybrid work policy", version: "2.2", replaces: "hybrid-work", text });
    expect(preview.sections.map((s) => s.ref)).toEqual(["§2.1", "§2.2"]);
    const [mine] = await searchPolicies(db, "How many remote days a week?", { asOf: NOW, workspaceId: ws });
    expect(mine).toMatchObject({ version: "2.2", body: "Up to three remote days a week, any weekday." });
    const [theirs] = await searchPolicies(db, "How many remote days a week?", { asOf: NOW, workspaceId: other });
    expect(theirs?.version).toBe("2.1");
    const hybrid = (await listPolicies(db, ws, NOW)).filter((p) => p.family === "hybrid-work");
    expect(hybrid.map((p) => [p.version, p.status])).toEqual([
      ["2.2", "in force"],
      ["2.1", "superseded"],
      ["2.0", "superseded"],
    ]);
  });

  it("keeps a policy with a future date out of answers until it takes effect", async () => {
    const ws = await fresh();
    await publishPolicy(db, ws, NOW, { title: "Relocation support", version: "1.0", effectiveDate: "2026-11-01", text: sample });
    expect(await searchPolicies(db, "temporary housing nights", { asOf: NOW, workspaceId: ws })).toEqual([]);
    expect((await searchPolicies(db, "temporary housing nights", { asOf: atIst("2026-11-02", "10:00"), workspaceId: ws }))[0]?.ref).toBe("§9.3");
    expect((await listPolicies(db, ws, NOW)).find((p) => p.title === "Relocation support")?.status).toBe("scheduled");
  });

  it("refuses a duplicate title, an unknown policy, unreadable text and too many sections", async () => {
    const ws = await fresh();
    await expect(previewPolicy(db, ws, NOW, { title: "Benefits", version: "1.0", text: sample })).rejects.toThrow('Choose it under "Replaces"');
    await expect(previewPolicy(db, ws, NOW, { title: "X policy", version: "1.0", replaces: "nope", text: sample })).rejects.toBeInstanceOf(PolicyUploadError);
    await expect(previewPolicy(db, ws, NOW, { title: "Short", version: "1.0", text: "too short" })).rejects.toThrow("at least a few sentences");
    await expect(previewPolicy(db, ws, NOW, { title: "Bad version", version: "v2", text: sample })).rejects.toThrow("Use a version like");
    const many = Array.from({ length: 41 }, (_, i) => `## Rule ${i + 1}\nThis is rule number ${i + 1} of the many rules.`).join("\n");
    await expect(previewPolicy(db, ws, NOW, { title: "Many rules", version: "1.0", text: many })).rejects.toThrow("at most 40");
    await expect(previewPolicy(db, ws, NOW, { title: "Comments only", version: "1.0", text: `<!-- ${"nothing here ".repeat(5)} -->` })).rejects.toThrow("couldn't find");
  });

  it("removes uploaded policies when the visitor resets the demo", async () => {
    const ws = await fresh();
    await publishPolicy(db, ws, NOW, { title: "Relocation support", version: "1.0", text: sample });
    await reset(db, ws);
    expect((await listPolicies(db, ws, NOW)).some((p) => p.source === "hr")).toBe(false);
  });
});
