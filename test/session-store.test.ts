import { describe, expect, test } from "bun:test";
import { createSessionStore, timelineKey } from "../src/stores/session";
import { normalizeHostInput } from "../src/config/hosts";

describe("session store", () => {
  test("hosts: add, activate, remove clears timelines", () => {
    const s = createSessionStore();
    s.actions.addHost({ id: "a", label: "a", url: "ws://x/ws" });
    s.actions.addHost({ id: "b", label: "b", url: "ws://y/ws" });
    expect(s.getState().activeHostId).toBe("a");
    s.actions.updateTimeline(timelineKey("a", "ag"), (t) => ({ ...t, loading: false }));
    s.actions.removeHost("a");
    expect(s.getState().activeHostId).toBe("b");
    expect(s.getState().timelines).toEqual({});
  });

  test("agents: snapshot, upsert, remove", () => {
    const s = createSessionStore();
    s.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
    s.actions.setAgents("h", [{ id: "1", title: "one" } as any]);
    s.actions.upsertAgent("h", { id: "2", title: "two" } as any);
    s.actions.removeAgent("h", "1");
    const h = s.getState().hosts.h!;
    expect(Object.keys(h.agents)).toEqual(["2"]);
    expect(h.loaded.agents).toBe(true);
  });
});

describe("normalizeHostInput", () => {
  test.each([
    ["6767", "ws://127.0.0.1:6767/ws"],
    ["box.local:6767", "ws://box.local:6767/ws"],
    ["tcp://10.0.0.2:7000", "ws://10.0.0.2:7000/ws"],
    ["ws://h:1", "ws://h:1/ws"],
    ["wss://h.example/ws", "wss://h.example/ws"],
  ])("%s → %s", (input, out) => expect(normalizeHostInput(input)).toBe(out));

  test("rejects junk", () => expect(() => normalizeHostInput("not a host")).toThrow());
});
