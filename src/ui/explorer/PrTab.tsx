/**
 * PR tab: the pull request for this branch — title, state, checks, review and merge
 * status — or, when there is none, the branch facts and the action to create one.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";
import { emptyChanges } from "../../paseo/changes";
import { runCommand, viewShouldIgnore } from "../../keyboard/dispatch";
import { useApp, useSession, useUi } from "../../stores/context";
import { changesKey } from "../../stores/session";
import { useTheme, type Theme } from "../../theme/theme";
import { truncate } from "../text";
import { prLines, type Tone } from "./pr-model";

const EMPTY_CHANGES = emptyChanges();

const toneColor = (tone: Tone, t: Theme) =>
  tone === "ok" ? t.success : tone === "warn" ? t.warning : tone === "err" ? t.error : tone === "accent" ? t.accent : tone === "info" ? t.info : tone === "muted" ? t.subtle : t.text;

export function PrTab({ hostId, workspaceId, width, height, openUrl }: { hostId: string; workspaceId: string; width: number; height: number; openUrl: (url: string) => boolean }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const key = changesKey(hostId, workspaceId);
  const state = useSession((s) => s.changes[key] ?? EMPTY_CHANGES);
  const focused = useUi((s) => s.focus === "panel" && s.panelTab === "pr");
  const [scroll, setScrollState] = useState(0);
  const scrollRef = useRef(0);
  const setScroll = (n: number) => {
    scrollRef.current = n;
    setScrollState(n);
  };
  const lines = prLines(state, width - 1);
  const view = Math.max(3, height - 1);
  const maxScroll = Math.max(0, lines.length - view);
  const top = Math.min(scroll, maxScroll);
  const live = useRef({ maxScroll, state });
  live.current = { maxScroll, state };

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    const u = ui.getState();
    if (u.focus !== "panel" || u.panelTab !== "pr") return;
    const { maxScroll, state } = live.current;
    const top = Math.min(scrollRef.current, maxScroll);
    switch (k.name) {
      case "j": case "down": return setScroll(Math.min(maxScroll, top + 1));
      case "k": case "up": return setScroll(Math.max(0, top - 1));
      case "pagedown": return setScroll(Math.min(maxScroll, top + view - 1));
      case "pageup": return setScroll(Math.max(0, top - view + 1));
      case "g": return setScroll(k.shift ? maxScroll : 0);
      case "r": return void runtimes.get(hostId)?.loadChanges(workspaceId, { pr: true });
      case "o":
        if (!state.pr) return ui.actions.toast("No pull request yet", "info");
        return ui.actions.toast(openUrl(state.pr.url) ? "Opened in your browser" : `Couldn't open it — ${state.pr.url}`, "info", 6000);
      case "return": case "enter": case "c":
        // With a PR there is nothing to create; Enter on the PR shows where it lives.
        if (state.prLoaded && !state.pr && state.checkout?.isGit !== false) return runCommand("pr.create");
        if (state.pr) return ui.actions.toast(state.pr.url, "info", 12000);
    }
  });

  const hint = state.pr ? "o open · r refresh · j/k scroll" : state.prLoaded ? "⏎ create PR · r refresh" : "r refresh";
  return (
    <box flexDirection="column" height={height} flexShrink={0}>
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {lines.slice(top, top + view).map((line, i) => (
          <box key={top + i} height={1} flexShrink={0}>
            <text wrapMode="none">
              {line.length === 0 ? " " : line.map((s, n) => (
                <span key={n} fg={toneColor(s.tone, t)} attributes={s.bold ? TextAttributes.BOLD : TextAttributes.NONE}>{s.text}</span>
              ))}
            </text>
          </box>
        ))}
      </box>
      <box height={1} flexShrink={0}>
        <text fg={t.subtle} wrapMode="none">{truncate(focused ? hint : "tab/C to focus", width)}</text>
      </box>
    </box>
  );
}
