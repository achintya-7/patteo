import { useMemo } from "react";
import type { PaseoAgent } from "@getpaseo/client";
import { useActiveHost, useUi } from "../../stores/context";
import { emptyTabs } from "./tabs-model";
import { tabsKey } from "../../stores/ui";

/** The active host's selected workspace, its live agents (newest first) and its tab state. */
export function useSelectedWorkspace() {
  const host = useActiveHost();
  const hostId = host?.config.id ?? null;
  const workspaceId = useUi((s) => (hostId ? s.selectedWorkspace[hostId] : undefined));
  const workspace = host && workspaceId ? host.workspaces[workspaceId] ?? null : null;
  const key = hostId && workspaceId ? tabsKey(hostId, workspaceId) : null;
  const tabs = useUi((s) => (key ? s.tabs[key] : undefined)) ?? EMPTY;

  const agents = useMemo<PaseoAgent[]>(
    () =>
      host && workspaceId
        ? Object.values(host.agents)
            .filter((a) => a.workspaceId === workspaceId && !a.archivedAt)
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        : [],
    [host?.agents, workspaceId],
  );

  return { host, hostId, workspaceId, workspace, key, tabs, agents };
}

const EMPTY = emptyTabs();
