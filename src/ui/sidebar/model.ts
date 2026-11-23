/**
 * Pure sidebar model: session state → flat list of rows (project headers and
 * workspace rows), mirroring the Desktop sidebar's project ▸ workspace tree.
 */
import type { PaseoAgent, PaseoProject, PaseoWorkspace } from "@getpaseo/client";

export type WorkspaceStatus = PaseoWorkspace["status"];

export interface AgentStats {
  total: number;
  running: number;
  attention: number;
  permissions: number;
}

export interface ProjectRow {
  kind: "project";
  key: string;
  projectId: string;
  label: string;
  collapsed: boolean;
  workspaceCount: number;
  /** Rolled-up status so a collapsed project still signals activity. */
  status: WorkspaceStatus | null;
}

export interface WorkspaceRow {
  kind: "workspace";
  key: string;
  projectKey: string;
  workspaceId: string;
  label: string;
  branch: string | null;
  status: WorkspaceStatus;
  pinned: boolean;
  isWorktree: boolean;
  diff: { additions: number; deletions: number } | null;
  agents: AgentStats;
}

export type SidebarRow = ProjectRow | WorkspaceRow;

export interface SidebarInput {
  hostId: string;
  projects: Record<string, PaseoProject>;
  workspaces: Record<string, PaseoWorkspace>;
  agents: Record<string, PaseoAgent>;
  collapsed: Record<string, true>;
}

/** Most urgent first; used to roll workspace status up to the project. */
const STATUS_PRIORITY: WorkspaceStatus[] = ["needs_input", "attention", "failed", "running", "done"];

export const projectKey = (hostId: string, projectId: string) => `${hostId}:${projectId}`;
export const workspaceKey = (hostId: string, workspaceId: string) => `${hostId}:ws:${workspaceId}`;

export function agentStatsByWorkspace(agents: Record<string, PaseoAgent>): Map<string, AgentStats> {
  const out = new Map<string, AgentStats>();
  for (const a of Object.values(agents)) {
    if (!a.workspaceId || a.archivedAt) continue;
    const s = out.get(a.workspaceId) ?? { total: 0, running: 0, attention: 0, permissions: 0 };
    s.total++;
    if (a.status === "running") s.running++;
    if (a.requiresAttention) s.attention++;
    s.permissions += a.pendingPermissions?.length ?? 0;
    out.set(a.workspaceId, s);
  }
  return out;
}

const recency = (w: PaseoWorkspace) => Date.parse(w.activityAt ?? w.statusEnteredAt ?? w.createdAt ?? "") || 0;

function compareWorkspaces(a: PaseoWorkspace, b: PaseoWorkspace): number {
  const pa = a.pinnedAt ? 1 : 0;
  const pb = b.pinnedAt ? 1 : 0;
  if (pa !== pb) return pb - pa;
  return recency(b) - recency(a);
}

export function workspaceLabel(w: PaseoWorkspace): string {
  return (w.title || w.name || w.id).trim();
}

export function workspaceBranch(w: PaseoWorkspace): string | null {
  const checkout = (w as { project?: { checkout?: { currentBranch?: string | null } } }).project?.checkout;
  return checkout?.currentBranch ?? null;
}

export function buildSidebarRows(input: SidebarInput): SidebarRow[] {
  const { hostId, projects, workspaces, agents, collapsed } = input;
  const stats = agentStatsByWorkspace(agents);

  const byProject = new Map<string, PaseoWorkspace[]>();
  for (const w of Object.values(workspaces)) {
    if (w.archivingAt) continue;
    const list = byProject.get(w.projectId) ?? [];
    list.push(w);
    byProject.set(w.projectId, list);
  }

  // Projects known only through a workspace still get a header.
  const projectIds = new Set([...Object.keys(projects), ...byProject.keys()]);
  const groups = [...projectIds].map((projectId) => {
    const list = (byProject.get(projectId) ?? []).sort(compareWorkspaces);
    const p = projects[projectId];
    const label = p?.projectCustomName || p?.projectDisplayName || list[0]?.projectDisplayName || projectId;
    return { projectId, label, list, latest: list.length ? Math.max(...list.map(recency)) : 0 };
  });
  // Active projects first (by latest workspace activity), then empty ones alphabetically.
  groups.sort((a, b) => b.latest - a.latest || a.label.localeCompare(b.label));

  const rows: SidebarRow[] = [];
  for (const g of groups) {
    const pk = projectKey(hostId, g.projectId);
    const isCollapsed = !!collapsed[pk];
    const statuses = new Set(g.list.map((w) => w.status));
    rows.push({
      kind: "project",
      key: pk,
      projectId: g.projectId,
      label: g.label,
      collapsed: isCollapsed,
      workspaceCount: g.list.length,
      status: STATUS_PRIORITY.find((s) => statuses.has(s)) ?? null,
    });
    if (isCollapsed) continue;
    for (const w of g.list) {
      rows.push({
        kind: "workspace",
        key: workspaceKey(hostId, w.id),
        projectKey: pk,
        workspaceId: w.id,
        label: workspaceLabel(w),
        branch: workspaceBranch(w),
        status: w.status,
        pinned: !!w.pinnedAt,
        isWorktree: w.workspaceKind === "worktree",
        diff: w.diffStat ?? null,
        agents: stats.get(w.id) ?? { total: 0, running: 0, attention: 0, permissions: 0 },
      });
    }
  }
  return rows;
}

/** Keeps the cursor on a valid row after the list changes (collapse moves it explicitly). */
export function resolveCursor(rows: SidebarRow[], cursor: string | null): string | null {
  if (rows.length === 0) return null;
  if (cursor && rows.some((r) => r.key === cursor)) return cursor;
  return rows.find((r) => r.kind === "workspace")?.key ?? rows[0]!.key;
}

export function moveCursor(rows: SidebarRow[], cursor: string | null, delta: number): string | null {
  if (rows.length === 0) return null;
  const i = Math.max(0, rows.findIndex((r) => r.key === cursor));
  return rows[Math.min(rows.length - 1, Math.max(0, i + delta))]!.key;
}
