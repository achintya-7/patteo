import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { AppContext } from "../src/stores/context";
import { createSessionStore } from "../src/stores/session";
import { createSettingsStore } from "../src/stores/settings";
import { createUiStore } from "../src/stores/ui";
import { PendingBar, summarizePending } from "../src/ui/agent/PendingBar";
import { PermissionsModal } from "../src/ui/modals/PermissionsModal";
import { WorkspacePane } from "../src/ui/workspace/WorkspacePane";
import { QuestionForm } from "../src/ui/modals/QuestionForm";
import {
  allAnswered, buildAnswers, buildRows, dismissAnswersEmpty, initialForm, isAnswered, parseQuestions, reduceForm,
  type FormEvent, type Question,
} from "../src/ui/modals/question-model";

const input = {
  questions: [
    { question: "Which database should we use?", header: "Database", options: [{ label: "Postgres", description: "Relational" }, { label: "SQLite", description: "Embedded" }], multiSelect: false },
    { question: "Which features do you want?", header: "Features", options: [{ label: "Auth" }, { label: "Billing" }, { label: "Search" }], multiSelect: true, allowOther: true },
  ],
};
const qs = parseQuestions(input)!;
const run = (events: FormEvent[], questions: Question[] = qs) =>
  events.reduce(
    (acc, e) => ({ ...reduceForm(questions, acc.state, e), submitted: acc.submitted }),
    { state: initialForm(questions), submit: false, submitted: false } as { state: ReturnType<typeof initialForm>; submit: boolean; submitted: boolean },
  );
const row = (state: ReturnType<typeof initialForm>, questions: Question[] = qs) => buildRows(questions)[state.cursor]!;

describe("question model", () => {
  test("parses Desktop's form shape and refuses malformed input", () => {
    expect(qs).toHaveLength(2);
    expect(qs[1]).toMatchObject({ header: "Features", multiSelect: true, allowOther: true, allowEmpty: false });
    expect(qs[0]!.options[0]).toEqual({ label: "Postgres", description: "Relational", preview: undefined });
    expect(parseQuestions(null)).toBeNull();
    expect(parseQuestions({ questions: [] })).toBeNull();
    expect(parseQuestions({ questions: [{ question: "q", header: "h", options: [{ nolabel: 1 }] }] })).toBeNull();
    expect(parseQuestions({ questions: [{ question: "q", options: [] }] })).toBeNull(); // header is required
    expect(parseQuestions({ questions: [{ question: "q", header: "h", options: [], isOther: true }] })![0]!.allowOther).toBe(true);
  });

  test("answers: picks join, typed text replaces a single pick and extends a multi pick", () => {
    const sel = { 0: new Set([1]), 1: new Set([0, 2]) };
    expect(buildAnswers(qs, sel, {})).toEqual({ Database: "SQLite", Features: "Auth, Search" });
    // Typed text only counts where free text is allowed: the first question has no "other".
    expect(buildAnswers(qs, sel, { 0: "DuckDB", 1: "Metrics" })).toEqual({ Database: "SQLite", Features: "Auth, Search, Metrics" });
    const open = parseQuestions({ questions: [{ question: "q", header: "Database", options: [{ label: "A" }], allowOther: true }] })!;
    expect(buildAnswers(open, { 0: new Set([0]) }, { 0: "DuckDB" })).toEqual({ Database: "DuckDB" }); // single-select: typed replaces
    expect(isAnswered(qs[0]!, 0, {}, {})).toBe(false);
    expect(isAnswered(qs[1]!, 1, {}, { 1: "  " })).toBe(false); // blank text is not an answer
    expect(isAnswered(qs[1]!, 1, {}, { 1: "x" })).toBe(true);
    expect(allAnswered(qs, sel, {})).toBe(true);
    const free = parseQuestions({ questions: [{ question: "Notes?", header: "Notes", options: [], allowEmpty: true }] })!;
    expect(buildAnswers(free, {}, {})).toEqual({ Notes: "" });
    expect(dismissAnswersEmpty(free)).toBe(true);
    expect(dismissAnswersEmpty(qs)).toBe(false);
  });

  test("every question and its options are one flat list, ending with submit", () => {
    expect(buildRows(qs).map((r) => `${r.q}:${r.kind}${r.kind === "option" ? r.option : ""}`)).toEqual([
      "0:option0", "0:option1", // Database
      "1:option0", "1:option1", "1:option2", "1:other", // Features (allows "other")
      "-1:submit",
    ]);
    const single = parseQuestions({ questions: [{ question: "q", header: "Only", options: [{ label: "A" }] }] })!;
    expect(buildRows(single).map((r) => r.kind)).toEqual(["option", "submit"]); // no "other" row unless allowed
    const textOnly = parseQuestions({ questions: [{ question: "q", header: "Name", options: [] }] })!;
    expect(buildRows(textOnly).map((r) => r.kind)).toEqual(["other", "submit"]); // a text question is just its field
    expect(initialForm(qs).cursor).toBe(0);
  });

  test("picking a single-choice option moves the cursor to the next unanswered question", () => {
    const r = run([{ type: "pick", row: 1 }]); // SQLite
    expect([...r.state.selections[0]!]).toEqual([1]);
    expect(row(r.state).q).toBe(1); // straight to Features, cursor on its first option
    expect(row(r.state).kind).toBe("option");
    // A multi-choice pick only toggles and stays put.
    const m = run([{ type: "pick", row: 1 }, { type: "pick", row: 2 }, { type: "pick", row: 3 }]);
    expect([...m.state.selections[1]!]).toEqual([0, 1]);
    expect(row(m.state).q).toBe(1);
  });

  test("'Other' opens in place; typing answers it and Enter carries on to the submit row", () => {
    const editing = run([{ type: "pick", row: 1 }, { type: "pick", row: 5 }]); // Features → "Something else…"
    expect(editing.state.editing).toBe(1);
    expect(editing.state.cursor).toBe(5);
    const typed = run([{ type: "pick", row: 1 }, { type: "pick", row: 5 }, { type: "typed", text: "Metrics" }, { type: "confirm" }]);
    expect(typed.state.editing).toBeNull();
    expect(typed.state.others[1]).toBe("Metrics");
    expect(row(typed.state).kind).toBe("submit");
    expect(typed.submit).toBe(false); // Enter closed the field, it did not send yet
    const sent = run([{ type: "pick", row: 1 }, { type: "pick", row: 5 }, { type: "typed", text: "Metrics" }, { type: "confirm" }, { type: "confirm" }]);
    expect(sent.submit).toBe(true);
  });

  test("the submit row refuses an incomplete form and jumps to what is missing", () => {
    const rows = buildRows(qs);
    const atSubmit = { ...initialForm(qs), cursor: rows.length - 1 };
    const r = reduceForm(qs, atSubmit, { type: "confirm" }, rows);
    expect(r.submit).toBe(false);
    expect(r.state.cursor).toBe(0); // back to the first unanswered control
    const done = reduceForm(qs, { ...atSubmit, selections: { 0: new Set([0]), 1: new Set([2]) } }, { type: "confirm" }, rows);
    expect(done.submit).toBe(true);
  });

  test("a text-only question starts on its own field", () => {
    const free = parseQuestions({ questions: [{ question: "Name?", header: "Name", options: [] }] })!;
    const empty = run([{ type: "confirm" }], free); // Enter opens the field
    expect(empty.state.editing).toBe(0);
    const blank = run([{ type: "typed", text: "   " }, { type: "confirm" }], free);
    expect(blank.submit).toBe(false);
    const answered = run([{ type: "confirm" }, { type: "typed", text: "Ada" }, { type: "confirm" }, { type: "confirm" }], free);
    expect(answered.state.editing).toBeNull();
    expect(answered.submit).toBe(true);
  });
});

describe("question form", () => {
  function mount(extra: { questions?: Question[]; input?: Record<string, unknown> } = {}) {
    const responses: { response: AgentPermissionResponse; label: string }[] = [];
    const store = createSessionStore();
    const ui = createUiStore();
    const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
    return {
      responses,
      render: async () => {
        const origError = console.error;
        console.error = () => {};
        const t = await testRender(
          <AppContext.Provider value={{ store, ui, runtimes: {} as never, settings }}>
            <QuestionForm questions={extra.questions ?? qs} input={extra.input ?? input} agentTitle="Backend agent" busy={false} error={null} onRespond={(response, label) => { responses.push({ response, label }); }} />
          </AppContext.Provider>,
          { width: 100, height: 34 },
        );
        await t.renderOnce();
        const settle = async () => { await Bun.sleep(20); await t.renderOnce(); };
        return { t, settle, done: () => { t.renderer.destroy(); console.error = origError; } };
      },
    };
  }

  test("every question is on screen at once, before answering anything", async () => {
    const m = mount();
    const { t, done } = await m.render();
    try {
      const frame = t.captureCharFrame();
      for (const s of [
        "from Backend agent", "0/2 answered",
        "1. Database", "Which database should we use?", "1. Postgres", "Relational", "2. SQLite", "Embedded",
        "2. Features", "Which features do you want?", "1. Auth", "2. Billing", "3. Search", "Something else…",
        "Send answers",
      ]) expect(frame).toContain(s);
    } finally {
      done();
    }
  });

  test("answering the first question moves the caret to the second by itself", async () => {
    const m = mount();
    const { t, settle, done } = await m.render();
    try {
      t.mockInput.pressKey("2"); // SQLite
      await settle();
      const lines = t.captureCharFrame().split("\n");
      const marked = lines.find((l) => l.includes("▌"));
      expect(marked).toContain("1. Auth"); // the caret is on the next question, not still on Database
      expect(lines.some((l) => l.includes("✔ 1. Database"))).toBe(true);
      expect(t.captureCharFrame()).toContain("1/2 answered");
    } finally {
      done();
    }
  });

  test("'Other' shows a text field inside the popup and the answer is sent from there", async () => {
    const m = mount();
    const { t, settle, done } = await m.render();
    try {
      t.mockInput.pressKey("1"); // Postgres
      await settle();
      for (let i = 0; i < 3; i++) { t.mockInput.pressKey("j"); } // Features 1, 2, then "Something else…"
      await settle();
      t.mockInput.pressEnter();
      await settle();
      const frame = t.captureCharFrame(); // the field is drawn in place, same popup
      expect(frame).toContain("Question");
      expect(frame).toContain("1. Database"); // the other question is still there while typing
      for (const ch of "Metrics") t.mockInput.pressKey(ch);
      await settle();
      expect(t.captureCharFrame()).toContain("Metrics");
      t.mockInput.pressEnter(); // closes the field, moves on
      await settle();
      t.mockInput.pressEnter(); // on the submit row
      await settle();
      expect(m.responses).toEqual([
        { label: "Answered", response: { behavior: "allow", updatedInput: { ...input, answers: { Database: "Postgres", Features: "Metrics" } } } },
      ]);
    } finally {
      done();
    }
  });

  test("d dismisses without answering", async () => {
    const m = mount();
    const { t, settle, done } = await m.render();
    try {
      t.mockInput.pressKey("d");
      await settle();
      expect(m.responses).toEqual([{ label: "Dismissed", response: { behavior: "deny", message: "Dismissed by user" } }]);
    } finally {
      done();
    }
  });
});

describe("question in the permissions modal and the pending bar", () => {
  const request = { id: "r1", provider: "claude", name: "AskUserQuestion", kind: "question", title: "Questions", input };
  function seed(req: Record<string, unknown>) {
    const store = createSessionStore();
    store.actions.addHost({ id: "h", label: "h", url: "ws://x/ws" });
    store.actions.setActiveHost("h");
    store.actions.setAgents("h", [{ id: "a", workspaceId: "w", status: "running", cwd: "/r", updatedAt: new Date().toISOString(), title: "Backend agent", provider: "claude", model: "m", pendingPermissions: [req] } as never]);
    const ui = createUiStore();
    ui.actions.openModal({ kind: "permissions" });
    const sent: { agentId: string; requestId: string; response: unknown }[] = [];
    const runtimes = { get: () => ({ respondToPermission: async (agentId: string, requestId: string, response: unknown) => { sent.push({ agentId, requestId, response }); } }) } as never;
    const settings = createSettingsStore(DEFAULT_SETTINGS, [], { persist: false });
    return { store, ui, runtimes, settings, sent };
  }
  async function mount(h: ReturnType<typeof seed>, node: React.ReactNode) {
    const origError = console.error;
    console.error = () => {};
    const t = await testRender(<AppContext.Provider value={{ store: h.store, ui: h.ui, runtimes: h.runtimes, settings: h.settings }}>{node}</AppContext.Provider>, { width: 100, height: 28 });
    await t.renderOnce();
    return { t, settle: async () => { await Bun.sleep(25); await t.renderOnce(); }, done: () => { t.renderer.destroy(); console.error = origError; } };
  }

  test("answering goes to the daemon for that agent and request, then the dialog closes", async () => {
    const h = seed(request);
    const { t, settle, done } = await mount(h, <PermissionsModal />);
    try {
      expect(t.captureCharFrame()).toContain("Which database should we use?");
      t.mockInput.pressKey("1"); // Postgres, moves on to the next question
      await settle();
      t.mockInput.pressKey("2"); // Billing
      await settle();
      for (let i = 0; i < 3; i++) { t.mockInput.pressKey("j"); } // past the last option and "Something else…" to the submit row
      await settle();
      t.mockInput.pressEnter();
      await settle();
      expect(h.sent).toEqual([{ agentId: "a", requestId: "r1", response: { behavior: "allow", updatedInput: { ...input, answers: { Database: "Postgres", Features: "Billing" } } } }]);
      expect(h.ui.getState().modal).toBeNull();
    } finally {
      done();
    }
  });

  test("a question the form can't parse still gets allow/deny", async () => {
    const h = seed({ ...request, input: { questions: "nonsense" }, title: "Odd question" });
    const { t, settle, done } = await mount(h, <PermissionsModal />);
    try {
      expect(t.captureCharFrame()).toContain("Odd question");
      t.mockInput.pressKey("y");
      await settle();
      expect(h.sent[0]!.response).toEqual({ behavior: "allow" });
    } finally {
      done();
    }
  });

  test("an open conversation shows the waiting question above the composer, not hidden in a toast", async () => {
    const h = seed(request);
    h.ui.actions.closeModal();
    h.store.actions.setWorkspaces("h", [{ id: "w", projectId: "p", title: "W", workspaceDirectory: "/r", status: "idle" } as never]);
    h.ui.actions.selectWorkspace("h", "w");
    h.ui.actions.updateTabs("h:w", (s) => ({ ...s, tabs: ["a"], active: "a" }));
    h.ui.actions.setFocus("main");
    const runtimes = { get: () => ({ openTimeline: () => () => {}, loadOlder: async () => {} }) } as never;
    h.runtimes = runtimes;
    const { t, done } = await mount(h, <box width={100} height={26}><WorkspacePane width={100} height={26} /></box>);
    try {
      for (let i = 0; i < 3; i++) { await Bun.sleep(20); await t.renderOnce(); }
      const frame = t.captureCharFrame();
      expect(frame).toContain("? asks");
      expect(frame).toContain("Which database should we use?");
      expect(frame).toContain("send to steer it"); // the composer is still there (the seeded agent is running)
      expect(frame.indexOf("? asks")).toBeLessThan(frame.indexOf("send to steer it"));
    } finally {
      done();
    }
  });

  test("the bar says what is waiting: the question, or the permission", async () => {
    expect(summarizePending(undefined)).toBeNull();
    expect(summarizePending({ pendingPermissions: [] } as never)).toBeNull();
    expect(summarizePending({ pendingPermissions: [request, request] } as never)).toEqual({ kind: "question", text: "Which database should we use?", more: 1 });
    expect(summarizePending({ pendingPermissions: [{ id: "x", kind: "tool", name: "Bash", title: "Run rm -rf build" }] } as never)).toEqual({ kind: "permission", text: "Run rm -rf build", more: 0 });

    const h = seed(request);
    h.ui.actions.closeModal();
    const agent = h.store.getState().hosts.h!.agents.a;
    const { t, done } = await mount(h, <box width={100} height={3}><PendingBar agent={agent} width={100} /></box>);
    try {
      const frame = t.captureCharFrame();
      expect(frame).toContain("? asks");
      expect(frame).toContain("Which database should we use?");
      expect(frame).toContain("p to answer");
    } finally {
      done();
    }
  });
});
