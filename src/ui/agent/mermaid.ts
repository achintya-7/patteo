import { renderMermaidAscii } from "beautiful-mermaid";

const cache = new Map<string, string | null>();

/**
 * beautiful-mermaid draws a state diagram's [*] pseudo-state as an empty box.
 * Rewrite it to explicit "start" / "end" states, which render as readable labelled nodes.
 */
export function normalizeStateDiagram(source: string): string {
  const lines = source.split("\n");
  if (!/^\s*stateDiagram(-v2)?\b/.test(lines[0] ?? "")) return source;
  let usesStart = false;
  let usesEnd = false;
  const body = lines.slice(1).map((line) =>
    line
      .replace(/\[\*\](\s*-->)/g, (_, arrow) => ((usesStart = true), `__start${arrow}`))
      .replace(/(-->\s*)\[\*\]/g, (_, arrow) => ((usesEnd = true), `${arrow}__end`)),
  );
  const decls = [usesStart ? '  state "start" as __start' : null, usesEnd ? '  state "end" as __end' : null].filter(Boolean) as string[];
  return [lines[0]!, ...decls, ...body].join("\n");
}
const MAX_CACHE = 100;

/**
 * Spacing: paddingY 4 keeps edge labels off node borders (2 collided); no inner box padding keeps it compact.
 * Mermaid source → Unicode box-drawing diagram, or null if it can't be rendered
 * (unsupported diagram type or a syntax error). Cached: timelines re-render often.
 */
export function mermaidToText(source: string): string | null {
  const key = source.trim();
  if (cache.has(key)) return cache.get(key)!;
  let out: string | null;
  try {
    const text = renderMermaidAscii(normalizeStateDiagram(key), { colorMode: "none", paddingX: 3, paddingY: 4, boxBorderPadding: 0 });
    // Trim trailing spaces and blank edge lines the layout engine leaves behind.
    out = text.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "") || null;
  } catch {
    out = null;
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}
