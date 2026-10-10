// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HrVM, RadarVM } from "@/services/view-model/types";
import { JoinersPage } from "@/ui/hr/JoinersPage";
import { PoliciesPage } from "@/ui/hr/PoliciesPage";

const refresh = vi.fn(async () => {});
vi.mock("@/ui/state/NavoStore", () => ({ useNavo: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const joiner = (name: string, label: string, tone: "done" | "risk" | "you", changed = false) => ({ id: name, name, role: "Engineer", start: "Mon 26 Oct", level: "x", label, tone, driver: "Laptop · IT", changed });
const radar: RadarVM = {
  scenarios: [
    { id: "today", label: "As things stand", summary: "No Day 1 at risk.", levels: [{ level: "low", label: "On track", count: 2, tone: "done" }], bottlenecks: [], joiners: [joiner("Asha Rao", "On track", "done"), joiner("Bilal Khan", "On track", "done")] },
    {
      id: "it_slow",
      label: "IT takes a week longer",
      summary: "2 joiners at risk of a broken Day 1; IT drives all of them.",
      levels: [{ level: "critical", label: "Will miss Day 1", count: 2, tone: "you" }],
      bottlenecks: [{ team: "IT", joiners: 2, worst: "Will miss Day 1", tone: "you" }],
      joiners: [joiner("Asha Rao", "Will miss Day 1", "you", true), joiner("Bilal Khan", "Will miss Day 1", "you", true)],
    },
  ],
};

describe("cohort radar page", () => {
  it("switches what-if scenarios and marks the joiners whose Day 1 changes", () => {
    render(<JoinersPage hr={{ radar } as HrVM} />);
    expect(screen.getByText("No Day 1 at risk.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Bottlenecks by team" })).toBeNull();
    const whatIf = screen.getByRole("group", { name: "What if" });
    fireEvent.click(within(whatIf).getByRole("button", { name: "IT takes a week longer" }));
    expect(within(whatIf).getByRole("button", { name: "IT takes a week longer" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("2 joiners at risk of a broken Day 1; IT drives all of them.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Bottlenecks by team" })).getByText("2 joiners · will miss day 1")).toBeTruthy();
    expect(screen.getAllByText("changed")).toHaveLength(2);
  });
});

const policies: HrVM["policies"] = {
  today: "2026-10-07",
  items: [
    { documentId: "benefits", family: "benefits", title: "Benefits", version: "3.0", effectiveDate: "2026-04-01", refs: "3.1–3.3", sections: 3, source: "library", status: "in force" },
    { documentId: "hybrid-work", family: "hybrid-work", title: "Hybrid work policy", version: "2.0", effectiveDate: "2025-01-01", refs: "2.1", sections: 1, source: "library", status: "superseded" },
    { documentId: "hr-1~ws", family: "hr-1~ws", title: "Parking", version: "1.0", effectiveDate: "2026-11-01", refs: "9.1", sections: 1, source: "hr", status: "scheduled" },
  ],
  replaceable: [{ family: "benefits", title: "Benefits", version: "3.0" }],
};
const preview = { documentId: "hr-2~ws", title: "Relocation support", version: "1.0", effectiveDate: "2026-10-07", replaces: null, sections: [{ ref: "Section 10.1", title: "Who is eligible", body: "Joiners who move." }, { ref: "Section 10.2", title: "Temporary housing", body: "14 nights." }] };

function respond(...bodies: { ok?: boolean; body: unknown; text?: string }[]) {
  const queue = [...bodies];
  return vi.fn(async () => {
    const next = queue.shift()!;
    return { ok: next.ok ?? true, status: next.ok === false ? 400 : 200, json: async () => next.body, text: async () => next.text ?? "" } as Response;
  });
}

describe("policies page", () => {
  it("lists the library with each version's status", () => {
    render(<PoliciesPage policies={policies} />);
    const rows = within(screen.getByRole("table", { name: "Policy library" })).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([
      "PolicyVersionSectionsEffectiveStatus",
      "Benefits3.03.1–3.3 · 32026-04-01In force",
      "Hybrid work policy2.02.1 · 12025-01-01Superseded",
      "ParkingAdded by HR1.09.1 · 12026-11-01Scheduled",
    ]);
  });

  it("loads the sample, previews the sections, publishes and refreshes", async () => {
    const fetchMock = respond({ body: null, text: "# Relocation support\n\n## Who is eligible\nJoiners who move more than 100 km." }, { body: { preview } }, { body: { published: preview } });
    vi.stubGlobal("fetch", fetchMock);
    render(<PoliciesPage policies={policies} />);
    const publish = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: "Load a sample policy" }));
    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Relocation support"));
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Preview sections" }));
    const list = await screen.findByRole("list", { name: "Sections Navo found" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["10.1Who is eligible Joiners who move.", "10.2Temporary housing 14 nights."]);
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Published Relocation support v1.0. Navo can cite Sections 10.1–10.2 from now on."));
    expect(refresh).toHaveBeenCalledOnce();
    const [, previewCall] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(previewCall![1].body))).toMatchObject({ action: "preview_policy", policy: { title: "Relocation support", version: "1.0", effectiveDate: "2026-10-07" } });
  });

  it("prefills title and next version when replacing a policy, and shows server errors", async () => {
    vi.stubGlobal("fetch", respond({ ok: false, body: { error: "The new version must be higher than 3.0." } }));
    render(<PoliciesPage policies={policies} />);
    fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "benefits" } });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Benefits");
    expect((screen.getByLabelText("Version") as HTMLInputElement).value).toBe("3.1");
    fireEvent.change(screen.getByLabelText("Policy text"), { target: { value: "## Leave\nEveryone gets twenty days of leave every year from now." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview sections" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The new version must be higher than 3.0.");
    fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "" } });
    expect((screen.getByLabelText("Version") as HTMLInputElement).value).toBe("1.0");
  });

  it("reads an uploaded text file and refuses one that is too large", async () => {
    render(<PoliciesPage policies={policies} />);
    const input = screen.getByLabelText(/upload a \.md or \.txt file/) as HTMLInputElement;
    const file = new File(["# Parking rules\n\n## Bikes\nBikes go in the basement rack, free for everyone."], "parking.md", { type: "text/markdown" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Parking rules"));
    expect((screen.getByLabelText("Policy text") as HTMLTextAreaElement).value).toContain("basement rack");
    const big = new File(["x".repeat(31_000)], "huge.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole("alert")).textContent).toContain("over 30 KB");
  });
});
