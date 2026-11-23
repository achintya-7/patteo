import { describe, expect, test } from "bun:test";
import { buildSidebarRows, moveCursor, resolveCursor, projectKey } from "../src/ui/sidebar/model";

const ws = (id: string, projectId: string, extra: Record<string, unknown> = {}) =>
  ({ id, projectId, projectDisplayName: projectId, name: id, title: null, status: "done", workspaceKind: "local_checkout",
     createdAt: "2026-01-01T00:00:00Z", activityAt: null, statusEnteredAt: null, pinnedAt: null, archivingAt: null, ...extra }) as any;
const agent = (id: string, workspaceId: string, extra: Record<string, unknown> = {}) =>
  ({ id, workspaceId, status: "idle", archivedAt: null, requiresAttention: false, pendingPermissions: [], ...extra }) as any;

const input = (collapsed: Record<string, true> = {}) => ({
  hostId: "h",
  projects: { p1: { projectId: "p1", projectDisplayName: "alpha" } as any, p2: { projectId: "p2", projectDisplayName: "beta" } as any },
  workspaces: {
    a: ws("a", "p1", { activityAt: "2026-02-01T00:00:00Z" }),
    b: ws("b", "p1", { activityAt: "2026-03-01T00:00:00Z", status: "running" }),
    c: ws("c", "p1", { pinnedAt: "2026-01-01T00:00:00Z" }),
    d: ws("d", "p2", { activityAt: "2026-04-01T00:00:00Z" }),
  },
  agents: {
    x: agent("x", "b", { status: "running" }),
    y: agent("y", "b", { requiresAttention: true, pendingPermissions: [{}, {}] }),
    z: agent("z", "b", { archivedAt: "2026-01-01" }),
  },
  collapsed,
});

describe("sidebar model", () => {
  test("projects ordered by latest activity; pinned workspaces first, then recency", () => {
    const rows = buildSidebarRows(input());
    expect(rows.map((r) => (r.kind === "project" ? r.label : r.workspaceId))).toEqual(["beta", "d", "alpha", "c", "b", "a"]);
  });

  test("agent stats exclude archived agents", () => {
    const b = buildSidebarRows(input()).find((r) => r.kind === "workspace" && r.workspaceId === "b") as any;
    expect(b.agents).toEqual({ total: 2, running: 1, attention: 1, permissions: 2 });
  });

  test("collapsed project hides workspaces and rolls up status", () => {
    const rows = buildSidebarRows(input({ [projectKey("h", "p1")]: true }));
    const alpha = rows.find((r) => r.kind === "project" && r.label === "alpha") as any;
    expect(alpha.collapsed).toBe(true);
    expect(alpha.status).toBe("running");
    expect(rows.filter((r) => r.kind === "workspace").map((r: any) => r.workspaceId)).toEqual(["d"]);
  });

  test("cursor helpers", () => {
    const rows = buildSidebarRows(input());
    expect(resolveCursor(rows, null)).toBe(rows[1]!.key);
    expect(resolveCursor(rows, "gone")).toBe(rows[1]!.key);
    expect(moveCursor(rows, rows[0]!.key, -1)).toBe(rows[0]!.key);
    expect(moveCursor(rows, rows[0]!.key, 99)).toBe(rows.at(-1)!.key);
  });
});
