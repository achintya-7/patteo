import { RGBA, SyntaxStyle, type StyleDefinitionInput } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useEffect, useMemo } from "react";
import { useTheme, type Theme } from "./theme";

/** Tree-sitter capture names (markdown + code) → theme colors. */
export function syntaxStyles(t: Theme): Record<string, StyleDefinitionInput> {
  const c = (hex: string) => RGBA.fromHex(hex);
  return {
    default: { fg: c(t.text) },
    conceal: { fg: c(t.subtle) },
    "markup.heading": { fg: c(t.accent), bold: true },
    // Native markdown headings use per-level names.
    "markup.heading.1": { fg: c(t.accent), bold: true, underline: true },
    "markup.heading.2": { fg: c(t.accent), bold: true },
    "markup.heading.3": { fg: c(t.info), bold: true },
    "markup.heading.4": { fg: c(t.text), bold: true },
    "markup.heading.5": { fg: c(t.muted), bold: true },
    "markup.heading.6": { fg: c(t.muted), bold: true },
    "markup.strong": { bold: true },
    "markup.italic": { italic: true },
    "markup.strikethrough": { strikethrough: true, fg: c(t.muted) },
    "markup.raw": { fg: c(t.warning) },
    "markup.raw.block": { fg: c(t.text) },
    "markup.link": { fg: c(t.info), underline: true },
    "markup.link.url": { fg: c(t.info), underline: true },
    "markup.link.label": { fg: c(t.info) },
    "markup.list": { fg: c(t.accent) },
    "markup.list.checked": { fg: c(t.success) },
    "markup.list.unchecked": { fg: c(t.muted) },
    "markup.quote": { fg: c(t.muted), italic: true },
    comment: { fg: c(t.subtle), italic: true },
    keyword: { fg: c(t.accent) },
    string: { fg: c(t.success) },
    number: { fg: c(t.warning) },
    boolean: { fg: c(t.warning) },
    constant: { fg: c(t.warning) },
    function: { fg: c(t.info) },
    "function.method": { fg: c(t.info) },
    type: { fg: c(t.warning) },
    operator: { fg: c(t.muted) },
    "punctuation.bracket": { fg: c(t.muted) },
    "punctuation.delimiter": { fg: c(t.muted) },
    variable: { fg: c(t.text) },
    property: { fg: c(t.text) },
  };
}

/** One SyntaxStyle per theme, owned by the renderer; released when the theme changes. */
export function useSyntaxStyle(): SyntaxStyle {
  const renderer = useRenderer();
  const theme = useTheme();
  const style = useMemo(() => SyntaxStyle.fromStyles(syntaxStyles(theme), renderer.nativeScene!), [theme, renderer]);
  useEffect(() => () => style.destroy(), [style]);
  return style;
}
