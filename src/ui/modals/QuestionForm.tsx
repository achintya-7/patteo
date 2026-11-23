/**
 * An agent's questions as one form: every question and its options are listed together, so you
 * can see the whole thing before answering. Picking an option on a single-choice question moves
 * the cursor to the next unanswered one by itself; "Other" opens a text field in place.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { useTheme } from "../../theme/theme";
import { truncate } from "../text";
import { wrapText } from "../explorer/pr-model";
import { keepVisible } from "../explorer/window";
import { Overlay } from "./Overlay";
import {
  allAnswered, buildRows, buildAnswers, dismissAnswersEmpty, dismissLabel, initialForm, isAnswered, reduceForm,
  type FormEvent, type FormState, type Question, type Row,
} from "./question-model";

/** One line of the drawn form; `cursor` ties it back to a row of the model. */
interface Item {
  node: ReactNode;
  /** Row index this line draws, when it is a control. */
  cursor: number | null;
}

export function QuestionForm({ questions, input, agentTitle, busy, error, onRespond, footerExtra }: {
  questions: Question[];
  /** The request's original input; answers are added to it, as Desktop does. */
  input: Record<string, unknown> | undefined;
  agentTitle: string;
  busy: boolean;
  error: string | null;
  onRespond: (response: AgentPermissionResponse, label: string) => void;
  footerExtra?: string;
}) {
  const t = useTheme();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const [form, setFormState] = useState(() => initialForm(questions));
  const [start, setStart] = useState(0);
  const rows = useMemo(() => buildRows(questions), [questions]);
  // Keys can outrun a re-render; handlers read the latest state from here.
  const live = useRef<FormState>(form);
  live.current = form;

  const respond = (state: FormState) => {
    onRespond({ behavior: "allow", updatedInput: { ...input, answers: buildAnswers(questions, state.selections, state.others) } } as AgentPermissionResponse, "Answered");
  };
  const dismiss = () => {
    if (dismissAnswersEmpty(questions)) return respond(live.current);
    onRespond({ behavior: "deny", message: "Dismissed by user" }, "Dismissed");
  };
  const apply = (e: FormEvent) => {
    const { state, submit } = reduceForm(questions, live.current, e, rows);
    live.current = state;
    setFormState(state);
    if (submit) void respond(state);
  };

  const editingQuestion = form.editing === null ? null : questions[form.editing];
  useKeyboard((k) => {
    if (busy) return;
    if (editingQuestion) {
      // The inline field owns typing; Esc puts it away without losing what you typed.
      if (k.name === "escape") return apply({ type: "stopEdit" });
      if (k.name === "return") return apply({ type: "confirm" });
      return;
    }
    if (k.name === "j" || k.name === "down") return apply({ type: "move", delta: 1 });
    if (k.name === "k" || k.name === "up") return apply({ type: "move", delta: -1 });
    if (k.name === "space") return apply({ type: "toggle" });
    if (k.name === "return") return apply({ type: "confirm" });
    if (k.name === "o") return apply({ type: "edit" });
    if (k.name === "d") return dismiss();
    if (/^[1-9]$/.test(k.name)) {
      // Digits pick an option of the question the cursor is in.
      const row = rows[form.cursor];
      const q = row ? questions[row.q] : undefined;
      const n = Number(k.name) - 1;
      if (!q || n >= q.options.length) return;
      const at = rows.findIndex((r) => r.q === row!.q && r.kind === "option" && r.option === n);
      if (at >= 0) apply({ type: "pick", row: at });
    }
  });

  const width = Math.min(88, termWidth - 4);
  const inner = width - 4;
  const gutter = 4;

  // Draw order: every question with its options, then the submit line. Each item is one row tall.
  const items: Item[] = [];
  const push = (node: ReactNode) => items.push({ node, cursor: null });
  questions.forEach((q, qi) => {
    const done = isAnswered(q, qi, form.selections, form.others);
    const active = rows[form.cursor]?.q === qi;
    push(
      <text key={`h${qi}`} wrapMode="none">
        <span fg={done ? t.success : active ? t.accent : t.subtle} attributes={TextAttributes.BOLD}>
          {`${done ? "✔" : active ? "▸" : "·"} ${qi + 1}. ${truncate(q.header, inner - 6)}`}
        </span>
        {q.multiSelect ? <span fg={t.subtle}>{"  pick any"}</span> : null}
      </text>,
    );
    for (const [i, line] of wrapText(q.question, inner - gutter).entries()) {
      push(<text key={`q${qi}:${i}`} fg={t.text} wrapMode="none">{line}</text>);
    }
    push(<text key={`s${qi}`} fg={t.subtle}>{" "}</text>);

    const chosen = form.selections[qi] ?? new Set<number>();
    rows.forEach((r, index) => {
      if (r.q !== qi) return;
      const on = form.cursor === index && !form.editing;
      if (r.kind === "option") {
        const o = q.options[r.option]!;
        const picked = chosen.has(r.option);
        items.push({
          cursor: index,
          node: (
            <box key={`o${qi}:${r.option}`} flexDirection="column" flexShrink={0} backgroundColor={on ? t.element : undefined}>
              <text wrapMode="none">
                <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
                <span fg={picked ? t.success : t.subtle}>{` ${q.multiSelect ? (picked ? "☑" : "☐") : picked ? "◉" : "○"} `}</span>
                <span fg={on ? t.text : t.muted} attributes={picked ? TextAttributes.BOLD : TextAttributes.NONE}>{truncate(`${r.option + 1}. ${o.label}`, inner - 6)}</span>
                {o.description ? <span fg={t.subtle}>{`  ${truncate(o.description, Math.max(0, inner - 10 - [...o.label].length))}`}</span> : null}
              </text>
            </box>
          ),
        });
        return;
      }
      // "Other": the answer is written right here, on this line, when it is open.
      const text = form.others[qi] ?? "";
      const open = form.editing === qi;
      const hasOptions = q.options.length > 0;
      if (open) {
        items.push({
          cursor: index,
          node: (
            <box key={`t${qi}`} border borderStyle="rounded" borderColor={t.accent} height={3} paddingLeft={1} flexShrink={0}>
              <input
                focused={!busy}
                value={text}
                placeholder={q.placeholder ?? "Type your answer"}
                onInput={(v: string) => apply({ type: "typed", text: v })}
                textColor={t.text}
                placeholderColor={t.subtle}
                backgroundColor={t.overlay}
                focusedBackgroundColor={t.overlay}
                cursorColor={t.accent}
              />
            </box>
          ),
        });
        return;
      }
      items.push({
        cursor: index,
        node: (
          <box key={`o${qi}:other`} height={1} flexShrink={0} backgroundColor={on ? t.element : undefined}>
            <text wrapMode="none">
              <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
              <span fg={text.trim() ? t.success : t.subtle}>{" ✎ "}</span>
              <span fg={text.trim() ? t.text : on ? t.text : t.muted}>
                {text.trim() ? truncate(text, inner - 8) : hasOptions ? "Something else…" : (q.placeholder ?? "Type your answer")}
              </span>
              {text.trim() && hasOptions ? <span fg={t.subtle}>{"  (replaces the choice)"}</span> : null}
            </text>
          </box>
        ),
      });
    });
    push(<text key={`g${qi}`} fg={t.subtle}>{" "}</text>);
  });

  const answered = allAnswered(questions, form.selections, form.others);
  const submitIndex = rows.length - 1;
  const onSubmit = form.cursor === submitIndex && form.editing === null;
  items.push({
    cursor: submitIndex,
    node: (
      <box key="submit" height={1} flexShrink={0} backgroundColor={onSubmit ? t.element : undefined}>
        <text wrapMode="none">
          <span fg={onSubmit ? t.accent : t.subtle}>{onSubmit ? "▌" : " "}</span>
          <span fg={answered ? t.success : t.subtle} attributes={TextAttributes.BOLD}>{answered ? " Send answers" : " Send answers  (answer everything first)"}</span>
        </text>
      </box>
    ),
  });

  const cursorItem = Math.max(0, items.findIndex((i) => i.cursor === form.cursor));
  // The dialog is as tall as the form needs, not the screen: a short question stays short.
  const view = Math.min(items.length, Math.max(4, termHeight - 8));
  const top = keepVisible(cursorItem, start, view, items.length);
  if (top !== start) setStart(top);
  const height = Math.min(termHeight - 2, Math.min(items.length, view) + 4); // header, content, footer, border

  const hints = editingQuestion
    ? ["⏎ done", "esc cancel"]
    : ["↑↓ move", "1-9 pick", "␣ toggle", `d ${dismissLabel(questions).toLowerCase()}`, "esc later", ...(footerExtra ? [footerExtra.replace(/^ · /, "")] : [])];
  // Arrows and the space glyph take two cells in most terminal fonts, so count them that way.
  const cells = (text: string) => [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0x2000 ? 2 : 1), 0);
  let footer = hints.join(" · ");
  for (let n = hints.length; cells(footer) > width - 14 && n > 1; n--) footer = hints.slice(0, n - 1).join(" · ");

  return (
    <Overlay title="Question" width={88} height={height} footer={busy ? "sending…" : footer}>
      <text fg={t.subtle} wrapMode="none">
        {truncate(`from ${agentTitle}`, Math.max(10, inner - 22))}
        <span fg={t.subtle}>{`  ${questions.filter((x, i) => isAnswered(x, i, form.selections, form.others)).length}/${questions.length} answered`}</span>
      </text>
      {items.slice(top, top + view).map((item, i) => (
        <box key={top + i} flexShrink={0}>{item.node}</box>
      ))}
      {error ? <text fg={t.error} wrapMode="none">{truncate(error, inner)}</text> : null}
    </Overlay>
  );
}

export type { Row };
