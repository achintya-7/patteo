/**
 * Renders the real App against the live local daemon in OpenTUI's test renderer,
 * drives it with mock keys and prints full frames. Usage: bun scripts/frames.tsx [width] [height]
 */
import { testRender } from "@opentui/react/test-utils";
import { defaultHostsFile } from "../src/config/hosts";
import { AppRoot, createAppState } from "../src/app-root";

setTimeout(() => {
  console.error("frames: timed out");
  process.exit(2);
}, Number(process.env.FRAMES_TIMEOUT ?? 20_000));
// React act() warnings are expected outside a test runner.
const origError = console.error;
console.error = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].includes("not wrapped in act")) return;
  origError(...a);
};

const width = Number(process.argv[2] ?? 110);
const height = Number(process.argv[3] ?? 22);
const hostsFile = process.env.FRAMES_URL
  ? { defaultHostId: "local", hosts: [{ id: "local", label: "test-host", url: process.env.FRAMES_URL }] }
  : defaultHostsFile();
const state = createAppState({ hostsFile, settings: process.env.FRAMES_THEME ? { theme: process.env.FRAMES_THEME } : {} });
const { store, runtimes } = state;
runtimes.start();

const t = await testRender(
  <AppRoot state={state} onQuit={() => {}} />,
  { width, height },
);

const show = async (label: string) => {
  await Bun.sleep(60);
  await t.renderOnce();
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, width - label.length - 4))}`);
  console.log(t.captureCharFrame());
};

for (let i = 0; i < (process.env.FRAMES_URL ? 40 : 200); i++) {
  const h = store.getState().hosts.local;
  if (h?.loaded.workspaces && h.loaded.projects) break;
  await Bun.sleep(25);
}
// FRAMES_SELECT="PR #585" opens the workspace whose title contains that text (no key hunting).
if (process.env.FRAMES_SELECT) {
  const ws = Object.values(store.getState().hosts.local?.workspaces ?? {}).find((w) => String(w.title).includes(process.env.FRAMES_SELECT!));
  if (ws) {
    state.ui.actions.selectWorkspace("local", ws.id);
    state.ui.actions.setFocus("main");
  } else console.error(`frames: no workspace matching "${process.env.FRAMES_SELECT}"`);
}
await show("initial");
const steps = (process.env.KEYS ?? "j,j,return").split(",").filter(Boolean);
for (const k of steps) {
  if (process.env.FRAMES_TRACE) {
    const u = state.ui.getState();
    const sel = u.selectedWorkspace.local;
    const tab = sel ? u.tabs[`local:${sel}`]?.active : undefined;
    const ag = tab ? store.getState().hosts.local?.agents[tab] : undefined;
    console.error(`trace ${k}: focus=${u.focus} tab=${tab?.slice(0, 8)} status=${ag?.status} activeTurn=${JSON.stringify(ag?.activeTurn)}`);
  }
  if (/^sleep\d+$/.test(k)) {
    await Bun.sleep(Number(k.slice(5)));
    await t.renderOnce();
  } else if (k === "wait") {
    await Bun.sleep(100);
    await t.renderOnce();
  } else if (["up", "down", "left", "right"].includes(k)) t.mockInput.pressArrow(k as "up");
  else if (k === "escape") t.mockInput.pressEscape();
  else if (k === "backspace") t.mockInput.pressBackspace();
  else if (k === "shift+tab") t.mockInput.pressTab({ shift: true });
  else if (k === "tab") t.mockInput.pressTab();
  else if (k === "return") t.mockInput.pressEnter();
  else if (k === "shift+return") t.mockInput.pressEnter({ shift: true });
  else if (k === "alt+return") t.mockInput.pressEnter({ meta: true });
  else if (k.startsWith("ctrl+")) t.mockInput.pressKey(k.slice(5), { ctrl: true });
  else t.mockInput.pressKey(k);
}
if (process.env.FRAMES_BEFORE) await show("before final keys");
await show(`after keys: ${steps.join(" ")}`);
void runtimes.disposeAll();
process.exit(0);
