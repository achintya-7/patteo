import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import type { AgentPermissionRequest, AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { selection } from "../../keyboard/commands";
import { useApp, useSession } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { toolBody, toolSummary } from "../agent/tool-format";
import { truncate } from "../text";
import { Overlay } from "./Overlay";
import { parseQuestions } from "./question-model";
import { QuestionForm } from "./QuestionForm";

interface Pending {
  agentId: string;
  agentTitle: string;
  request: AgentPermissionRequest;
}

/** Every pending permission request on the active host, one at a time: y allow · n deny · ←→ next. */
export function PermissionsModal() {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const { width } = useTerminalDimensions();
  const hostId = useSession((s) => s.activeHostId);
  const agents = useSession((s) => (hostId ? s.hosts[hostId]?.agents : undefined)) ?? {};
  const pending: Pending[] = Object.values(agents).flatMap((a) =>
    (a.pendingPermissions ?? []).map((request) => ({ agentId: a.id, agentTitle: a.title || "Untitled agent", request: request as AgentPermissionRequest })),
  );
  // Prefer the agent in the open tab.
  const active = selection({ ui, store }).agentId;
  pending.sort((a, b) => Number(b.agentId === active) - Number(a.agentId === active));
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = pending[Math.min(index, pending.length - 1)];
  // An agent's question gets a form of its own; anything unparseable falls back to allow/deny.
  const questions = cur?.request.kind === "question" ? parseQuestions(cur.request.input) : null;

  const respond = async (response: AgentPermissionResponse, label: string) => {
    if (!cur || !hostId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await runtimes.get(hostId)!.respondToPermission(cur.agentId, cur.request.id, response);
      ui.actions.toast(`${label}: ${cur.request.title || cur.request.name}`, response.behavior === "allow" ? "success" : "info");
      if (pending.length <= 1) ui.actions.closeModal();
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      setError(message);
      ui.actions.toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const actions = cur?.request.actions ?? [];
  useKeyboard((k) => {
    if (k.name === "escape") return ui.actions.closeModal();
    if (!cur) return;
    if (questions) {
      // The form owns its keys; [ ] move between waiting requests.
      if (k.name === "[") return setIndex((i) => Math.max(0, i - 1));
      if (k.name === "]") return setIndex((i) => Math.min(pending.length - 1, i + 1));
      return;
    }
    if (k.name === "left" || k.name === "h") return setIndex((i) => Math.max(0, i - 1));
    if (k.name === "right" || k.name === "l" || k.name === "tab") return setIndex((i) => Math.min(pending.length - 1, i + 1));
    if (actions.length) {
      const n = Number(k.name);
      const a = n >= 1 && n <= actions.length ? actions[n - 1] : undefined;
      if (a) return void respond({ behavior: a.behavior, selectedActionId: a.id } as AgentPermissionResponse, a.label);
    }
    if (k.name === "y" || k.name === "return") return void respond({ behavior: "allow" }, "Allowed");
    if (k.name === "n") return void respond({ behavior: "deny", message: "Denied from patteo" }, "Denied");
  });

  const inner = Math.min(76, width - 4) - 4;
  if (!cur) {
    return (
      <Overlay title="Permissions" width={60} height={6} footer="esc close">
        <text fg={t.muted}>{"No pending permission requests."}</text>
      </Overlay>
    );
  }
  if (questions) {
    return (
      <QuestionForm
        key={cur.request.id}
        questions={questions}
        input={cur.request.input as Record<string, unknown> | undefined}
        agentTitle={cur.agentTitle}
        busy={busy}
        error={error}
        onRespond={(response, label) => void respond(response, label)}
        footerExtra={pending.length > 1 ? ` · [ ] ${index + 1}/${pending.length}` : ""}
      />
    );
  }
  const r = cur.request;
  const asTool = r.detail ? ({ type: "tool_call", callId: r.id, name: r.name, status: "running", error: null, detail: r.detail } as const) : null;
  const summary = asTool ? toolSummary(asTool as never) : null;
  const body = asTool ? toolBody(asTool as never, 8) : [];
  return (
    <Overlay title={`Permission ${index + 1}/${pending.length}`} width={76} height={Math.min(24, 12 + body.length)} footer={busy ? "sending…" : "←→ switch · esc later"}>
      <text fg={t.subtle} wrapMode="none">{truncate(`from ${cur.agentTitle}`, inner)}</text>
      <box height={1} />
      <text fg={t.warning} attributes={TextAttributes.BOLD}>{truncate(r.title || `${r.name} wants to run`, inner)}</text>
      {r.description ? <text fg={t.muted} wrapMode="word">{r.description}</text> : null}
      {summary ? (
        <box marginTop={1} flexDirection="column" backgroundColor={t.raised} paddingLeft={1} paddingRight={1}>
          <text wrapMode="none">
            <span fg={t.subtle}>{`${summary.icon} `}</span>
            <span fg={t.text}>{truncate([summary.label, summary.subject].filter(Boolean).join(" "), inner - 4)}</span>
          </text>
          {body.map((l, i) => (
            <text key={i} fg={t.muted} wrapMode="none">{truncate(l.text, inner - 2) || " "}</text>
          ))}
        </box>
      ) : null}
      <box flexGrow={1} />
      <text wrapMode="none">
        {actions.length ? (
          actions.map((a, i) => (
            <span key={a.id} fg={a.behavior === "allow" ? t.success : t.error}>{`${i + 1} ${a.label}   `}</span>
          ))
        ) : (
          <>
            <span fg={t.success} attributes={TextAttributes.BOLD}>{"y Allow"}</span>
            <span>{"     "}</span>
            <span fg={t.error} attributes={TextAttributes.BOLD}>{"n Deny"}</span>
          </>
        )}
      </text>
    </Overlay>
  );
}
