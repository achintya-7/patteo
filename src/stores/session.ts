import { createStore } from "zustand/vanilla";
import type { PaseoAgent, PaseoProject, PaseoWorkspace } from "@getpaseo/client";
import type { HostConfig } from "../config/hosts";
import { emptyTimeline, type TimelineState } from "../paseo/timeline";
import { emptyChanges, type ChangesState } from "../paseo/changes";
import { emptyFiles, type FilesState } from "../paseo/files";

export type HostConnection =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "connected" }
  | { status: "disconnected"; error?: string; /** epoch ms of the SDK's next retry */ retryAt?: number };

export interface HostState {
  config: HostConfig;
  connection: HostConnection;
  serverId: string | null;
  serverVersion: string | null;
  hostname: string | null;
  projects: Record<string, PaseoProject>;
  workspaces: Record<string, PaseoWorkspace>;
  agents: Record<string, PaseoAgent>;
  loaded: { projects: boolean; workspaces: boolean; agents: boolean };
}

export interface SessionState {
  hosts: Record<string, HostState>;
  hostOrder: string[];
  activeHostId: string | null;
  /** Keyed by timelineKey(hostId, agentId). */
  timelines: Record<string, TimelineState>;
  /** Working-tree changes and PR state, keyed by changesKey(hostId, workspaceId). */
  changes: Record<string, ChangesState>;
  /** Directory listings for the Files tab, keyed like `changes`. */
  files: Record<string, FilesState>;
}

export const timelineKey = (hostId: string, agentId: string) => `${hostId}:${agentId}`;
export const changesKey = (hostId: string, workspaceId: string) => `${hostId}:${workspaceId}`;

const newHost = (config: HostConfig): HostState => ({
  config,
  connection: { status: "idle" },
  serverId: null,
  serverVersion: null,
  hostname: null,
  projects: {},
  workspaces: {},
  agents: {},
  loaded: { projects: false, workspaces: false, agents: false },
});

const byId = <T,>(items: T[], id: (t: T) => string) => Object.fromEntries(items.map((t) => [id(t), t]));

export function createSessionStore() {
  const store = createStore<SessionState>()(() => ({
    hosts: {},
    hostOrder: [],
    activeHostId: null,
    timelines: {},
    changes: {},
    files: {},
  }));
  const { setState, getState } = store;

  const patchHost = (hostId: string, fn: (h: HostState) => Partial<HostState>) =>
    setState((s) => {
      const h = s.hosts[hostId];
      if (!h) return s;
      return { hosts: { ...s.hosts, [hostId]: { ...h, ...fn(h) } } };
    });

  const actions = {
    addHost(config: HostConfig) {
      setState((s) => ({
        hosts: { ...s.hosts, [config.id]: s.hosts[config.id] ?? newHost(config) },
        hostOrder: s.hostOrder.includes(config.id) ? s.hostOrder : [...s.hostOrder, config.id],
        activeHostId: s.activeHostId ?? config.id,
      }));
    },
    removeHost(hostId: string) {
      setState((s) => {
        const { [hostId]: _, ...hosts } = s.hosts;
        const hostOrder = s.hostOrder.filter((id) => id !== hostId);
        const timelines = Object.fromEntries(Object.entries(s.timelines).filter(([k]) => !k.startsWith(`${hostId}:`)));
        return { hosts, hostOrder, timelines, activeHostId: s.activeHostId === hostId ? hostOrder[0] ?? null : s.activeHostId };
      });
    },
    setActiveHost(hostId: string) {
      if (getState().hosts[hostId]) setState({ activeHostId: hostId });
    },
    setConnection(hostId: string, connection: HostConnection) {
      patchHost(hostId, () => ({ connection }));
    },
    setHostConfig(hostId: string, config: HostConfig) {
      patchHost(hostId, () => ({ config }));
    },
    setServerInfo(hostId: string, info: { serverId?: string; version?: string; hostname?: string }) {
      patchHost(hostId, () => ({
        serverId: info.serverId ?? null,
        serverVersion: info.version ?? null,
        hostname: info.hostname ?? null,
      }));
    },
    setProjects(hostId: string, projects: PaseoProject[]) {
      patchHost(hostId, (h) => ({ projects: byId(projects, (p) => p.projectId), loaded: { ...h.loaded, projects: true } }));
    },
    upsertProject(hostId: string, project: PaseoProject) {
      patchHost(hostId, (h) => ({ projects: { ...h.projects, [project.projectId]: project } }));
    },
    removeProject(hostId: string, projectId: string) {
      patchHost(hostId, (h) => {
        const { [projectId]: _, ...projects } = h.projects;
        return { projects };
      });
    },
    setWorkspaces(hostId: string, workspaces: PaseoWorkspace[]) {
      patchHost(hostId, (h) => ({ workspaces: byId(workspaces, (w) => w.id), loaded: { ...h.loaded, workspaces: true } }));
    },
    upsertWorkspace(hostId: string, ws: PaseoWorkspace) {
      patchHost(hostId, (h) => ({ workspaces: { ...h.workspaces, [ws.id]: ws } }));
    },
    removeWorkspace(hostId: string, workspaceId: string) {
      patchHost(hostId, (h) => {
        const { [workspaceId]: _, ...workspaces } = h.workspaces;
        return { workspaces };
      });
    },
    setAgents(hostId: string, agents: PaseoAgent[]) {
      patchHost(hostId, (h) => ({ agents: byId(agents, (a) => a.id), loaded: { ...h.loaded, agents: true } }));
    },
    upsertAgent(hostId: string, agent: PaseoAgent) {
      patchHost(hostId, (h) => ({ agents: { ...h.agents, [agent.id]: agent } }));
    },
    removeAgent(hostId: string, agentId: string) {
      patchHost(hostId, (h) => {
        const { [agentId]: _, ...agents } = h.agents;
        return { agents };
      });
    },
    updateTimeline(key: string, fn: (t: TimelineState) => TimelineState) {
      setState((s) => {
        const prev = s.timelines[key] ?? emptyTimeline();
        const next = fn(prev);
        return next === prev ? s : { timelines: { ...s.timelines, [key]: next } };
      });
    },
    dropTimeline(key: string) {
      setState((s) => {
        const { [key]: _, ...timelines } = s.timelines;
        return { timelines };
      });
    },
    updateFiles(key: string, fn: (f: FilesState) => FilesState) {
      setState((s) => {
        const prev = s.files[key] ?? emptyFiles();
        const next = fn(prev);
        return next === prev ? s : { files: { ...s.files, [key]: next } };
      });
    },
    updateChanges(key: string, fn: (c: ChangesState) => ChangesState) {
      setState((s) => {
        const prev = s.changes[key] ?? emptyChanges();
        const next = fn(prev);
        return next === prev ? s : { changes: { ...s.changes, [key]: next } };
      });
    },
  };

  return Object.assign(store, { actions });
}

export type SessionStore = ReturnType<typeof createSessionStore>;
