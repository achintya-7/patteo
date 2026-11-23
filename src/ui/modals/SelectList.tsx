import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useRef, useState } from "react";
import { useTheme } from "../../theme/theme";
import { padEnd, truncate } from "../text";

export interface ListItem {
  id: string;
  label: string;
  /** Right-aligned, dim (e.g. a shortcut or "current"). */
  hint?: string;
  /** Second dim line under the label. */
  detail?: string;
  /** Small colored marker before the label. */
  marker?: { glyph: string; color: string };
  disabled?: boolean;
}

/** Subsequence fuzzy match score (lower is better), or -1 when it doesn't match. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  const direct = s.indexOf(q);
  if (direct >= 0) return direct;
  let si = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = s.indexOf(ch, si);
    if (found < 0) return -1;
    gaps += found - si;
    si = found + 1;
  }
  return 100 + gaps;
}

export function filterItems(items: ListItem[], query: string): ListItem[] {
  if (!query.trim()) return items;
  return items
    .map((it) => ({ it, score: fuzzyScore(query.trim(), `${it.label} ${it.detail ?? ""}`) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.it);
}

/**
 * Filterable list that owns the keyboard while mounted (it lives inside a modal):
 * type to filter, ↑↓/^N^P to move, ⏎ to choose, Esc to close.
 */
export function SelectList(props: {
  items: ListItem[];
  width: number;
  height: number;
  placeholder?: string;
  initialId?: string;
  filterable?: boolean;
  onSelect: (item: ListItem) => void;
  onCancel: () => void;
  /** Called as the cursor moves (live preview, e.g. themes). */
  onHighlight?: (item: ListItem) => void;
  /** Extra keys for the current item (e.g. "d" to delete); return true if handled. */
  onKey?: (key: { name: string; ctrl: boolean; shift: boolean; sequence?: string }, item: ListItem | undefined) => boolean;
}) {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const filterable = props.filterable !== false;
  const visible = useMemo(() => filterItems(props.items, filterable ? query : ""), [props.items, query, filterable]);
  const initial = Math.max(0, visible.findIndex((i) => i.id === props.initialId));
  const [cursor, setCursor] = useState(initial);
  const live = useRef({ visible, cursor });
  live.current = { visible, cursor: Math.min(cursor, Math.max(0, visible.length - 1)) };

  const move = (d: number) => {
    const { visible: v, cursor: c } = live.current;
    if (!v.length) return;
    const next = (c + d + v.length) % v.length;
    setCursor(next);
    props.onHighlight?.(v[next]!);
  };

  useKeyboard((k) => {
    const { visible: v, cursor: c } = live.current;
    if (props.onKey?.(k, v[c])) return;
    if (k.name === "escape") return props.onCancel();
    if (k.name === "up" || (k.ctrl && k.name === "p")) return move(-1);
    if (k.name === "down" || (k.ctrl && k.name === "n") || k.name === "tab") return move(1);
    if (k.name === "pageup") return move(-5);
    if (k.name === "pagedown") return move(5);
    if (k.name === "return" || k.name === "enter") {
      const it = v[c];
      if (it && !it.disabled) props.onSelect(it);
      return;
    }
    if (!filterable) {
      if (k.name === "j") return move(1);
      if (k.name === "k") return move(-1);
      return;
    }
    if (k.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      setCursor(0);
      return;
    }
    const ch = k.sequence;
    if (ch && ch.length === 1 && ch >= " " && !k.ctrl && !k.meta) {
      setQuery((q) => q + ch);
      setCursor(0);
    }
  });

  const rowsAvail = Math.max(1, props.height - (filterable ? 2 : 0));
  const lineH = props.items.some((i) => i.detail) ? 2 : 1;
  const perPage = Math.max(1, Math.floor(rowsAvail / lineH));
  const cur = live.current.cursor;
  const start = Math.max(0, Math.min(cur - perPage + 1, visible.length - perPage));
  const page = visible.slice(Math.max(0, start), Math.max(0, start) + perPage);

  return (
    <box flexDirection="column" flexGrow={1}>
      {filterable ? (
        <>
          <box height={1} flexShrink={0}>
            <text wrapMode="none">
              <span fg={t.accent}>{"› "}</span>
              {query ? <span fg={t.text}>{query}</span> : <span fg={t.subtle}>{props.placeholder ?? "Type to filter"}</span>}
              <span fg={t.accent}>{"▏"}</span>
            </text>
          </box>
          <box height={1} flexShrink={0} />
        </>
      ) : null}
      {visible.length === 0 ? <text fg={t.subtle}>{"No matches"}</text> : null}
      {page.map((it) => {
        const sel = it.id === visible[cur]?.id;
        const hint = it.hint ?? "";
        const labelW = Math.max(4, props.width - hint.length - 4);
        return (
          <box key={it.id} flexDirection="column" flexShrink={0} backgroundColor={sel ? t.element : undefined}>
            <text wrapMode="none">
              <span fg={sel ? t.accent : t.subtle}>{sel ? "▌" : " "}</span>
              <span fg={it.marker?.color ?? t.subtle}>{it.marker ? `${it.marker.glyph} ` : " "}</span>
              <span fg={it.disabled ? t.subtle : sel ? t.text : t.muted} attributes={sel ? TextAttributes.BOLD : TextAttributes.NONE}>
                {padEnd(truncate(it.label, labelW - 1), labelW - 1)}
              </span>
              <span fg={t.subtle}>{hint}</span>
            </text>
            {it.detail ? (
              <text wrapMode="none" fg={t.subtle}>{`   ${truncate(it.detail, props.width - 4)}`}</text>
            ) : null}
          </box>
        );
      })}
    </box>
  );
}
