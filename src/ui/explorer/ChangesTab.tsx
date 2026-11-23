/**
 * Changes tab: the files that differ — by default the branch against its base (what the
 * PR contains), switchable to uncommitted or all. Enter opens one file's diff.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import { CHANGES_MODES, effectiveMode, emptyChanges, type ChangesMode } from "../../paseo/changes";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useApp, useSession, useUi } from "../../stores/context";
import { changesKey } from "../../stores/session";
import { useTheme } from "../../theme/theme";
import { fileGlyph, fileLabel, summarize } from "../changes/model";
import { Skeleton, SpinnerSpan } from "../motion/Motion";
import { padEnd, truncate } from "../text";
import { keepVisible } from "./window";

const EMPTY_CHANGES = emptyChanges();

export function modeLabel(mode: ChangesMode, baseRef: string | null | undefined): string {
  if (mode === "base") return `PR changes · vs ${baseRef ?? "base"}`;
  if (mode === "uncommitted") return "Uncommitted";
  return "All changes";
}

export function ChangesTab({ hostId, workspaceId, width, height }: { hostId: string; workspaceId: string; width: number; height: number }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const key = changesKey(hostId, workspaceId);
  const state = useSession((s) => s.changes[key] ?? EMPTY_CHANGES);
  const focused = useUi((s) => s.focus === "panel" && s.panelTab === "changes");
  const [cursor, setCursorState] = useState(0);
  /** Keys can arrive faster than a re-render, so handlers read the cursor from here. */
  const cursorRef = useRef(0);
  const setCursor = (n: number) => {
    cursorRef.current = n;
    setCursorState(n);
  };
  const [start, setStart] = useState(0);
  const files = state.files;
  const mode = effectiveMode(state);
  const view = Math.max(3, height - 3);
  const cur = Math.max(0, Math.min(cursor, files.length - 1));
  const first = keepVisible(cur, start, view, files.length);
  useEffect(() => {
    if (first !== start) setStart(first);
  }, [first]);
  const live = useRef({ files, mode });
  live.current = { files, mode };
  const rt = runtimes.get(hostId);

  const open = (path?: string) => {
    const target = path ?? live.current.files[Math.min(cursorRef.current, live.current.files.length - 1)]?.path;
    if (!target) return;
    ui.actions.setDiffPath(target);
    ui.actions.setFocus("main");
  };
  const cycleMode = () => {
    const at = CHANGES_MODES.indexOf(live.current.mode);
    void rt?.loadChanges(workspaceId, { mode: CHANGES_MODES[(at + 1) % CHANGES_MODES.length]! });
    setCursor(0);
  };

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    const u = ui.getState();
    if (u.focus !== "panel" || u.panelTab !== "changes") return;
    const { files } = live.current;
    const last = Math.max(0, files.length - 1);
    const cursor = Math.min(cursorRef.current, last);
    switch (k.name) {
      case "j": case "down": return setCursor(Math.min(last, cursor + 1));
      case "k": case "up": return setCursor(Math.max(0, cursor - 1));
      case "pagedown": return setCursor(Math.min(last, cursor + view - 1));
      case "pageup": return setCursor(Math.max(0, cursor - view + 1));
      case "home": return setCursor(0);
      case "end": return setCursor(last);
      case "g": return setCursor(k.shift ? last : 0);
      case "return": case "enter": case "l": case "right": return open();
      case "m": return cycleMode();
      case "r": return void rt?.loadChanges(workspaceId, { pr: true });
    }
  });

  const inner = Math.max(10, width);
  const counts = summarize(files);
  const shown = files.slice(first, first + view);
  return (
    <box flexDirection="column" height={height} flexShrink={0}>
      <box height={1} flexShrink={0}>
        <text fg={t.accent} wrapMode="none">{truncate(`‹ ${modeLabel(mode, state.checkout?.baseRef ?? state.pr?.baseRefName)} ›  m`, inner)}</text>
      </box>
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {state.error ? (
          <text fg={t.warning} wrapMode="word">{truncate(state.error, inner * 2)}</text>
        ) : state.loading && files.length === 0 ? (
          <Skeleton rows={5} width={inner} widths={[0.8, 0.55, 0.7, 0.4, 0.62]} />
        ) : files.length === 0 ? (
          <text fg={t.muted}>{mode === "base" ? "Nothing differs from the base" : "No changes"}</text>
        ) : (
          shown.map((f, n) => {
            const i = first + n;
            const on = i === cur;
            const { name, dir } = fileLabel(f);
            const glyph = fileGlyph(f);
            const glyphColor = glyph === "A" ? t.success : glyph === "D" ? t.error : glyph === "R" ? t.info : t.warning;
            const counts = `+${f.additions} −${f.deletions}`;
            const labelW = Math.max(6, inner - 4 - counts.length);
            return (
              <box key={f.path} height={1} flexShrink={0} backgroundColor={on && focused ? t.element : undefined} onMouseDown={() => { setCursor(i); open(f.path); }}>
                <text wrapMode="none">
                  <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
                  <span fg={glyphColor} attributes={TextAttributes.BOLD}>{`${glyph} `}</span>
                  <span fg={on ? t.text : t.muted}>{`${padEnd(truncate(dir ? `${name}  ${dir}` : name, labelW), labelW)} `}</span>
                  <span fg={t.success}>{`+${f.additions}`}</span>
                  <span fg={t.subtle}>{" "}</span>
                  <span fg={t.error}>{`−${f.deletions}`}</span>
                </text>
              </box>
            );
          })
        )}
      </box>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">
          {state.loading && files.length > 0 ? <SpinnerSpan color={t.subtle} /> : null}
          {` ${counts.files} file${counts.files === 1 ? "" : "s"} `}
          <span fg={t.success}>{`+${counts.additions}`}</span>
          <span fg={t.subtle}>{" "}</span>
          <span fg={t.error}>{`−${counts.deletions}`}</span>
        </text>
      </box>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">{truncate(focused ? "⏎ diff · m compare · r refresh" : "tab/C to focus", inner)}</text>
      </box>
    </box>
  );
}
