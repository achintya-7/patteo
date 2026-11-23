import type { SidebarRow } from "./model";

export interface PlacedRow {
  row: SidebarRow;
  /** First line of the row (including its leading gap line, if any). */
  top: number;
  height: number;
  /** Projects after the first get one blank line above them. */
  gapBefore: boolean;
}

const isEmptyProject = (r: SidebarRow | undefined) => r?.kind === "project" && r.workspaceCount === 0;

/**
 * Line heights: projects 1 (+1 gap above unless first), workspaces 2 (title + meta).
 * Consecutive empty projects stack without gaps so they don't eat the list.
 */
export function placeRows(rows: SidebarRow[]): { placed: PlacedRow[]; totalLines: number } {
  let top = 0;
  const placed = rows.map((row, i) => {
    const gapBefore = row.kind === "project" && i > 0 && !(isEmptyProject(row) && isEmptyProject(rows[i - 1]));
    const height = (row.kind === "project" ? 1 : 2) + (gapBefore ? 1 : 0);
    const p = { row, top, height, gapBefore };
    top += height;
    return p;
  });
  return { placed, totalLines: top };
}

/** Smallest scroll change that keeps the cursor's row fully visible; clamped to content. */
export function scrollToShow(placed: PlacedRow[], totalLines: number, cursorKey: string | null, scroll: number, viewport: number): number {
  const max = Math.max(0, totalLines - viewport);
  const p = placed.find((r) => r.row.key === cursorKey);
  let next = Math.min(scroll, max);
  if (p) {
    // Keep a project's gap line out of view at the top so the header sits flush.
    const visibleTop = p.gapBefore ? p.top + 1 : p.top;
    if (visibleTop < next) next = visibleTop;
    else if (p.top + p.height > next + viewport) next = p.top + p.height - viewport;
  }
  return Math.max(0, Math.min(next, max));
}
