import type { PaseoAgent } from "@getpaseo/client";
import { useTheme } from "../../theme/theme";
import { padEnd, truncate } from "../text";
import { relativeTime } from "../time";

/** The workspace's agents; Enter opens one as a tab. Cursor is owned by the parent. */
export function AgentPicker(props: {
  agents: PaseoAgent[];
  openTabs: string[];
  cursor: number;
  width: number;
  height: number;
  onOpen: (agentId: string) => void;
}) {
  const t = useTheme();
  const { agents, width } = props;
  if (agents.length === 0) {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <text fg={t.muted}>{"No agents in this workspace yet"}</text>
        <text fg={t.subtle}>{"Press n to start one"}</text>
      </box>
    );
  }
  const rows = Math.max(1, props.height - 2);
  const offset = Math.max(0, Math.min(props.cursor - rows + 1, agents.length - rows));
  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={t.subtle}>{"Open an agent"}</text>
      <box height={1} />
      {agents.slice(offset, offset + rows).map((a, i) => {
        const sel = offset + i === props.cursor;
        const dot = a.requiresAttention ? t.warning : a.status === "running" ? t.info : null;
        const meta = `${a.model ?? a.provider}  ${relativeTime(a.updatedAt)}`;
        const titleW = Math.max(8, width - meta.length - 6);
        return (
          <box key={a.id} height={1} backgroundColor={sel ? t.raised : undefined} onMouseDown={() => props.onOpen(a.id)}>
            <text>
              <span fg={dot ?? t.subtle}>{dot ? " ● " : "   "}</span>
              <span fg={sel ? t.text : t.muted}>{padEnd(truncate(a.title || "Untitled agent", titleW), titleW)}</span>
              <span fg={t.subtle}>{`  ${meta}`}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}
