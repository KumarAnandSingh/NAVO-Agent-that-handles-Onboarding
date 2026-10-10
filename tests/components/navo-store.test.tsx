// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { ViewModel } from "@/services/view-model/types";
import { NavoProvider, REPLAY_STEP_MS, useNavo } from "@/ui/state/NavoStore";

const vms = inject("viewModels");
type Store = ReturnType<typeof useNavo>;

/** Renders the provider and hands back the live store. */
function mount(props: { initialScreen?: "launch" | "auto"; pollMs?: number } = {}) {
  const ref: { current: Store | null } = { current: null };
  function Probe() {
    ref.current = useNavo();
    return null;
  }
  render(
    <NavoProvider {...props}>
      <Probe />
    </NavoProvider>,
  );
  return () => ref.current!;
}

/** A fetch that answers each URL from a queue of bodies, recording what was sent. */
function server(routes: Record<string, { status?: number; body: unknown }[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const queue = routes[url]!;
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, json: async () => next.body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the client store", () => {
  it("loads the state, opens on the right screen and fails without crashing", async () => {
    server({ "/api/state": [{ body: { vm: vms.risk } }] });
    const store = mount({ initialScreen: "auto" });
    await waitFor(() => expect(store().vm?.chapter).toBe("pre_joining"));
    expect(store().screen).toBe("home");
    cleanup();
    server({ "/api/state": [{ status: 500, body: { error: "Something went wrong" } }] });
    const broken = mount();
    await waitFor(() => expect(broken().error).toBe("Something went wrong"));
  });

  it("replays Navo's new tool calls one by one before showing the new state", async () => {
    server({ "/api/state": [{ body: { vm: vms.documents } }], "/api/demo": [{ body: { vm: vms.risk } }] });
    const store = mount();
    await waitFor(() => expect(store().vm).not.toBeNull());
    vi.useFakeTimers();
    await act(async () => {
      await store().demo({ action: "advance" });
    });
    const tools = store().replay?.tools ?? [];
    expect(tools.length).toBeGreaterThan(1);
    expect(store().liveStatus?.working).toBe(true);
    // The new state is visible to the guided demo at once, and on screen after the replay.
    expect(store().latest()?.chapter).toBe("pre_joining");
    expect(store().vm?.chapter).toBe("documents");
    for (let i = 0; i < tools.length; i++) await act(async () => vi.advanceTimersByTime(REPLAY_STEP_MS));
    expect(store().replay).toBeNull();
    expect(store().vm?.chapter).toBe("pre_joining");
  });

  it("sends the visitor's key with every call, and shows API errors", async () => {
    sessionStorage.setItem("navo.claudeKey", "sk-ant-test");
    const calls = server({ "/api/state": [{ body: { vm: vms.risk } }], "/api/employee": [{ status: 400, body: { error: "Tap what you collected" } }] });
    const store = mount();
    await waitFor(() => expect(store().vm).not.toBeNull());
    let result: ViewModel | null = vms.risk!;
    await act(async () => {
      result = await store().employee({ action: "confirm_pickup", collected: [] });
    });
    expect(result).toBeNull();
    expect(store().error).toBe("Tap what you collected");
    expect(calls.every((c) => (c.init?.headers as Record<string, string> | undefined)?.["x-navo-claude-key"] === "sk-ant-test")).toBe(true);
  });

  it("asks Navo, shows the pending line, then the answer with who wrote it", async () => {
    const answer = { text: "Bring your PAN card (§6.1).", checked: ["Day 1 guide §6.1"], composedBy: "claude", model: "claude-sonnet-5-5", showActivity: true };
    server({ "/api/state": [{ body: { vm: vms.risk } }], "/api/ask": [{ body: { answer, vm: vms.risk } }] });
    const store = mount();
    await waitFor(() => expect(store().vm).not.toBeNull());
    await act(async () => {
      await store().ask("What should I bring?");
    });
    expect(store().sheet).toBe("ask");
    expect(store().messages.map((m) => [m.role, m.text, m.answeredBy ?? null])).toEqual([
      ["user", "What should I bring?", null],
      ["navo", "Bring your PAN card (§6.1).", "Answered by Claude Sonnet 5.5 with Navo's tools"],
    ]);
    expect(store().messages[1]!.actions).toEqual([{ label: "Show me", run: "activity" }]);
    await act(async () => {
      await store().ask("   ");
    });
    expect(store().messages).toHaveLength(2);
  });

  it("shows an error line when Ask fails, and navigates and toasts", async () => {
    server({ "/api/state": [{ body: { vm: vms.risk } }], "/api/ask": [{ status: 500, body: { error: "Something went wrong" } }] });
    const store = mount();
    await waitFor(() => expect(store().vm).not.toBeNull());
    await act(async () => {
      await store().ask("Hello?");
    });
    expect(store().messages.at(-1)?.text).toBe("Something went wrong");
    act(() => store().go("idtrack"));
    expect(store().screen).toBe("idtrack");
    act(() => store().setView("hr"));
    expect(store().view).toBe("hr");
    act(() => store().toggleWhy());
    expect(store().why).toBe(true);
    vi.useFakeTimers();
    act(() => store().say("Saved"));
    expect(store().toast).toBe("Saved");
    act(() => vi.advanceTimersByTime(3_000));
    expect(store().toast).toBeNull();
  });

  it("toasts after a joiner action and polls for outside changes", async () => {
    const calls = server({ "/api/state": [{ body: { vm: vms.ready } }], "/api/employee": [{ body: { vm: vms.ready } }], "/api/hr": [{ body: { vm: vms.ready } }] });
    const store = mount({ pollMs: 1_000 });
    await waitFor(() => expect(store().vm).not.toBeNull());
    await act(async () => {
      await store().employee({ action: "pulse", score: 4 }, (vm) => `Thanks · ${vm.employee.firstName}`);
    });
    expect(store().toast).toBe("Thanks · Anand");
    await act(async () => {
      await store().hr({ action: "generate_id" });
    });
    const before = calls.filter((c) => c.url === "/api/state").length;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(calls.filter((c) => c.url === "/api/state").length).toBeGreaterThan(before);
  });
});
