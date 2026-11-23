/**
 * The README's demo recording: the real UI in a real terminal, drawn from demo data
 * (no daemon, nothing private). `docs/demo.tape` drives it with vhs; run it by hand to look:
 *
 *   bun scripts/demo.tsx            # catppuccin-mocha
 *   DEMO_THEME=nord bun scripts/demo.tsx
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { AppRoot } from "../src/app-root";
import { setMotionFrozen } from "../src/ui/motion/clock";
import { QUESTION, demoState, seed, seedPanel } from "./demo-data";

// Frozen by default: a spinner ticks the shared clock every 80ms, and its repaints tear
// through the modal's background in the recording. DEMO_MOTION=1 keeps them.
if (process.env.DEMO_MOTION !== "1") setMotionFrozen(true);

const state = demoState({ theme: process.env.DEMO_THEME ?? "catppuccin-mocha", transparent: false });
seed(state, { workspace: "w-checkout", agent: "a-checkout" }, { pending: QUESTION });
seedPanel(state);
state.ui.actions.setFocus("composer");

const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#11111b" });
renderer.on("destroy", () => process.exit(0));
createRoot(renderer).render(<AppRoot state={state} onQuit={() => renderer.destroy()} />);
