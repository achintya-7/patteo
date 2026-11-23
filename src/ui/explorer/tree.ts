/**
 * Pure model of the Files tab: directory listings + expansion state → the flat rows the
 * panel draws. Nothing here touches the daemon or React, so ordering, hidden-file
 * filtering and change markers are unit-tested.
 */
import type { DiffFile } from "../../paseo/changes";
import { sortEntries, type DirListing } from "../../paseo/files";

export interface TreeRow {
  /** The path for files and folders; synthetic for notes. */
  key: string;
  path: string;
  name: string;
  kind: "file" | "directory" | "note";
  depth: number;
  expanded: boolean;
  /** A folder whose listing is being fetched. */
  loading: boolean;
  /** git letter for a changed file. */
  change?: "A" | "D" | "M" | "R";
  /** A folder containing at least one changed file. */
  dirty: boolean;
}

/** path → A/D/M/R for every file in the current comparison. */
export function changeIndex(files: DiffFile[]): Map<string, "A" | "D" | "M" | "R"> {
  const out = new Map<string, "A" | "D" | "M" | "R">();
  for (const f of files) out.set(f.path, f.isNew ? "A" : f.isDeleted ? "D" : f.oldPath && f.oldPath !== f.path ? "R" : "M");
  return out;
}

export function buildRows(input: {
  listings: Record<string, DirListing>;
  isExpanded: (path: string) => boolean;
  showHidden: boolean;
  changes: Map<string, "A" | "D" | "M" | "R">;
}): TreeRow[] {
  const { listings, isExpanded, showHidden, changes } = input;
  const changedPaths = [...changes.keys()];
  const rows: TreeRow[] = [];

  const walk = (dir: string, depth: number) => {
    const listing = listings[dir];
    if (!listing) return;
    for (const e of sortEntries(listing.entries)) {
      if (!showHidden && e.name.startsWith(".")) continue;
      if (e.kind === "file") {
        rows.push({ key: e.path, path: e.path, name: e.name, kind: "file", depth, expanded: false, loading: false, change: changes.get(e.path), dirty: false });
        continue;
      }
      const open = isExpanded(e.path);
      const child = listings[e.path];
      rows.push({
        key: e.path,
        path: e.path,
        name: e.name,
        kind: "directory",
        depth,
        expanded: open,
        loading: open && (!child || child.loading) && !child?.entries.length,
        dirty: changedPaths.some((p) => p.startsWith(`${e.path}/`)),
      });
      if (!open || !child) continue;
      if (child.error) rows.push({ key: `${e.path}/#error`, path: e.path, name: child.error, kind: "note", depth: depth + 1, expanded: false, loading: false, dirty: false });
      else if (!child.loading && child.entries.length === 0) rows.push({ key: `${e.path}/#empty`, path: e.path, name: "empty", kind: "note", depth: depth + 1, expanded: false, loading: false, dirty: false });
      else walk(e.path, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}

/** Index of `path` in `rows`, or 0 — the cursor follows the row's identity, not its position. */
export function indexOfPath(rows: TreeRow[], path: string | null): number {
  if (!path) return 0;
  const i = rows.findIndex((r) => r.key === path);
  return i < 0 ? 0 : i;
}
