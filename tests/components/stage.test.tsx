// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen as find, within } from "@testing-library/react";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import type { ViewModel } from "@/services/view-model/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/ui/state/NavoStore", async (original) => ({ ...(await original<object>()), useNavo: () => store.current }));
const { HrConsole } = await import("@/ui/hr/HrConsole");
const { RuntimePanel } = await import("@/ui/stage/RuntimePanel");
const { PresenterPanel } = await import("@/ui/stage/PresenterPanel");
const { CaptionBar, GuideProvider } = await import("@/ui/stage/Guide");
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

  it("starts the guided demo at the chapter clicked in the intro brief", async () => {
    const vm = vms.risk!;
    const s = use({ ...vm, workspace: { ...vm.workspace, scenario: "hr_responds" } });
    render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    const intro = find.getByRole("dialog", { name: "About this demo" });
    await act(async () => fireEvent.click(within(intro).getByRole("button", { name: /Navo at work/ })));
    expect(find.queryByRole("dialog", { name: "About this demo" })).toBeNull();
    expect(s.demo).toHaveBeenNthCalledWith(1, { action: "chapter", chapter: 2 });
    // Then the chapter's first beat runs on the engine.
    expect(s.demo).toHaveBeenNthCalledWith(2, { action: "skip", to: "risk_day" });
  });

  it("jumps to the late Employee ID from the Watch for card, switching HR back to responding first", async () => {
    const vm = vms.risk!;
    const s = use({ ...vm, workspace: { ...vm.workspace, scenario: "hr_silent" } });
    render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    await act(async () => fireEvent.click(find.getByRole("button", { name: "▶ Jump to this moment" })));
    expect(s.demo).toHaveBeenNthCalledWith(1, { action: "scenario", scenario: "hr_responds" });
    expect(s.demo).toHaveBeenNthCalledWith(2, { action: "chapter", chapter: 2 });
  });

  it("restarts the story when the first chapter is clicked", async () => {
    const s = use(vms.risk!);
    render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    await act(async () => fireEvent.click(find.getByRole("button", { name: /Meet Navo/ })));
    expect(s.demo).toHaveBeenCalledWith({ action: "reset", scenario: "hr_responds" });
    expect(s.demo).not.toHaveBeenCalledWith(expect.objectContaining({ action: "chapter" }));
  });

  it("lets Space press a focused chapter row instead of playing the demo from the start", () => {
    const s = use(vms.risk!);
    render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    const row = find.getByRole("button", { name: /Ready for Day 1/ });
    row.focus();
    fireEvent.keyDown(row, { key: " " });
    expect(s.demo).not.toHaveBeenCalled();
    expect(find.getByRole("dialog", { name: "About this demo" })).toBeTruthy();
  });

  it("offers the same chapter again when a jump fails", async () => {
    const vm = vms.risk!;
    const s = use({ ...vm, workspace: { ...vm.workspace, scenario: "hr_responds" } });
    s.demo.mockImplementation(async (body: { action: string }) => (body.action === "chapter" ? null : vm));
    render(
      <GuideProvider>
        <IntroBrief />
        <CaptionBar />
      </GuideProvider>,
    );
    await act(async () => fireEvent.click(find.getByRole("button", { name: /chapter 5: Day 1/ })));
    const bar = find.getByRole("region", { name: "Guided demo" });
    expect(bar.textContent).toContain("The demo action failed");
    s.demo.mockClear();
    await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "▶ Play" })));
    expect(s.demo).toHaveBeenCalledWith({ action: "chapter", chapter: 4 });
    expect(s.demo).not.toHaveBeenCalledWith(expect.objectContaining({ action: "reset" }));
  });

  it("opens Anand's app or Priya's HR console from their cards", () => {
    const vm = vms.documents!;
    const s = use(vm) as ReturnType<typeof use> & { setView: ReturnType<typeof vi.fn> };
    const { unmount } = render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    fireEvent.click(find.getByRole("button", { name: new RegExp(vm.employee.hrName) }));
    expect(s.setView).toHaveBeenCalledWith("hr");
    expect(find.queryByRole("dialog", { name: "About this demo" })).toBeNull();
    unmount();
    render(
      <GuideProvider>
        <IntroBrief />
      </GuideProvider>,
    );
    fireEvent.click(find.getByRole("button", { name: new RegExp(vm.employee.name) }));
    expect(s.setView).toHaveBeenLastCalledWith("emp");
    expect(s.go).toHaveBeenCalledWith("launch");
  });
});
