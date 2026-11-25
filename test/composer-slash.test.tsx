import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { AppContext } from "../src/stores/context";
import { createSessionStore } from "../src/stores/session";
import { createSettingsStore } from "../src/stores/settings";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { createUiStore } from "../src/stores/ui";
import { Composer } from "../src/ui/agent/Composer";

/** A composer on a focused agent tab, with a draft already typed. */
async function composerWith(draft: string) {
  const store = createSessionStore();
  store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
  store.actions.setActiveHost("h");
  store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", status: "idle" } as never]);
  store.actions.setAgents("h", [{ id: "a", status: "idle", cwd: "/r", workspaceId: "w", updatedAt: new Date().toISOString(), provider: "claude", model: "claude-haiku", title: "A" } as never]);
  const ui = createUiStore();
  ui.actions.selectWorkspace("h", "w");
  ui.actions.updateTabs("h:w", (s) => ({ ...s, tabs: ["a"], active: "a" }));
  ui.actions.setDraft("h:a", draft);
  ui.actions.setFocus("composer");
  const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
  const runtimes = { get: () => ({ fork: async () => "b" }) } as never;
  const t = await testRender(
    <AppContext.Provider value={{ store, ui, runtimes, settings } as never}>
      <box width={80} height={24}><Composer hostId="h" agentId="a" width={70} /></box>
    </AppContext.Provider>,
    { width: 80, height: 24 },
  );
  await Bun.sleep(40);
  await t.renderOnce();
  return { t, ui };
}

describe("the composer's / menu", () => {
  test("↓ highlights a command and Enter runs it", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const { t, ui } = await composerWith("/");
      try {
        t.mockInput.pressArrow("down");
        await Bun.sleep(20);
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain("▌/fork");

        t.mockInput.pressEnter();
        await Bun.sleep(30);
        await t.renderOnce();
        // Enter ran the highlighted command, not an exact-name lookup.
        expect(ui.getState().tabs["h:w"]!.tabs).toEqual(["a", "b"]);
        expect(ui.getState().drafts["h:a"] ?? "").toBe(""); // the draft went with it
      } finally {
        t.renderer.destroy();
      }
    } finally {
      console.error = origError;
    }
  });

  test("↑ starts at the last match and typing resets the pick", async () => {
    const { t, ui } = await composerWith("");
    try {
      await t.mockInput.typeText("/");
      await Bun.sleep(20);
      await t.renderOnce();
      t.mockInput.pressArrow("up");
      await Bun.sleep(20);
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("▌/settings");

      await t.mockInput.typeText("fork");
      await Bun.sleep(20);
      await t.renderOnce();
      expect(t.captureCharFrame()).not.toContain("▌"); // no highlight after typing
      t.mockInput.pressEnter();
      await Bun.sleep(30);
      await t.renderOnce();
      // Enter fell back to the typed name: /fork forked, no stale-menu run.
      expect(ui.getState().tabs["h:w"]!.tabs).toEqual(["a", "b"]);
      expect(ui.getState().toasts.at(-1)).toMatchObject({ text: "Forked into a new tab", kind: "success" });
    } finally {
      t.renderer.destroy();
    }
  });
});
