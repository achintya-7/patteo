/**
 * Real end-to-end check against the local daemon: create an agent (cheap model) in a scratch
 * directory, wait for its reply, send a follow-up, then archive it. Exercises the same
 * HostRuntime methods the UI uses. Usage: bun scripts/e2e-agent.ts [provider/model]
 */
import { defaultHostsFile } from "../src/config/hosts";
import { RuntimeManager } from "../src/paseo/runtime-manager";
import { createSessionStore, timelineKey } from "../src/stores/session";

const model = process.argv[2] ?? "claude/haiku";
const store = createSessionStore();
const mgr = new RuntimeManager(store, { hostsFile: defaultHostsFile() });
mgr.start();
const rt = mgr.get("local")!;
const until = async (pred: () => boolean, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(100);
  }
};
const step = (s: string) => console.log(`• ${s}`);

try {
  await until(() => !!store.getState().hosts.local?.loaded.agents, 10_000, "connection");
  step("connected");
  const handle = await rt.createAgent({ cwd: "/tmp/patteo-e2e", config: { provider: model, modeId: "plan" }, prompt: "Reply with exactly one word: pong", title: "patteo e2e (safe to delete)" });
  step(`created agent ${handle.id.slice(0, 8)} with ${model}`);
  const release = rt.openTimeline(handle.id);
  const key = timelineKey("local", handle.id);
  const answer = () => store.getState().timelines[key]?.entries.filter((e) => e.item.type === "assistant_message").map((e) => (e.item as { text: string }).text).join(" ") ?? "";
  await until(() => /pong/i.test(answer()), 90_000, "first reply");
  step(`reply streamed into the timeline: "${answer().trim()}"`);
  // Plan mode ends a turn with a plan-approval permission: answer it like the Permissions dialog does.
  const agentNow = () => store.getState().hosts.local!.agents[handle.id];
  await until(() => (agentNow()?.pendingPermissions?.length ?? 0) > 0 || agentNow()?.status !== "running", 60_000, "turn end or permission");
  const pending = agentNow()?.pendingPermissions?.[0] as { id: string; kind: string; actions?: { id: string; label: string; behavior: "allow" | "deny" }[] } | undefined;
  if (pending) {
    const reject = pending.actions?.find((a) => a.behavior === "deny");
    await rt.respondToPermission(handle.id, pending.id, { behavior: "deny", ...(reject ? { selectedActionId: reject.id } : {}), message: "e2e" } as never);
    await until(() => (agentNow()?.pendingPermissions?.length ?? 0) === 0, 20_000, "permission resolved");
    step(`answered ${pending.kind} permission with ${reject?.label ?? "deny"}`);
  }
  await until(() => agentNow()?.status !== "running", 60_000, "turn end");
  await rt.send(handle.id, "Now reply with exactly one word: ping");
  await until(() => /ping/i.test(answer()), 90_000, "second reply");
  step(`follow-up sent and answered: "${answer().trim()}"`);
  const modes = store.getState().hosts.local!.agents[handle.id]?.availableModes ?? [];
  if (modes.length > 1) {
    const target = modes.find((m) => m.id !== store.getState().hosts.local!.agents[handle.id]?.currentModeId)!;
    await until(() => store.getState().hosts.local!.agents[handle.id]?.status !== "running", 60_000, "turn end");
    await rt.setMode(handle.id, target.id);
    await until(() => store.getState().hosts.local!.agents[handle.id]?.currentModeId === target.id, 10_000, "mode change");
    step(`mode switched to ${target.label}`);
  }
  release();
  await rt.archive(handle.id);
  await until(() => !store.getState().hosts.local!.agents[handle.id] || !!store.getState().hosts.local!.agents[handle.id]!.archivedAt, 10_000, "archive");
  step("archived");
  const ws = handle.workspaceId;
  if (ws) {
    await rt.api.workspaces.archive(ws).catch(() => {});
    step("scratch workspace archived");
  }
  console.log("E2E OK");
} catch (err) {
  console.log("E2E FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await mgr.disposeAll();
  process.exit();
}
