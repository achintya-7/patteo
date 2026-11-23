/** Key spec matching: "ctrl+k", "shift+tab", "?", "q", "G" (= shift+g), "ctrl+,". */
export interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  option?: boolean;
  shift: boolean;
  sequence?: string;
}

export function matchKey(k: KeyLike, spec: string): boolean {
  const parts = spec.split("+");
  let key = parts.pop()!;
  if (key === "" && spec.endsWith("+")) key = "+"; // "ctrl++"
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const alt = !!(k.meta || k.option);
  if (mods.has("ctrl") !== !!k.ctrl) return false;
  if ((mods.has("alt") || mods.has("meta")) !== alt) return false;

  // Single printable symbol ("?", ",", "[", "`"): compare the produced character; shift is implied.
  if (key.length === 1 && !/[a-z0-9]/i.test(key)) return k.sequence === key || k.name === key;
  // Uppercase letter means shift+letter.
  if (key.length === 1 && /[A-Z]/.test(key)) return k.name === key.toLowerCase() && !!k.shift;
  if (mods.has("shift") !== !!k.shift) return false;
  const name = key.toLowerCase();
  return k.name === name || (name === "enter" && k.name === "return") || (name === "esc" && k.name === "escape");
}

/** A bare printable key ("n", "q", "?", "G"): typing it must reach the text field, never a command. */
export function isTextKeySpec(spec: string): boolean {
  return !spec.includes("+") && [...spec].length === 1;
}

/** Pretty label for help/palette: "ctrl+k" → "^K", "shift+tab" → "⇧Tab". */
export function keyLabel(spec: string): string {
  const parts = spec.split("+");
  const key = parts.pop()!;
  const mods = parts.map((m) => (m === "ctrl" ? "^" : m === "shift" ? "⇧" : m === "alt" || m === "meta" ? "⌥" : m)).join("");
  const pretty: Record<string, string> = { tab: "Tab", return: "⏎", enter: "⏎", escape: "Esc", esc: "Esc", space: "Space", up: "↑", down: "↓" };
  return mods + (pretty[key] ?? (mods.includes("^") ? key.toUpperCase() : key));
}
