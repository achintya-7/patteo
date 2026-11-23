/**
 * The right-hand workspace panel, after Paseo Desktop: Files | Changes | PR tabs over
 * one daemon-backed view of the checkout. Owns tab switching and the data polling the
 * Changes/PR tabs share; each tab owns its own keys.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect } from "react";
import { emptyChanges } from "../../paseo/changes";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useApp, useSession, useUi } from "../../stores/context";
import { changesKey } from "../../stores/session";
import { PANEL_TABS, type PanelTab } from "../../stores/ui";
import { useTheme } from "../../theme/theme";
import { openUrl as defaultOpenUrl } from "../../util/open-url";
import { truncate } from "../text";
import { ChangesTab } from "./ChangesTab";
import { FilesTab } from "./FilesTab";
import { PrTab } from "./PrTab";

/** Below this terminal width the panel would starve the conversation, so it stays hidden. */
export const PANEL_MIN_TERM_WIDTH = 90;
export const panelWidth = (termWidth: number) => Math.max(30, Math.min(50, Math.floor(termWidth * 0.3)));

const EMPTY_CHANGES = emptyChanges();
const POLL_MS = 4000;

export function tabLabels(input: { changeCount: number; prNumber?: number; compact: boolean }): Record<PanelTab, string> {
  const { changeCount, prNumber, compact } = input;
  return {
    files: "Files",
    changes: changeCount > 0 && !compact ? `Changes ${changeCount}` : "Changes",
    pr: prNumber ? `#${prNumber}` : "PR",
  };
}

export function ExplorerPanel({ hostId, workspaceId, width, height, openUrl = defaultOpenUrl }: { hostId: string; workspaceId: string; width: number; height: number; openUrl?: (url: string) => boolean }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const key = changesKey(hostId, workspaceId);
  const state = useSession((s) => s.changes[key] ?? EMPTY_CHANGES);
  const tab = useUi((s) => s.panelTab);
  const focused = useUi((s) => s.focus === "panel");

  useEffect(() => {
    const rt = runtimes.get(hostId);
    if (!rt) return;
    // PR state hits the forge API: once on open, then on `r`.
    void rt.loadChanges(workspaceId, { pr: true });
    const id = setInterval(() => void rt.loadChanges(workspaceId), POLL_MS);
    return () => clearInterval(id);
  }, [hostId, workspaceId]);

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    const u = ui.getState();
    if (u.focus !== "panel") return;
    const at = PANEL_TABS.indexOf(u.panelTab);
    if (k.name === "]") return ui.actions.setPanelTab(PANEL_TABS[(at + 1) % PANEL_TABS.length]!);
    if (k.name === "[") return ui.actions.setPanelTab(PANEL_TABS[(at + PANEL_TABS.length - 1) % PANEL_TABS.length]!);
    if (/^[1-3]$/.test(k.name)) return ui.actions.setPanelTab(PANEL_TABS[Number(k.name) - 1]!);
    if (k.name === "escape") return ui.actions.setFocus("main");
  });

  const inner = Math.max(10, width - 4);
  const bodyHeight = Math.max(4, height - 3);
  const labels = tabLabels({ changeCount: state.files.length, prNumber: state.pr?.number, compact: inner < 34 });
  const title = state.checkout?.branch ? ` ${truncate(state.checkout.branch, Math.max(6, width - 6))} ` : " Workspace ";

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={focused ? t.borderActive : t.border}
      title={title}
      titleColor={focused ? t.accent : t.subtle}
      paddingLeft={1}
      paddingRight={1}
    >
      <box height={1} flexShrink={0} flexDirection="row">
        {PANEL_TABS.map((id) => {
          const on = id === tab;
          return (
            <box key={id} flexShrink={0} paddingRight={1} backgroundColor={on ? t.element : undefined} onMouseDown={() => { ui.actions.setPanelTab(id); ui.actions.setFocus("panel"); }}>
              <text wrapMode="none">
                <span fg={on ? t.accent : t.subtle} attributes={on ? TextAttributes.BOLD : TextAttributes.NONE}>{` ${labels[id]}`}</span>
              </text>
            </box>
          );
        })}
      </box>
      {tab === "files" ? <FilesTab hostId={hostId} workspaceId={workspaceId} width={inner} height={bodyHeight} /> : null}
      {tab === "changes" ? <ChangesTab hostId={hostId} workspaceId={workspaceId} width={inner} height={bodyHeight} /> : null}
      {tab === "pr" ? <PrTab hostId={hostId} workspaceId={workspaceId} width={inner} height={bodyHeight} openUrl={openUrl} /> : null}
    </box>
  );
}
