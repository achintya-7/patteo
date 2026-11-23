/**
 * An agent's question (a permission request of kind "question"): parsing its form,
 * tracking answers, and building the response the provider expects. The logic follows
 * Paseo Desktop's question form (Apache-2.0, © Mohamed Boudra) so both clients answer
 * the same way.
 */

export interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
  allowEmpty: boolean;
  placeholder?: string;
  dismissLabel?: string;
}

export type Selections = Record<number, ReadonlySet<number>>;
export type OtherTexts = Record<number, string>;

const str = (r: Record<string, unknown>, k: string) => (typeof r[k] === "string" ? (r[k] as string) : undefined);

/** `request.input` → questions, or null when it isn't a well-formed question form. */
export function parseQuestions(input: unknown): Question[] | null {
  if (typeof input !== "object" || input === null || !Array.isArray((input as Record<string, unknown>).questions)) return null;
  const out: Question[] = [];
  for (const item of (input as { questions: unknown[] }).questions) {
    if (typeof item !== "object" || item === null) return null;
    const q = item as Record<string, unknown>;
    if (typeof q.question !== "string" || typeof q.header !== "string" || !Array.isArray(q.options)) return null;
    const options: QuestionOption[] = [];
    for (const opt of q.options as unknown[]) {
      if (typeof opt !== "object" || opt === null || typeof (opt as Record<string, unknown>).label !== "string") return null;
      const o = opt as Record<string, unknown>;
      options.push({ label: o.label as string, description: str(o, "description"), preview: str(o, "preview") });
    }
    out.push({
      question: q.question,
      header: q.header,
      options,
      multiSelect: q.multiSelect === true,
      allowOther: q.allowOther === true || q.isOther === true,
      allowEmpty: q.allowEmpty === true,
      placeholder: str(q, "placeholder"),
      dismissLabel: str(q, "dismissLabel"),
    });
  }
  return out.length > 0 ? out : null;
}

/** A free-text answer is possible when there are no options, or the question allows "other". */
export const showsTextInput = (q: Question) => q.options.length === 0 || q.allowOther;

export function isAnswered(q: Question, i: number, selections: Selections, others: OtherTexts): boolean {
  if ((selections[i]?.size ?? 0) > 0) return true;
  if (!showsTextInput(q)) return false;
  if ((others[i]?.trim().length ?? 0) > 0) return true;
  return q.allowEmpty;
}

export const allAnswered = (qs: Question[], selections: Selections, others: OtherTexts) =>
  qs.every((q, i) => isAnswered(q, i, selections, others));

/** header → answer text; several picks join with ", ". Single-select: typed text replaces the pick. */
export function buildAnswers(qs: Question[], selections: Selections, others: OtherTexts): Record<string, string> {
  const answers: Record<string, string> = {};
  qs.forEach((q, i) => {
    const labels = [...(selections[i] ?? [])].sort((a, b) => a - b).map((idx) => q.options[idx]!.label);
    const other = others[i]?.trim();
    if (showsTextInput(q)) {
      if (other) {
        answers[q.header] = q.multiSelect ? [...labels, other].join(", ") : other;
        return;
      }
      if (q.allowEmpty && q.options.length === 0) {
        answers[q.header] = "";
        return;
      }
    }
    if (labels.length > 0) answers[q.header] = labels.join(", ");
  });
  return answers;
}

/** Dismissing a text-only optional form still answers it (with nothing) instead of denying. */
export const dismissAnswersEmpty = (qs: Question[]) => qs.length > 0 && qs.every((q) => q.allowEmpty && q.options.length === 0);

export const dismissLabel = (qs: Question[], fallback = "Dismiss") => qs.find((q) => q.dismissLabel)?.dismissLabel ?? fallback;

/** The rows the option list shows: every option, then "Other…" when free text is allowed. */
export const rowCount = (q: Question) => q.options.length + (q.allowOther && q.options.length > 0 ? 1 : 0);

/** The form's whole interaction state: pure, so every key is unit-tested without a terminal. */
export interface FormState {
  /** Active question. */
  qi: number;
  /** Option cursor per question. */
  cursors: Record<number, number>;
  selections: Selections;
  others: OtherTexts;
  /** Typing into the free-text answer. */
  editing: boolean;
}

export type FormEvent =
  | { type: "move"; delta: number }
  | { type: "pick"; index: number }
  | { type: "toggle" }
  | { type: "confirm" }
  | { type: "question"; delta: number }
  | { type: "typed"; text: string }
  | { type: "edit" };

export const initialForm = (qs: Question[]): FormState => ({ qi: 0, cursors: {}, selections: {}, others: {}, editing: qs[0] ? qs[0].options.length === 0 : false });

const isTextOnly = (q: Question) => q.options.length === 0;
const otherRow = (q: Question) => (q.allowOther && q.options.length > 0 ? q.options.length : -1);

/** Moves to a question; a text-only one starts in its input. */
function goTo(qs: Question[], s: FormState, qi: number): FormState {
  const i = Math.max(0, Math.min(qs.length - 1, qi));
  return { ...s, qi: i, editing: isTextOnly(qs[i]!) };
}

function pick(q: Question, s: FormState, index: number): FormState {
  if (index < 0 || index >= q.options.length) return s;
  const current = new Set(s.selections[s.qi] ?? []);
  if (q.multiSelect) {
    if (!current.delete(index)) current.add(index);
    return { ...s, selections: { ...s.selections, [s.qi]: current } };
  }
  // Single-select: a pick and a typed answer replace each other.
  const { [s.qi]: _drop, ...others } = s.others;
  return { ...s, selections: { ...s.selections, [s.qi]: new Set([index]) }, others, cursors: { ...s.cursors, [s.qi]: index } };
}

export function reduceForm(qs: Question[], s: FormState, e: FormEvent): { state: FormState; submit: boolean } {
  const q = qs[s.qi];
  if (!q) return { state: s, submit: false };
  const done = (state: FormState) => ({ state, submit: false });
  switch (e.type) {
    case "move": {
      const max = Math.max(0, rowCount(q) - 1);
      const next = Math.max(0, Math.min(max, (s.cursors[s.qi] ?? 0) + e.delta));
      return done({ ...s, cursors: { ...s.cursors, [s.qi]: next } });
    }
    case "pick": return done(pick(q, s, e.index));
    case "toggle": {
      const at = s.cursors[s.qi] ?? 0;
      return at === otherRow(q) ? done({ ...s, editing: true }) : done(pick(q, s, at));
    }
    case "edit": return done({ ...s, editing: true });
    case "typed": {
      const others = { ...s.others, [s.qi]: e.text };
      // Single-select: typing an answer drops the picked option.
      const selections = !q.multiSelect && e.text.length > 0 ? { ...s.selections, [s.qi]: new Set<number>() } : s.selections;
      return done({ ...s, others, selections });
    }
    case "question": return done(goTo(qs, s, s.qi + e.delta));
    case "confirm": {
      const at = s.cursors[s.qi] ?? 0;
      if (!s.editing && at === otherRow(q)) return done({ ...s, editing: true });
      let state: FormState = { ...s, editing: isTextOnly(q) ? s.editing : false };
      // Enter on an option with nothing chosen yet chooses it.
      if (!state.editing && (state.selections[s.qi]?.size ?? 0) === 0 && at < q.options.length && !(state.others[s.qi]?.trim())) state = pick(q, state, at);
      if (!isAnswered(q, s.qi, state.selections, state.others)) return done(state);
      if (s.qi < qs.length - 1) return done(goTo(qs, state, s.qi + 1));
      const firstOpen = qs.findIndex((x, i) => !isAnswered(x, i, state.selections, state.others));
      return firstOpen >= 0 ? done(goTo(qs, state, firstOpen)) : { state, submit: true };
    }
  }
}
