/** Blends two `#rgb` / `#rrggbb` colours; `amount` is how much of `a` (0..1). Undefined if either isn't hex. */
export function mixHex(a: string, b: string, amount: number): string | undefined {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return undefined;
  const k = Math.max(0, Math.min(1, amount));
  const channel = (i: number) => Math.round(pa[i]! * k + pb[i]! * (1 - k)).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
