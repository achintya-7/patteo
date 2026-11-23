import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { CHANGES_MODES, effectiveMode, emptyChanges, toCheckoutInfo, toPrState, type ChangesState } from "../src/paseo/changes";
import { emptyFiles, sortEntries, toDirEntries, toFileContent, type DirEntry } from "../src/paseo/files";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { dispatchGlobal, installDispatcher } from "../src/keyboard/dispatch";
import { AppContext } from "../src/stores/context";
import { changesKey, createSessionStore } from "../src/stores/session";
import { createSettingsStore } from "../src/stores/settings";
import { createUiStore } from "../src/stores/ui";
import { DiffView } from "../src/ui/changes/DiffView";
import { ExplorerPanel, tabLabels } from "../src/ui/explorer/ExplorerPanel";
import { FileView, fileColumns } from "../src/ui/explorer/FileView";
import { checkKind, prLines, summarizeChecks, wrapText } from "../src/ui/explorer/pr-model";
import { buildRows, changeIndex, indexOfPath } from "../src/ui/explorer/tree";
import { keepVisible } from "../src/ui/explorer/window";
import { mixHex } from "../src/theme/color";
import { numberedLines } from "../src/ui/changes/model";
import { clipTokens, roleColor, syntaxRole, tokenColor } from "../src/ui/changes/syntax";
import { findTheme } from "../src/theme/themes";
import { toDiffFiles } from "../src/paseo/changes";

const key = (name: string, o: Partial<{ ctrl: boolean; shift: boolean; meta: boolean }> = {}) => ({ name, ctrl: false, meta: false, shift: false, sequence: name, ...o });
const entry = (path: string, kind: "file" | "directory"): DirEntry => ({ name: path.split("/").pop()!, path, kind, size: 10 });
const file = (path: string, over: Record<string, unknown> = {}) => ({
  path, isNew: false, isDeleted: false, additions: 2, deletions: 1,
  hunks: [{ oldStart: 1, oldCount: 2, newStart: 1, newCount: 3, lines: [{ type: "header", content: "@@ -1,2 +1,3 @@" }, { type: "context", content: "keep" }, { type: "remove", content: "old line" }, { type: "add", content: "new line", tokens: [{ text: "new", style: "keyword" }, { text: " ", style: null }, { text: "line", style: "string" }] }] }],
  ...over,
});
const listing = (entries: DirEntry[]) => ({ entries, loading: false, error: null });

describe("file tree model", () => {
  const listings = {
    "": listing([entry("README.md", "file"), entry(".env", "file"), entry("src", "directory"), entry("Apps", "directory")]),
    src: listing([entry("src/z.ts", "file"), entry("src/a.ts", "file"), entry("src/ui", "directory")]),
  };
  const rows = (over: Partial<Parameters<typeof buildRows>[0]> = {}) =>
    buildRows({ listings, isExpanded: () => false, showHidden: true, changes: new Map(), ...over });

  test("folders first, then files, each A→Z ignoring case", () => {
    expect(rows().map((r) => r.name)).toEqual(["Apps", "src", ".env", "README.md"]);
    expect(sortEntries([entry("b", "file"), entry("A", "file"), entry("c", "directory")]).map((e) => e.name)).toEqual(["c", "A", "b"]);
  });

  test("dotfiles hide on request; expanded folders show children one level deeper", () => {
    expect(rows({ showHidden: false }).map((r) => r.name)).toEqual(["Apps", "src", "README.md"]);
    const open = rows({ isExpanded: (p) => p === "src" });
    expect(open.map((r) => `${r.depth}:${r.name}`)).toEqual(["0:Apps", "0:src", "1:ui", "1:a.ts", "1:z.ts", "0:.env", "0:README.md"]);
  });

  test("changed files carry their letter and their folders a dot", () => {
    const changes = changeIndex([file("src/a.ts") as never, file("src/new.ts", { isNew: true }) as never, file("old.md", { isDeleted: true }) as never]);
    const r = rows({ isExpanded: (p) => p === "src", changes });
    expect(r.find((x) => x.path === "src/a.ts")!.change).toBe("M");
    expect(r.find((x) => x.name === "src")!.dirty).toBe(true);
    expect(r.find((x) => x.name === "Apps")!.dirty).toBe(false);
    expect(changes.get("src/new.ts")).toBe("A");
    expect(changes.get("old.md")).toBe("D");
  });

  test("an expanded empty or unreadable folder says so; the cursor follows a row's path", () => {
    const l = { ...listings, src: { entries: [], loading: false, error: null }, Apps: { entries: [], loading: false, error: "denied" } };
    const r = buildRows({ listings: l, isExpanded: (p) => p === "src" || p === "Apps", showHidden: true, changes: new Map() });
    expect(r.filter((x) => x.kind === "note").map((x) => x.name)).toEqual(["denied", "empty"]);
    const ordered = rows();
    expect(indexOfPath(ordered, "src")).toBe(1);
    expect(indexOfPath(ordered, "gone")).toBe(0);
    expect(keepVisible(9, 0, 5, 20)).toBe(5);
    expect(keepVisible(0, 7, 5, 20)).toBe(0);
    expect(keepVisible(3, 0, 10, 4)).toBe(0);
  });

  test("daemon entries and file bytes map to what the panel shows", () => {
    expect(toDirEntries({ entries: [{ name: "a", path: "a", kind: "directory", size: 1 }, { name: "", path: "x" }, { name: "b", path: "b", kind: "file" }] })).toEqual([
      { name: "a", path: "a", kind: "directory", size: 1 },
      { name: "b", path: "b", kind: "file", size: 0 },
    ]);
    const text = new TextEncoder().encode("hi");
    expect(toFileContent({ kind: "text", bytes: text, size: 2 })).toEqual({ kind: "text", text: "hi", size: 2, truncated: false });
    expect(toFileContent({ kind: "text", bytes: text, size: 9000 })).toMatchObject({ truncated: true });
    expect(toFileContent({ kind: "binary", size: 5 })).toEqual({ kind: "binary", size: 5 });
    expect(toFileContent({ kind: "text", bytes: new Uint8Array([104, 0, 105]), size: 3 }).kind).toBe("binary");
    expect(fileColumns("a\n\tb\n").gutter).toBe("1 │\n2 │");
    expect(fileColumns("a\n\tb\n").code).toBe("a\n  b");
    expect(fileColumns(Array(12).fill("x").join("\n")).gutter.split("\n")[0]).toBe(" 1 │");
  });
});

describe("diff highlighting", () => {
  test("colour blending takes hex in either form and refuses anything else", () => {
    expect(mixHex("#ff0000", "#000000", 0.5)).toBe("#800000");
    expect(mixHex("#f00", "#fff", 0)).toBe("#ffffff");
    expect(mixHex("#00ff00", "#0000ff", 1)).toBe("#00ff00");
    expect(mixHex("transparent", "#000000", 0.5)).toBeUndefined();
    expect(mixHex("rgb(1,2,3)", "#000", 0.5)).toBeUndefined();
  });

  test("lines are numbered like a diff: removals by the old file, the rest by the new", () => {
    const rows = numberedLines({
      oldStart: 10, newStart: 20,
      lines: [
        { type: "header", content: "@@" },
        { type: "context", content: "a" },
        { type: "remove", content: "b" },
        { type: "remove", content: "c" },
        { type: "add", content: "d" },
        { type: "context", content: "e" },
      ],
    });
    expect(rows.map((r) => `${r.line.type}:${r.no}`)).toEqual(["context:20", "remove:11", "remove:12", "add:21", "context:22"]);
  });
});

describe("syntax colours", () => {
  const theme = findTheme("catppuccin-mocha");
  const tok = (text: string, style: string | null = null) => ({ text, style });

  test("the daemon's style classes bucket into roles, unknown ones stay plain", () => {
    const roles = ["keyword", "string", "number", "comment", "function", "class", "definition", "operator", "punctuation", "variable", "property", null, "zzz"].map((s) => syntaxRole(s));
    expect(roles).toEqual(["keyword", "string", "number", "comment", "function", "type", "definition", "operator", "punctuation", "plain", "plain", "plain", "plain"]);
    expect(syntaxRole("keyword.control")).toBe("keyword");
    expect(syntaxRole("string.regexp")).toBe("string");
    expect(roleColor("keyword", theme)).toBe(theme.accent);
    expect(roleColor("plain", theme)).toBe(theme.text);
    expect(tokenColor("string", theme, false)).toBe(theme.success);
    expect(tokenColor("string", theme, true)).not.toBe(theme.success); // context lines are dimmed
    expect(tokenColor("string", theme, true)).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("tokens clip to the row with an ellipsis, expand tabs, and refuse to disagree with the text", () => {
    const tokens = [tok("const", "keyword"), tok(" "), tok("name", "definition"), tok(" = "), tok("'value'", "string")];
    expect(clipTokens(tokens, "const name = 'value'", 40)!.map((t) => t.text).join("")).toBe("const name = 'value'");
    const cut = clipTokens(tokens, "const name = 'value'", 10)!;
    expect(cut.map((t) => t.text).join("")).toBe("const nam…"); // 10 cells, ellipsis included
    expect(clipTokens([tok("\tx", "keyword")], "\tx", 10)!.map((t) => t.text).join("")).toBe("  x");
    expect(clipTokens(tokens, "something else", 40)).toBeNull();
  });

  test("tokens survive the daemon mapping", () => {
    const mapped = toDiffFiles({ files: [{ path: "a.ts", hunks: [{ lines: [{ type: "add", content: "x", tokens: [{ text: "x", style: "variable" }, { text: "", style: undefined }] }, { type: "add", content: "y" }] }] }] });
    expect(mapped.files[0]!.hunks[0]!.lines[0]!.tokens).toEqual([{ text: "x", style: "variable" }, { text: "", style: null }]);
    expect(mapped.files[0]!.hunks[0]!.lines[1]!.tokens).toBeUndefined();
  });
});

describe("PR tab model", () => {
  const base: ChangesState = { ...emptyChanges(), prLoaded: true, checkout: toCheckoutInfo({ isGit: true, currentBranch: "feat/x", baseRef: "main", aheadBehind: { ahead: 3, behind: 0 }, isDirty: true, hasRemote: true }) };
  const text = (c: ChangesState, w = 40) => prLines(c, w).map((l) => l.map((s) => s.text).join(""));

  test("checks bucket by provider status and sum up", () => {
    expect(["SUCCESS", "FAILURE", "PENDING", "SKIPPED", "CANCELLED", "NEUTRAL"].map(checkKind)).toEqual(["ok", "fail", "pending", "skipped", "fail", "skipped"]);
    expect(summarizeChecks([{ name: "a", status: "SUCCESS", url: null }, { name: "b", status: "FAILURE", url: null }, { name: "c", status: "SUCCESS", url: null }])).toEqual({ ok: 2, fail: 1, pending: 0, skipped: 0 });
    expect(wrapText("the quick brown fox", 10)).toEqual(["the quick", "brown fox"]);
    expect(wrapText("x".repeat(20), 8)).toEqual(["xxxxxxxx", "xxxxxxxx", "xxxx"]);
  });

  test("no PR: branch facts and the action to create one", () => {
    const lines = text(base);
    expect(lines).toContain("No pull request");
    expect(lines).toContain("feat/x  →  main");
    expect(lines).toContain("↑3 ahead  ↓0 behind");
    expect(lines).toContain("uncommitted changes");
    expect(lines.some((l) => l.includes("create pull request"))).toBe(true);
    expect(text({ ...emptyChanges(), prLoading: true })).toEqual(["Checking pull request…"]);
    expect(text({ ...base, checkout: { ...base.checkout!, isGit: false } })[0]).toBe("Not a git repository");
  });

  test("a PR shows state, title, failing checks first, review, merge and the URL", () => {
    const pr = toPrState({
      status: {
        url: "https://forge/pr/7", state: "OPEN", number: 7, title: "Fix the checkout flow for guests", baseRefName: "main", headRefName: "feat/x",
        reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING",
        checks: [{ name: "build", status: "SUCCESS", url: null }, { name: "lint", status: "FAILURE", url: null, duration: "1m" }, { name: "e2e", status: "PENDING", url: null }],
      },
    });
    const lines = text({ ...base, pr }, 30);
    expect(lines[0]).toBe("#7  open");
    expect(lines.slice(1, 3)).toEqual(["Fix the checkout flow for", "guests"]);
    expect(lines).toContain("feat/x  →  main");
    expect(lines.indexOf(" ✗ lint  1m")).toBeLessThan(lines.indexOf(" ◌ e2e"));
    expect(lines.indexOf(" ◌ e2e")).toBeLessThan(lines.indexOf(" ✓ build"));
    expect(lines).toContain("Checks  ✓ 1  ✗ 1  ◌ 1  ");
    expect(lines).toContain("Review   changes requested");
    expect(lines).toContain("Merge    has conflicts");
    expect(lines.at(-1)).toBe("https://forge/pr/7");
  });

  test("the default comparison follows the PR, and the labels carry counts", () => {
    expect(effectiveMode({ mode: null, pr: null })).toBe("uncommitted");
    expect(effectiveMode({ mode: null, pr: { url: "u", state: "OPEN", checks: [] } })).toBe("base");
    expect(effectiveMode({ mode: "all", pr: null })).toBe("all");
    expect(CHANGES_MODES[0]).toBe("base");
    expect(tabLabels({ changeCount: 4, prNumber: 12, compact: false })).toEqual({ files: "Files", changes: "Changes 4", pr: "#12" });
    expect(tabLabels({ changeCount: 4, compact: true })).toEqual({ files: "Files", changes: "Changes", pr: "PR" });
  });

  test("focus order follows the screen", () => {
    const ui = createUiStore();
    ui.actions.openPanel("files");
    ui.actions.setFocus("sidebar");
    const order = (side: "left" | "right") => {
      const seen: string[] = [];
      ui.actions.setFocus("sidebar");
      for (let i = 0; i < 3; i++) { ui.actions.cycleFocus(side); seen.push(ui.getState().focus); }
      return seen;
    };
    expect(order("right")).toEqual(["main", "panel", "sidebar"]);
    expect(order("left")).toEqual(["panel", "main", "sidebar"]);
  });
});

describe("explorer panel", () => {
  function harness(over: { pr?: ChangesState["pr"]; opened?: string[] } = {}) {
    const store = createSessionStore();
    store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
    store.actions.setActiveHost("h");
    store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", workspaceDirectory: "/repo", status: "idle" } as never]);
    store.actions.updateChanges(changesKey("h", "w"), () => ({
      ...emptyChanges(),
      cwd: "/repo",
      files: [file("src/a.ts") as never, file("docs/c.md", { isNew: true, additions: 9, deletions: 0 }) as never],
      pr: over.pr ?? null,
      prLoaded: true,
      checkout: toCheckoutInfo({ isGit: true, currentBranch: "feat/x", baseRef: "main", aheadBehind: { ahead: 1, behind: 0 }, isDirty: false, hasRemote: true }),
    }));
    store.actions.updateFiles(changesKey("h", "w"), () => ({
      ...emptyFiles(),
      cwd: "/repo",
      listings: { "": listing([entry("src", "directory"), entry(".env", "file"), entry("README.md", "file")]) },
    }));
    const ui = createUiStore();
    ui.actions.selectWorkspace("h", "w");
    const calls = { listDir: [] as string[], loads: [] as { pr?: boolean; mode?: string }[], read: [] as string[] };
    const runtimes = {
      get: () => ({
        listDir: async (_w: string, p: string) => { calls.listDir.push(p); },
        loadChanges: async (_w: string, o?: { pr?: boolean; mode?: string }) => { calls.loads.push(o ?? {}); },
        readFile: async (_w: string, p: string) => { calls.read.push(p); return p.endsWith(".png") ? { kind: "binary" as const, size: 9 } : { kind: "text" as const, text: "const a = 1;\n\tindented\n", size: 22, truncated: false }; },
      }),
    } as never;
    const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
    installDispatcher({ ui, store, runtimes, settings, quit: () => {} });
    return { store, ui, runtimes, settings, calls, opened: over.opened ?? [] };
  }

  async function mount(h: ReturnType<typeof harness>) {
    const origError = console.error;
    console.error = () => {};
    const t = await testRender(
      <AppContext.Provider value={{ store: h.store, ui: h.ui, runtimes: h.runtimes, settings: h.settings }}>
        <box flexDirection="row" width={110} height={22}>
          <ExplorerPanel hostId="h" workspaceId="w" width={38} height={22} openUrl={(u) => { h.opened.push(u); return true; }} />
          <box width={72} height={22}><DiffView hostId="h" workspaceId="w" width={72} height={22} /></box>
        </box>
      </AppContext.Provider>,
      { width: 110, height: 22 },
    );
    await t.renderOnce();
    const settle = async () => { await Bun.sleep(25); await t.renderOnce(); };
    return { t, settle, done: () => { t.renderer.destroy(); console.error = origError; } };
  }

  test("Files: folders expand through the daemon, dotfiles toggle, files open in the main pane", async () => {
    const h = harness();
    h.ui.actions.openPanel("files");
    const { t, settle, done } = await mount(h);
    try {
      expect(t.captureCharFrame()).toContain("▸ src");
      t.mockInput.pressEnter(); // on "src"
      await settle();
      expect(h.ui.getState().expanded["h:w:src"]).toBe(true);
      expect(h.calls.listDir).toContain("src");
      t.mockInput.pressKey("."); // hide dotfiles
      await settle();
      expect(t.captureCharFrame()).not.toContain(".env");
      expect(t.captureCharFrame()).toContain("README.md");
      t.mockInput.pressKey("j");
      await settle();
      t.mockInput.pressEnter(); // README.md
      await settle();
      expect(h.ui.getState().filePath).toBe("README.md");
      expect(h.ui.getState().focus).toBe("main");
    } finally {
      done();
    }
  });

  test("keys faster than a re-render still move the cursor row by row", async () => {
    const h = harness();
    h.store.actions.updateFiles(changesKey("h", "w"), (f) => ({ ...f, listings: { "": listing([entry("a.md", "file"), entry("b.md", "file"), entry("c.md", "file"), entry("d.md", "file")]) } }));
    h.ui.actions.openPanel("files");
    const { t, settle, done } = await mount(h);
    try {
      t.mockInput.pressKey("j");
      t.mockInput.pressKey("j");
      t.mockInput.pressKey("j");
      t.mockInput.pressEnter(); // no render in between: the cursor must already be on d.md
      await settle();
      expect(h.ui.getState().filePath).toBe("d.md");
    } finally {
      done();
    }
  });

  test("tabs switch with [ ] and 1-3, and the panel hands focus back with Esc", async () => {
    const h = harness();
    h.ui.actions.openPanel("files");
    const { t, settle, done } = await mount(h);
    try {
      t.mockInput.pressKey("]");
      await settle();
      expect(h.ui.getState().panelTab).toBe("changes");
      t.mockInput.pressKey("3");
      await settle();
      expect(h.ui.getState().panelTab).toBe("pr");
      t.mockInput.pressKey("[");
      await settle();
      expect(h.ui.getState().panelTab).toBe("changes");
      t.mockInput.pressEscape();
      await settle();
      expect(h.ui.getState().focus).toBe("main");
    } finally {
      done();
    }
  });

  test("Changes: Enter shows the diff, m switches what is compared, Esc returns to the panel", async () => {
    const h = harness({ pr: { url: "https://forge/pr/7", state: "OPEN", number: 7, checks: [] } });
    h.ui.actions.openPanel("changes");
    const { t, settle, done } = await mount(h);
    try {
      const frame = t.captureCharFrame();
      expect(frame).toContain("PR changes · vs main"); // a PR exists, so the PR's comparison is the default
      expect(frame).toContain("a.ts");
      expect(frame).toContain("c.md");
      t.mockInput.pressKey("m");
      await settle();
      expect(h.calls.loads.at(-1)).toEqual({ mode: "uncommitted" });
      t.mockInput.pressEnter();
      await settle();
      expect(h.ui.getState().diffPath).toBe("src/a.ts");
      const diff = t.captureCharFrame();
      expect(diff).toContain("old line");
      expect(diff).toContain("new line");
      expect(diff.match(/@@ -1,2 \+1,3 @@/g)?.length).toBe(1); // one hunk header, not the daemon's copy too
      h.ui.actions.setFocus("main");
      t.mockInput.pressEscape();
      await settle();
      expect(h.ui.getState().diffPath).toBeNull();
      expect(h.ui.getState().focus).toBe("panel");
    } finally {
      done();
    }
  });

  test("added and removed code is a tinted row, with no +/- prefix", async () => {
    const h = harness();
    h.ui.actions.openPanel("changes");
    h.ui.actions.setDiffPath("src/a.ts");
    h.ui.actions.setFocus("main");
    const { t, settle, done } = await mount(h);
    try {
      await settle();
      const frame = t.captureCharFrame();
      expect(frame).toContain("new line");
      expect(frame).not.toMatch(/\+new line|-old line|\+ +new line/); // no prefix glyphs
      const spans = (t.captureSpans() as unknown as { lines: { spans: { text: string; bg: { buffer: ArrayLike<number> } }[] }[] }).lines;
      const bgOf = (needle: string) => {
        for (const line of spans) for (const sp of line.spans) if (sp.text.includes(needle)) return Array.from(sp.bg.buffer).slice(0, 3).map((v) => Math.round(v * 255));
        throw new Error(`no span with "${needle}"`);
      };
      const add = bgOf("new"); // the keyword token of "new line"
      const del = bgOf("old line");
      const ctx = bgOf("keep");
      expect(add[1]).toBeGreaterThan(add[0]!); // greenish
      expect(del[0]).toBeGreaterThan(del[1]!); // reddish
      expect(add).not.toEqual(ctx);
      expect(del).not.toEqual(ctx);
    } finally {
      done();
    }
  });

  test("code in the diff is coloured by the daemon's tokens", async () => {
    const h = harness();
    h.ui.actions.openPanel("changes");
    h.ui.actions.setDiffPath("src/a.ts");
    h.ui.actions.setFocus("main");
    const { t, settle, done } = await mount(h);
    try {
      await settle();
      const theme = findTheme("catppuccin-mocha");
      const spans = (t.captureSpans() as unknown as { lines: { spans: { text: string; fg: { buffer: ArrayLike<number> } }[] }[] }).lines;
      const fgOf = (needle: string) => {
        for (const line of spans) for (const sp of line.spans) if (sp.text.trim() === needle) return Array.from(sp.fg.buffer).slice(0, 3).map((v) => Math.round(v));
        throw new Error(`no span "${needle}"`);
      };
      const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(fgOf("new")).toEqual(rgb(theme.accent)); // keyword
      expect(fgOf("line")).toEqual(rgb(theme.success)); // string
    } finally {
      done();
    }
  });

  test("PR: shows the PR, opens it in the browser, and offers to create one when there is none", async () => {
    const withPr = harness({ pr: { url: "https://forge/pr/7", state: "OPEN", number: 7, title: "Fix checkout", baseRefName: "main", headRefName: "feat/x", checks: [{ name: "lint", status: "FAILURE", url: null }] } });
    withPr.ui.actions.openPanel("pr");
    const a = await mount(withPr);
    try {
      expect(a.t.captureCharFrame()).toContain("#7");
      expect(a.t.captureCharFrame()).toContain("✗ lint");
      a.t.mockInput.pressKey("o");
      await a.settle();
      expect(withPr.opened).toEqual(["https://forge/pr/7"]);
    } finally {
      a.done();
    }

    const none = harness();
    none.ui.actions.openPanel("pr");
    const b = await mount(none);
    try {
      expect(b.t.captureCharFrame()).toContain("No pull request");
      b.t.mockInput.pressEnter();
      await b.settle();
      expect(none.ui.getState().modal).toMatchObject({ kind: "confirm", action: "workspace.pr", payload: "h:w" });
      expect((none.ui.getState().modal as { body: string }).body).toContain("feat/x");
    } finally {
      b.done();
    }
  });

  test("P opens the PR tab from anywhere; C toggles the panel", async () => {
    const h = harness();
    expect(dispatchGlobal(key("p", { shift: true }))).toBe(true);
    expect(h.ui.getState()).toMatchObject({ panelOpen: true, panelTab: "pr", focus: "panel" });
    expect(dispatchGlobal(key("c", { shift: true }))).toBe(true);
    expect(h.ui.getState().panelOpen).toBe(false);
    expect(h.ui.getState().focus).toBe("main");
  });

  test("a file opens with line numbers; binary files say so; Esc returns to the panel", async () => {
    const h = harness();
    h.ui.actions.openPanel("files");
    h.ui.actions.setFilePath("src/a.ts");
    h.ui.actions.setFocus("main");
    const origError = console.error;
    console.error = () => {};
    const t = await testRender(
      <AppContext.Provider value={{ store: h.store, ui: h.ui, runtimes: h.runtimes, settings: h.settings }}>
        <box width={70} height={14}><FileView hostId="h" workspaceId="w" width={70} height={14} /></box>
      </AppContext.Provider>,
      { width: 70, height: 14 },
    );
    try {
      for (let i = 0; i < 3; i++) { await Bun.sleep(20); await t.renderOnce(); }
      const frame = t.captureCharFrame();
      expect(frame).toContain("src/a.ts");
      expect(frame).toContain("1 │");
      expect(frame).toContain("const a = 1;");
      expect(frame).toContain("2 lines");
      h.ui.actions.setFilePath("logo.png");
      for (let i = 0; i < 3; i++) { await Bun.sleep(20); await t.renderOnce(); }
      expect(t.captureCharFrame()).toContain("Binary file");
      t.mockInput.pressEscape();
      await Bun.sleep(20);
      await t.renderOnce();
      expect(h.ui.getState().filePath).toBeNull();
      expect(h.ui.getState().focus).toBe("panel");
    } finally {
      t.renderer.destroy();
      console.error = origError;
    }
  });
});

import { AppRoot, createAppState } from "../src/app-root";

describe("panel placement", () => {
  async function app(settings: { panelSide?: "left" | "right" }, width: number) {
    const state = createAppState({ hostsFile: { defaultHostId: "h", hosts: [{ id: "h", label: "h", url: "ws://127.0.0.1:1/ws" }] }, settings });
    state.store.actions.addHost({ id: "h", label: "h", url: "ws://127.0.0.1:1/ws" });
    state.store.actions.setActiveHost("h");
    state.store.actions.setProjects("h", [{ projectId: "p", projectDisplayName: "Proj", projectRootPath: "/r", projectKind: "git" } as never]);
    state.store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", workspaceDirectory: "/r", workspaceKind: "checkout", workspaceStatus: "idle", projectRootPath: "/r", projectDisplayName: "Proj", projectKind: "git" } as never]);
    state.store.actions.updateFiles(changesKey("h", "w"), () => ({ ...emptyFiles(), cwd: "/r", listings: { "": listing([entry("src", "directory")]) } }));
    state.ui.actions.selectWorkspace("h", "w");
    state.ui.actions.openPanel("files");
    const t = await testRender(<AppRoot state={state} onQuit={() => {}} />, { width, height: 24 });
    for (let i = 0; i < 12; i++) { await Bun.sleep(15); await t.renderOnce(); }
    const frame = t.captureCharFrame();
    t.renderer.destroy();
    await state.runtimes.disposeAll();
    return frame;
  }
  const column = (frame: string, text: string) => frame.split("\n").map((l) => l.indexOf(text)).find((i) => i >= 0) ?? -1;

  test("the panel opens on the right by default, on the left by setting, and steps aside on narrow terminals", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      expect(column(await app({}, 120), "Files")).toBeGreaterThan(60);
      expect(column(await app({ panelSide: "left" }, 120), "Files")).toBeLessThan(60);
      expect(column(await app({}, 80), "Files")).toBe(-1); // too narrow: the conversation keeps the room
    } finally {
      console.error = origError;
    }
  });
});
