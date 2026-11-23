/**
 * Renders the README screenshots: the real UI, drawn from made-up demo data (no daemon, nothing
 * private), captured cell by cell and written as SVG with the theme's own colours.
 *
 *   bun scripts/screenshots.tsx            → docs/screenshots/*.svg
 *   bun scripts/screenshots.tsx hero pr    → just those scenes
 */
import { TextAttributes } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppRoot } from "../src/app-root";
import { HOST, demoState, seed, seedPanel } from "./demo-data";
import type { AppContextValue } from "../src/stores/context";
import { setMotionFrozen } from "../src/ui/motion/clock";
import { emptyChanges, type ChangesState, type DiffFile, type DiffToken } from "../src/paseo/changes";
import { emptyFiles, type DirEntry } from "../src/paseo/files";
import { emptyTimeline, hydrateTimeline } from "../src/paseo/timeline";
import { changesKey, timelineKey } from "../src/stores/session";
import { findTheme } from "../src/theme/themes";
import type { Theme } from "../src/theme/theme";

const OUT = join(import.meta.dir, "..", "docs", "screenshots");
// ── scenes ───────────────────────────────────────────────────────────────────

interface Scene {
  theme: string;
  width: number;
  height: number;
  title: string;
  setup: (s: AppContextValue) => void;
}

const SCENES: Record<string, Scene> = {
  changes: {
    theme: "tokyo-night", width: 136, height: 34, title: "patteo: Changes",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      s.ui.actions.toggleSidebar(); // more room for the diff
      s.ui.actions.openPanel("changes");
      s.ui.actions.setDiffPath("src/checkout/card-field.tsx");
      s.ui.actions.setFocus("main");
    },
  },
  files: {
    theme: "gruvbox-dark", width: 136, height: 34, title: "patteo: Files",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      for (const p of ["src", "src/checkout"]) s.ui.actions.toggleExpanded(`${HOST}:w-checkout:${p}`, true);
      s.ui.actions.openPanel("files");
      s.ui.actions.setFocus("panel");
    },
  },
  pr: {
    theme: "catppuccin-latte", width: 136, height: 34, title: "patteo: Pull request",
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      seedPanel(s);
      s.ui.actions.openPanel("pr");
    },
  },
  "question-bar": {
    theme: "catppuccin-mocha", width: 124, height: 30, title: "patteo: an agent needs an answer",
    setup(s) {
      seed(s, { workspace: "w-flaky", agent: "a-flaky" });
      s.ui.actions.setFocus("main");
    },
  },
  question: {
    theme: "nord", width: 124, height: 34, title: "patteo: an agent asks",
    setup(s) {
      seed(s, { workspace: "w-flaky", agent: "a-flaky" });
      s.ui.actions.openModal({ kind: "permissions" });
    },
    // Answer the first question (the caret moves on by itself), then type an "Other" answer to the second.
  },
};

// One small scene per theme for the README's theme gallery.
for (const theme of ["dracula", "rose-pine", "kanagawa", "one-dark", "gruvbox-light", "solarized-dark"]) {
  SCENES[`theme-${theme}`] = {
    theme, width: 96, height: 22, title: theme,
    setup(s) {
      seed(s, { workspace: "w-checkout", agent: "a-checkout" });
      s.ui.actions.setFocus("main");
    },
  };
}

// ── capture → SVG ────────────────────────────────────────────────────────────

const CW = 8.4;
const CH = 18;
const PAD = 14;
const BAR = 34;

type RGBA = [number, number, number, number];
/** A colour as the renderer hands it over: an object wrapping a typed array, 0-255 per channel. */
interface RendererColor { buffer: ArrayLike<number> }
interface CapturedSpan { text: string; fg: RendererColor; bg: RendererColor; attributes: number; width: number }
const rgba = (c: RendererColor): RGBA => [c.buffer[0]!, c.buffer[1]!, c.buffer[2]!, c.buffer[3] ?? 255];

/** Block-drawing glyphs as a fraction of the cell: x, y, width, height, opacity. */
const BLOCKS: Record<string, { x: number; y: number; w: number; h: number; o: number }> = {
  "█": { x: 0, y: 0, w: 1, h: 1, o: 1 },
  "▌": { x: 0, y: 0, w: 0.5, h: 1, o: 1 },
  "▐": { x: 0.5, y: 0, w: 0.5, h: 1, o: 1 },
  "▀": { x: 0, y: 0, w: 1, h: 0.5, o: 1 },
  "▄": { x: 0, y: 0.5, w: 1, h: 0.5, o: 1 },
  "░": { x: 0, y: 0, w: 1, h: 1, o: 0.25 },
  "▒": { x: 0, y: 0, w: 1, h: 1, o: 0.5 },
  "▓": { x: 0, y: 0, w: 1, h: 1, o: 0.75 },
};

const hex = ([r, g, b]: RGBA) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textEl(x: number, y: number, text: string, fg: RGBA, attributes: number, cells: number): string {
  const bold = attributes & TextAttributes.BOLD ? ' font-weight="700"' : "";
  const italic = attributes & TextAttributes.ITALIC ? ' font-style="italic"' : "";
  const dim = attributes & TextAttributes.DIM ? ' opacity="0.6"' : "";
  const under = attributes & TextAttributes.UNDERLINE ? ' text-decoration="underline"' : "";
  return `<text x="${x.toFixed(1)}" y="${(y + CH * 0.76).toFixed(1)}" fill="${hex(fg)}" textLength="${(cells * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs"${bold}${italic}${dim}${under} xml:space="preserve">${esc(text)}</text>`;
}

export function toSvg(lines: { spans: CapturedSpan[] }[], cols: number, theme: Theme, title: string): string {
  const w = cols * CW + PAD * 2;
  const h = lines.length * CH + PAD * 2 + BAR;
  const base = theme.bg;
  const frame = "#00000055";
  let bgs = "";
  let texts = "";
  lines.forEach((l, row) => {
    let col = 0;
    for (const sp of l.spans) {
      const len = sp.width;
      let fg = rgba(sp.fg), bg = rgba(sp.bg);
      if (sp.attributes & TextAttributes.INVERSE) [fg, bg] = [bg, fg];
      const x = PAD + col * CW;
      const y = BAR + PAD + row * CH;
      if (hex(bg) !== base.toLowerCase() && bg[3] > 0) bgs += `<rect x="${x.toFixed(1)}" y="${y}" width="${(len * CW + 0.6).toFixed(1)}" height="${CH + 0.6}" fill="${hex(bg)}"/>`;
      if (sp.text.trim()) {
        // Block glyphs (scrollbars, bars) are drawn as shapes: fonts disagree on their width and height.
        const chars = [...sp.text];
        if (chars.some((c) => c in BLOCKS)) {
          let runStart = 0;
          const flush = (end: number) => {
            const run = chars.slice(runStart, end).join("");
            if (run.trim()) texts += textEl(x + runStart * CW, y, run, fg, sp.attributes, run.length);
          };
          chars.forEach((c, i) => {
            const b = BLOCKS[c];
            if (!b) return;
            flush(i);
            runStart = i + 1;
            bgs += `<rect x="${(x + i * CW + b.x * CW).toFixed(1)}" y="${(y + b.y * CH).toFixed(1)}" width="${(b.w * CW + 0.4).toFixed(1)}" height="${(b.h * CH + 0.4).toFixed(1)}" fill="${hex(fg)}" opacity="${b.o}"/>`;
          });
          flush(chars.length);
          col += len;
          continue;
        }
        texts += textEl(x, y, sp.text, fg, sp.attributes, len);
      }
      col += len;
    }
  });
  const dots = [["#ff5f57", 20], ["#febc2e", 40], ["#28c840", 60]].map(([c, x]) => `<circle cx="${x}" cy="${BAR / 2 + 1}" r="6" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h}" viewBox="0 0 ${w.toFixed(0)} ${h}" role="img" aria-label="${esc(title)}">
<rect width="${w.toFixed(0)}" height="${h}" rx="10" fill="${base}" stroke="${frame}"/>
<rect width="${w.toFixed(0)}" height="${BAR}" rx="10" fill="${theme.element ?? base}" opacity="0.55"/>
${dots}
<text x="${(w / 2).toFixed(0)}" y="${BAR / 2 + 5}" fill="${theme.subtle}" font-size="12.5" text-anchor="middle" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">${esc(title)}</text>
<g shape-rendering="crispEdges">${bgs}</g>
<g font-family="'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace" font-size="14">${texts}</g>
</svg>
`;
}

async function render(name: string, scene: Scene) {
  setMotionFrozen(true);
  const state = demoState({ theme: scene.theme, transparent: false, reduceMotion: true });
  scene.setup(state);
  const origError = console.error;
  console.error = () => {};
  const t = await testRender(<AppRoot state={state} onQuit={() => {}} />, { width: scene.width, height: scene.height });
  for (let i = 0; i < 8; i++) {
    await Bun.sleep(25);
    await t.renderOnce();
  }
  // captureSpans' declared type hides the per-span colours it really returns.
  const cap: { cols: number; lines: { spans: CapturedSpan[] }[] } = t.captureSpans() as never;
  const frame = t.captureCharFrame();
  t.renderer.destroy();
  console.error = origError;
  const svg = toSvg(cap.lines, cap.cols, findTheme(scene.theme), scene.title);
  writeFileSync(join(OUT, `${name}.svg`), svg);
  return { svg, frame };
}

if (import.meta.main) {
  mkdirSync(OUT, { recursive: true });
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : Object.keys(SCENES);
  for (const name of names) {
    const scene = SCENES[name];
    if (!scene) throw new Error(`unknown scene "${name}" (${Object.keys(SCENES).join(", ")})`);
    const { svg, frame } = await render(name, scene);
    console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB`);
    if (process.env.SHOW) console.log(frame);
  }
  process.exit(0);
}
