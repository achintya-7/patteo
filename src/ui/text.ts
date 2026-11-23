/**
 * Truncates to `width` terminal cells with an ellipsis (ASCII/BMP approximation).
 * Newlines/tabs become spaces; runs of spaces are kept so indentation survives.
 */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  const chars = [...s.replace(/[\r\n\t]+/g, " ")];
  if (chars.length <= width) return chars.join("");
  if (width === 1) return "…";
  return chars.slice(0, width - 1).join("") + "…";
}

export function padEnd(s: string, width: number): string {
  const len = [...s].length;
  return len >= width ? s : s + " ".repeat(width - len);
}
