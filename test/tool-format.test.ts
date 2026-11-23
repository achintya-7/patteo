import { describe, expect, test } from "bun:test";
import { toolBody, toolSummary, shortenPath } from "../src/ui/agent/tool-format";

const call = (detail: any, extra: any = {}) => ({ type: "tool_call", callId: "c", name: "Bash", status: "completed", error: null, detail, ...extra }) as any;

describe("tool formatting", () => {
  test("shell summary + tail-kept output with exit code", () => {
    const out = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const item = call({ type: "shell", command: "ls  -la\n /tmp", output: out, exitCode: 2 });
    expect(toolSummary(item)).toEqual({ icon: "$", label: "", subject: "ls -la /tmp" });
    const body = toolBody(item, 5);
    expect(body[0]!.text).toBe("… 26 earlier lines");
    expect(body.at(-1)).toEqual({ text: "exit 2", tone: "error" });
  });

  test("edit summary counts diff lines; body tones", () => {
    const item = call({ type: "edit", filePath: "/repo/src/a.ts", unifiedDiff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n+more" });
    expect(toolSummary(item, "/repo").subject).toBe("src/a.ts +2 -1");
    expect(toolBody(item).map((l) => l.tone)).toEqual(["hunk", "del", "add", "add"]);
  });

  test("unknown tool falls back to compact JSON input", () => {
    const item = call({ type: "unknown", input: { query: "select:Foo" }, output: null }, { name: "ToolSearch" });
    expect(toolSummary(item)).toEqual({ icon: "⚙", label: "ToolSearch", subject: "select:Foo" });
  });

  test("failed calls append the error", () => {
    const item = call({ type: "read", filePath: "/x" }, { status: "failed", error: "ENOENT" });
    expect(toolBody(item).at(-1)).toEqual({ text: "ENOENT", tone: "error" });
  });

  test("shortenPath", () => {
    expect(shortenPath("/repo/a/b.ts", "/repo")).toBe("a/b.ts");
    expect(shortenPath(`${process.env.HOME}/x`, null)).toBe("~/x");
  });
});

import { prettyToolName } from "../src/ui/agent/tool-format";
import { truncate } from "../src/ui/text";

test("prettyToolName", () => {
  expect(prettyToolName("mcp__aftershoot__mongo_find")).toBe("aftershoot › mongo_find");
  expect(prettyToolName("mcp__claude_ai_Gmail__send_message")).toBe("claude_ai_Gmail › send_message");
  expect(prettyToolName("Bash")).toBe("Bash");
});

test("truncate keeps indentation", () => {
  expect(truncate('    "a": 1', 20)).toBe('    "a": 1');
  expect(truncate("a\nb", 10)).toBe("a b");
});

import { compactArgs } from "../src/ui/agent/tool-format";
test("compactArgs shows short scalar values, falls back to JSON", () => {
  expect(compactArgs({ database: "pricing_v2", collection: "plans", limit: 5, filter: { a: 1 } })).toBe("pricing_v2 · plans · 5");
  expect(compactArgs({ filter: { a: 1 } })).toBe('{"filter":{"a":1}}');
  expect(compactArgs({})).toBe("");
  expect(compactArgs({ query: "x".repeat(100), n: 5 })).toBe("x".repeat(59) + "… · 5");
});
