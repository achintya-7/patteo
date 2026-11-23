import { useKeyboard } from "@opentui/react";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useEffect, useRef, useState } from "react";
import { useApp, useUi } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { workspaceBranch, workspaceLabel } from "../sidebar/model";
import { truncate } from "../text";
import { AgentPicker } from "./AgentPicker";
import { AgentView } from "../agent/AgentView";
import { DiffView } from "../changes/DiffView";
import { FileView } from "../explorer/FileView";
import { Composer } from "../agent/Composer";
import { PENDING_BAR_ROWS, PendingBar, summarizePending } from "../agent/PendingBar";
import { composerHeight, maxComposerLines } from "../agent/composer-size";
import { ErrorBoundary } from "../ErrorBoundary";
import { TabBar } from "./TabBar";
import * as T from "./tabs-model";
import { useSelectedWorkspace } from "./use-workspace";
import { tabsKey } from "../../stores/ui";

export function WorkspacePane({ width, height }: { width: number; height: number }) {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const focused = useUi((s) => s.focus === "main");
  const pickerOpenRaw = useUi((s) => s.pickerOpen);
  const { host, workspace, key, tabs, agents } = useSelectedWorkspace();
  const agentsLoaded = !!host?.loaded.agents;
  const showPicker = pickerOpenRaw || tabs.tabs.length === 0;
  const diffPath = useUi((s) => s.diffPath);
  const filePath = useUi((s) => s.filePath);
  const [pickerCursor, setPickerCursor] = useState(0);
  const composerMaxLines = maxComposerLines(Math.max(6, height - 4));
  const [composerRows, setComposerRows] = useState(composerHeight(1, composerMaxLines));

  // Drop tabs whose agents were archived, removed or moved to another workspace.
  useEffect(() => {
    if (!key || !host || !agentsLoaded) return;
    ui.actions.updateTabs(key, (s) =>
      T.pruneTabs(s, (id) => {
        const a = host.agents[id];
        return !!a && !a.archivedAt && a.workspaceId === workspace?.id;
      }),
    );
  }, [key, host?.agents, agentsLoaded]);

  // First visit to a workspace this session: open its most recent agent, like Desktop.
  const autoOpened = useRef(new Set<string>());
  useEffect(() => {
    if (!key || !agentsLoaded || autoOpened.current.has(key)) return;
    autoOpened.current.add(key);
    if (tabs.tabs.length === 0 && agents[0]) ui.actions.updateTabs(key, (s) => T.openTab(s, agents[0]!.id));
  }, [key, agentsLoaded, agents.length]);

  useEffect(() => setPickerCursor(0), [key, showPicker]);

  const pickerRef = useRef({ agents, cursor: pickerCursor });
  pickerRef.current = { agents, cursor: pickerCursor };

  const openAgent = (agentId: string, k: string | null = key) => {
    if (!k) return;
    ui.actions.updateTabs(k, (s) => T.openTab(s, agentId, { after: "active" }));
    ui.actions.setPickerOpen(false);
  };
  const liveAgents = (hostId: string, wsId: string) =>
    Object.values(store.getState().hosts[hostId]?.agents ?? {})
      .filter((a) => a.workspaceId === wsId && !a.archivedAt)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    // Read live state: keys can arrive faster than React re-renders (e.g. Enter then o).
    const u = ui.getState();
    const hostId = store.getState().activeHostId;
    const wsId = hostId ? u.selectedWorkspace[hostId] : undefined;
    if (u.focus !== "main" || !hostId || !wsId) return;
    const key = tabsKey(hostId, wsId);
    const tab = (fn: (s: T.WorkspaceTabs) => T.WorkspaceTabs) => {
      ui.actions.updateTabs(key, fn);
      ui.actions.setPickerOpen(false);
    };
    const pickerVisible = ui.getState().pickerOpen || (ui.getState().tabs[key]?.tabs.length ?? 0) === 0;

    // Tab switching works in both modes.
    const digit = /^[1-9]$/.test(k.name) ? Number(k.name) - 1 : -1;
    if (digit >= 0 && (k.meta || k.option || !pickerVisible)) return tab((s) => T.selectTabIndex(s, digit));
    if (k.name === "]" || (k.ctrl && k.name === "pagedown")) return tab((s) => T.cycleTab(s, 1));
    if (k.name === "[" || (k.ctrl && k.name === "pageup")) return tab((s) => T.cycleTab(s, -1));
    if (k.name === "}") return ui.actions.updateTabs(key, (s) => T.moveTab(s, 1));
    if (k.name === "{") return ui.actions.updateTabs(key, (s) => T.moveTab(s, -1));
    if (k.name === "`") return tab(T.previousTab);
    if (k.ctrl && k.name === "w") return ui.actions.updateTabs(key, (s) => T.closeTab(s));

    if (pickerVisible) {
      const { cursor } = pickerRef.current;
      const list = liveAgents(hostId, wsId);
      if (k.name === "j" || k.name === "down") return setPickerCursor(Math.min(list.length - 1, cursor + 1));
      if (k.name === "k" || k.name === "up") return setPickerCursor(Math.max(0, cursor - 1));
      if ((k.name === "return" || k.name === "enter") && list[cursor]) return openAgent(list[cursor]!.id, key);
      if (k.name === "escape") {
        if ((ui.getState().tabs[key]?.tabs.length ?? 0) > 0) return ui.actions.setPickerOpen(false);
        return ui.actions.setFocus("sidebar");
      }
      return;
    }
    if (k.name === "o" || k.name === "+") return ui.actions.setPickerOpen(true);
    if (k.name === "x") return ui.actions.updateTabs(key, (s) => T.closeTab(s));
    // Esc means "stop this turn" in the conversation; pane switching is Tab's job.
    if (k.name === "escape") {
      const agentId = ui.getState().tabs[key]?.active;
      const agent = agentId ? store.getState().hosts[hostId]?.agents[agentId] : undefined;
      if (agentId && agent?.status === "running") {
        void runtimes.get(hostId)!.cancel(agentId).catch((err: unknown) => {
          ui.actions.toast(`Not stopped: ${err instanceof Error ? err.message : String(err)}`, "error", 5000);
        });
      }
      return;
    }
  });

  // Border (2) + horizontal padding (2).
  const inner = Math.max(10, width - 4);
  const branch = workspace ? workspaceBranch(workspace) : null;
  const title = workspace ? truncate(workspaceLabel(workspace), Math.max(10, width - 8)) : "patteo";
  const meta = workspace ? [workspace.projectDisplayName, branch && `⑂ ${branch}`].filter(Boolean).join(" · ") : "";
  const frame = (children: React.ReactNode) => (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={t.bg}
      border
      borderStyle="rounded"
      borderColor={focused ? t.borderActive : t.border}
      title={` ${title} `}
      titleColor={focused ? t.accent : t.text}
      bottomTitle={meta ? ` ${truncate(meta, Math.max(10, width - 6))} ` : undefined}
      bottomTitleAlignment="right"
      paddingLeft={1}
      paddingRight={1}
    >
      {children}
    </box>
  );

  if (!workspace) {
    return frame(
      <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <text fg={t.muted}>{"Select a workspace"}</text>
      </box>,
    );
  }

  const activeAgent = tabs.active ? host?.agents[tabs.active] : undefined;
  // Border (2) + tab row + spacer.
  const contentHeight = Math.max(3, height - 4);
  const pendingRows = summarizePending(activeAgent) ? PENDING_BAR_ROWS : 0;
  // A diff takes over the pane; Esc in the DiffView clears it.
  if (diffPath && host) {
    return frame(<DiffView hostId={host.config.id} workspaceId={workspace.id} width={inner} height={contentHeight} />);
  }
  if (filePath && host) {
    return frame(<FileView hostId={host.config.id} workspaceId={workspace.id} width={inner} height={contentHeight} />);
  }
  return frame(
    <>
      <TabBar
        tabs={tabs.tabs}
        active={tabs.active}
        agents={host?.agents ?? {}}
        width={inner}
        focused={focused}
        pickerOpen={showPicker}
        onSelect={(id) => {
          ui.actions.setFocus("main");
          ui.actions.updateTabs(key!, (s) => T.activateTab(s, id));
          ui.actions.setPickerOpen(false);
        }}
        onClose={(id) => ui.actions.updateTabs(key!, (s) => T.closeTab(s, id))}
        onNew={() => {
          ui.actions.setFocus("main");
          ui.actions.setPickerOpen(true);
        }}
      />
      <box height={1} flexShrink={0} />
      <box flexGrow={1} flexDirection="column" overflow="hidden">
        {showPicker ? (
          <AgentPicker
            agents={agents}
            openTabs={tabs.tabs}
            cursor={pickerCursor}
            width={inner}
            height={contentHeight}
            onOpen={(id) => {
              ui.actions.setFocus("main");
              openAgent(id);
            }}
          />
        ) : activeAgent && host && tabs.active ? (
          <ErrorBoundary label="Agent view" resetKey={tabs.active}>
            <AgentView
              hostId={host.config.id}
              workspaceId={workspace.id}
              agentId={tabs.active}
              width={inner + 1}
              height={Math.max(3, contentHeight - composerRows - pendingRows)}
            />
            <PendingBar agent={activeAgent} width={inner} />
            <Composer key={tabs.active} hostId={host.config.id} agentId={tabs.active} width={inner} maxLines={composerMaxLines} onHeight={setComposerRows} />
          </ErrorBoundary>
        ) : null}
      </box>
    </>,
  );
}
