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
  allAnswered, buildAnswers, dismissAnswersEmpty, initialForm, isAnswered, parseQuestions, reduceForm, rowCount,
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
  events.reduce((acc, e) => ({ ...reduceForm(questions, acc.state, e), submitted: acc.submitted }), { state: initialForm(questions), submit: false, submitted: false } as { state: ReturnType<typeof initialForm>; submit: boolean; submitted: boolean });

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
    expect(rowCount(qs[0]!)).toBe(2);
    expect(rowCount(qs[1]!)).toBe(4); // three options + "Other…"
  });

  test("single-select: a digit picks and moves on; Enter on the last answered question submits", () => {
    let r = run([{ type: "pick", index: 1 }, { type: "confirm" }]);
    expect(r.state.qi).toBe(1);
    expect([...r.state.selections[0]!]).toEqual([1]);
    expect(r.submit).toBe(false);
    r = run([{ type: "pick", index: 1 }, { type: "confirm" }, { type: "toggle" }, { type: "confirm" }]); // Auth chosen on the multi question
    expect(r.submit).toBe(true);
  });

  test("Enter on an option with nothing chosen chooses it; an unanswered Enter stays put", () => {
    const r = run([{ type: "move", delta: 1 }, { type: "confirm" }]);
    expect([...r.state.selections[0]!]).toEqual([1]);
    expect(r.state.qi).toBe(1);
    // On the last question Enter picks the cursor row, but the first question is still open:
    // the form sends you back to it instead of submitting.
    const stay = run([{ type: "question", delta: 1 }, { type: "confirm" }]);
    expect(stay.state.qi).toBe(0);
    expect(stay.submit).toBe(false);
  });

  test("multi-select toggles; the Other row opens the text input; typing replaces a single pick", () => {
    let r = run([{ type: "question", delta: 1 }, { type: "toggle" }, { type: "move", delta: 1 }, { type: "toggle" }, { type: "toggle" }]);
    expect([...r.state.selections[1]!]).toEqual([0]); // Auth on, Billing on then off
    r = run([{ type: "question", delta: 1 }, { type: "move", delta: 3 }, { type: "toggle" }]);
    expect(r.state.editing).toBe(true);
    r = run([{ type: "pick", index: 0 }, { type: "typed", text: "DuckDB" }]);
    expect(r.state.selections[0]!.size).toBe(0);
    expect(r.state.others[0]).toBe("DuckDB");
    r = run([{ type: "typed", text: "DuckDB" }, { type: "pick", index: 0 }]);
    expect(r.state.others[0]).toBeUndefined(); // picking drops the typed answer
  });

  test("a text-only question starts in its input and Enter answers it", () => {
    const free = parseQuestions({ questions: [{ question: "Name?", header: "Name", options: [] }] })!;
    expect(initialForm(free).editing).toBe(true);
    expect(run([{ type: "confirm" }], free).submit).toBe(false); // empty is not an answer
    expect(run([{ type: "typed", text: "Ada" }, { type: "confirm" }], free).submit).toBe(true);
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
          { width: 100, height: 28 },
        );
        await t.renderOnce();
        const settle = async () => { await Bun.sleep(20); await t.renderOnce(); };
        return { t, settle, done: () => { t.renderer.destroy(); console.error = origError; } };
      },
    };
  }

  test("shows the agent, the question, the options with their descriptions, and progress", async () => {
    const m = mount();
    const { t, done } = await m.render();
    try {
      const frame = t.captureCharFrame();
      for (const s of ["from Backend agent", "Which database should we use?", "1. Postgres", "Relational", "2. SQLite", "Embedded", "○ Database", "○ Features", "0/2 answered"]) expect(frame).toContain(s);
    } finally {
      done();
    }
  });

  test("answers every question and sends them as updatedInput.answers", async () => {
    const m = mount();
    const { t, settle, done } = await m.render();
    try {
      t.mockInput.pressKey("2"); // SQLite, moves on
      await settle();
      expect(t.captureCharFrame()).toContain("Which features do you want?");
      t.mockInput.pressKey("1"); // Auth (multi: toggles)
      t.mockInput.pressKey("3"); // Search
      await settle();
      expect(m.responses).toEqual([]);
      t.mockInput.pressEnter(); // last question answered: send
      await settle();
      expect(m.responses).toEqual([
        { label: "Answered", response: { behavior: "allow", updatedInput: { ...input, answers: { Database: "SQLite", Features: "Auth, Search" } } } },
      ]);
    } finally {
      done();
    }
  });

  test("a typed answer through Other, and d dismisses without answering", async () => {
    const m = mount();
    const { t, settle, done } = await m.render();
    try {
      t.mockInput.pressKey("1");
      await settle();
      t.mockInput.pressKey("o"); // free-text answer for the multi question
      await settle();
      for (const ch of "Metrics") t.mockInput.pressKey(ch);
      await settle();
      t.mockInput.pressEnter();
      await settle();
      expect(m.responses.at(-1)!.response).toMatchObject({ behavior: "allow", updatedInput: { answers: { Database: "Postgres", Features: "Metrics" } } });
    } finally {
      done();
    }
    const n = mount();
    const b = await n.render();
    try {
      b.t.mockInput.pressKey("d");
      await b.settle();
      expect(n.responses).toEqual([{ label: "Dismissed", response: { behavior: "deny", message: "Dismissed by user" } }]);
    } finally {
      b.done();
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
      t.mockInput.pressKey("1");
      await settle();
      t.mockInput.pressKey("2");
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
