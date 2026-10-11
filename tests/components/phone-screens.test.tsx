// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen as find, within } from "@testing-library/react";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import type { ViewModel } from "@/services/view-model/types";
import type { ChatMessage, Screen, Sheet } from "@/ui/state/NavoStore";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/ui/state/NavoStore", async (original) => ({ ...(await original<object>()), useNavo: () => store.current }));
const { Phone } = await import("@/ui/phone/Phone");

const vms = inject("viewModels");
const SCREENS: Screen[] = ["launch", "signin", "meet", "docs", "privacy", "clarify", "forms", "home", "culture", "idtrack", "journey", "updates", "idcard", "pickup", "day1", "confirm", "day1done", "week1", "benefits", "day30"];
const BROKEN = /undefined|NaN|\[object Object\]|Invalid Date/;

function use(vm: ViewModel, screen: Screen, extra: Partial<Record<string, unknown>> = {}) {
  store.current = {
    vm,
    screen,
    sheet: null as Sheet,
    toast: null,
    error: null,
    busy: false,
    replay: null,
    why: false,
    liveFace: "watching",
    liveStatus: null,
    messages: [] as ChatMessage[],
    go: vi.fn(),
    setSheet: vi.fn(),
    toggleWhy: vi.fn(),
    setWhy: vi.fn(),
    say: vi.fn(),
    ask: vi.fn(),
    demo: vi.fn(async () => vm),
    employee: vi.fn(async () => vm),
    hr: vi.fn(async () => vm),
    refresh: vi.fn(),
    latest: () => vm,
    ...extra,
  };
  return store.current as { go: ReturnType<typeof vi.fn>; employee: ReturnType<typeof vi.fn>; setSheet: ReturnType<typeof vi.fn> };
}

// jsdom has no layout, so no scrolling; the Ask sheet scrolls to the newest answer.
Element.prototype.scrollTo = () => {};

afterEach(cleanup);

describe("the joiner's phone renders every screen from real engine state", () => {
  for (const [name, vm] of Object.entries(vms)) {
    it(`renders all ${SCREENS.length} screens at "${name}" without broken copy`, () => {
      for (const screen of SCREENS) {
        use(vm, screen);
        const { container, unmount } = render(<Phone />);
        const phone = find.getByRole("region", { name: "Anand's phone" });
        expect(phone.textContent!.length, `${name}/${screen}`).toBeGreaterThan(20);
        expect(container.textContent, `${name}/${screen}`).not.toMatch(BROKEN);
        unmount();
      }
    });
  }
});

describe("phone interactions", () => {
  it("shows the home headline and the risk Navo is watching", () => {
    use(vms.risk!, "home");
    render(<Phone />);
    expect(find.getByText(vms.risk!.home.headline)).toBeTruthy();
    expect(find.getByText("Laptop may miss Day 1")).toBeTruthy();
  });

  it("asks the joiner to approve the loaner and sends the decision", () => {
    const vm = vms.approval!;
    expect(vm.pendingApproval).not.toBeNull();
    const s = use(vm, "home");
    render(<Phone />);
    const approve = find.getAllByRole("button").find((b) => /approve|yes/i.test(b.textContent ?? ""));
    expect(approve, "an approve button").toBeTruthy();
    fireEvent.click(approve!);
    expect(s.employee).toHaveBeenCalledWith({ action: "decide_approval", approvalId: vm.pendingApproval!.id, decision: "approved" });
  });

  it("shows Ask Navo's answers with who wrote them and what was checked", () => {
    const messages: ChatMessage[] = [
      { id: 1, role: "user", text: "What if HR doesn't respond?" },
      { id: 2, role: "navo", text: "I reminded Priya Nair at 09:17 today (Section 4.2).", checked: ["Onboarding standards and escalation, Section 4.2"], composedBy: "fallback", answeredBy: "Answered from Navo's rules (no AI key connected)", actions: [{ label: "Show me", run: "activity" }] },
      { id: 3, role: "navo", text: "Checking your state and policy…", pending: true },
    ];
    const s = use(vms.risk!, "home", { sheet: "ask", messages });
    render(<Phone />);
    const sheet = find.getByRole("dialog", { name: "Ask Navo" });
    expect(within(sheet).getByText("Checked Onboarding standards and escalation, Section 4.2")).toBeTruthy();
    expect(within(sheet).getByText("Answered from Navo's rules (no AI key connected)")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Show me" }));
    expect(s.setSheet).toHaveBeenCalledWith("activity");
  });

  it("opens the activity sheet with Navo's reasons", () => {
    use(vms.risk!, "home", { sheet: "activity", why: true });
    render(<Phone />);
    expect(find.getByRole("dialog", { name: "What Navo did" }).textContent!.length).toBeGreaterThan(40);
  });

  it("links back to Home on its own page, where there's no presenter panel", () => {
    use(vms.documents!, "docs");
    const { unmount } = render(<Phone fullscreen />);
    expect(find.getByRole("link", { name: "← Back to Home" }).getAttribute("href")).toBe("/");
    unmount();
    render(<Phone />);
    expect(find.queryByRole("link", { name: "← Back to Home" })).toBeNull();
  });

  it("shows a toast and an error", () => {
    use(vms.documents!, "docs", { toast: "Address proof verified", error: "Something went wrong" });
    render(<Phone />);
    expect(find.getByRole("status").textContent).toContain("Address proof verified");
    expect(find.getByRole("alert").textContent).toBe("Something went wrong");
  });
});
