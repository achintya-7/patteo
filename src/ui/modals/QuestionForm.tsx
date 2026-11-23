/**
 * An agent's question as a form: pick an option (or several), type your own answer, step
 * through several questions, submit. The interaction lives in `reduceForm`; this draws it
 * and maps keys to events.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useMemo, useRef, useState } from "react";
import type { AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { useTheme } from "../../theme/theme";
import { truncate } from "../text";
import { wrapText } from "../explorer/pr-model";
import { Overlay } from "./Overlay";
import {
  allAnswered, buildAnswers, dismissAnswersEmpty, dismissLabel, initialForm, isAnswered, reduceForm, showsTextInput,
  type FormEvent, type Question,
} from "./question-model";

const MAX_PREVIEW = 6;

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
  // Keys can outrun a re-render; handlers read the latest state from here.
  const live = useRef(form);
  const apply = (e: FormEvent) => {
    const { state, submit } = reduceForm(questions, live.current, e);
    live.current = state;
    setFormState(state);
    if (submit) void respond();
  };

  const respond = () => {
    const s = live.current;
    onRespond({ behavior: "allow", updatedInput: { ...input, answers: buildAnswers(questions, s.selections, s.others) } } as AgentPermissionResponse, "Answered");
  };
  const dismiss = () => {
    if (dismissAnswersEmpty(questions)) return respond();
    onRespond({ behavior: "deny", message: "Dismissed by user" }, "Dismissed");
  };

  useKeyboard((k) => {
    if (busy) return;
    const s = live.current;
    const q = questions[s.qi]!;
    if (s.editing) {
      // The input owns text; Enter finishes the answer.
      if (k.name === "return") return apply({ type: "confirm" });
      if (k.name === "escape" && q.options.length > 0) {
        live.current = { ...s, editing: false };
        return setFormState(live.current);
      }
      return;
    }
    if (k.name === "j" || k.name === "down") return apply({ type: "move", delta: 1 });
    if (k.name === "k" || k.name === "up") return apply({ type: "move", delta: -1 });
    if (k.name === "space") return apply({ type: "toggle" });
    if (k.name === "return") return apply({ type: "confirm" });
    if (k.name === "tab" || k.name === "right" || k.name === "l") return apply({ type: "question", delta: 1 });
    if (k.name === "left" || k.name === "h") return apply({ type: "question", delta: -1 });
    if (k.name === "o" && showsTextInput(q)) return apply({ type: "edit" });
    if (k.name === "d") return dismiss();
    if (/^[1-9]$/.test(k.name)) {
      const n = Number(k.name) - 1;
      if (n >= q.options.length) return;
      apply({ type: "pick", index: n });
      // A single-select pick is the answer: move on (or submit) right away.
      if (!q.multiSelect) apply({ type: "confirm" });
    }
  });

  const q = questions[Math.min(form.qi, questions.length - 1)]!;
  const width = Math.min(86, termWidth - 4);
  const inner = width - 4;
  const cursor = form.cursors[form.qi] ?? 0;
  const selected = form.selections[form.qi] ?? new Set<number>();
  const questionLines = useMemo(() => wrapText(q.question, inner), [q.question, inner]);
  const other = form.others[form.qi] ?? "";
  const withOther = q.allowOther && q.options.length > 0;
  const current = q.options[cursor];
  const preview = current?.preview ? current.preview.split("\n").slice(0, MAX_PREVIEW) : [];
  const answered = allAnswered(questions, form.selections, form.others);

  const optionLines = q.options.reduce((n, o) => n + 1 + (o.description ? 1 : 0), 0) + (withOther ? 1 : 0);
  const textInputRows = q.options.length === 0 || form.editing ? 3 : 0;
  const wanted = 6 + (questions.length > 1 ? 1 : 0) + questionLines.length + optionLines + textInputRows + (preview.length ? preview.length + 2 : 0) + (error ? 1 : 0);
  const height = Math.min(termHeight - 2, Math.max(10, wanted + 2));

  // Hints in priority order; the border only has room for so many.
  const hints = form.editing
    ? ["type your answer", "⏎ done", ...(q.options.length ? ["esc back"] : [])]
    : [
        q.multiSelect ? "␣ toggle" : "⏎ choose",
        "↑↓ move",
        "1-9 pick",
        ...(showsTextInput(q) && q.options.length ? ["o other"] : []),
        ...(questions.length > 1 ? ["←→ question"] : []),
        `d ${dismissLabel(questions).toLowerCase()}`,
        "esc later",
        ...(footerExtra ? [footerExtra.replace(/^ · /, "")] : []),
      ];
  let shown = hints.join(" · ");
  for (let n = hints.length; shown.length > width - 8 && n > 1; n--) shown = hints.slice(0, n - 1).join(" · ");
  const footer = busy ? "sending…" : shown;

  return (
    <Overlay title="Question" width={86} height={height} footer={footer}>
      <text fg={t.subtle} wrapMode="none">{truncate(`from ${agentTitle}`, inner)}</text>
      {questions.length > 1 ? (
        <box height={1} flexShrink={0}>
          <text wrapMode="none">
            {questions.map((x, i) => {
              const on = i === form.qi;
              const ok = isAnswered(x, i, form.selections, form.others);
              return (
                <span key={i} fg={on ? t.accent : ok ? t.success : t.subtle} attributes={on ? TextAttributes.BOLD : TextAttributes.NONE}>
                  {`${ok ? "●" : "○"} ${truncate(x.header, 14)}   `}
                </span>
              );
            })}
          </text>
        </box>
      ) : null}
      <box height={1} />
      {questionLines.map((l, i) => (
        <text key={i} fg={t.text} attributes={TextAttributes.BOLD} wrapMode="none">{l}</text>
      ))}
      <box height={1} />
      {q.options.map((o, i) => {
        const on = i === cursor && !form.editing;
        const chosen = selected.has(i);
        const mark = q.multiSelect ? (chosen ? "☑" : "☐") : chosen ? "◉" : "○";
        return (
          <box key={i} flexDirection="column" flexShrink={0} backgroundColor={on ? t.element : undefined}>
            <text wrapMode="none">
              <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
              <span fg={chosen ? t.success : t.subtle}>{` ${mark} `}</span>
              <span fg={on ? t.text : t.muted} attributes={chosen ? TextAttributes.BOLD : TextAttributes.NONE}>{truncate(`${i + 1}. ${o.label}`, inner - 6)}</span>
            </text>
            {o.description ? <text fg={t.subtle} wrapMode="none">{`      ${truncate(o.description, inner - 8)}`}</text> : null}
          </box>
        );
      })}
      {withOther ? (
        <box height={1} flexShrink={0} backgroundColor={cursor === q.options.length && !form.editing ? t.element : undefined}>
          <text wrapMode="none">
            <span fg={cursor === q.options.length && !form.editing ? t.accent : t.subtle}>{cursor === q.options.length && !form.editing ? "▌" : " "}</span>
            <span fg={other.trim() ? t.success : t.subtle}>{" ✎ "}</span>
            <span fg={other.trim() ? t.text : t.muted}>{other.trim() ? truncate(other, inner - 8) : "Other…"}</span>
          </text>
        </box>
      ) : null}
      {q.options.length === 0 || form.editing ? (
        <box border borderStyle="rounded" borderColor={t.accent} height={3} paddingLeft={1} flexShrink={0}>
          <input
            focused={!busy}
            value={other}
            placeholder={q.placeholder ?? "Type your answer"}
            onInput={(v: string) => apply({ type: "typed", text: v })}
            textColor={t.text}
            placeholderColor={t.subtle}
            backgroundColor={t.overlay}
            focusedBackgroundColor={t.overlay}
            cursorColor={t.accent}
          />
        </box>
      ) : null}
      {preview.length ? (
        <box flexDirection="column" marginTop={1} backgroundColor={t.raised} paddingLeft={1} paddingRight={1} flexShrink={0}>
          {preview.map((l, i) => (
            <text key={i} fg={t.muted} wrapMode="none">{truncate(l, inner - 2) || " "}</text>
          ))}
        </box>
      ) : null}
      <box flexGrow={1} />
      {error ? <text fg={t.error} wrapMode="none">{truncate(error, inner)}</text> : null}
      <text wrapMode="none">
        <span fg={answered ? t.success : t.subtle} attributes={TextAttributes.BOLD}>{answered ? "⏎ on the last question sends your answers" : `${questions.filter((x, i) => isAnswered(x, i, form.selections, form.others)).length}/${questions.length} answered`}</span>
      </text>
    </Overlay>
  );
}
