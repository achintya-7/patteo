import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUiState, persistUiState } from "../src/stores/persist";
import { createUiStore } from "../src/stores/ui";
import { openTab, emptyTabs } from "../src/ui/workspace/tabs-model";

describe("ui persistence", () => {
  test("round-trips tabs, selection and collapse; ignores transient state", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "patteo-")), "state.json");
    const ui = createUiStore();
    const stop = persistUiState(ui, file, 5);
    ui.actions.selectWorkspace("local", "w1");
    ui.actions.updateTabs("local:w1", (s) => openTab(s, "agentA"));
    ui.actions.toggleCollapsed("local:p1");
    ui.actions.setFocus("main"); // transient
    await Bun.sleep(30);
    stop();
    const loaded = loadUiState(file);
    expect(loaded.selectedWorkspace).toEqual({ local: "w1" });
    expect(loaded.tabs?.["local:w1"]).toEqual({ ...emptyTabs(), tabs: ["agentA"], active: "agentA", mru: ["agentA"] });
    expect(loaded.collapsed).toEqual({ "local:p1": true });
    expect(JSON.parse(readFileSync(file, "utf8")).focus).toBeUndefined();
  });

  test("corrupt or partial files load as empty/filtered", () => {
    const dir = mkdtempSync(join(tmpdir(), "patteo-"));
    writeFileSync(join(dir, "bad.json"), "{nope");
    expect(loadUiState(join(dir, "bad.json"))).toEqual({});
    writeFileSync(join(dir, "partial.json"), JSON.stringify({ tabs: { ok: { tabs: [], active: null, mru: [] }, bad: { tabs: 3 } } }));
    expect(Object.keys(loadUiState(join(dir, "partial.json")).tabs!)).toEqual(["ok"]);
    expect(loadUiState(join(dir, "missing.json"))).toEqual({});
  });
});
