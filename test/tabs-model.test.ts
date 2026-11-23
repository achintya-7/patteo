import { describe, expect, test } from "bun:test";
import { activateTab, closeTab, cycleTab, emptyTabs, moveTab, openTab, previousTab, pruneTabs, selectTabIndex } from "../src/ui/workspace/tabs-model";

const three = () => openTab(openTab(openTab(emptyTabs(), "a"), "b"), "c");

describe("tabs model", () => {
  test("open appends and activates; reopening just activates", () => {
    const s = three();
    expect(s.tabs).toEqual(["a", "b", "c"]);
    expect(s.active).toBe("c");
    const r = openTab(s, "a");
    expect(r.tabs).toEqual(["a", "b", "c"]);
    expect(r.active).toBe("a");
  });

  test("open after active inserts next to it", () => {
    const s = openTab(activateTab(three(), "a"), "d", { after: "active" });
    expect(s.tabs).toEqual(["a", "d", "b", "c"]);
  });

  test("closing the active tab returns to the most recently used", () => {
    let s = activateTab(three(), "a"); // mru: a, c, b
    s = closeTab(s);
    expect(s.active).toBe("c");
    expect(s.tabs).toEqual(["b", "c"]);
  });

  test("closing an inactive tab keeps the active one", () => {
    const s = closeTab(three(), "a");
    expect(s.active).toBe("c");
    expect(s.tabs).toEqual(["b", "c"]);
  });

  test("closing the last tab leaves none active", () => {
    expect(closeTab(openTab(emptyTabs(), "a")).active).toBeNull();
  });

  test("cycle wraps both ways; select by index", () => {
    expect(cycleTab(three(), 1).active).toBe("a");
    expect(cycleTab(three(), -1).active).toBe("b");
    expect(selectTabIndex(three(), 1).active).toBe("b");
    expect(selectTabIndex(three(), 9).active).toBe("c");
  });

  test("previousTab flips between the last two", () => {
    const s = previousTab(three());
    expect(s.active).toBe("b");
    expect(previousTab(s).active).toBe("c");
  });

  test("moveTab reorders the active tab", () => {
    expect(moveTab(three(), -1).tabs).toEqual(["a", "c", "b"]);
    expect(moveTab(three(), 1).tabs).toEqual(["a", "b", "c"]);
  });

  test("prune removes dead agents and keeps identity when nothing changes", () => {
    const s = three();
    expect(pruneTabs(s, () => true)).toBe(s);
    const p = pruneTabs(s, (id) => id !== "c");
    expect(p.tabs).toEqual(["a", "b"]);
    expect(p.active).toBe("b");
  });
});

import { fitTabs } from "../src/ui/workspace/TabBar";

describe("fitTabs", () => {
  const specs = Array.from({ length: 6 }, (_, i) => ({ id: String(i), label: "x", width: 10 }));
  test("everything fits", () => expect(fitTabs(specs.slice(0, 2), 0, 100)).toEqual({ start: 0, end: 2 }));
  test("window always contains the active tab", () => {
    const r = fitTabs(specs, 5, 34); // budget 30 → 3 tabs
    expect(r.end).toBe(6);
    expect(r.start).toBe(3);
  });
  test("grows right from the active tab first", () => expect(fitTabs(specs, 1, 34)).toEqual({ start: 1, end: 4 }));
});
