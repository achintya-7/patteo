/**
 * One line above the composer when the open agent is waiting on you: a question to answer
 * or a permission to review. The modal is one key (p) away; this makes sure you can see
 * that something is blocking the agent without having noticed a toast.
 */
import type { PaseoAgent } from "@getpaseo/client";
import { useApp } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { parseQuestions } from "../modals/question-model";
import { truncate } from "../text";

export const PENDING_BAR_ROWS = 1;

export interface PendingSummary {
  kind: "question" | "permission";
  text: string;
  /** Requests waiting beyond the first. */
  more: number;
}

/** What the bar says about an agent's waiting requests, or null when nothing is waiting. */
export function summarizePending(agent: Pick<PaseoAgent, "pendingPermissions"> | undefined): PendingSummary | null {
  const list = (agent?.pendingPermissions ?? []) as { kind?: string; title?: string; name?: string; input?: unknown }[];
  const first = list[0];
  if (!first) return null;
  const more = list.length - 1;
  if (first.kind === "question") {
    const qs = parseQuestions(first.input);
    return { kind: "question", text: qs?.[0]?.question ?? first.title ?? "has a question", more };
  }
  return { kind: "permission", text: first.title || `${first.name ?? "a tool"} wants to run`, more };
}

export function PendingBar({ agent, width }: { agent: PaseoAgent | undefined; width: number }) {
  const t = useTheme();
  const { ui } = useApp();
  const s = summarizePending(agent);
  if (!s) return null;
  const q = s.kind === "question";
  const tail = `  ·  p to ${q ? "answer" : "review"}${s.more ? `  (+${s.more})` : ""}`;
  return (
    <box height={PENDING_BAR_ROWS} flexShrink={0} paddingLeft={1} onMouseDown={() => ui.actions.openModal({ kind: "permissions" })}>
      <text wrapMode="none">
        <span fg={q ? t.info : t.warning}>{q ? "? asks  " : "⚠ needs you  "}</span>
        <span fg={t.text}>{truncate(s.text, Math.max(10, width - tail.length - 14))}</span>
        <span fg={t.subtle}>{tail}</span>
      </text>
    </box>
  );
}
