// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen as find, within } from "@testing-library/react";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import type { ViewModel } from "@/services/view-model/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/ui/state/NavoStore", async (original) => ({ ...(await original<object>()), useNavo: () => store.current }));
const { HrConsole } = await import("@/ui/hr/HrConsole");
const { RuntimePanel } = await import("@/ui/stage/RuntimePanel");
const { PresenterPanel } = await import("@/ui/stage/PresenterPanel");
const { GuideProvider } = await import("@/ui/stage/Guide");
const { IntroBrief, ImpactOutro } = await import("@/ui/stage/Briefs");

const vms = inject("viewModels");
const BROKEN = /undefined|NaN|\[object Object\]|Invalid Date/;

function use(vm: ViewModel, extra: Partial<Record<string, unknown>> = {}) {
  store.current = {
    vm,
    screen: "home",
    view: "emp",
    sheet: null,
    busy: false,
    replay: null,
    liveFace: "watching",
    messages: [],
    go: vi.fn(),
    setView: vi.fn(),
    setSheet: vi.fn(),
    say: vi.fn(),
    demo: vi.fn(async () => vm),
    employee: vi.fn(async () => vm),
    hr: vi.fn(async () => vm),
    ask: vi.fn(),
    refresh: vi.fn(async () => {}),
    latest: () => vm,
    ...extra,
  };
  return store.current as { demo: ReturnType<typeof vi.fn>; hr: ReturnType<typeof vi.fn>; go: ReturnType<typeof vi.fn> };
}

afterEach(cleanup);

describe("HR console", () => {
  for (const name of ["documents", "risk", "approval", "day1"]) {
    it(`renders its three pages at "${name}"`, () => {
      use(vms[name]!);
      render(<HrConsole />);
      const nav = find.getByRole("navigation", { name: "HR navigation" });
      for (const page of [/All joiners/, /Policies and rules/, /Needs HR/]) {
        fireEvent.click(within(nav).getByRole("button", { name: page }));
        expect(within(nav).getByRole("button", { name: page }).getAttribute("aria-current")).toBe("page");
        expect(find.getByRole("region", { name: "HR console" }).textContent).not.toMatch(BROKEN);
      }
    });
  }

  it("lets HR generate the late Employee ID from the queue", () => {
    const s = use(vms.risk!);
    render(<HrConsole />);
    fireEvent.click(find.getByRole("button", { name: "Generate ID" }));
    expect(s.hr).toHaveBeenCalledWith({ action: "generate_id" });
  });

  it("shows a loading face before the first state arrives", () => {
    use(vms.risk!, { vm: null });
    render(<HrConsole />);
    expect(find.getByRole("region", { name: "HR console" }).textContent).toBe("");
  });
});

describe("runtime panel", () => {
  it("lists the latest run's tool calls, state changes and earlier runs", () => {
    const vm = vms.risk!;
    use(vm);
    render(<RuntimePanel />);
    const panel = find.getByRole("complementary", { name: "Agent runtime" });
    expect(panel.textContent).toContain("send_reminder");
    expect(panel.textContent).toContain("State changes");
    expect(panel.textContent).toContain("Guardrails");
    expect(panel.textContent).not.toMatch(BROKEN);
  });

  it("replays tool calls one by one while Navo works", () => {
    const vm = vms.risk!;
    const tools = vm.runtime.runs[0]!.tools;
    use(vm, { replay: { tools, index: 1 } });
    render(<RuntimePanel />);
    const panel = find.getByRole("complementary", { name: "Agent runtime" });
    expect(panel.textContent).toContain("Running");
    expect(panel.textContent).toContain("running…");
  });
});

describe("presenter controls and briefs", () => {
  it("jumps to a chapter, advances time and resets through the demo API", async () => {
    const s = use(vms.risk!);
    render(
      <GuideProvider>
        <PresenterPanel />
      </GuideProvider>,
    );
    const chapters = find.getByRole("navigation", { name: "Chapters" });
    await act(async () => fireEvent.click(within(chapters).getAllByRole("button")[2]!));
    expect(s.demo).toHaveBeenCalledWith({ action: "chapter", chapter: 2 });
    await act(async () => fireEvent.click(find.getByRole("button", { name: "Advance time ▸" })));
    expect(s.demo).toHaveBeenCalledWith({ action: "advance" });
    await act(async () => fireEvent.click(find.getByRole("button", { name: "Reset" })));
    expect(s.demo).toHaveBeenCalledWith({ action: "reset" });
    expect(s.go).toHaveBeenCalledWith("launch");
  });

  it("opens on the intro brief and explores on request", () => {
    use(vms.documents!);
    render(
      <GuideProvider>
        <IntroBrief />
        <ImpactOutro />
      </GuideProvider>,
    );
    const intro = find.getByRole("dialog", { name: "About this demo" });
    expect(intro.textContent).toContain("Navo");
    fireEvent.click(within(intro).getByRole("button", { name: "Explore on my own" }));
    expect(find.queryByRole("dialog", { name: "About this demo" })).toBeNull();
  });
});
