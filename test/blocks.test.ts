import { describe, expect, test } from "bun:test";
import { buildBlocks, summarize, LIVE_TAIL } from "../src/ui/agent/blocks";

let n = 0;
const e = (item: any) => ({ key: `k${++n}`, item });
const user = () => e({ type: "user_message", text: "q" });
const answer = () => e({ type: "assistant_message", text: "a" });
const thought = () => e({ type: "reasoning", text: "t" });
const tool = (status = "completed") => e({ type: "tool_call", callId: String(++n), name: "Bash", status, error: null, detail: { type: "shell", command: "ls" } });
const opts = (o: Partial<{ running: boolean; expandAll: boolean; toggled: Record<string, boolean> }> = {}) => ({ running: false, expandAll: false, toggled: {}, ...o });

describe("timeline blocks", () => {
  test("finished activity runs collapse; short runs stay open", () => {
    const b = buildBlocks([user(), thought(), tool(), tool("failed"), answer(), thought(), answer()], opts());
    expect(b.map((x) => x.kind)).toEqual(["user", "activity", "answer", "activity", "answer"]);
    const long = b[1] as any;
    expect(long.collapsed).toBe(true);
    expect(long.counts).toEqual({ thoughts: 1, tools: 2, failed: 1, other: 0 });
    expect((b[3] as any).collapsed).toBe(false);
    expect((b[3] as any).shown).toHaveLength(1);
  });

  test("the live run stays open and shows only the latest steps", () => {
    const steps = Array.from({ length: LIVE_TAIL + 3 }, () => tool());
    const b = buildBlocks([user(), ...steps], opts({ running: true }));
    const live = b.at(-1) as any;
    expect(live.live).toBe(true);
    expect(live.collapsed).toBe(false);
    expect(live.hidden).toBe(3);
    expect(live.shown).toEqual(steps.slice(-LIVE_TAIL));
  });

  test("expandAll opens everything; a per-group toggle overrides it", () => {
    const entries = [user(), thought(), tool(), tool(), answer()];
    const key = buildBlocks(entries, opts())[1]!.key;
    expect((buildBlocks(entries, opts({ expandAll: true }))[1] as any).collapsed).toBe(false);
    expect((buildBlocks(entries, opts({ toggled: { [key]: true } }))[1] as any).collapsed).toBe(false);
    expect((buildBlocks(entries, opts({ expandAll: true, toggled: { [key]: false } }))[1] as any).collapsed).toBe(true);
  });

  test("summary text", () => {
    expect(summarize({ thoughts: 1, tools: 6, failed: 1, other: 0 })).toBe("1 thought · 6 tools");
    expect(summarize({ thoughts: 0, tools: 0, failed: 0, other: 2 })).toBe("2 more");
  });
});
