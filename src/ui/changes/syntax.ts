/**
 * Syntax colours for the diff view. The daemon tokenizes each line (a style class per
 * token); this turns a class into a theme colour and clips tokens to the row's width.
 * Pure apart from the Theme lookup, so the mapping is unit-tested.
 */
import { mixHex } from "../../theme/color";
import type { DiffToken } from "../../paseo/changes";
import type { Theme } from "../../theme/theme";

export type SyntaxRole = "keyword" | "string" | "number" | "comment" | "function" | "type" | "definition" | "operator" | "punctuation" | "tag" | "plain";

/** Buckets the daemon's style classes; anything unfamiliar stays plain text. */
export function syntaxRole(style: string | null | undefined): SyntaxRole {
  if (!style) return "plain";
  const s = style.toLowerCase();
  if (/comment/.test(s)) return "comment";
  if (/keyword|modifier|storage|control|import/.test(s)) return "keyword";
  if (/string|regexp|escape|char/.test(s)) return "string";
  if (/number|integer|float|bool|null|atom|constant|literal/.test(s)) return "number";
  if (/function|method|call/.test(s)) return "function";
  if (/class|type|interface|enum|namespace|struct/.test(s)) return "type";
  if (/definition|declaration/.test(s)) return "definition";
  if (/operator/.test(s)) return "operator";
  if (/punctuation|bracket|delimiter|separator/.test(s)) return "punctuation";
  if (/tag|attribute|selector/.test(s)) return "tag";
  return "plain";
}

export function roleColor(role: SyntaxRole, t: Theme): string {
  switch (role) {
    case "keyword": return t.accent;
    case "string": return t.success;
    case "number": return t.warning;
    case "type": return t.warning;
    case "function": return t.info;
    case "definition": return t.info;
    case "tag": return t.accent;
    case "comment": return t.subtle;
    case "operator": return t.muted;
    case "punctuation": return t.muted;
    default: return t.text;
  }
}

/** Colour for a token; `dim` pulls it toward the surface, for unchanged context lines. */
export function tokenColor(style: string | null, t: Theme, dim: boolean): string {
  const color = roleColor(syntaxRole(style), t);
  return (dim ? mixHex(color, t.overlay, 0.6) : undefined) ?? color;
}

/** Tabs become two spaces; CRs go. Applied to tokens and plain text alike so widths agree. */
export const cleanCode = (text: string) => text.replace(/\r/g, "").replace(/\t/g, "  ");

/**
 * Tokens clipped to `width` cells with a trailing "…" when cut. Returns null when the
 * tokens don't add up to `content` (so the caller falls back to plain text).
 */
export function clipTokens(tokens: DiffToken[], content: string, width: number): DiffToken[] | null {
  const cleaned = tokens.map((tk) => ({ text: cleanCode(tk.text), style: tk.style }));
  if (cleaned.map((tk) => tk.text).join("") !== cleanCode(content)) return null;
  const total = cleaned.reduce((n, tk) => n + [...tk.text].length, 0);
  if (total <= width) return cleaned;
  const out: DiffToken[] = [];
  let left = Math.max(1, width - 1);
  for (const tk of cleaned) {
    const chars = [...tk.text];
    if (chars.length <= left) {
      out.push(tk);
      left -= chars.length;
    } else {
      if (left > 0) out.push({ text: chars.slice(0, left).join(""), style: tk.style });
      break;
    }
  }
  out.push({ text: "…", style: null });
  return out;
}
