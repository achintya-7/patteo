/**
 * Renders an agent's most recent assistant reply through the app's Markdown component and prints the full frame.
 * Usage: bun scripts/render-reply.tsx [width] [match-text]
 */
import { testRender } from "@opentui/react/test-utils";
import { useRenderer } from "@opentui/react";
import { useMemo } from "react";
import { SyntaxStyle } from "@opentui/core";
import { createPaseoClient } from "@getpaseo/client";
import { Markdown } from "../src/ui/agent/Markdown";
import { syntaxStyles } from "../src/theme/syntax";
import { catppuccinMocha } from "../src/theme/theme";

const origError = console.error;
console.error = (...a: unknown[]) => { if (!String(a[0]).includes("act(")) origError(...a); };
const width = Number(process.argv[2] ?? 90);
const match = process.argv[3] ?? "patteo test sheet";

const c = createPaseoClient({ url: "ws://127.0.0.1:6767/ws" });
await c.connect();
let md = "";
for (const e of (await c.agents.list()).entries) {
  const p: any = await c.agents.ref(e.agent.id).timeline.refetch({ direction: "tail", limit: 300 });
  const hit = [...p.entries].reverse().find((x: any) => x.item.type === "assistant_message" && x.item.text.includes(match));
  if (hit) { md = hit.item.text.trim(); break; }
}
await c.close();
if (!md) { console.log("reply not found"); process.exit(1); }

function M() {
  const r = useRenderer();
  const style = useMemo(() => SyntaxStyle.fromStyles(syntaxStyles(catppuccinMocha), r.nativeScene!), [r]);
  return <box paddingLeft={3}><Markdown content={md} syntaxStyle={style} fg={catppuccinMocha.text} /></box>;
}
const t = await testRender(<M />, { width, height: 400 });
for (let i = 0; i < 8; i++) { await Bun.sleep(30); await t.renderOnce(); }
const lines = t.captureCharFrame().split("\n").map((l) => l.replace(/\s+$/, ""));
while (lines.length && !lines.at(-1)) lines.pop();
console.log(lines.join("\n"));
process.exit(0);
