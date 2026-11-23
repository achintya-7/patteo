/** Pure formatting of tool calls for the timeline (one-line summary + expandable body). */
import type { ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";

export type Tone = "normal" | "muted" | "add" | "del" | "hunk" | "error";
export interface BodyLine {
  text: string;
  tone: Tone;
}

export function shortenPath(p: string, cwd?: string | null): string {
  if (cwd && p.startsWith(cwd + "/")) return p.slice(cwd.length + 1);
  const home = process.env.HOME;
  return home && p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function diffCounts(diff: string | undefined): string {
  if (!diff) return "";
  let add = 0;
  let del = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) add++;
    else if (l.startsWith("-") && !l.startsWith("---")) del++;
  }
  return add || del ? ` +${add} -${del}` : "";
}

/** "mcp__aftershoot__mongo_find" → "aftershoot › mongo_find". */
export function prettyToolName(name: string): string {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  return m ? `${m[1]} › ${m[2]}` : name;
}

/**
 * One-line rendering of a tool call, opencode-style: a small icon, a verb and the subject.
 * e.g. "$ git status", "→ Read src/a.ts", "← Edit src/a.ts +2 -1", "✱ Grep \"todo\" · 3 files".
 */
export function toolSummary(item: ToolCallTimelineItem, cwd?: string | null): { icon: string; label: string; subject: string } {
  const d = item.detail;
  switch (d.type) {
    case "shell":
      return { icon: "$", label: "", subject: oneLine(d.command) };
    case "read":
      return { icon: "→", label: "Read", subject: shortenPath(d.filePath, cwd) + (d.offset ? `:${d.offset}` : "") };
    case "edit":
      return { icon: "←", label: "Edit", subject: shortenPath(d.filePath, cwd) + diffCounts(d.unifiedDiff) };
    case "write":
      return { icon: "←", label: "Write", subject: shortenPath(d.filePath, cwd) };
    case "search": {
      const n = d.numFiles != null ? ` · ${d.numFiles} file${d.numFiles === 1 ? "" : "s"}` : "";
      if (d.toolName === "web_search") return { icon: "◈", label: "Web search", subject: oneLine(d.query) };
      return { icon: "✱", label: d.toolName === "glob" ? "Glob" : "Grep", subject: `"${oneLine(d.query)}"${n}` };
    }
    case "fetch":
      return { icon: "%", label: "Fetch", subject: d.url };
    case "worktree_setup":
      return { icon: "⚙", label: "Worktree", subject: d.branchName };
    case "sub_agent":
      return { icon: "◉", label: d.subAgentType ? `Task:${d.subAgentType}` : "Task", subject: oneLine(d.description ?? "") };
    case "plain_text":
    {
      const label = d.label || prettyToolName(item.name);
      const text = oneLine(d.text ?? "");
      // Some providers repeat the label as the text; show it once.
      return { icon: "⚙", label, subject: text === label ? "" : text };
    }
    case "plan":
      return { icon: "◇", label: "Plan", subject: "" };
    default:
      return { icon: "⚙", label: prettyToolName(item.name), subject: compactArgs((d as { input?: unknown }).input) };
  }
}

/**
 * Human-friendly one-line view of tool arguments: the short scalar values, joined.
 * {"database":"pricing_v2","collection":"plans","limit":5} → "pricing_v2 · plans · 5"
 */
export function compactArgs(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object" || Array.isArray(input)) return compactJson(input);
  const entries = Object.values(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  const values = entries
    .filter((v) => (typeof v === "string" && v.trim().length > 0) || typeof v === "number" || typeof v === "boolean")
    .map((v) => {
      const s = oneLine(String(v));
      return s.length > 60 ? s.slice(0, 59) + "…" : s;
    });
  return values.length ? values.join(" · ") : compactJson(input);
}

export function compactJson(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return oneLine(v);
  try {
    return oneLine(JSON.stringify(v));
  } catch {
    return String(v);
  }
}

const lines = (s: string | undefined | null, tone: Tone = "muted") =>
  (s ?? "").replace(/\s+$/, "").split("\n").filter((_, i, a) => !(a.length === 1 && a[0] === "")).map((text) => ({ text, tone }));

/** Expanded body, capped to `max` lines (keeps the tail for logs/output, the head otherwise). */
export function toolBody(item: ToolCallTimelineItem, max = 20): BodyLine[] {
  const d = item.detail;
  let out: BodyLine[] = [];
  let keepTail = false;
  switch (d.type) {
    case "shell":
      out = lines(d.output);
      keepTail = true;
      if (d.exitCode != null && d.exitCode !== 0) out.push({ text: `exit ${d.exitCode}`, tone: "error" });
      break;
    case "edit":
      out = d.unifiedDiff
        ? d.unifiedDiff.split("\n").filter((l) => !l.startsWith("+++") && !l.startsWith("---")).map((text) => ({
            text,
            tone: text.startsWith("+") ? "add" : text.startsWith("-") ? "del" : text.startsWith("@@") ? "hunk" : "muted",
          }))
        : [...lines(d.oldString).map((l) => ({ ...l, text: "- " + l.text, tone: "del" as Tone })), ...lines(d.newString).map((l) => ({ ...l, text: "+ " + l.text, tone: "add" as Tone }))];
      break;
    case "write":
    case "read":
      out = lines(d.content);
      break;
    case "search":
      out = d.filePaths?.length ? d.filePaths.map((text) => ({ text, tone: "muted" as Tone })) : d.webResults?.length ? d.webResults.map((r) => ({ text: `${r.title} — ${r.url}`, tone: "muted" as Tone })) : lines(d.content);
      break;
    case "fetch":
      out = lines(d.result);
      break;
    case "worktree_setup":
      out = lines(d.log);
      keepTail = true;
      break;
    case "sub_agent":
      out = d.actions?.length ? d.actions.map((a) => ({ text: `${a.toolName}${a.summary ? ` ${a.summary}` : ""}`, tone: "muted" as Tone })) : lines(d.log);
      keepTail = true;
      break;
    case "plain_text":
      out = lines(d.text);
      break;
    case "plan":
      out = lines(d.text, "normal");
      break;
    default: {
      const u = d as { input?: unknown; output?: unknown };
      out = [...lines(prettyJson(u.input)), ...(u.output != null ? [{ text: "→", tone: "muted" as Tone }, ...lines(prettyJson(u.output))] : [])];
    }
  }
  if (item.status === "failed" && item.error != null) out.push({ text: compactJson(item.error), tone: "error" });
  if (out.length <= max) return out;
  const hidden = out.length - max;
  return keepTail
    ? [{ text: `… ${hidden} earlier line${hidden === 1 ? "" : "s"}`, tone: "muted" }, ...out.slice(-max)]
    : [...out.slice(0, max), { text: `… ${hidden} more line${hidden === 1 ? "" : "s"}`, tone: "muted" }];
}

function prettyJson(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
