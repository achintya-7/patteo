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

/** One control in the flat list the form draws: every option of every question, in order. */
export interface Row {
  /** Question index, or -1 for the submit row. */
  q: number;
  kind: "option" | "other" | "submit";
  /** Option index for `kind: "option"`. */
  option: number;
}

/**
 * Every question at once: its options, an "Other" row when free text is allowed (or the only row
 * when there are no options), then a submit row at the end.
 */
export function buildRows(qs: Question[]): Row[] {
  const rows: Row[] = [];
  qs.forEach((q, qi) => {
    q.options.forEach((_, option) => rows.push({ q: qi, kind: "option", option }));
    if (q.allowOther || q.options.length === 0) rows.push({ q: qi, kind: "other", option: -1 });
  });
  rows.push({ q: -1, kind: "submit", option: -1 });
  return rows;
}

/** The form's interaction state. `cursor` indexes `buildRows(qs)`. */
export interface FormState {
  cursor: number;
  selections: Selections;
  others: OtherTexts;
  /** Question whose free-text answer is being typed (its input is open in the form). */
  editing: number | null;
}

export type FormEvent =
  | { type: "move"; delta: number }
  | { type: "pick"; row?: number }
  | { type: "toggle" }
  | { type: "confirm" }
  | { type: "typed"; text: string }
  | { type: "edit" }
  | { type: "stopEdit" };

export const initialForm = (qs: Question[]): FormState => {
  const rows = buildRows(qs);
  const firstOpen = rows.findIndex((r) => r.kind !== "submit" && !isAnswered(qs[r.q]!, r.q, {}, {}));
  return { cursor: Math.max(0, firstOpen), selections: {}, others: {}, editing: null };
};

/** First row of the next question that still needs an answer, else the submit row. */
export function nextRow(qs: Question[], rows: Row[], from: number, s: FormState): number {
  for (let i = from; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.q < 0) return rows.length - 1;
    if (!isAnswered(qs[r.q]!, r.q, s.selections, s.others)) return i;
  }
  return rows.length - 1;
}

const firstRowOfQuestion = (rows: Row[], q: number) => Math.max(0, rows.findIndex((r) => r.q === q));

function choose(qs: Question[], s: FormState, rows: Row[], row: Row, advance: boolean): FormState {
  const q = qs[row.q]!;
  if (row.kind === "other") return { ...s, editing: row.q };
  if (row.kind === "submit") return s;
  const current = new Set(s.selections[row.q] ?? []);
  if (q.multiSelect) {
    if (!current.delete(row.option)) current.add(row.option);
    return { ...s, selections: { ...s.selections, [row.q]: current } };
  }
  // Single-select: a pick and a typed answer replace each other.
  const { [row.q]: _drop, ...others } = s.others;
  const next: FormState = { ...s, selections: { ...s.selections, [row.q]: new Set([row.option]) }, others };
  return advance ? { ...next, cursor: nextRow(qs, rows, firstRowOfQuestion(rows, row.q) + 1, next), editing: null } : next;
}

export function reduceForm(qs: Question[], s: FormState, e: FormEvent, rows: Row[] = buildRows(qs)): { state: FormState; submit: boolean } {
  const done = (state: FormState) => ({ state, submit: false });
  const row = rows[s.cursor];
  switch (e.type) {
    case "move": return done({ ...s, cursor: Math.max(0, Math.min(rows.length - 1, s.cursor + e.delta)), editing: null });
    case "pick": {
      const index = e.row ?? s.cursor;
      const at = rows[index];
      if (!at) return done(s);
      const next = choose(qs, s, rows, at, true);
      // A single-choice pick has already moved the cursor on; everything else stays on the row.
      return done({ ...next, cursor: at.kind === "option" && !qs[at.q]!.multiSelect ? next.cursor : index });
    }
    case "toggle": {
      if (!row || s.editing !== null) return done(s);
      return done(choose(qs, s, rows, row, false));
    }
    case "edit": {
      if (!row || row.kind !== "other") return done(s);
      return done({ ...s, editing: row.q });
    }
    case "stopEdit": return done({ ...s, editing: null });
    case "typed": {
      if (s.editing === null) return done(s);
      const q = qs[s.editing]!;
      // Single-select: typing an answer drops the picked option.
      const selections = !q.multiSelect && e.text.length > 0 ? { ...s.selections, [s.editing]: new Set<number>() } : s.selections;
      return done({ ...s, others: { ...s.others, [s.editing]: e.text }, selections });
    }
    case "confirm": {
      if (row?.kind === "submit") {
        if (!allAnswered(qs, s.selections, s.others)) {
          // Jump to the first thing still missing instead of failing silently.
          const missing = rows.findIndex((r) => r.kind !== "submit" && !isAnswered(qs[r.q]!, r.q, s.selections, s.others));
          return done({ ...s, cursor: Math.max(0, missing), editing: null });
        }
        return { state: s, submit: true };
      }
      if (!row) return done(s);
      if (s.editing !== null) {
        // Enter in the inline text field answers that question and moves on.
        const next: FormState = { ...s, editing: null };
        return done({ ...next, cursor: nextRow(qs, rows, firstRowOfQuestion(rows, row.q) + 1, next) });
      }
      if (row.kind === "other") return done({ ...s, editing: row.q });
      return done(choose(qs, s, rows, row, true));
    }
  }
}
