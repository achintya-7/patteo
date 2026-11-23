/**
 * Working-tree changes and pull-request state for a workspace, mapped from the daemon's
 * checkout payloads into the shape the TUI renders. Mapping is pure so it is testable.
 */

/** A highlighted piece of a code line; `style` is the daemon's class (keyword, string, function…). */
export interface DiffToken {
  text: string;
  style: string | null;
}

export interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  /** Syntax highlighting from the daemon; absent for files it can't tokenize. */
  tokens?: DiffToken[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  isNew: boolean;
  isDeleted: boolean;
  additions: number;
  deletions: number;
  /** "binary" and "too_large" have no hunks. */
  status?: "binary" | "ok" | "too_large";
  hunks: DiffHunk[];
}

export interface PrCheck {
  name: string;
  /** Provider status string, e.g. SUCCESS / FAILURE / PENDING. */
  status: string;
  url: string | null;
  workflow?: string;
  duration?: string;
}

export interface PrState {
  number?: number;
  url: string;
  state: string;
  title?: string;
  isDraft?: boolean;
  isMerged?: boolean;
  checksStatus?: string;
  reviewDecision?: string | null;
  mergeable?: string;
  baseRefName?: string;
  headRefName?: string;
  checks: PrCheck[];
}

/** What the Changes tab compares: the working tree, the branch against its base (the PR), or both. */
export type ChangesMode = "uncommitted" | "base" | "all";
export const CHANGES_MODES: ChangesMode[] = ["base", "uncommitted", "all"];

/** Branch facts for the PR tab, from the daemon's checkout status. */
export interface CheckoutInfo {
  isGit: boolean;
  branch: string | null;
  baseRef: string | null;
  ahead: number | null;
  behind: number | null;
  isDirty: boolean;
  hasRemote: boolean;
  remoteUrl: string | null;
}

export interface ChangesState {
  cwd: string | null;
  loading: boolean;
  /** null until chosen: the PR's base comparison when there is a PR, else uncommitted. */
  mode: ChangesMode | null;
  files: DiffFile[];
  error: string | null;
  diffTooLarge: boolean;
  pr: PrState | null;
  prLoading: boolean;
  /** True once PR state has been fetched at least once (so "no PR" is not "unknown"). */
  prLoaded: boolean;
  checkout: CheckoutInfo | null;
  fetchedAt: number;
}

export const emptyChanges = (): ChangesState => ({
  cwd: null,
  loading: false,
  mode: null,
  files: [],
  error: null,
  diffTooLarge: false,
  pr: null,
  prLoading: false,
  prLoaded: false,
  checkout: null,
  fetchedAt: 0,
});

/** The mode in effect: the user's choice, else the PR comparison when one exists. */
export const effectiveMode = (c: Pick<ChangesState, "mode" | "pr">): ChangesMode => c.mode ?? (c.pr ? "base" : "uncommitted");

interface RawDiffLine { type?: string; content?: string; tokens?: { text?: string; style?: string | null }[] }
interface RawHunk { oldStart?: number; oldCount?: number; newStart?: number; newCount?: number; lines?: RawDiffLine[] }
interface RawFile {
  path?: string;
  oldPath?: string;
  isNew?: boolean;
  isDeleted?: boolean;
  additions?: number;
  deletions?: number;
  status?: string;
  hunks?: RawHunk[];
}

/** Daemon checkout-diff payload → renderable files. Unknown line types become context. */
export function toDiffFiles(payload: { files?: RawFile[]; error?: { message?: string } | null; diffTooLarge?: boolean }): {
  files: DiffFile[];
  error: string | null;
  diffTooLarge: boolean;
} {
  const files = (payload.files ?? []).map((f): DiffFile => {
    const status: DiffFile["status"] = f.status === "binary" ? "binary" : f.status === "too_large" ? "too_large" : undefined;
    return {
    path: String(f.path ?? ""),
    ...(f.oldPath ? { oldPath: f.oldPath } : {}),
    isNew: !!f.isNew,
    isDeleted: !!f.isDeleted,
    additions: Number(f.additions ?? 0),
    deletions: Number(f.deletions ?? 0),
    ...(status ? { status } : {}),
    hunks: (f.hunks ?? []).map((h) => ({
      oldStart: Number(h.oldStart ?? 0),
      oldCount: Number(h.oldCount ?? 0),
      newStart: Number(h.newStart ?? 0),
      newCount: Number(h.newCount ?? 0),
      lines: (h.lines ?? []).map((l): DiffLine => ({
        type: lineType(l.type),
        content: String(l.content ?? ""),
        ...(Array.isArray(l.tokens) && l.tokens.length ? { tokens: l.tokens.map((t) => ({ text: String(t.text ?? ""), style: t.style ?? null })) } : {}),
      })),
    })),
    };
  });
  return { files, error: payload.error?.message ?? null, diffTooLarge: !!payload.diffTooLarge };
}

const lineType = (t: string | undefined): DiffLine["type"] =>
  t === "add" || t === "remove" || t === "header" ? t : "context";

/** Daemon PR-status payload → the PR tab's data (null when the branch has no PR). */
export function toPrState(payload: { status?: Record<string, unknown> | null }): PrState | null {
  const s = payload.status;
  if (!s || typeof s.url !== "string") return null;
  const checks = Array.isArray(s.checks) ? (s.checks as Record<string, unknown>[]) : [];
  return {
    url: s.url,
    state: String(s.state ?? "OPEN"),
    ...(typeof s.number === "number" ? { number: s.number } : {}),
    ...(typeof s.title === "string" ? { title: s.title } : {}),
    ...(s.isDraft === true ? { isDraft: true } : {}),
    ...(s.isMerged === true ? { isMerged: true } : {}),
    ...(typeof s.checksStatus === "string" ? { checksStatus: s.checksStatus } : {}),
    ...(typeof s.reviewDecision === "string" ? { reviewDecision: s.reviewDecision } : {}),
    ...(typeof s.mergeable === "string" ? { mergeable: s.mergeable } : {}),
    ...(typeof s.baseRefName === "string" ? { baseRefName: s.baseRefName } : {}),
    ...(typeof s.headRefName === "string" ? { headRefName: s.headRefName } : {}),
    checks: checks.map((c) => ({
      name: String(c.name ?? ""),
      status: String(c.status ?? ""),
      url: typeof c.url === "string" ? c.url : null,
      ...(typeof c.workflow === "string" ? { workflow: c.workflow } : {}),
      ...(typeof c.duration === "string" ? { duration: c.duration } : {}),
    })),
  };
}

/** Daemon checkout-status payload → branch facts. */
export function toCheckoutInfo(p: Record<string, unknown>): CheckoutInfo {
  const ab = p.aheadBehind as { ahead?: number; behind?: number } | null | undefined;
  return {
    isGit: p.isGit === true,
    branch: typeof p.currentBranch === "string" ? p.currentBranch : null,
    baseRef: typeof p.baseRef === "string" ? p.baseRef : null,
    ahead: ab ? Number(ab.ahead ?? 0) : null,
    behind: ab ? Number(ab.behind ?? 0) : null,
    isDirty: p.isDirty === true,
    hasRemote: p.hasRemote === true,
    remoteUrl: typeof p.remoteUrl === "string" ? p.remoteUrl : null,
  };
}
