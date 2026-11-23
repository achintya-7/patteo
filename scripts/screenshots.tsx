/**
 * Renders the README screenshots: the real UI, drawn from made-up demo data (no daemon, nothing
 * private), captured cell by cell and written as SVG with the theme's own colours.
 *
 *   bun scripts/screenshots.tsx            → docs/screenshots/*.svg
 *   bun scripts/screenshots.tsx hero pr    → just those scenes
 */
import { TextAttributes } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppRoot, createAppState } from "../src/app-root";
import type { AppContextValue } from "../src/stores/context";
import { setMotionFrozen } from "../src/ui/motion/clock";
import { emptyChanges, type ChangesState, type DiffFile, type DiffToken } from "../src/paseo/changes";
import { emptyFiles, type DirEntry } from "../src/paseo/files";
import { emptyTimeline, hydrateTimeline } from "../src/paseo/timeline";
import { changesKey, timelineKey } from "../src/stores/session";
import { findTheme } from "../src/theme/themes";
import type { Theme } from "../src/theme/theme";

const OUT = join(import.meta.dir, "..", "docs", "screenshots");
const HOST = "demo";

// ── demo data ────────────────────────────────────────────────────────────────

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const PROJECTS = [
  { projectId: "web", projectDisplayName: "acme-web", projectRootPath: "/work/acme-web", projectKind: "git" },
  { projectId: "api", projectDisplayName: "acme-api", projectRootPath: "/work/acme-api", projectKind: "git" },
  { projectId: "dots", projectDisplayName: "dotfiles", projectRootPath: "/work/dotfiles", projectKind: "git" },
];

const ws = (id: string, projectId: string, title: string, branch: string, status: string, minutes: number, diff?: [number, number]) => {
  const p = PROJECTS.find((x) => x.projectId === projectId)!;
  return {
    id, title, status,
    workspaceKind: "checkout", workspaceDirectory: p.projectRootPath, ...p,
    project: { checkout: { currentBranch: branch } },
    activityAt: iso(minutes), createdAt: iso(minutes + 60),
    ...(diff ? { diffStat: { additions: diff[0], deletions: diff[1] } } : {}),
  };
};

const WORKSPACES = [
  ws("w-checkout", "web", "Checkout redesign", "feat/card-validation", "running", 1, [118, 24]),
  ws("w-flaky", "web", "Fix flaky e2e", "fix/e2e-flake", "needs_input", 9, [14, 6]),
  ws("w-rate", "api", "Rate limiter", "feat/rate-limit", "done", 40, [203, 12]),
  ws("w-nvim", "dots", "Neovim cleanup", "main", "done", 300),
];

const agent = (id: string, workspaceId: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, workspaceId, title, status, cwd: "/work", updatedAt: iso(2), provider: "claude", model: "claude-opus-4-5",
  currentModeId: "default", availableModes: [{ id: "default", label: "Auto" }], activeTurn: status === "running" ? { startedAt: iso(1) } : null,
  ...extra,
});

const QUESTION = {
  id: "q1", provider: "claude", name: "AskUserQuestion", kind: "question", title: "Questions",
  input: {
    questions: [
      {
        question: "The flaky test is a race between the cart fetch and the click. How should I fix it?",
        header: "Approach",
        options: [
          { label: "Wait for the network", description: "await the cart request before clicking; deterministic, a little slower" },
          { label: "Retry the click", description: "fastest to write, hides the real race" },
          { label: "Mock the cart API", description: "no network at all; needs a fixture" },
        ],
        multiSelect: false,
        allowOther: true,
      },
      { question: "Which browsers should the fix run on?", header: "Browsers", options: [{ label: "Chromium" }, { label: "Firefox" }, { label: "WebKit" }], multiSelect: true },
    ],
  },
};

const AGENTS = [
  agent("a-checkout", "w-checkout", "Validate the card number as you type", "idle"),
  agent("a-checkout-2", "w-checkout", "Add Amex support", "running"),
  agent("a-flaky", "w-flaky", "Fix the flaky checkout e2e", "running", { pendingPermissions: [QUESTION] }),
  agent("a-rate", "w-rate", "Token-bucket rate limiter", "idle"),
];

const REPLY = `Done: card numbers are now validated **as you type**.

**What changed**
- \`CardField\` runs a Luhn check on every keystroke and shows the brand
- Errors are announced with \`aria-live\`, so screen readers pick them up
- Added \`card-field.test.tsx\` (8 cases, all passing)

\`\`\`ts
export function luhn(digits: string): boolean {
  let sum = 0;
  for (const [i, ch] of [...digits].reverse().entries()) {
    const d = Number(ch) * (i % 2 ? 2 : 1);
    sum += d > 9 ? d - 9 : d;
  }
  return sum % 10 === 0;
}
\`\`\`

Want me to wire the same check into the saved-cards form?`;

const tool = (n: number, command: string) => ({ type: "tool_call", callId: `c${n}`, name: "bash", status: "completed", error: null, detail: { type: "shell", command, output: "" } });

const ENTRIES = [
  { item: { type: "user_message", text: "Validate the card number as the user types, and add tests for it." } },
  { item: { type: "reasoning", text: "Look at CardField first, then the existing checkout tests." } },
  { item: tool(1, "rg -n CardField src") },
  { item: tool(2, "sed -n 1,80p src/checkout/card-field.tsx") },
  { item: { type: "reasoning", text: "A Luhn check is enough; the brand comes from the prefix." } },
  { item: tool(3, "bun test src/checkout") },
  { item: tool(4, "bun run typecheck") },
  { item: { type: "assistant_message", text: REPLY } },
];

const FLAKY = [
  { item: { type: "user_message", text: "The checkout e2e test fails about one run in five on CI. Find out why and fix it." } },
  { item: { type: "reasoning", text: "Compare a failing run with a passing one." } },
  { item: tool(1, "gh run view --log-failed") },
  { item: tool(2, "rg -n 'click' e2e/checkout.spec.ts") },
  { item: { type: "assistant_message", text: "Found it: the test clicks **Pay** before the cart request has finished, so on a slow runner the button is still disabled.\n\nThere are a few ways to fix it, and they trade speed against realism." } },
];

// A small tokenizer so the demo diff is coloured like the daemon's would be.
const KEYWORDS = new Set(["export", "function", "const", "let", "return", "if", "for", "import", "from", "new", "type", "interface", "async", "await", "else"]);
function tokenize(code: string): DiffToken[] {
  const out: DiffToken[] = [];
  const re = /(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d+\b)|([A-Za-z_$][\w$]*)(?=\()|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  for (const m of code.matchAll(re)) {
    const [text, comment, str, num, call, word, , other] = m;
    if (comment) out.push({ text, style: "comment" });
    else if (str) out.push({ text, style: "string" });
    else if (num) out.push({ text, style: "number" });
    else if (call) out.push({ text, style: "function" });
    else if (word) out.push({ text, style: KEYWORDS.has(word) ? "keyword" : /^[A-Z]/.test(word) ? "class" : "variable" });
    else if (other) out.push({ text, style: "punctuation" });
    else out.push({ text, style: null });
  }
  return out;
}
const line = (type: "add" | "remove" | "context", content: string) => ({ type, content, tokens: tokenize(content) });

const DIFF_FILES: DiffFile[] = [
  {
    path: "src/checkout/card-field.tsx", isNew: false, isDeleted: false, additions: 14, deletions: 3,
    hunks: [{
      oldStart: 8, oldCount: 14, newStart: 8, newCount: 25,
      lines: [
        line("context", "export function CardField({ onChange }: Props) {"),
        line("context", "  const [value, setValue] = useState(\"\");"),
        line("remove", "  const valid = value.length === 16;"),
        line("add", "  const digits = value.replace(/\\s/g, \"\");"),
        line("add", "  const valid = luhn(digits);"),
        line("add", "  const brand = detectBrand(digits); // visa, mastercard, amex"),
        line("context", ""),
        line("context", "  return ("),
        line("remove", "    <input value={value} onChange={(e) => setValue(e.target.value)} />"),
        line("add", "    <label>"),
        line("add", "      <input"),
        line("add", "        value={formatCard(value)}"),
        line("add", "        aria-invalid={!valid && digits.length > 0}"),
        line("add", "        onChange={(e) => {"),
        line("add", "          setValue(e.target.value);"),
        line("add", "          onChange(digits, valid);"),
        line("add", "        }}"),
        line("add", "      />"),
        line("add", "      {brand && <BrandIcon name={brand} />}"),
        line("add", "    </label>"),
        line("context", "  );"),
        line("context", "}"),
      ],
    }],
  },
  { path: "src/checkout/luhn.ts", isNew: true, isDeleted: false, additions: 12, deletions: 0, hunks: [] },
  { path: "src/checkout/card-field.test.tsx", isNew: true, isDeleted: false, additions: 64, deletions: 0, hunks: [] },
  { path: "src/checkout/brands.ts", isNew: true, isDeleted: false, additions: 21, deletions: 0, hunks: [] },
  { path: "src/checkout/form.tsx", isNew: false, isDeleted: false, additions: 6, deletions: 2, hunks: [] },
  { path: "docs/checkout.md", isNew: false, isDeleted: false, additions: 1, deletions: 0, hunks: [] },
];

const PR_CHECKS = [
  { name: "e2e / chromium", status: "FAILURE", url: null, duration: "4m" },
  { name: "e2e / firefox", status: "PENDING", url: null },
  { name: "unit tests", status: "SUCCESS", url: null, duration: "1m" },
  { name: "typecheck", status: "SUCCESS", url: null, duration: "28s" },
  { name: "lint", status: "SUCCESS", url: null, duration: "19s" },
  { name: "secret-scan", status: "SUCCESS", url: null, duration: "5s" },
];

const e = (path: string, kind: "file" | "directory"): DirEntry => ({ name: path.split("/").pop()!, path, kind, size: 1200 });
const LISTINGS: Record<string, DirEntry[]> = {
  "": [e("src", "directory"), e("docs", "directory"), e("public", "directory"), e(".github", "directory"), e("package.json", "file"), e("README.md", "file"), e("tsconfig.json", "file"), e(".gitignore", "file")],
  src: [e("src/checkout", "directory"), e("src/cart", "directory"), e("src/ui", "directory"), e("src/index.tsx", "file")],
  "src/checkout": [e("src/checkout/brands.ts", "file"), e("src/checkout/card-field.test.tsx", "file"), e("src/checkout/card-field.tsx", "file"), e("src/checkout/form.tsx", "file"), e("src/checkout/luhn.ts", "file")],
};

const FILE_TEXT = `import { useState } from "react";
import { detectBrand, formatCard } from "./brands";
import { luhn } from "./luhn";

type Props = { onChange: (digits: string, valid: boolean) => void };

// Validates the card number as the user types.
export function CardField({ onChange }: Props) {
  const [value, setValue] = useState("");
  const digits = value.replace(/\\s/g, "");
  const valid = luhn(digits);
  const brand = detectBrand(digits);

  return (
    <label>
      <input
        value={formatCard(value)}
        aria-invalid={!valid && digits.length > 0}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(digits, valid);
        }}
      />
      {brand && <BrandIcon name={brand} />}
    </label>
  );
}
`;

// ── scenes ───────────────────────────────────────────────────────────────────

interface Scene {
  theme: string;
  width: number;
  height: number;
  title: string;
  setup: (s: AppContextValue) => void;
}

function seed(s: AppContextValue, selected: { workspace: string; agent: string }) {
  const { store, ui } = s;
  store.actions.addHost({ id: HOST, label: "workstation", url: "ws://127.0.0.1:6767/ws" });
  store.actions.setActiveHost(HOST);
  store.actions.setConnection(HOST, { status: "connected" });
  store.actions.setServerInfo(HOST, { version: "0.16.1", hostname: "workstation" });
  store.actions.setProjects(HOST, PROJECTS as never);
  store.actions.setWorkspaces(HOST, WORKSPACES as never);
  store.actions.setAgents(HOST, AGENTS as never);
  store.actions.updateTimeline(timelineKey(HOST, "a-checkout"), () => hydrateTimeline(emptyTimeline(), { epoch: "E", endCursor: { epoch: "E", seq: 100 }, entries: ENTRIES as never }));
  store.actions.updateTimeline(timelineKey(HOST, "a-flaky"), () => hydrateTimeline(emptyTimeline(), { epoch: "E", endCursor: { epoch: "E", seq: 100 }, entries: FLAKY as never }));
  ui.actions.selectWorkspace(HOST, selected.workspace);
  ui.actions.setCursor(`${HOST}:ws:${selected.workspace}`);
  ui.actions.updateTabs(`${HOST}:${selected.workspace}`, (t) => ({ ...t, tabs: AGENTS.filter((a) => a.workspaceId === selected.workspace).map((a) => a.id), active: selected.agent }));
}

function seedPanel(s: AppContextValue, mode: "base" | "uncommitted" = "base") {
  const key = changesKey(HOST, "w-checkout");
  s.store.actions.updateChanges(key, (): ChangesState => ({
    ...emptyChanges(),
    cwd: "/work/acme-web", files: DIFF_FILES, mode,
    prLoaded: true, fetchedAt: Date.now(),
    checkout: { isGit: true, branch: "feat/card-validation", baseRef: "main", ahead: 3, behind: 0, isDirty: false, hasRemote: true, remoteUrl: null },
    pr: { number: 42, url: "https://github.com/acme/ui/pull/42", state: "OPEN", title: "Validate card numbers as you type", baseRefName: "main", headRefName: "feat/card-validation", checksStatus: "FAILURE", reviewDecision: "APPROVED", mergeable: "MERGEABLE", checks: PR_CHECKS },
  }));
  s.store.actions.updateFiles(key, () => ({ ...emptyFiles(), cwd: "/work/acme-web", listings: Object.fromEntries(Object.entries(LISTINGS).map(([k, v]) => [k, { entries: v, loading: false, error: null }])) }));
}

const SCENES: Record<string, Scene> = {
  hero: {
    theme: "catppuccin-mocha", width: 124, height: 38, title: "patteo",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      s.ui.actions.setDraft(`${HOST}:a-checkout`, "also handle 15-digit Amex numbers");
      s.ui.actions.setFocus("composer");
    },
  },
  changes: {
    theme: "tokyo-night", width: 136, height: 34, title: "patteo: Changes",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      s.ui.actions.toggleSidebar(); // more room for the diff
      s.ui.actions.openPanel("changes");
      s.ui.actions.setDiffPath("src/checkout/card-field.tsx");
      s.ui.actions.setFocus("main");
    },
  },
  files: {
    theme: "gruvbox-dark", width: 136, height: 34, title: "patteo: Files",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      for (const p of ["src", "src/checkout"]) s.ui.actions.toggleExpanded(`${HOST}:w-checkout:${p}`, true);
      s.ui.actions.openPanel("files");
      s.ui.actions.setFocus("panel");
    },
  },
  pr: {
    theme: "catppuccin-latte", width: 136, height: 34, title: "patteo: Pull request",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      s.ui.actions.openPanel("pr");
    },
  },
  "question-bar": {
    theme: "catppuccin-mocha", width: 124, height: 30, title: "patteo: an agent needs an answer",
    setup(s) {
      seed(s, { workspace: "w-flaky", agent: "a-flaky" });
      s.ui.actions.setFocus("main");
    },
  },
  question: {
    theme: "nord", width: 124, height: 34, title: "patteo: an agent asks",
    setup(s) {
      seed(s, { workspace: "w-flaky", agent: "a-flaky" });
      s.ui.actions.openModal({ kind: "permissions" });
    },
  },
};

// One small scene per theme for the README's theme gallery.
for (const theme of ["dracula", "rose-pine", "kanagawa", "one-dark", "gruvbox-light", "solarized-dark"]) {
  SCENES[`theme-${theme}`] = {
    theme, width: 96, height: 22, title: theme,
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      s.ui.actions.setFocus("main");
    },
  };
}

// ── capture → SVG ────────────────────────────────────────────────────────────

const CW = 8.4;
const CH = 18;
const PAD = 14;
const BAR = 34;

type RGBA = [number, number, number, number];
/** A colour as the renderer hands it over: an object wrapping a typed array, 0-255 per channel. */
interface RendererColor { buffer: ArrayLike<number> }
interface CapturedSpan { text: string; fg: RendererColor; bg: RendererColor; attributes: number; width: number }
const rgba = (c: RendererColor): RGBA => [c.buffer[0]!, c.buffer[1]!, c.buffer[2]!, c.buffer[3] ?? 255];

/** Block-drawing glyphs as a fraction of the cell: x, y, width, height, opacity. */
const BLOCKS: Record<string, { x: number; y: number; w: number; h: number; o: number }> = {
  "█": { x: 0, y: 0, w: 1, h: 1, o: 1 },
  "▌": { x: 0, y: 0, w: 0.5, h: 1, o: 1 },
  "▐": { x: 0.5, y: 0, w: 0.5, h: 1, o: 1 },
  "▀": { x: 0, y: 0, w: 1, h: 0.5, o: 1 },
  "▄": { x: 0, y: 0.5, w: 1, h: 0.5, o: 1 },
  "░": { x: 0, y: 0, w: 1, h: 1, o: 0.25 },
  "▒": { x: 0, y: 0, w: 1, h: 1, o: 0.5 },
  "▓": { x: 0, y: 0, w: 1, h: 1, o: 0.75 },
};

const hex = ([r, g, b]: RGBA) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textEl(x: number, y: number, text: string, fg: RGBA, attributes: number, cells: number): string {
  const bold = attributes & TextAttributes.BOLD ? ' font-weight="700"' : "";
  const italic = attributes & TextAttributes.ITALIC ? ' font-style="italic"' : "";
  const dim = attributes & TextAttributes.DIM ? ' opacity="0.6"' : "";
  const under = attributes & TextAttributes.UNDERLINE ? ' text-decoration="underline"' : "";
  return `<text x="${x.toFixed(1)}" y="${(y + CH * 0.76).toFixed(1)}" fill="${hex(fg)}" textLength="${(cells * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs"${bold}${italic}${dim}${under} xml:space="preserve">${esc(text)}</text>`;
}

export function toSvg(lines: { spans: CapturedSpan[] }[], cols: number, theme: Theme, title: string): string {
  const w = cols * CW + PAD * 2;
  const h = lines.length * CH + PAD * 2 + BAR;
  const base = theme.bg;
  const frame = "#00000055";
  let bgs = "";
  let texts = "";
  lines.forEach((l, row) => {
    let col = 0;
    for (const sp of l.spans) {
      const len = sp.width;
      let fg = rgba(sp.fg), bg = rgba(sp.bg);
      if (sp.attributes & TextAttributes.INVERSE) [fg, bg] = [bg, fg];
      const x = PAD + col * CW;
      const y = BAR + PAD + row * CH;
      if (hex(bg) !== base.toLowerCase() && bg[3] > 0) bgs += `<rect x="${x.toFixed(1)}" y="${y}" width="${(len * CW + 0.6).toFixed(1)}" height="${CH + 0.6}" fill="${hex(bg)}"/>`;
      if (sp.text.trim()) {
        // Block glyphs (scrollbars, bars) are drawn as shapes: fonts disagree on their width and height.
        const chars = [...sp.text];
        if (chars.some((c) => c in BLOCKS)) {
          let runStart = 0;
          const flush = (end: number) => {
            const run = chars.slice(runStart, end).join("");
            if (run.trim()) texts += textEl(x + runStart * CW, y, run, fg, sp.attributes, run.length);
          };
          chars.forEach((c, i) => {
            const b = BLOCKS[c];
            if (!b) return;
            flush(i);
            runStart = i + 1;
            bgs += `<rect x="${(x + i * CW + b.x * CW).toFixed(1)}" y="${(y + b.y * CH).toFixed(1)}" width="${(b.w * CW + 0.4).toFixed(1)}" height="${(b.h * CH + 0.4).toFixed(1)}" fill="${hex(fg)}" opacity="${b.o}"/>`;
          });
          flush(chars.length);
          col += len;
          continue;
        }
        texts += textEl(x, y, sp.text, fg, sp.attributes, len);
      }
      col += len;
    }
  });
  const dots = [["#ff5f57", 20], ["#febc2e", 40], ["#28c840", 60]].map(([c, x]) => `<circle cx="${x}" cy="${BAR / 2 + 1}" r="6" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h}" viewBox="0 0 ${w.toFixed(0)} ${h}" role="img" aria-label="${esc(title)}">
<rect width="${w.toFixed(0)}" height="${h}" rx="10" fill="${base}" stroke="${frame}"/>
<rect width="${w.toFixed(0)}" height="${BAR}" rx="10" fill="${theme.element ?? base}" opacity="0.55"/>
${dots}
<text x="${(w / 2).toFixed(0)}" y="${BAR / 2 + 5}" fill="${theme.subtle}" font-size="12.5" text-anchor="middle" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">${esc(title)}</text>
<g shape-rendering="crispEdges">${bgs}</g>
<g font-family="'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace" font-size="14">${texts}</g>
</svg>
`;
}

async function render(name: string, scene: Scene) {
  setMotionFrozen(true);
  const base = createAppState({ settings: { theme: scene.theme, transparent: false, reduceMotion: true }, hostsFile: { defaultHostId: HOST, hosts: [] } });
  const noop = async () => {};
  // No daemon: the views only need these calls, and the data is already in the stores.
  const runtimes = {
    get: () => ({
      openTimeline: () => () => {}, loadOlder: noop, loadChanges: noop, listDir: noop, send: noop, cancel: noop,
      readFile: async () => ({ kind: "text", text: FILE_TEXT, size: FILE_TEXT.length, truncated: false }),
    }),
    hosts: () => [], start: () => {}, disposeAll: noop,
  };
  const state: AppContextValue = { ...base, runtimes: runtimes as never };
  scene.setup(state);
  const origError = console.error;
  console.error = () => {};
  const t = await testRender(<AppRoot state={state} onQuit={() => {}} />, { width: scene.width, height: scene.height });
  for (let i = 0; i < 8; i++) {
    await Bun.sleep(25);
    await t.renderOnce();
  }
  // captureSpans' declared type hides the per-span colours it really returns.
  const cap: { cols: number; lines: { spans: CapturedSpan[] }[] } = t.captureSpans() as never;
  const frame = t.captureCharFrame();
  t.renderer.destroy();
  console.error = origError;
  const svg = toSvg(cap.lines, cap.cols, findTheme(scene.theme), scene.title);
  writeFileSync(join(OUT, `${name}.svg`), svg);
  return { svg, frame };
}

if (import.meta.main) {
  mkdirSync(OUT, { recursive: true });
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : Object.keys(SCENES);
  for (const name of names) {
    const scene = SCENES[name];
    if (!scene) throw new Error(`unknown scene "${name}" (${Object.keys(SCENES).join(", ")})`);
    const { svg, frame } = await render(name, scene);
    console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB`);
    if (process.env.SHOW) console.log(frame);
  }
  process.exit(0);
}
