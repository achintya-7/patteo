/** Drives the real App against the live daemon with resizes, navigation and live updates; exits non-zero on any render error. */
import { testRender } from "@opentui/react/test-utils";
import { defaultHostsFile } from "../src/config/hosts";
import { AppRoot, createAppState } from "../src/app-root";
const oe = console.error; console.error = (...a: any[]) => { if (String(a[0]).includes("act(")) return; oe(...a); };
process.on("uncaughtException", (e) => { console.log("UNCAUGHT", e.stack?.split("\n").slice(0, 4).join(" | ")); process.exit(1); });
const state = createAppState({ hostsFile: defaultHostsFile() }); state.runtimes.start();
const t = await testRender(<AppRoot state={state} onQuit={() => {}} />, { width: 120, height: 30 });
await Bun.sleep(800);
const step = async (label: string, fn: () => void) => {
  try { fn(); await Bun.sleep(40); await t.renderOnce(); } catch (e: any) { console.log("FAIL at", label, e.message); process.exit(1); }
};
for (const w of [140, 100, 89, 70, 59, 40, 30, 120]) await step(`resize ${w}`, () => t.resize(w, 24));
for (let i = 0; i < 14; i++) {
  await step(`j${i}`, () => t.mockInput.pressKey("j"));
  await step(`enter${i}`, () => t.mockInput.pressEnter());
  await step(`o${i}`, () => t.mockInput.pressKey("o"));
  await step(`esc${i}`, () => t.mockInput.pressEscape());
  await step(`tab${i}`, () => t.mockInput.pressTab());
  await step(`tab2${i}`, () => t.mockInput.pressTab());
}
await step("ctrl+b", () => t.mockInput.pressKey("b", { ctrl: true }));
await step("ctrl+b", () => t.mockInput.pressKey("b", { ctrl: true }));
// Dialogs, composer and every theme.
const press = (k: string, mods?: { ctrl?: boolean; shift?: boolean }) => () => t.mockInput.pressKey(k, mods);
for (const [label, fn] of [
  ["palette", press("k", { ctrl: true })], ["type", press("a")], ["esc", () => t.mockInput.pressEscape()],
  ["help", press("?")], ["esc", () => t.mockInput.pressEscape()],
  ["hosts", press("h", { shift: true })], ["esc", () => t.mockInput.pressEscape()],
  ["theme", press("t", { shift: true })],
] as [string, () => void][]) { await step(label, fn); await Bun.sleep(30); }
for (let i = 0; i < 16; i++) await step(`theme${i}`, () => t.mockInput.pressArrow("right"));
await step("esc", () => t.mockInput.pressEscape()); await Bun.sleep(30);
await step("esc", () => t.mockInput.pressEscape()); await Bun.sleep(30);
for (const k of ["j", "j", "j", "j", "j", "j", "j"]) await step("nav", press(k));
await step("open", () => t.mockInput.pressEnter()); await Bun.sleep(150);
// Files / Changes / PR panel: expand a folder, open a file and a diff, view the PR, open the
// create-PR dialog (never confirmed), then close everything.
await step("panel", press("C")); await Bun.sleep(900);
await step("files expand", () => t.mockInput.pressEnter()); await Bun.sleep(400);
await step("files down", press("j"));
await step("files hidden", press(".")); await Bun.sleep(60);
await step("files hidden", press(".")); await Bun.sleep(60);
await step("tab changes", press("]")); await Bun.sleep(600);
await step("changes diff", () => t.mockInput.pressEnter()); await Bun.sleep(300);
await step("diff esc", () => t.mockInput.pressEscape()); await Bun.sleep(100);
await step("changes mode", press("m")); await Bun.sleep(600);
await step("tab pr", press("]")); await Bun.sleep(300);
await step("pr create", () => t.mockInput.pressEnter()); await Bun.sleep(200);
await step("pr esc", () => t.mockInput.pressEscape()); await Bun.sleep(50);
await step("tab files", press("1")); await Bun.sleep(100);
for (const w of [100, 90, 80]) await step(`panel resize ${w}`, () => t.resize(w, 24));
await step("resize back", () => t.resize(120, 30));
await step("panel off", press("C")); await Bun.sleep(100);
await step("tab", () => t.mockInput.pressTab()); await Bun.sleep(30);
await step("compose", press("i")); await Bun.sleep(30);
for (const k of "hello q j") await step("type", press(k));
await step("newline", () => t.mockInput.pressEnter({ meta: true }));
await step("clear", () => t.mockInput.pressCtrlC()); await Bun.sleep(30);
await step("leave", () => t.mockInput.pressEscape()); await Bun.sleep(30);
await step("new agent", press("n")); await Bun.sleep(400);
await step("esc", () => t.mockInput.pressEscape()); await Bun.sleep(30);
console.log("dialogs, composer and themes: no crash");
console.log("no crash; waiting for live updates 8s");
for (let i = 0; i < 16; i++) await step(`live${i}`, () => {}), await Bun.sleep(500);
console.log("OK");
process.exit(0);
