/**
 * Files tab: the workspace's directory tree (folders first, lazily listed through the
 * daemon), with git change markers. Enter opens a file in the main pane.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyChanges } from "../../paseo/changes";
import { emptyFiles, parentDir } from "../../paseo/files";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useApp, useSession, useUi } from "../../stores/context";
import { changesKey } from "../../stores/session";
import { useTheme } from "../../theme/theme";
import { Skeleton, SpinnerSpan } from "../motion/Motion";
import { truncate } from "../text";
import { buildRows, changeIndex, indexOfPath, type TreeRow } from "./tree";
import { keepVisible } from "./window";

const EMPTY_FILES = emptyFiles();
const EMPTY_CHANGES = emptyChanges();
const POLL_MS = 6000;

export function FilesTab({ hostId, workspaceId, width, height }: { hostId: string; workspaceId: string; width: number; height: number }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const key = changesKey(hostId, workspaceId);
  const files = useSession((s) => s.files[key] ?? EMPTY_FILES);
  const changes = useSession((s) => s.changes[key] ?? EMPTY_CHANGES);
  const showHidden = useUi((s) => s.showHidden);
  const expanded = useUi((s) => s.expanded);
  const focused = useUi((s) => s.focus === "panel" && s.panelTab === "files");
  const [cursorPath, setCursorPathState] = useState<string | null>(null);
  /** Keys can arrive faster than a re-render, so handlers read the cursor from here. */
  const cursorRef = useRef<string | null>(null);
  const setCursorPath = (path: string | null) => {
    cursorRef.current = path;
    setCursorPathState(path);
  };
  const [start, setStart] = useState(0);

  const rows = useMemo(
    () => buildRows({ listings: files.listings, isExpanded: (p) => !!expanded[`${key}:${p}`], showHidden, changes: changeIndex(changes.files) }),
    [files.listings, expanded, showHidden, changes.files, key],
  );
  const cur = indexOfPath(rows, cursorPath);
  const view = Math.max(3, height - 2);
  const first = keepVisible(cur, start, view, rows.length);
  useEffect(() => {
    if (first !== start) setStart(first);
  }, [first]);

  const live = useRef({ rows });
  live.current = { rows };
  const rt = runtimes.get(hostId);
  const isOpen = (path: string) => !!ui.getState().expanded[`${key}:${path}`];

  const reloadAll = () => {
    if (!rt) return;
    void rt.listDir(workspaceId, "");
    for (const k of Object.keys(ui.getState().expanded)) if (k.startsWith(`${key}:`)) void rt.listDir(workspaceId, k.slice(key.length + 1));
  };

  useEffect(() => {
    reloadAll();
    const id = setInterval(reloadAll, POLL_MS);
    return () => clearInterval(id);
  }, [hostId, workspaceId]);

  const expand = (row: TreeRow, open: boolean) => {
    ui.actions.toggleExpanded(`${key}:${row.path}`, open);
    if (open && !files.listings[row.path]) void rt?.listDir(workspaceId, row.path);
  };
  const activate = (row: TreeRow | undefined) => {
    if (!row || row.kind === "note") return;
    if (row.kind === "directory") return expand(row, !isOpen(row.path));
    ui.actions.setFilePath(row.path);
    ui.actions.setFocus("main");
  };

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    const u = ui.getState();
    if (u.focus !== "panel" || u.panelTab !== "files") return;
    const { rows } = live.current;
    const cur = indexOfPath(rows, cursorRef.current);
    const go = (i: number) => setCursorPath(rows[Math.max(0, Math.min(rows.length - 1, i))]?.key ?? null);
    const row = rows[cur];
    switch (k.name) {
      case "j": case "down": return go(cur + 1);
      case "k": case "up": return go(cur - 1);
      case "pagedown": return go(cur + view - 1);
      case "pageup": return go(cur - view + 1);
      case "home": return go(0);
      case "end": return go(rows.length - 1);
      case "g": return go(k.shift ? rows.length - 1 : 0);
      case "return": case "space": case "enter": return activate(row);
      case "l": case "right":
        if (row?.kind === "directory" && !row.expanded) return expand(row, true);
        return row?.kind === "file" ? activate(row) : go(cur + 1);
      case "h": case "left": {
        if (row?.kind === "directory" && row.expanded) return expand(row, false);
        // A note belongs to the folder it sits under; anything else steps up to its parent.
        const up = row?.kind === "note" ? row.path : parentDir(row?.path ?? "");
        return up ? go(indexOfPath(rows, up)) : undefined;
      }
      case ".": return ui.actions.toggleHidden();
      case "r": return reloadAll();
    }
  });

  const root = files.listings[""];
  const inner = Math.max(10, width);
  const visible = rows.slice(first, first + view);
  const body =
    root?.error ? (
      <text fg={t.warning} wrapMode="word">{truncate(root.error, inner * 2)}</text>
    ) : !root || (root.loading && root.entries.length === 0) ? (
      <Skeleton rows={6} width={inner} widths={[0.5, 0.4, 0.6, 0.35, 0.55, 0.45]} />
    ) : rows.length === 0 ? (
      <text fg={t.muted}>{"Empty folder"}</text>
    ) : (
      visible.map((row, n) => {
        const on = first + n === cur;
        const indent = "  ".repeat(row.depth);
        const glyph = row.kind === "directory" ? (row.expanded ? "▾ " : "▸ ") : row.kind === "note" ? "  " : "  ";
        const markW = 2;
        const nameW = Math.max(4, inner - 1 - indent.length - glyph.length - markW);
        const color = row.kind === "directory" ? t.text : row.kind === "note" ? t.subtle : row.change ? t.warning : t.muted;
        const markColor = row.change === "A" ? t.success : row.change === "D" ? t.error : t.warning;
        return (
          <box key={row.key} height={1} flexShrink={0} backgroundColor={on && focused ? t.element : undefined} onMouseDown={() => { setCursorPath(row.key); activate(row); }}>
            <text wrapMode="none">
              <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
              <span fg={t.subtle}>{`${indent}${glyph}`}</span>
              <span fg={on ? t.text : color} attributes={row.kind === "directory" ? TextAttributes.BOLD : row.kind === "note" ? TextAttributes.ITALIC : TextAttributes.NONE}>
                {truncate(row.name, nameW)}
              </span>
              {row.loading ? <span fg={t.subtle}>{" "}</span> : null}
              {row.loading ? <SpinnerSpan color={t.subtle} /> : null}
              {row.change ? <span fg={markColor}>{` ${row.change}`}</span> : row.dirty ? <span fg={t.warning}>{" •"}</span> : null}
            </text>
          </box>
        );
      })
    );

  return (
    <box flexDirection="column" height={height} flexShrink={0}>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">
          {`${rows.length} item${rows.length === 1 ? "" : "s"}  ·  dotfiles ${showHidden ? "shown" : "hidden"}`}
        </text>
      </box>
      <box flexDirection="column" flexGrow={1} overflow="hidden">{body}</box>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">{truncate(focused ? "⏎ open · h/l fold · . dotfiles · r" : "tab/C to focus", inner)}</text>
      </box>
    </box>
  );
}
