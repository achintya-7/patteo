import { describe, expect, test } from "bun:test";
import { applyStreamEvent, emptyTimeline, hydrateTimeline, type StreamEnvelope } from "../src/paseo/timeline";

const tl = (item: any, seq: number, turnId = "t1"): StreamEnvelope => ({
  event: { type: "timeline", item, turnId },
  seq,
  epoch: "E",
});

const hydrated = () => hydrateTimeline(emptyTimeline(), { epoch: "E", entries: [{ item: { type: "user_message", text: "hi", messageId: "m1" }, seqStart: 0, seqEnd: 3 }] });

describe("timeline reducer", () => {
  test("hydrate sets lastSeq from seqEnd and clears loading", () => {
    const s = hydrated();
    expect(s.lastSeq).toBe(3);
    expect(s.loading).toBe(false);
    expect(s.entries).toHaveLength(1);
  });

  test("assistant deltas append into one entry", () => {
    let s = hydrated();
    s = applyStreamEvent(s, tl({ type: "assistant_message", text: "Hel", messageId: "a" }, 4));
    s = applyStreamEvent(s, tl({ type: "assistant_message", text: "lo", messageId: "a" }, 5));
    expect(s.entries).toHaveLength(2);
    expect((s.entries[1]!.item as any).text).toBe("Hello");
  });

  test("reasoning deltas append; a different type starts a new entry", () => {
    let s = hydrated();
    s = applyStreamEvent(s, tl({ type: "reasoning", text: "a" }, 4));
    s = applyStreamEvent(s, tl({ type: "reasoning", text: "b" }, 5));
    s = applyStreamEvent(s, tl({ type: "assistant_message", text: "x" }, 6));
    s = applyStreamEvent(s, tl({ type: "reasoning", text: "c" }, 7));
    expect(s.entries.map((e) => e.item.type)).toEqual(["user_message", "reasoning", "assistant_message", "reasoning"]);
    expect((s.entries[1]!.item as any).text).toBe("ab");
  });

  test("tool_call upserts by callId", () => {
    let s = hydrated();
    s = applyStreamEvent(s, tl({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "shell", command: "" } }, 4));
    s = applyStreamEvent(s, tl({ type: "assistant_message", text: "x" }, 5));
    s = applyStreamEvent(s, tl({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "ls" } }, 6));
    expect(s.entries).toHaveLength(3);
    expect((s.entries[1]!.item as any).status).toBe("completed");
  });

  test("duplicate / old seq is ignored", () => {
    let s = hydrated();
    const before = s;
    s = applyStreamEvent(s, tl({ type: "assistant_message", text: "dup" }, 2));
    expect(s).toBe(before);
  });

  test("user_message echo dedupes by clientMessageId", () => {
    let s = hydrated();
    s = applyStreamEvent(s, tl({ type: "user_message", text: "q", clientMessageId: "c" }, 4));
    s = applyStreamEvent(s, tl({ type: "user_message", text: "q", clientMessageId: "c", messageId: "m2" }, 5));
    expect(s.entries).toHaveLength(2);
  });

  test("replacement / epoch change marks stale", () => {
    expect(applyStreamEvent(hydrated(), { event: { type: "replacement", epoch: "F" } }).stale).toBe(true);
    expect(applyStreamEvent(hydrated(), { ...tl({ type: "reasoning", text: "a" }, 9), epoch: "F" }).stale).toBe(true);
  });

  test("turn lifecycle", () => {
    let s = applyStreamEvent(hydrated(), { event: { type: "turn_started" } });
    expect(s.turn).toBe("running");
    s = applyStreamEvent(s, { event: { type: "turn_failed", error: "boom" } });
    expect(s.turn).toBe("idle");
    expect(s.lastError).toBe("boom");
  });
});

import { prependOlder } from "../src/paseo/timeline";

describe("timeline paging", () => {
  test("hydrate prefers the daemon end cursor and keeps the start cursor", () => {
    const s = hydrateTimeline(emptyTimeline(), {
      entries: [{ item: { type: "reasoning", text: "x" }, seqEnd: 5 }],
      startCursor: { epoch: "E", seq: 3 },
      endCursor: { epoch: "E", seq: 9 },
      hasOlder: true,
    });
    expect(s.lastSeq).toBe(9);
    expect(s.epoch).toBe("E");
    expect(s.startCursor).toEqual({ epoch: "E", seq: 3 });
  });

  test("prependOlder puts older entries first; epoch change marks stale", () => {
    const base = hydrateTimeline(emptyTimeline(), { epoch: "E", entries: [{ item: { type: "reasoning", text: "new" } }], hasOlder: true, startCursor: { epoch: "E", seq: 10 } });
    const p = prependOlder(base, { epoch: "E", entries: [{ item: { type: "reasoning", text: "old" } }], hasOlder: false, startCursor: { epoch: "E", seq: 1 } });
    expect(p.entries.map((e) => (e.item as any).text)).toEqual(["old", "new"]);
    expect(p.hasOlder).toBe(false);
    expect(p.startCursor?.seq).toBe(1);
    expect(prependOlder(base, { epoch: "F", entries: [] }).stale).toBe(true);
  });
});
