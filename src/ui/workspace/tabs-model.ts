/**
 * Pure per-workspace tab model (agent tabs), after the Desktop app's
 * workspace-tabs model: tabs belong to a workspace, with an active tab and MRU order.
 */
export interface WorkspaceTabs {
  /** Agent ids in display order. */
  tabs: string[];
  active: string | null;
  /** Most-recently-used first; drives "previous tab" and the tab chosen after a close. */
  mru: string[];
}

export const emptyTabs = (): WorkspaceTabs => ({ tabs: [], active: null, mru: [] });

const touch = (mru: string[], id: string) => [id, ...mru.filter((x) => x !== id)];

export function openTab(s: WorkspaceTabs, agentId: string, opts: { after?: "active" | "end" } = {}): WorkspaceTabs {
  if (s.tabs.includes(agentId)) return activateTab(s, agentId);
  const tabs = s.tabs.slice();
  const ai = s.active ? tabs.indexOf(s.active) : -1;
  if (opts.after === "active" && ai >= 0) tabs.splice(ai + 1, 0, agentId);
  else tabs.push(agentId);
  return { tabs, active: agentId, mru: touch(s.mru, agentId) };
}

export function activateTab(s: WorkspaceTabs, agentId: string): WorkspaceTabs {
  if (!s.tabs.includes(agentId) || s.active === agentId) return s;
  return { ...s, active: agentId, mru: touch(s.mru, agentId) };
}

export function closeTab(s: WorkspaceTabs, agentId: string | null = s.active): WorkspaceTabs {
  if (!agentId || !s.tabs.includes(agentId)) return s;
  const tabs = s.tabs.filter((x) => x !== agentId);
  const mru = s.mru.filter((x) => x !== agentId);
  if (s.active !== agentId) return { ...s, tabs, mru };
  // Like editors: go back to the most recently used remaining tab.
  const active = mru.find((x) => tabs.includes(x)) ?? tabs[Math.min(s.tabs.indexOf(agentId), tabs.length - 1)] ?? null;
  return { tabs, active, mru };
}

export function cycleTab(s: WorkspaceTabs, delta: number): WorkspaceTabs {
  if (s.tabs.length === 0) return s;
  const i = s.active ? s.tabs.indexOf(s.active) : 0;
  const next = s.tabs[(((i + delta) % s.tabs.length) + s.tabs.length) % s.tabs.length]!;
  return activateTab(s, next);
}

export function selectTabIndex(s: WorkspaceTabs, index: number): WorkspaceTabs {
  const id = s.tabs[index];
  return id ? activateTab(s, id) : s;
}

/** Alt-tab style: switch to the previously used tab. */
export function previousTab(s: WorkspaceTabs): WorkspaceTabs {
  const prev = s.mru.find((x) => x !== s.active && s.tabs.includes(x));
  return prev ? activateTab(s, prev) : s;
}

export function moveTab(s: WorkspaceTabs, delta: number): WorkspaceTabs {
  if (!s.active) return s;
  const i = s.tabs.indexOf(s.active);
  const j = Math.max(0, Math.min(s.tabs.length - 1, i + delta));
  if (i === j) return s;
  const tabs = s.tabs.slice();
  tabs.splice(i, 1);
  tabs.splice(j, 0, s.active);
  return { ...s, tabs };
}

/** Drops tabs whose agents no longer exist (archived/removed). Returns the same object if unchanged. */
export function pruneTabs(s: WorkspaceTabs, alive: (agentId: string) => boolean): WorkspaceTabs {
  if (s.tabs.every(alive)) return s;
  let next = s;
  for (const id of s.tabs) if (!alive(id)) next = closeTab(next, id);
  return next;
}
