import type { PaseoAgent } from "@getpaseo/client";
import { useTheme } from "../../theme/theme";
import { truncate } from "../text";

const MAX_LABEL = 28;

interface TabSpec {
  id: string;
  label: string;
  width: number;
}

/**
 * Picks the window of tabs that fits `width`, always containing the active tab.
 * Exported for tests.
 */
export function fitTabs(specs: TabSpec[], activeIndex: number, width: number): { start: number; end: number } {
  if (specs.length === 0) return { start: 0, end: 0 };
  const a = Math.max(0, activeIndex);
  let start = a;
  let end = a + 1;
  let used = specs[a]!.width;
  const budget = width - 4; // room for ‹ › overflow markers
  while (end < specs.length && used + specs[end]!.width <= budget) used += specs[end++]!.width;
  while (start > 0 && used + specs[start - 1]!.width <= budget) used += specs[--start]!.width;
  return { start, end };
}

/** Quiet tab row: plain titles, the active one on a raised background. A dot only when an agent is busy or needs you. */
export function TabBar(props: {
  tabs: string[];
  active: string | null;
  agents: Record<string, PaseoAgent>;
  width: number;
  focused: boolean;
  pickerOpen: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  const t = useTheme();
  const { tabs, active, agents, width } = props;
  const specs: TabSpec[] = tabs.map((id) => {
    const label = truncate(agents[id]?.title || "Untitled agent", MAX_LABEL);
    return { id, label, width: [...label].length + 4 + 1 };
  });
  const { start, end } = fitTabs(specs, tabs.indexOf(active ?? ""), width - 3);

  return (
    <box height={1} flexShrink={0} flexDirection="row">
      {start > 0 ? <text fg={t.subtle}>{"‹ "}</text> : null}
      {specs.slice(start, end).map((s) => {
        const agent = agents[s.id];
        const isActive = s.id === active && !props.pickerOpen;
        const dot = agent?.requiresAttention ? t.warning : agent?.status === "running" ? t.info : null;
        return (
          <box key={s.id} flexDirection="row" marginRight={1} backgroundColor={isActive ? t.raised : undefined} onMouseDown={() => props.onSelect(s.id)}>
            <text>
              <span fg={dot ?? t.subtle}>{dot ? " ●" : "  "}</span>
              <span fg={isActive ? t.text : t.subtle}>{` ${s.label} `}</span>
            </text>
          </box>
        );
      })}
      {end < specs.length ? <text fg={t.subtle}>{" ›"}</text> : null}
      <box backgroundColor={props.pickerOpen ? t.raised : undefined} onMouseDown={props.onNew}>
        <text fg={props.pickerOpen ? t.text : t.subtle}>{" + "}</text>
      </box>
    </box>
  );
}
