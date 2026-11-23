/**
 * The made-up workspace the README screenshots and the demo recording draw: one checkout
 * app, four agents, a real-looking diff. Nothing here touches a daemon or private data.
 */
import { createAppState } from "../src/app-root";
import type { AppContextValue } from "../src/stores/context";
import { emptyChanges, type ChangesState, type DiffFile, type DiffToken } from "../src/paseo/changes";
import { emptyFiles, type DirEntry } from "../src/paseo/files";
import { emptyTimeline, hydrateTimeline } from "../src/paseo/timeline";
import { changesKey, timelineKey } from "../src/stores/session";

export const HOST = "demo";

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

export const QUESTION = {
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
      { question: "Which browsers should the fix run on?", header: "Browsers", options: [{ label: "Chromium" }, { label: "Firefox" }, { label: "WebKit" }], multiSelect: true, allowOther: true },
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

export function seed(s: AppContextValue, selected: { workspace: string; agent: string }, opts: { pending?: unknown } = {}) {
  const { store, ui } = s;
  store.actions.addHost({ id: HOST, label: "workstation", url: "ws://127.0.0.1:6767/ws" });
  store.actions.setActiveHost(HOST);
  store.actions.setConnection(HOST, { status: "connected" });
  store.actions.setServerInfo(HOST, { version: "0.16.1", hostname: "workstation" });
  store.actions.setProjects(HOST, PROJECTS as never);
  store.actions.setWorkspaces(HOST, WORKSPACES as never);
  store.actions.setAgents(HOST, AGENTS.map((a) => (opts.pending && a.id === selected.agent ? { ...a, pendingPermissions: [opts.pending] } : a)) as never);
  store.actions.updateTimeline(timelineKey(HOST, "a-checkout"), () => hydrateTimeline(emptyTimeline(), { epoch: "E", endCursor: { epoch: "E", seq: 100 }, entries: ENTRIES as never }));
  store.actions.updateTimeline(timelineKey(HOST, "a-flaky"), () => hydrateTimeline(emptyTimeline(), { epoch: "E", endCursor: { epoch: "E", seq: 100 }, entries: FLAKY as never }));
  ui.actions.selectWorkspace(HOST, selected.workspace);
  ui.actions.setCursor(`${HOST}:ws:${selected.workspace}`);
  ui.actions.updateTabs(`${HOST}:${selected.workspace}`, (t) => ({ ...t, tabs: AGENTS.filter((a) => a.workspaceId === selected.workspace).map((a) => a.id), active: selected.agent }));
}

export function seedPanel(s: AppContextValue, mode: "base" | "uncommitted" = "base") {
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


// ── state ────────────────────────────────────────────────────────────────────

/** No daemon behind the UI: the views only make these calls, and the data is already in the stores. */
export function demoRuntimes() {
  const noop = async () => {};
  return {
    get: () => ({
      openTimeline: () => () => {}, loadOlder: noop, loadChanges: noop, listDir: noop, send: noop, cancel: noop,
      respondToPermission: noop,
      readFile: async () => ({ kind: "text", text: FILE_TEXT, size: FILE_TEXT.length, truncated: false }),
    }),
    hosts: () => [], start: () => {}, disposeAll: noop,
  };
}

/** App state for one demo scene: demo settings, no real hosts, stub runtimes. */
export function demoState(settings: { theme: string; transparent?: boolean; reduceMotion?: boolean }): AppContextValue {
  const base = createAppState({ settings, hostsFile: { defaultHostId: HOST, hosts: [] } });
  return { ...base, runtimes: demoRuntimes() as never };
}
