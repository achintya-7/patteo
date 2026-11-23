import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { viewShouldIgnore } from "../../keyboard/dispatch";
import { useEffect, useRef, useState } from "react";
import { useApp, useSession, useSettings } from "../../stores/context";
import { Skeleton, WorkingLine } from "../motion/Motion";
import { timelineKey } from "../../stores/session";
import { tabsKey } from "../../stores/ui";
import { useSyntaxStyle } from "../../theme/syntax";
import { useTheme } from "../../theme/theme";
import { GUTTER, TimelineItem } from "./TimelineItem";
import { buildBlocks, summarize, type Block } from "./blocks";
import type { TimelineEntry } from "../../paseo/timeline";

/** Subscribes to an agent's timeline while mounted (ref-counted in the runtime). */
function useTimeline(hostId: string, agentId: string) {
  const { runtimes } = useApp();
  useEffect(() => runtimes.get(hostId)?.openTimeline(agentId), [hostId, agentId]);
  return useSession((s) => s.timelines[timelineKey(hostId, agentId)]);
}

/** What the agent is doing right now, from its latest activity. */
function workingLabel(entries: TimelineEntry[]): string {
  const last = entries[entries.length - 1]?.item;
  if (last?.type === "reasoning") return "Thinking…";
  if (last?.type === "tool_call" && last.status === "running") return "Running tools…";
  if (last?.type === "assistant_message") return "Writing…";
  return "Working…";
}

/** Thin vertical guide on the left of an activity group. */
const GUIDE = {
  topLeft: "", bottomLeft: "", topRight: "", bottomRight: "", horizontal: " ",
  vertical: "│", topT: "", bottomT: "", leftT: "", rightT: "", cross: "",
};

export function AgentView({ hostId, workspaceId, agentId, width, height }: {
  hostId: string;
  workspaceId: string;
  agentId: string;
  width: number;
  height: number;
}) {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const timeline = useTimeline(hostId, agentId);
  const agent = useSession((s) => s.hosts[hostId]?.agents[agentId]);
  const syntaxStyle = useSyntaxStyle();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  /** `e`: open every activity group. Per-group clicks are stored in groupToggles. */
  const expandDefault = useSettings((x) => x.settings.expandActivity);
  const thoughtsDefault = useSettings((x) => x.settings.showThoughts);
  const [expandAll, setExpandAll] = useState(expandDefault);
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({});
  const [showThoughts, setShowThoughts] = useState(thoughtsDefault);
  useEffect(() => setExpandAll(expandDefault), [expandDefault]);
  useEffect(() => setShowThoughts(thoughtsDefault), [thoughtsDefault]);

  useEffect(() => {
    setOverrides({});
    setGroupToggles({});
  }, [agentId]);

  const isActive = () => {
    const u = ui.getState();
    if (u.focus !== "main" || u.pickerOpen) return false;
    return u.tabs[tabsKey(hostId, workspaceId)]?.active === agentId && store.getState().activeHostId === hostId;
  };

  useKeyboard((k) => {
    if (viewShouldIgnore(k)) return;
    if (!isActive()) return;
    const sb = scrollRef.current;
    if (!sb) return;
    const page = Math.max(1, height - 2);
    if (k.name === "j" || k.name === "down") return sb.scrollBy(1);
    if (k.name === "k" || k.name === "up") return sb.scrollBy(-1);
    if (k.ctrl && k.name === "d") return sb.scrollBy(Math.floor(page / 2));
    if (k.ctrl && k.name === "u") return sb.scrollBy(-Math.floor(page / 2));
    if (k.name === "pagedown" || k.name === "space") return sb.scrollBy(page);
    if (k.name === "pageup") return sb.scrollBy(-page);
    if (k.name === "g" && k.shift) return sb.scrollTo(sb.scrollHeight);
    if (k.name === "end") return sb.scrollTo(sb.scrollHeight);
    if (k.name === "g" || k.name === "home") {
      // At the top already: page in older history.
      if (sb.scrollTop <= 0) void runtimes.get(hostId)?.loadOlder(agentId);
      return sb.scrollTo(0);
    }
    if (k.name === "e") {
      setGroupToggles({});
      return setExpandAll((v) => !v);
    }
    if (k.name === "r") return setShowThoughts((v) => !v);
  });

  if (!timeline || timeline.loading) {
    // Skeleton in the conversation's own shape: a message block, activity, then an answer.
    return (
      <box flexGrow={1} flexDirection="column" paddingTop={1}>
        <box paddingLeft={1} marginBottom={1}>
          <WorkingLine label="Loading conversation…" />
        </box>
        <Skeleton rows={2} width={Math.max(10, width - 6)} widths={[0.7, 0.45]} indent={2} />
        <box height={1} />
        <Skeleton rows={3} width={Math.max(10, width - 6)} widths={[0.35, 0.5, 0.3]} indent={5} />
        <box height={1} />
        <Skeleton rows={4} width={Math.max(10, width - 6)} widths={[0.9, 0.82, 0.88, 0.5]} indent={3} />
      </box>
    );
  }

  const innerWidth = Math.max(10, width - 2);
  // The daemon's activeTurn is authoritative: an agent can report "running" while its
  // turn already closed (background work), and that left a spinner on a finished reply.
  const running = agent ? (agent.activeTurn !== undefined ? !!agent.activeTurn : agent.status === "running" || timeline.turn === "running") : timeline.turn === "running";
  const turnStartedAt = agent?.activeTurn?.startedAt ? Date.parse(agent.activeTurn.startedAt) : undefined;
  const error = timeline.lastError ?? agent?.lastError ?? null;
  const blocks = buildBlocks(timeline.entries, { running, expandAll, toggled: groupToggles });
  // Activity sits one level deeper than the answer: GUTTER + "│ " guide.
  const activityWidth = Math.max(10, innerWidth - GUTTER - 2);
  const lastAnswerKey = [...blocks].reverse().find((b) => b.kind === "answer")?.key;

  const renderEntry = (entry: TimelineEntry, width: number, streaming = false) => {
    const expanded = overrides[entry.key] ?? false;
    return (
      <TimelineItem
        key={entry.key}
        entry={entry}
        width={width}
        expanded={expanded}
        showThoughts={showThoughts}
        syntaxStyle={syntaxStyle}
        cwd={agent?.cwd ?? null}
        streaming={streaming}
        onToggle={() => setOverrides((o) => ({ ...o, [entry.key]: !expanded }))}
      />
    );
  };

  const toggleGroup = (b: Extract<Block, { kind: "activity" }>) =>
    setGroupToggles((g) => ({ ...g, [b.key]: !(g[b.key] ?? (b.collapsed || b.hidden > 0 ? false : true)) }));

  return (
    <scrollbox
      ref={scrollRef}
      flexGrow={1}
      stickyScroll
      stickyStart="bottom"
      viewportCulling
      scrollY
      contentOptions={{ flexDirection: "column", paddingRight: 1 }}
    >
      {timeline.hasOlder ? (
        <box flexShrink={0} paddingLeft={GUTTER} marginBottom={1}>
          <text fg={t.subtle}>{timeline.loadingOlder ? "Loading earlier messages…" : "Earlier messages · g at the top to load"}</text>
        </box>
      ) : null}
      {blocks.length === 0 ? (
        <box flexShrink={0} paddingLeft={GUTTER}>
          <text fg={t.subtle}>{"No messages yet"}</text>
        </box>
      ) : null}
      {blocks.map((b, i) => (
        <box key={b.key} flexShrink={0} marginTop={i === 0 ? 0 : 1} flexDirection="column">
          {b.kind !== "activity" ? (
            renderEntry(b.entry, innerWidth, running && b.key === lastAnswerKey && i === blocks.length - 1)
          ) : (
            <box paddingLeft={GUTTER} flexShrink={0}>
              <box border={["left"]} customBorderChars={GUIDE} borderColor={t.element} paddingLeft={1} flexDirection="column" flexShrink={0}>
                {b.collapsed ? (
                  <box height={1} onMouseDown={() => toggleGroup(b)}>
                    <text wrapMode="none">
                      <span fg={t.subtle}>{"▸ "}</span>
                      <span fg={t.subtle}>{summarize(b.counts)}</span>
                      {b.counts.failed ? <span fg={t.error}>{` · ${b.counts.failed} failed`}</span> : null}
                    </text>
                  </box>
                ) : (
                  <>
                    {b.hidden > 0 ? (
                      <box height={1} onMouseDown={() => toggleGroup(b)}>
                        <text fg={t.subtle} wrapMode="none">{`⋯ ${b.hidden} earlier step${b.hidden === 1 ? "" : "s"}`}</text>
                      </box>
                    ) : null}
                    {b.shown.map((entry) => renderEntry(entry, activityWidth))}
                  </>
                )}
              </box>
            </box>
          )}
        </box>
      ))}
      {running ? (
        <box flexShrink={0} paddingLeft={GUTTER} marginTop={1}>
          <WorkingLine label={workingLabel(timeline.entries)} since={turnStartedAt} />
        </box>
      ) : null}
      {error && !running ? (
        <box flexShrink={0} paddingLeft={GUTTER} marginTop={1}>
          <text fg={t.error} wrapMode="word">{String(error).split("\n")[0]}</text>
        </box>
      ) : null}
      <box height={1} flexShrink={0} />
    </scrollbox>
  );
}
