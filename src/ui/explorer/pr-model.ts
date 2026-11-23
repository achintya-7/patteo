/**
 * The PR tab as lines of coloured segments, built from the daemon's PR status and the
 * branch facts. Pure: the component only maps tones to theme colours.
 */
import type { ChangesState, PrCheck } from "../../paseo/changes";

export type Tone = "text" | "muted" | "ok" | "warn" | "err" | "accent" | "info";
export interface Seg {
  text: string;
  tone: Tone;
  bold?: boolean;
}
/** One display line; an empty array is a blank line. */
export type PrLine = Seg[];

const seg = (text: string, tone: Tone = "text", bold = false): Seg => ({ text, tone, ...(bold ? { bold } : {}) });

export type CheckKind = "ok" | "fail" | "pending" | "skipped";

/** Provider status strings differ (GitHub: SUCCESS/FAILURE/PENDING…); bucket them. */
export function checkKind(status: string): CheckKind {
  const s = status.toLowerCase();
  if (/success|pass|neutral/.test(s)) return s.includes("neutral") ? "skipped" : "ok";
  if (/fail|error|cancel|timed|action_required/.test(s)) return "fail";
  if (/skip/.test(s)) return "skipped";
  return "pending";
}

const KIND_GLYPH: Record<CheckKind, { glyph: string; tone: Tone }> = {
  ok: { glyph: "✓", tone: "ok" },
  fail: { glyph: "✗", tone: "err" },
  pending: { glyph: "◌", tone: "warn" },
  skipped: { glyph: "–", tone: "muted" },
};

export function summarizeChecks(checks: PrCheck[]): Record<CheckKind, number> {
  const out: Record<CheckKind, number> = { ok: 0, fail: 0, pending: 0, skipped: 0 };
  for (const c of checks) out[checkKind(c.status)]++;
  return out;
}

/** Greedy word wrap by code points; words longer than a line are split. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(8, width);
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while ([...word].length > w) {
      if (line) { lines.push(line); line = ""; }
      lines.push([...word].slice(0, w).join(""));
      word = [...word].slice(w).join("");
    }
    if (!line) line = word;
    else if ([...line].length + 1 + [...word].length <= w) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

const REVIEW: Record<string, { text: string; tone: Tone }> = {
  APPROVED: { text: "approved", tone: "ok" },
  CHANGES_REQUESTED: { text: "changes requested", tone: "err" },
  REVIEW_REQUIRED: { text: "review required", tone: "warn" },
};

export function prLines(c: ChangesState, width: number): PrLine[] {
  const w = Math.max(12, width);
  const out: PrLine[] = [];
  const info = c.checkout;

  if (!c.prLoaded) return [[seg(c.prLoading ? "Checking pull request…" : "Pull request not loaded yet", "muted")]];
  if (info && !info.isGit) return [[seg("Not a git repository", "warn")], [seg("Pull requests need a git checkout.", "muted")]];

  const branchLine = (): PrLine | null => {
    if (!info?.branch) return null;
    return [seg(info.branch, "accent", true), ...(info.baseRef ? [seg("  →  ", "muted"), seg(info.baseRef)] : [])];
  };

  if (!c.pr) {
    out.push([seg("No pull request", "text", true)]);
    out.push([]);
    const b = branchLine();
    if (b) out.push(b);
    if (info) {
      const parts: Seg[] = [];
      if (info.ahead !== null) parts.push(seg(`↑${info.ahead} ahead`, info.ahead > 0 ? "ok" : "muted"), seg("  "), seg(`↓${info.behind ?? 0} behind`, info.behind ? "warn" : "muted"));
      if (parts.length) out.push(parts);
      if (info.isDirty) out.push([seg("uncommitted changes", "warn")]);
      out.push([seg(info.hasRemote ? "remote configured" : "no remote — a PR needs one", info.hasRemote ? "muted" : "err")]);
    }
    out.push([]);
    out.push([seg("⏎", "accent", true), seg("  create pull request", "text")]);
    return out;
  }

  const pr = c.pr;
  const state = pr.isMerged || pr.state.toUpperCase() === "MERGED" ? "merged" : pr.state.toLowerCase();
  const stateTone: Tone = state === "merged" ? "accent" : state === "open" ? "ok" : "muted";
  out.push([seg(pr.number ? `#${pr.number}` : "PR", "accent", true), seg("  "), seg(pr.isDraft ? "draft" : state, pr.isDraft ? "muted" : stateTone, true)]);
  if (pr.title) for (const l of wrapText(pr.title, w)) out.push([seg(l, "text", true)]);
  const head = pr.headRefName ?? info?.branch;
  const base = pr.baseRefName ?? info?.baseRef;
  if (head || base) out.push([seg(head ?? "?", "accent"), seg("  →  ", "muted"), seg(base ?? "?")]);
  out.push([]);

  if (pr.checks.length) {
    const n = summarizeChecks(pr.checks);
    out.push([
      seg("Checks  ", "muted"),
      seg(`✓ ${n.ok}`, "ok"), seg("  "),
      ...(n.fail ? [seg(`✗ ${n.fail}`, "err"), seg("  ")] : []),
      ...(n.pending ? [seg(`◌ ${n.pending}`, "warn"), seg("  ")] : []),
      ...(n.skipped ? [seg(`– ${n.skipped}`, "muted")] : []),
    ]);
    // Failures first: they are what you came to see.
    const order: CheckKind[] = ["fail", "pending", "ok", "skipped"];
    const sorted = [...pr.checks].sort((a, b) => order.indexOf(checkKind(a.status)) - order.indexOf(checkKind(b.status)));
    for (const ch of sorted) {
      const k = KIND_GLYPH[checkKind(ch.status)];
      const dur = ch.duration ? `  ${ch.duration}` : "";
      const name = [...ch.name].length > w - 4 - [...dur].length ? `${[...ch.name].slice(0, Math.max(4, w - 5 - [...dur].length)).join("")}…` : ch.name;
      out.push([seg(` ${k.glyph} `, k.tone), seg(name, checkKind(ch.status) === "skipped" ? "muted" : "text"), seg(dur, "muted")]);
    }
  } else {
    out.push([seg("Checks  ", "muted"), seg("none reported", "muted")]);
  }
  out.push([]);

  const review = pr.reviewDecision ? REVIEW[pr.reviewDecision] ?? { text: pr.reviewDecision.toLowerCase().replace(/_/g, " "), tone: "muted" as Tone } : { text: "none yet", tone: "muted" as Tone };
  out.push([seg("Review   ", "muted"), seg(review.text, review.tone)]);
  const merge = pr.mergeable === "MERGEABLE" ? { text: "no conflicts", tone: "ok" as Tone } : pr.mergeable === "CONFLICTING" ? { text: "has conflicts", tone: "err" as Tone } : { text: "unknown", tone: "muted" as Tone };
  out.push([seg("Merge    ", "muted"), seg(merge.text, merge.tone)]);
  out.push([]);
  for (const l of wrapText(pr.url, w)) out.push([seg(l, "info")]);
  return out;
}
