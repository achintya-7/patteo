/**
 * One file's diff, shown in the main pane in place of the conversation while
 * `ui.diffPath` is set. Esc returns to the panel.
 */
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef } from "react";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { changesKey } from "../../stores/session";
import { useApp, useSession, useUi } from "../../stores/context";
import { emptyChanges } from "../../paseo/changes";
import { useTheme } from "../../theme/theme";
import { truncate } from "../text";
import { mixHex } from "../../theme/color";
import { fileGlyph, hunkHeader, numberedLines, prBadge } from "./model";
import { cleanCode, clipTokens, syntaxRole, tokenColor } from "./syntax";

/** Stable fallback: a fresh object per render would loop useSyncExternalStore. */
const EMPTY_CHANGES = emptyChanges();

/** Beyond this many lines a file is drawn without per-token colour: thousands of spans slow the pane. */
const HIGHLIGHT_LINE_LIMIT = 3000;

export function DiffView({ hostId, workspaceId, width, height }: { hostId: string; workspaceId: string; width: number; height: number }) {
  const t = useTheme();
  const { ui } = useApp();
  const state = useSession((s) => s.changes[changesKey(hostId, workspaceId)] ?? emptyChanges());
  const path = useUi((s) => s.diffPath);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const files = state.files;
  const index = Math.max(0, files.findIndex((f) => f.path === path));
  const file = files[index];
  const badge = prBadge(state);

  const step = (delta: number) => {
    const next = files[(index + delta + files.length) % files.length];
    if (next) ui.actions.setDiffPath(next.path);
  };

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    if (ui.getState().focus !== "main" || !ui.getState().diffPath) return;
    const sb = scrollRef.current;
    if (sb) {
      const page = Math.max(1, height - 2);
      if (k.name === "j" || k.name === "down") return sb.scrollBy(1);
      if (k.name === "k" || k.name === "up") return sb.scrollBy(-1);
      if (k.ctrl && k.name === "d") return sb.scrollBy(Math.floor(page / 2));
      if (k.ctrl && k.name === "u") return sb.scrollBy(-Math.floor(page / 2));
      if (k.name === "pagedown" || k.name === "space") return sb.scrollBy(page);
      if (k.name === "pageup") return sb.scrollBy(-page);
      if (k.name === "g" && k.shift) return sb.scrollTo(sb.scrollHeight);
      if (k.name === "g" || k.name === "home") return sb.scrollTo(0);
    }
    if (k.name === "escape") {
      ui.actions.setDiffPath(null);
      return ui.actions.setFocus("panel");
    }
    if (k.name === "]") return step(1);
    if (k.name === "[") return step(-1);
  });

  const inner = Math.max(10, width - 4);
  // Added and removed code is a tinted row, not a +/- prefix. Tints blend with the solid
  // overlay colour: the theme's own background may be transparent.
  const addBg = mixHex(t.success, t.overlay, 0.22) ?? t.element;
  const delBg = mixHex(t.error, t.overlay, 0.22) ?? t.element;
  const maxNo = file ? Math.max(1, ...file.hunks.flatMap((h) => [h.oldStart + h.oldCount, h.newStart + h.newCount])) : 1;
  const gutterW = String(maxNo).length;
  const codeW = Math.max(4, inner - gutterW - 2);
  const highlight = !!file && file.hunks.reduce((n, h) => n + h.lines.length, 0) <= HIGHLIGHT_LINE_LIMIT;
  /** One code line as coloured spans (daemon tokens), or plain text when there are none. */
  const code = (line: { type: string; content: string; tokens?: { text: string; style: string | null }[] }, width: number) => {
    const dim = line.type === "context";
    const tokens = highlight && line.tokens ? clipTokens(line.tokens, line.content, width) : null;
    if (!tokens) return <span fg={dim ? t.muted : t.text}>{truncate(cleanCode(line.content), width)}</span>;
    return tokens.map((tk, i) => (
      <span key={i} fg={tokenColor(tk.style, t, dim)} attributes={syntaxRole(tk.style) === "comment" ? TextAttributes.ITALIC : TextAttributes.NONE}>
        {tk.text}
      </span>
    ));
  };
  const body = (
    <box flexDirection="column" flexShrink={0}>
      {file?.hunks.map((h, hi) => (
        <box key={hi} flexDirection="column" flexShrink={0}>
          <box height={1}>
            <text fg={t.info} wrapMode="none">{truncate(hunkHeader(h.oldStart, h.oldCount, h.newStart, h.newCount), inner)}</text>
          </box>
          {numberedLines(h).map(({ line, no }, li) => (
            <box key={li} height={1} backgroundColor={line.type === "add" ? addBg : line.type === "remove" ? delBg : undefined}>
              <text wrapMode="none">
                <span fg={line.type === "context" ? t.subtle : line.type === "add" ? t.success : t.error}>{`${String(no).padStart(gutterW)}  `}</span>
                {code(line, codeW)}
              </text>
            </box>
          ))}
        </box>
      ))}
    </box>
  );

  // The header is one row: path on the left, counts and the PR badge on the right. Budget the
  // right side first (dropping the badge when narrow), then give the path what is left.
  const counts = file ? `+${file.additions}  −${file.deletions}` : "";
  const position = `  ${index + 1}/${files.length}`;
  const badgeText = inner >= 72 ? `  ${truncate(badge.text, 26)}` : "";
  const rightLen = counts.length + position.length + badgeText.length;
  const renamed = file && file.oldPath && file.oldPath !== file.path ? `  ← ${truncate(file.oldPath, 18)}` : "";
  const pathW = Math.max(8, inner - rightLen - 4 - renamed.length);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
        <text wrapMode="none">
          <span fg={file?.isNew ? t.success : file?.isDeleted ? t.error : t.warning}>{`${file ? fileGlyph(file) : "?"} `}</span>
          <span fg={t.text}>{truncate(path ?? "", pathW)}</span>
          {renamed ? <span fg={t.subtle}>{renamed}</span> : null}
        </text>
        <text wrapMode="none">
          {file ? <span fg={t.success}>{`+${file.additions}`}</span> : null}
          {file ? <span fg={t.subtle}>{"  "}</span> : null}
          {file ? <span fg={t.error}>{`−${file.deletions}`}</span> : null}
          <span fg={t.subtle}>{position}</span>
          {badgeText ? <span fg={badge.tone === "err" ? t.error : t.subtle}>{badgeText}</span> : null}
        </text>
      </box>
      <box height={1} flexShrink={0} />
      <scrollbox ref={scrollRef} flexGrow={1} scrollY viewportCulling contentOptions={{ flexDirection: "column", paddingRight: 1 }}>
        {!file ? (
          <box flexShrink={0}>
            <text fg={t.muted}>{state.loading ? "Loading diff…" : "This file is no longer in the changes list"}</text>
          </box>
        ) : file.status === "binary" ? (
          <box flexShrink={0}><text fg={t.muted}>{"Binary file — no text diff"}</text></box>
        ) : file.status === "too_large" ? (
          <box flexShrink={0}><text fg={t.muted}>{"Diff too large to show"}</text></box>
        ) : file.hunks.length === 0 ? (
          <box flexShrink={0}><text fg={t.muted}>{"No text changes (mode or metadata only)"}</text></box>
        ) : (
          body
        )}
      </scrollbox>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">{"j/k · [ ] file · esc back · P PR"}</text>
      </box>
    </box>
  );
}
