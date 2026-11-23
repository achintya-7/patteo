/**
 * Timeline rows, styled after opencode's session view: the user's message on a raised
 * block with a colored ┃ bar, the agent's answer as plain markdown, and its activity
 * (thoughts, tool calls, todos) as quiet one-liners.
 */
import { TextAttributes } from "@opentui/core";
import type { SyntaxStyle } from "@opentui/core";
import type { TimelineEntry } from "../../paseo/timeline";
import { useTheme, type Theme } from "../../theme/theme";
import { truncate } from "../text";
import { toolBody, toolSummary, type Tone } from "./tool-format";
import { Markdown } from "./Markdown";
import { SpinnerSpan } from "../motion/Motion";

/** Left gutter for everything the agent produced, so the user's ┃ block stands out. */
export const GUTTER = 3;

/** Half-block bar, like opencode's SplitBorder. */
const BAR = {
  topLeft: "", bottomLeft: "", topRight: "", bottomRight: "", horizontal: " ",
  vertical: "┃", topT: "", bottomT: "", leftT: "", rightT: "", cross: "",
};

export interface ItemProps {
  entry: TimelineEntry;
  width: number;
  expanded: boolean;
  showThoughts: boolean;
  syntaxStyle: SyntaxStyle;
  cwd: string | null;
  /** The agent is still writing this entry. */
  streaming?: boolean;
  onToggle: () => void;
}

const toneColor = (tone: Tone, t: Theme) =>
  tone === "add" ? t.success : tone === "del" ? t.error : tone === "hunk" ? t.info : tone === "error" ? t.error : tone === "normal" ? t.text : t.subtle;

export function TimelineItem(p: ItemProps) {
  const t = useTheme();
  const { item } = p.entry;
  const inner = Math.max(10, p.width - GUTTER);

  switch (item.type) {
    case "user_message":
      return (
        <box border={["left"]} customBorderChars={BAR} borderColor={t.accent} backgroundColor={t.raised} flexShrink={0}>
          <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
            <text fg={t.text} wrapMode="word">{item.text.trim()}</text>
          </box>
        </box>
      );

    case "assistant_message":
      if (!item.text.trim()) return null;
      return (
        <box paddingLeft={GUTTER} flexShrink={0}>
          <Markdown content={item.text.trim()} syntaxStyle={p.syntaxStyle} fg={t.text} streaming={p.streaming} />
        </box>
      );

    // ── Activity rows. Drawn inside an activity group (which owns the indent and the │ guide),
    // so they take the full `width`. Each is one line: a 2-cell icon column, then dim text.
    case "reasoning": {
      const text = item.text.trim();
      if (!text) return null;
      if (p.showThoughts || p.expanded) {
        return (
          <box flexDirection="row" flexShrink={0} onMouseDown={p.onToggle}>
            <text fg={t.subtle} flexShrink={0}>{"∴ "}</text>
            <text fg={t.muted} attributes={TextAttributes.ITALIC} wrapMode="word" flexGrow={1}>{text}</text>
          </box>
        );
      }
      return (
        <ActivityLine icon="∴" iconColor={t.subtle} width={p.width} onClick={p.onToggle}>
          <span fg={t.subtle} attributes={TextAttributes.ITALIC}>{truncate(text, p.width - 2)}</span>
        </ActivityLine>
      );
    }

    case "tool_call": {
      const { icon, label, subject } = toolSummary(item, p.cwd);
      const failed = item.status === "failed";
      const running = item.status === "running";
      const line = [label, subject].filter(Boolean).join(" ");
      return (
        <box flexDirection="column" flexShrink={0}>
          <ActivityLine icon={running ? <SpinnerSpan color={t.info} /> : icon} iconColor={failed ? t.error : running ? t.info : t.subtle} width={p.width} onClick={p.onToggle}>
            <span
              fg={failed ? t.error : running ? t.muted : t.subtle}
              attributes={item.status === "canceled" ? TextAttributes.STRIKETHROUGH : TextAttributes.NONE}
            >
              {truncate(line, p.width - 2)}
            </span>
          </ActivityLine>
          {p.expanded ? (
            <box paddingLeft={2} flexDirection="column" flexShrink={0}>
              {toolBody(item).map((l, i) => (
                <text key={i} fg={toneColor(l.tone, t)} wrapMode="none">{truncate(l.text, p.width - 2) || " "}</text>
              ))}
            </box>
          ) : null}
        </box>
      );
    }

    case "todo":
      return (
        <box flexDirection="column" flexShrink={0}>
          {item.items.map((it, i) => {
            const state = it.status ?? (it.completed ? "completed" : "pending");
            const icon = state === "completed" ? "✓" : state === "in_progress" ? "•" : "○";
            const fg = state === "completed" ? t.subtle : state === "in_progress" ? t.text : t.muted;
            return (
              <ActivityLine key={it.id ?? i} icon={icon} iconColor={state === "in_progress" ? t.info : t.subtle} width={p.width}>
                <span fg={fg}>{truncate(state === "in_progress" && it.activeForm ? it.activeForm : it.text, p.width - 2)}</span>
              </ActivityLine>
            );
          })}
        </box>
      );

    case "error":
      return (
        <box flexDirection="row" flexShrink={0}>
          <text fg={t.error} flexShrink={0}>{"✗ "}</text>
          <text fg={t.error} wrapMode="word" flexGrow={1}>{item.message}</text>
        </box>
      );

    case "notification":
      // Info notifications (e.g. MCP mounts) are noise in a chat view; keep warnings and errors.
      if (item.level === "info") return null;
      return (
        <ActivityLine icon="!" iconColor={item.level === "error" ? t.error : t.warning} width={p.width}>
          <span fg={item.level === "error" ? t.error : t.warning}>{truncate(item.message, p.width - 2)}</span>
        </ActivityLine>
      );

    case "compaction":
      return (
        <ActivityLine icon="≡" iconColor={t.subtle} width={p.width}>
          <span fg={t.subtle}>{"Context compacted"}</span>
        </ActivityLine>
      );

    default:
      return null;
  }
}

/** One activity row: fixed 2-cell icon column, never wraps. */
function ActivityLine(props: { icon: React.ReactNode; iconColor: string; width: number; onClick?: () => void; children: React.ReactNode }) {
  return (
    <box height={1} flexShrink={0} onMouseDown={props.onClick}>
      <text wrapMode="none">
        {typeof props.icon === "string" ? <span fg={props.iconColor}>{props.icon}</span> : props.icon}
        <span>{" "}</span>
        {props.children}
      </text>
    </box>
  );
}

/** Which "speaker" a row belongs to; a blank line separates speakers, like opencode. */
export function speakerOf(entry: TimelineEntry): "user" | "answer" | "activity" | null {
  const it = entry.item;
  switch (it.type) {
    case "user_message":
      return "user";
    case "assistant_message":
      return it.text.trim() ? "answer" : null;
    case "reasoning":
      return it.text.trim() ? "activity" : null;
    case "notification":
      return it.level === "info" ? null : "activity";
    case "tool_call":
    case "todo":
    case "error":
    case "compaction":
      return "activity";
    default:
      return null;
  }
}
