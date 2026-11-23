/**
 * Groups timeline entries into what the reader scans: the user's message, the agent's
 * answer, and runs of activity (thoughts, tools, todos) between them. Finished activity
 * collapses to a one-line summary so questions and answers stand out.
 */
import type { TimelineEntry } from "../../paseo/timeline";
import { speakerOf } from "./TimelineItem";

/** Activity runs this short are shown as-is; summarising them would add noise. */
export const COLLAPSE_MIN = 3;
/** While the agent works, the live run shows this many latest steps. */
export const LIVE_TAIL = 5;

export interface ActivityCounts {
  thoughts: number;
  tools: number;
  failed: number;
  other: number;
}

export type Block =
  | { kind: "user" | "answer"; key: string; entry: TimelineEntry }
  | {
      kind: "activity";
      key: string;
      entries: TimelineEntry[];
      /** Entries to draw (all, the live tail, or none when collapsed). */
      shown: TimelineEntry[];
      /** Earlier entries hidden above the live tail. */
      hidden: number;
      collapsed: boolean;
      live: boolean;
      counts: ActivityCounts;
    };

export function countActivity(entries: TimelineEntry[]): ActivityCounts {
  const c: ActivityCounts = { thoughts: 0, tools: 0, failed: 0, other: 0 };
  for (const e of entries) {
    if (e.item.type === "reasoning") c.thoughts++;
    else if (e.item.type === "tool_call") {
      c.tools++;
      if (e.item.status === "failed") c.failed++;
    } else c.other++;
  }
  return c;
}

export function summarize(c: ActivityCounts): string {
  const parts: string[] = [];
  if (c.thoughts) parts.push(`${c.thoughts} thought${c.thoughts === 1 ? "" : "s"}`);
  if (c.tools) parts.push(`${c.tools} tool${c.tools === 1 ? "" : "s"}`);
  if (c.other) parts.push(`${c.other} more`);
  return parts.join(" · ");
}

export function buildBlocks(
  entries: TimelineEntry[],
  opts: { running: boolean; expandAll: boolean; toggled: Record<string, boolean> },
): Block[] {
  const blocks: Block[] = [];
  let run: TimelineEntry[] = [];

  const flush = (isLast: boolean) => {
    if (run.length === 0) return;
    const key = `act:${run[0]!.key}`;
    const live = opts.running && isLast;
    const counts = countActivity(run);
    const collapsible = run.length >= COLLAPSE_MIN;
    // A per-group toggle flips whatever the global default is.
    const expanded = opts.toggled[key] ?? opts.expandAll;
    let shown = run;
    let hidden = 0;
    let collapsed = false;
    if (live && !expanded && run.length > LIVE_TAIL) {
      shown = run.slice(-LIVE_TAIL);
      hidden = run.length - LIVE_TAIL;
    } else if (!live && collapsible && !expanded) {
      shown = [];
      collapsed = true;
    }
    blocks.push({ kind: "activity", key, entries: run, shown, hidden, collapsed, live, counts });
    run = [];
  };

  for (const entry of entries) {
    const speaker = speakerOf(entry);
    if (!speaker) continue;
    if (speaker === "activity") {
      run.push(entry);
      continue;
    }
    flush(false);
    blocks.push({ kind: speaker, key: entry.key, entry });
  }
  flush(true);
  return blocks;
}
