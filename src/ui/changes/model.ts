/**
 * Pure presentation helpers for the changes panel and diff view.
 */
import type { ChangesState, DiffFile, DiffLine, PrState } from "../../paseo/changes";

/** A, D, M, R — the one-letter status git shows in its short format. */
export function fileGlyph(f: DiffFile): string {
  if (f.isNew) return "A";
  if (f.isDeleted) return "D";
  if (f.oldPath && f.oldPath !== f.path) return "R";
  return "M";
}

/** Splits `a/b/c.ts` into the file name and its directory, for two-tone rows. */
export function fileLabel(f: DiffFile): { name: string; dir: string } {
  const cut = f.path.lastIndexOf("/");
  if (cut < 0) return { name: f.path, dir: "" };
  return { name: f.path.slice(cut + 1), dir: f.path.slice(0, cut) };
}

export function summarize(files: DiffFile[]): { files: number; additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ files: acc.files + 1, additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

export type Tone = "ok" | "warn" | "err" | "muted";

/** The PR badge: number and state, or what to press to create one. */
export function prBadge(state: ChangesState): { text: string; tone: Tone } {
  if (state.prLoading) return { text: "checking PR…", tone: "muted" };
  const pr = state.pr;
  if (!pr) return { text: "P  create PR", tone: "muted" };
  const num = pr.number ? `#${pr.number}` : "";
  if (pr.state === "MERGED" || pr.state === "merged") return { text: `${num} merged`.trim(), tone: "ok" };
  if (pr.state === "CLOSED" || pr.state === "closed") return { text: `${num} closed`.trim(), tone: "muted" };
  const checks = pr.checksStatus && pr.checksStatus !== "SUCCESS" ? ` · checks ${pr.checksStatus.toLowerCase()}` : "";
  return { text: `${num} ${pr.isDraft ? "draft" : "open"}${checks}`.trim(), tone: pr.checksStatus === "FAILURE" ? "err" : "ok" };
}

/**
 * A hunk's code lines with the line number each one is shown against: the new file's for
 * context and additions, the old file's for removals. Hunk header lines are dropped (the
 * view draws its own `@@` row).
 */
export function numberedLines(hunk: { oldStart: number; newStart: number; lines: DiffLine[] }): { line: DiffLine; no: number }[] {
  let oldNo = hunk.oldStart;
  let newNo = hunk.newStart;
  const out: { line: DiffLine; no: number }[] = [];
  for (const line of hunk.lines) {
    if (line.type === "header") continue;
    if (line.type === "remove") out.push({ line, no: oldNo++ });
    else if (line.type === "add") out.push({ line, no: newNo++ });
    else {
      out.push({ line, no: newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

/** Hunk ranges as git writes them, used in the diff's section rows. */
export function hunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
}

export function prDetail(pr: PrState): string | null {
  const parts = [pr.title, pr.headRefName && pr.baseRefName ? `${pr.headRefName} → ${pr.baseRefName}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
