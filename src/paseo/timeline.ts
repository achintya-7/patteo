/**
 * Pure reducer that folds a fetched timeline page plus live `agent_stream`
 * events into a flat list of renderable entries.
 *
 * Live semantics observed from the daemon (v0.16):
 *  - assistant_message / reasoning arrive as text deltas → append to the open entry
 *  - tool_call arrives repeatedly with the same callId → upsert in place
 *  - todo is a full snapshot → replace the turn's previous todo
 *  - user_message may echo an optimistic message → dedupe by (client)messageId
 * Fetched pages are already merged by the daemon, so they hydrate directly.
 */
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

export interface TimelineEntry {
  key: string;
  item: AgentTimelineItem;
  turnId?: string;
  timestamp?: string;
}

export type TurnState = "idle" | "running";

export interface TimelineState {
  epoch: string | null;
  /** Highest daemon seq folded in; live events at or below it are duplicates. */
  lastSeq: number;
  entries: TimelineEntry[];
  turn: TurnState;
  lastError: string | null;
  /** Set when the daemon invalidated the epoch; the owner must refetch. */
  stale: boolean;
  hasOlder: boolean;
  loading: boolean;
  loadingOlder: boolean;
  /** Cursor of the oldest loaded entry, for paging backwards. */
  startCursor: TimelineCursor | null;
}

export interface TimelineCursor {
  epoch: string;
  seq: number;
}

export const emptyTimeline = (): TimelineState => ({
  epoch: null,
  lastSeq: -1,
  entries: [],
  turn: "idle",
  lastError: null,
  stale: false,
  hasOlder: false,
  loading: true,
  loadingOlder: false,
  startCursor: null,
});

let keyCounter = 0;
const nextKey = () => `e${++keyCounter}`;

export interface FetchedEntry {
  item: AgentTimelineItem;
  turnId?: string;
  timestamp?: string;
  seqStart?: number;
  seqEnd?: number;
}

export interface FetchedPage {
  epoch?: string | null;
  entries: FetchedEntry[];
  hasOlder?: boolean;
  startCursor?: TimelineCursor | null;
  endCursor?: TimelineCursor | null;
}

const toEntry = (e: FetchedEntry): TimelineEntry => ({ key: nextKey(), item: e.item, turnId: e.turnId, timestamp: e.timestamp });

export function hydrateTimeline(prev: TimelineState, page: FetchedPage): TimelineState {
  let lastSeq = page.endCursor?.seq ?? -1;
  for (const e of page.entries) if (typeof e.seqEnd === "number" && e.seqEnd > lastSeq) lastSeq = e.seqEnd;
  return {
    ...prev,
    epoch: page.epoch ?? page.endCursor?.epoch ?? null,
    lastSeq,
    entries: page.entries.map(toEntry),
    stale: false,
    loading: false,
    hasOlder: page.hasOlder ?? false,
    startCursor: page.startCursor ?? null,
  };
}

/** Prepends an older page fetched with direction "before". A different epoch means the history was replaced. */
export function prependOlder(prev: TimelineState, page: FetchedPage): TimelineState {
  const epoch = page.epoch ?? page.startCursor?.epoch ?? null;
  if (prev.epoch && epoch && epoch !== prev.epoch) return { ...prev, stale: true, loadingOlder: false };
  return {
    ...prev,
    entries: [...page.entries.map(toEntry), ...prev.entries],
    hasOlder: page.hasOlder ?? false,
    startCursor: page.startCursor ?? prev.startCursor,
    loadingOlder: false,
  };
}

/** Minimal shape of a timeline subscription event (PaseoAgentTimelineEvent). */
export interface StreamEnvelope {
  event: { type: string; [k: string]: any };
  seq?: number;
  epoch?: string;
  timestamp?: string;
}

export function applyStreamEvent(state: TimelineState, env: StreamEnvelope): TimelineState {
  const ev = env.event;
  switch (ev.type) {
    case "replacement":
      return { ...state, stale: true };
    case "subscription_restored":
      // History may have been missed while disconnected.
      return { ...state, stale: true };
    case "error":
      return { ...state, lastError: String(ev.error ?? "timeline error") };
    case "turn_started":
      return { ...state, turn: "running", lastError: null };
    case "turn_completed":
    case "turn_canceled":
      return { ...state, turn: "idle" };
    case "turn_failed":
      return { ...state, turn: "idle", lastError: String(ev.error ?? "turn failed") };
    case "timeline":
      break;
    default:
      return state;
  }

  if (typeof env.seq === "number") {
    if (env.epoch && state.epoch && env.epoch !== state.epoch) return { ...state, stale: true };
    if (env.seq <= state.lastSeq) return state;
  }

  const item = ev.item as AgentTimelineItem;
  const entries = foldItem(state.entries, item, ev.turnId as string | undefined, env.timestamp);
  return {
    ...state,
    entries,
    epoch: state.epoch ?? env.epoch ?? null,
    lastSeq: typeof env.seq === "number" ? env.seq : state.lastSeq,
  };
}

function foldItem(
  entries: TimelineEntry[],
  item: AgentTimelineItem,
  turnId: string | undefined,
  timestamp: string | undefined,
): TimelineEntry[] {
  const last = entries[entries.length - 1];
  const push = () => [...entries, { key: nextKey(), item, turnId, timestamp }];
  const replaceAt = (i: number, next: AgentTimelineItem) => {
    const copy = entries.slice();
    copy[i] = { ...copy[i]!, item: next };
    return copy;
  };

  switch (item.type) {
    case "assistant_message": {
      if (
        last?.item.type === "assistant_message" &&
        last.turnId === turnId &&
        (!item.messageId || !last.item.messageId || item.messageId === last.item.messageId)
      ) {
        return replaceAt(entries.length - 1, { ...last.item, text: last.item.text + item.text });
      }
      return push();
    }
    case "reasoning": {
      if (last?.item.type === "reasoning" && last.turnId === turnId) {
        return replaceAt(entries.length - 1, { ...last.item, text: last.item.text + item.text });
      }
      return push();
    }
    case "tool_call": {
      const i = findLastIndex(entries, (e) => e.item.type === "tool_call" && e.item.callId === item.callId);
      if (i >= 0) return replaceAt(i, { ...(entries[i]!.item as typeof item), ...item });
      return push();
    }
    case "todo": {
      const i = findLastIndex(entries, (e) => e.item.type === "todo" && e.turnId === turnId);
      if (i >= 0 && turnId) return replaceAt(i, item);
      return push();
    }
    case "user_message": {
      const i = findLastIndex(
        entries,
        (e) =>
          e.item.type === "user_message" &&
          ((!!item.messageId && e.item.messageId === item.messageId) ||
            (!!item.clientMessageId && e.item.clientMessageId === item.clientMessageId)),
      );
      if (i >= 0) return replaceAt(i, item);
      return push();
    }
    default:
      return push();
  }
}

function findLastIndex<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return i;
  return -1;
}
