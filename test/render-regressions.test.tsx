import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { useState, useEffect } from "react";
import { AgentPicker } from "../src/ui/workspace/AgentPicker";

const agent = { id: "a1", title: "First agent", status: "idle", provider: "claude", model: "m", updatedAt: new Date().toISOString() } as any;

function Harness({ next }: { next: unknown[] }) {
  const [agents, setAgents] = useState<any[]>([]);
  useEffect(() => void setTimeout(() => setAgents(next as any[]), 0), []);
  return <AgentPicker agents={agents} openTabs={[]} cursor={0} width={60} height={10} onOpen={() => {}} />;
}

describe("render regressions", () => {
  test("agent picker survives going from 0 agents to 1 (crashed: Native scene text requires a string)", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const t = await testRender(<Harness next={[agent]} />, { width: 60, height: 10 });
      await t.renderOnce();
      await Bun.sleep(20);
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("First agent");
      t.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });

  test("no <text content=…> in src: mixing content= and children at one position crashes the reconciler", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && /<text[^>]*\scontent=/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    walk(join(import.meta.dir, "../src"));
    expect(offenders).toEqual([]);
  });
});

import { createSessionStore, timelineKey } from "../src/stores/session";
import { createUiStore } from "../src/stores/ui";
import { AppContext } from "../src/stores/context";
import { AgentView } from "../src/ui/agent/AgentView";
import { createSettingsStore } from "../src/stores/settings";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { applyStreamEvent, hydrateTimeline, emptyTimeline } from "../src/paseo/timeline";

describe("AgentView", () => {
  test("renders every item type and streams deltas into the open message", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const store = createSessionStore();
      const ui = createUiStore();
      const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
      store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
      store.actions.setAgents("h", [{ id: "a", status: "running", cwd: "/repo", workspaceId: "w", updatedAt: new Date().toISOString() } as any]);
      const key = timelineKey("h", "a");
      store.actions.updateTimeline(key, () =>
        hydrateTimeline(emptyTimeline(), {
          epoch: "E",
          endCursor: { epoch: "E", seq: 10 },
          entries: [
            { item: { type: "user_message", text: "Please fix the bug" } },
            { item: { type: "reasoning", text: "Looking at the code first" } },
            { item: { type: "tool_call", callId: "c1", name: "Bash", status: "completed", error: null, detail: { type: "shell", command: "git status", output: "clean" } } as any },
            { item: { type: "todo", items: [{ text: "Find bug", completed: true }, { text: "Fix bug", completed: false, status: "in_progress", activeForm: "Fixing bug" }] } },
            { item: { type: "error", message: "Something failed" } },
            { item: { type: "assistant_message", text: "Done with **step one**" } },
          ],
        }),
      );
      const runtimes = { get: () => ({ openTimeline: () => () => {}, loadOlder: async () => {} }) } as any;
      const t = await testRender(
        <AppContext.Provider value={{ store, ui, runtimes, settings }}>
          <AgentView hostId="h" workspaceId="w" agentId="a" width={70} height={20} />
        </AppContext.Provider>,
        { width: 70, height: 20 },
      );
      await t.renderOnce();
      store.actions.updateTimeline(key, (s) => applyStreamEvent(s, { event: { type: "timeline", item: { type: "assistant_message", text: " and two" } }, seq: 11, epoch: "E" }));
      await Bun.sleep(30);
      await t.renderOnce();
      const frame = t.captureCharFrame();
      // The run before the answer has 4 activity entries and the turn is running, but it isn't the
      // last run (an answer follows), so it collapses to a summary.
      expect(frame).toContain("▸ 1 thought · 1 tool · 2 more");
      for (const s of ["┃  Please fix the bug", "Done with step one and two", "Writing…"]) {
        expect(frame).toContain(s);
      }
      t.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });
});

import { Markdown } from "../src/ui/agent/Markdown";
import { SyntaxStyle, RGBA } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useMemo } from "react";
import { mermaidToText } from "../src/ui/agent/mermaid";

describe("mermaid", () => {
  test("mermaidToText renders flowcharts and returns null for garbage", () => {
    expect(mermaidToText("graph LR\n  A --> B")).toContain("─");
    expect(mermaidToText("this is not mermaid at all {{{")).toBeNull();
  });

  test("markdown draws closed ```mermaid fences as diagrams, open ones as code", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      function M({ md }: { md: string }) {
        const r = useRenderer();
        const style = useMemo(() => SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex("#ffffff") } }, r.nativeScene!), [r]);
        return <Markdown content={md} syntaxStyle={style} fg="#ffffff" />;
      }
      const closed = await testRender(<M md={"Flow:\n\n```mermaid\ngraph LR\n  Alpha --> Beta\n```\n"} />, { width: 60, height: 14 });
      for (let i = 0; i < 5; i++) await closed.renderOnce();
      const f = closed.captureCharFrame();
      expect(f).toContain("diagram");
      expect(f).toContain("Alpha");
      expect(f).not.toContain("-->");
      closed.renderer.destroy();

      const open = await testRender(<M md={"```mermaid\ngraph LR\n  Alpha --> Beta\n"} />, { width: 60, height: 8 });
      for (let i = 0; i < 5; i++) await open.renderOnce();
      expect(open.captureCharFrame()).toContain("Alpha --> Beta");
      open.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });
});

import { normalizeStateDiagram } from "../src/ui/agent/mermaid";
test("state diagram [*] becomes labelled start/end states; other diagrams untouched", () => {
  const out = normalizeStateDiagram("stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]");
  expect(out).toBe('stateDiagram-v2\n  state "start" as __start\n  state "end" as __end\n  __start --> Idle\n  Idle --> __end');
  expect(normalizeStateDiagram("graph LR\n  A --> B")).toBe("graph LR\n  A --> B");
  const drawn = mermaidToText("stateDiagram-v2\n  [*] --> Idle")!;
  expect(drawn).toContain("start");
  expect(drawn).not.toContain("●");
});

describe("streaming markdown lists", () => {
  // Crashed in OpenTUI 0.9.7: updateList read `_shown[item]` while a list was still
  // being applied, so a not-yet-shown item threw. Patched in patches/@opentui%2Fcore@0.9.7.patch.
  test("a bulleted list streamed into AgentView does not crash", async () => {
    const origError = console.error;
    console.error = () => {};
    const md = readFileSync(join(import.meta.dir, "fixtures/streaming-list.md"), "utf8");
    try {
      const store = createSessionStore();
      const ui = createUiStore();
      const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
      store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
      store.actions.setAgents("h", [{ id: "a", status: "running", cwd: "/repo", workspaceId: "w", updatedAt: new Date().toISOString() } as any]);
      const key = timelineKey("h", "a");
      store.actions.updateTimeline(key, () =>
        hydrateTimeline(emptyTimeline(), {
          epoch: "E",
          endCursor: { epoch: "E", seq: 10 },
          entries: [
            { item: { type: "user_message", text: "Status?" } },
            { item: { type: "assistant_message", text: "" } },
          ],
        }),
      );
      const runtimes = { get: () => ({ openTimeline: () => () => {}, loadOlder: async () => {} }) } as any;
      const t = await testRender(
        <AppContext.Provider value={{ store, ui, runtimes, settings }}>
          <AgentView hostId="h" workspaceId="w" agentId="a" width={110} height={40} />
        </AppContext.Provider>,
        { width: 110, height: 40 },
      );
      let seq = 11;
      for (let i = 0; i < md.length; i += 25) {
        store.actions.updateTimeline(key, (s) =>
          applyStreamEvent(s, { event: { type: "timeline", item: { type: "assistant_message", text: md.slice(i, i + 25) } }, seq: seq++, epoch: "E" } as never),
        );
        await Bun.sleep(5);
        await t.renderOnce();
      }
      await Bun.sleep(20);
      await t.renderOnce();
      const frame = t.captureCharFrame();
      expect(frame).not.toContain("crashed");
      expect(frame).toContain("ER diagrams");
      t.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });
});

import { formatElapsed } from "../src/ui/motion/Motion";
test("formatElapsed reads as m:ss", () => {
  expect(formatElapsed(0)).toBe("0:00");
  expect(formatElapsed(42_000)).toBe("0:42");
  expect(formatElapsed(605_000)).toBe("10:05");
});

describe("busy line", () => {
  // An agent can report "running" while its turn is closed (background work); that left
  // a spinner under a finished reply.
  test("no spinner when the daemon reports no active turn", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const store = createSessionStore();
      const ui = createUiStore();
      const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
      store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
      store.actions.setAgents("h", [{ id: "a", status: "running", cwd: "/repo", workspaceId: "w", updatedAt: new Date().toISOString(), activeTurn: null } as any]);
      store.actions.updateTimeline(timelineKey("h", "a"), () =>
        hydrateTimeline(emptyTimeline(), { epoch: "E", endCursor: { epoch: "E", seq: 3 }, entries: [{ item: { type: "assistant_message", text: "All done" } }] }),
      );
      const runtimes = { get: () => ({ openTimeline: () => () => {}, loadOlder: async () => {} }) } as any;
      const t = await testRender(
        <AppContext.Provider value={{ store, ui, runtimes, settings }}>
          <AgentView hostId="h" workspaceId="w" agentId="a" width={70} height={20} />
        </AppContext.Provider>,
        { width: 70, height: 20 },
      );
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("All done");
      expect(t.captureCharFrame()).not.toContain("Writing…");
      t.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });
});
