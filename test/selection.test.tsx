import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { AppRoot, createAppState } from "../src/app-root";
import { composerHandle } from "../src/ui/agent/Composer";
import { createSessionStore } from "../src/stores/session";
import { createUiStore } from "../src/stores/ui";
import { createSettingsStore } from "../src/stores/settings";
import { AppContext } from "../src/stores/context";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { Composer } from "../src/ui/agent/Composer";

describe("selecting text", () => {
  test("dragging across the conversation selects what is under the mouse", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const state = createAppState({ hostsFile: { defaultHostId: "h", hosts: [{ id: "h", label: "h", url: "ws://127.0.0.1:1/ws" }] } });
      state.store.actions.addHost({ id: "h", label: "h", url: "ws://127.0.0.1:1/ws" });
      state.store.actions.setActiveHost("h");
      state.store.actions.setProjects("h", [{ projectId: "p", projectDisplayName: "Proj", projectRootPath: "/r", projectKind: "git" } as never]);
      state.store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", workspaceDirectory: "/r", workspaceKind: "checkout", workspaceStatus: "idle", projectRootPath: "/r", projectDisplayName: "Proj", projectKind: "git" } as never]);
      state.store.actions.setAgents("h", [{ id: "a", workspaceId: "w", status: "idle", cwd: "/r", updatedAt: new Date().toISOString(), provider: "claude", model: "m", title: "A", activeTurn: null } as never]);
      state.ui.actions.selectWorkspace("h", "w");
      state.ui.actions.updateTabs("h:w", (s) => ({ ...s, tabs: ["a"], active: "a" }));
      state.ui.actions.setFocus("main");
      const t = await testRender(<AppRoot state={state} onQuit={() => {}} />, { width: 90, height: 24 });
      for (let i = 0; i < 6; i++) { await Bun.sleep(20); await t.renderOnce(); }
      // Drag over the conversation area (the pane right of the sidebar).
      await t.mockMouse.drag(30, 3, 60, 6, 0);
      await Bun.sleep(40);
      await t.renderOnce();
      const selected = t.renderer.getSelection()?.getSelectedText() ?? "";
      expect(selected.trim().length).toBeGreaterThan(0);
      t.renderer.destroy();
      await state.runtimes.disposeAll();
    } finally {
      console.error = origError;
    }
  });
});

describe("pasting", () => {
  test("the composer handle inserts at the cursor", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const store = createSessionStore();
      store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
      store.actions.setActiveHost("h");
      store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", status: "idle" } as never]);
      store.actions.setAgents("h", [{ id: "a", status: "idle", cwd: "/r", workspaceId: "w", updatedAt: new Date().toISOString(), provider: "claude", model: "m", title: "A" } as never]);
      const ui = createUiStore();
      ui.actions.selectWorkspace("h", "w");
      ui.actions.updateTabs("h:w", (s) => ({ ...s, tabs: ["a"], active: "a" }));
      ui.actions.setFocus("composer");
      const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
      const t = await testRender(
        <AppContext.Provider value={{ store, ui, runtimes: { get: () => ({ send: async () => {} }) } as never, settings }}>
          <box width={60} height={10}><Composer hostId="h" agentId="a" width={60} maxLines={6} /></box>
        </AppContext.Provider>,
        { width: 60, height: 10 },
      );
      await t.renderOnce();
      for (const ch of "git push") t.mockInput.pressKey(ch);
      await Bun.sleep(20);
      await t.renderOnce();
      composerHandle.insert(" --force");
      await Bun.sleep(20);
      await t.renderOnce();
      expect(ui.getState().drafts["h:a"]).toBe("git push --force");
      t.renderer.destroy();
    } finally {
      console.error = origError;
    }
  });
});
