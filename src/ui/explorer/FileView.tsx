/**
 * One file's contents in the main pane (opened from the Files tab). Plain text with a
 * line-number gutter; large files are cut at a size cap, binary files say so.
 */
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileContent } from "../../paseo/files";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useApp, useUi } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { truncate } from "../text";

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Gutter and code columns as two newline-joined strings, so each is one renderable. */
export function fileColumns(text: string): { gutter: string; code: string; lines: number } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const w = String(lines.length).length;
  return {
    gutter: lines.map((_, i) => `${String(i + 1).padStart(w)} │`).join("\n"),
    code: lines.map((l) => l.replace(/\t/g, "  ")).join("\n"),
    lines: lines.length,
  };
}

export function FileView({ hostId, workspaceId, width, height }: { hostId: string; workspaceId: string; width: number; height: number }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const path = useUi((s) => s.filePath);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [content, setContent] = useState<FileContent | null>(null);

  useEffect(() => {
    if (!path) return;
    let current = true; // a late answer for a file we've left must not overwrite the new one
    setContent(null);
    void runtimes.get(hostId)?.readFile(workspaceId, path).then((c) => current && setContent(c));
    return () => {
      current = false;
    };
  }, [hostId, workspaceId, path]);

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    const u = ui.getState();
    if (u.focus !== "main" || !u.filePath) return;
    if (k.name === "escape") {
      ui.actions.setFilePath(null);
      return ui.actions.setFocus("panel");
    }
    const sb = scrollRef.current;
    if (!sb) return;
    const page = Math.max(1, height - 3);
    if (k.name === "j" || k.name === "down") return sb.scrollBy(1);
    if (k.name === "k" || k.name === "up") return sb.scrollBy(-1);
    if (k.ctrl && k.name === "d") return sb.scrollBy(Math.floor(page / 2));
    if (k.ctrl && k.name === "u") return sb.scrollBy(-Math.floor(page / 2));
    if (k.name === "pagedown" || k.name === "space") return sb.scrollBy(page);
    if (k.name === "pageup") return sb.scrollBy(-page);
    if (k.name === "g" && k.shift) return sb.scrollTo(sb.scrollHeight);
    if (k.name === "g" || k.name === "home") return sb.scrollTo(0);
    if (k.name === "end") return sb.scrollTo(sb.scrollHeight);
  });

  const cols = useMemo(() => (content?.kind === "text" ? fileColumns(content.text) : null), [content]);
  const inner = Math.max(10, width - 4);
  const meta =
    content?.kind === "text" ? `${cols!.lines} lines · ${formatSize(content.size)}${content.truncated ? " · truncated" : ""}`
    : content && content.kind !== "error" ? `${content.kind} · ${formatSize(content.size)}`
    : "";

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
        <text fg={t.text} wrapMode="none">{truncate(path ?? "", Math.max(10, inner - meta.length - 2))}</text>
        <text fg={t.subtle} wrapMode="none">{meta}</text>
      </box>
      <box height={1} flexShrink={0} />
      <scrollbox ref={scrollRef} flexGrow={1} scrollY contentOptions={{ flexDirection: "column", paddingRight: 1 }}>
        {content === null ? (
          <box flexShrink={0}><text fg={t.muted}>{"Loading…"}</text></box>
        ) : content.kind === "error" ? (
          <box flexShrink={0}><text fg={t.error} wrapMode="word">{content.message}</text></box>
        ) : content.kind !== "text" ? (
          <box flexShrink={0}><text fg={t.muted}>{`${content.kind === "image" ? "Image" : "Binary file"} — not shown in the terminal`}</text></box>
        ) : (
          <box flexDirection="row" flexShrink={0}>
            <box flexShrink={0} paddingRight={1}><text fg={t.subtle} wrapMode="none">{cols!.gutter}</text></box>
            <text fg={t.text} wrapMode="none">{cols!.code}</text>
          </box>
        )}
      </scrollbox>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">{"j/k scroll · g/G top/bottom · esc back to files"}</text>
      </box>
    </box>
  );
}
