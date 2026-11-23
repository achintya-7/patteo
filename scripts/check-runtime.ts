/** Headless integration check: connect via RuntimeManager, load everything, follow one timeline. */
import { createSessionStore, timelineKey } from "../src/stores/session";
import { RuntimeManager } from "../src/paseo/runtime-manager";
import { defaultHostsFile } from "../src/config/hosts";
import { isVersionSkewed } from "../src/paseo/host-runtime";

const store = createSessionStore();
const hostsFile = defaultHostsFile();
hostsFile.hosts.push({ id: "dead", label: "dead", url: "ws://127.0.0.1:1/ws" });
const mgr = new RuntimeManager(store, { hostsFile }); // in-memory: never writes hosts.json
const t0 = performance.now();
mgr.start();

const until = async (pred: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await Bun.sleep(25);
  return pred();
};

await until(() => { const h = store.getState().hosts.local!; return h.loaded.agents && h.loaded.workspaces && h.loaded.projects; });
const h = store.getState().hosts.local!;
console.log(`local: ${h.connection.status} v${h.serverVersion} skew=${isVersionSkewed(h.serverVersion)} in ${(performance.now() - t0).toFixed(0)}ms`);
console.log(`  projects=${Object.keys(h.projects).length} workspaces=${Object.keys(h.workspaces).length} agents=${Object.keys(h.agents).length}`);

const agent = Object.values(h.agents).find((a) => a.status === "running") ?? Object.values(h.agents)[0]!;
const release = mgr.get("local")!.openTimeline(agent.id);
const key = timelineKey("local", agent.id);
await until(() => store.getState().timelines[key]?.loading === false);
const before = store.getState().timelines[key]!.entries.length;
console.log(`timeline "${agent.title?.slice(0, 40)}" (${agent.status}): ${before} entries, lastSeq=${store.getState().timelines[key]!.lastSeq}`);
await Bun.sleep(Number(process.env.LIVE_MS ?? 4000));
const after = store.getState().timelines[key]!;
console.log(`after live window: ${after.entries.length} entries, lastSeq=${after.lastSeq}, stale=${after.stale}`);
release();

const dead = store.getState().hosts.dead!.connection;
console.log("dead host:", JSON.stringify(dead));
await mgr.disposeAll();
process.exit(0);
