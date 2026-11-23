/**
 * Built-in themes as semantic tokens. Palettes follow each theme's published colors.
 * Components only use tokens (see Theme), so a theme is just this mapping.
 */
import type { Theme } from "./theme";

interface Palette {
  dark: boolean;
  bg: string;
  panel: string;
  element: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

const make = (name: string, label: string, p: Palette): Theme & { label: string; dark: boolean } => ({
  name,
  label,
  dark: p.dark,
  bg: p.bg,
  panel: p.panel,
  element: p.element,
  raised: p.raised,
  overlay: p.bg,
  border: p.border,
  borderActive: p.accent,
  text: p.text,
  muted: p.muted,
  subtle: p.subtle,
  accent: p.accent,
  selection: p.element,
  success: p.success,
  warning: p.warning,
  error: p.error,
  info: p.info,
  thought: p.muted,
});

export const THEMES = [
  make("catppuccin-mocha", "Catppuccin Mocha", {
    dark: true, bg: "#1e1e2e", panel: "#181825", element: "#313244", raised: "#262637", border: "#45475a",
    text: "#cdd6f4", muted: "#a6adc8", subtle: "#6c7086", accent: "#cba6f7",
    success: "#a6e3a1", warning: "#f9e2af", error: "#f38ba8", info: "#89b4fa",
  }),
  make("catppuccin-macchiato", "Catppuccin Macchiato", {
    dark: true, bg: "#24273a", panel: "#1e2030", element: "#363a4f", raised: "#2b2e43", border: "#494d64",
    text: "#cad3f5", muted: "#a5adcb", subtle: "#6e738d", accent: "#c6a0f6",
    success: "#a6da95", warning: "#eed49f", error: "#ed8796", info: "#8aadf4",
  }),
  make("catppuccin-frappe", "Catppuccin Frappé", {
    dark: true, bg: "#303446", panel: "#292c3c", element: "#414559", raised: "#363a4f", border: "#51576d",
    text: "#c6d0f5", muted: "#a5adce", subtle: "#737994", accent: "#ca9ee6",
    success: "#a6d189", warning: "#e5c890", error: "#e78284", info: "#8caaee",
  }),
  make("catppuccin-latte", "Catppuccin Latte", {
    dark: false, bg: "#eff1f5", panel: "#e6e9ef", element: "#ccd0da", raised: "#e6e9ef", border: "#bcc0cc",
    text: "#4c4f69", muted: "#6c6f85", subtle: "#9ca0b0", accent: "#8839ef",
    success: "#40a02b", warning: "#df8e1d", error: "#d20f39", info: "#1e66f5",
  }),
  make("gruvbox-dark", "Gruvbox Dark", {
    dark: true, bg: "#282828", panel: "#1d2021", element: "#504945", raised: "#3c3836", border: "#665c54",
    text: "#ebdbb2", muted: "#bdae93", subtle: "#928374", accent: "#fe8019",
    success: "#b8bb26", warning: "#fabd2f", error: "#fb4934", info: "#83a598",
  }),
  make("gruvbox-light", "Gruvbox Light", {
    dark: false, bg: "#fbf1c7", panel: "#f2e5bc", element: "#d5c4a1", raised: "#ebdbb2", border: "#bdae93",
    text: "#3c3836", muted: "#665c54", subtle: "#928374", accent: "#af3a03",
    success: "#79740e", warning: "#b57614", error: "#9d0006", info: "#076678",
  }),
  make("github-dark", "GitHub Dark", {
    dark: true, bg: "#0d1117", panel: "#010409", element: "#21262d", raised: "#161b22", border: "#30363d",
    text: "#e6edf3", muted: "#8b949e", subtle: "#6e7681", accent: "#2f81f7",
    success: "#3fb950", warning: "#d29922", error: "#f85149", info: "#58a6ff",
  }),
  make("github-light", "GitHub Light", {
    dark: false, bg: "#ffffff", panel: "#f6f8fa", element: "#eaeef2", raised: "#f6f8fa", border: "#d0d7de",
    text: "#1f2328", muted: "#59636e", subtle: "#818b98", accent: "#0969da",
    success: "#1a7f37", warning: "#9a6700", error: "#d1242f", info: "#0969da",
  }),
  make("tokyo-night", "Tokyo Night", {
    dark: true, bg: "#1a1b26", panel: "#16161e", element: "#292e42", raised: "#1f2335", border: "#3b4261",
    text: "#c0caf5", muted: "#a9b1d6", subtle: "#565f89", accent: "#bb9af7",
    success: "#9ece6a", warning: "#e0af68", error: "#f7768e", info: "#7aa2f7",
  }),
  make("nord", "Nord", {
    dark: true, bg: "#2e3440", panel: "#272c36", element: "#3b4252", raised: "#353b49", border: "#4c566a",
    text: "#eceff4", muted: "#d8dee9", subtle: "#7b88a1", accent: "#88c0d0",
    success: "#a3be8c", warning: "#ebcb8b", error: "#bf616a", info: "#81a1c1",
  }),
  make("dracula", "Dracula", {
    dark: true, bg: "#282a36", panel: "#21222c", element: "#44475a", raised: "#313341", border: "#6272a4",
    text: "#f8f8f2", muted: "#bfc3d9", subtle: "#6272a4", accent: "#bd93f9",
    success: "#50fa7b", warning: "#f1fa8c", error: "#ff5555", info: "#8be9fd",
  }),
  make("one-dark", "One Dark", {
    dark: true, bg: "#282c34", panel: "#21252b", element: "#3e4451", raised: "#2c313a", border: "#4b5263",
    text: "#abb2bf", muted: "#9da5b4", subtle: "#5c6370", accent: "#c678dd",
    success: "#98c379", warning: "#e5c07b", error: "#e06c75", info: "#61afef",
  }),
  make("rose-pine", "Rosé Pine", {
    dark: true, bg: "#191724", panel: "#1f1d2e", element: "#26233a", raised: "#1f1d2e", border: "#403d52",
    text: "#e0def4", muted: "#908caa", subtle: "#6e6a86", accent: "#c4a7e7",
    success: "#9ccfd8", warning: "#f6c177", error: "#eb6f92", info: "#31748f",
  }),
  make("solarized-dark", "Solarized Dark", {
    dark: true, bg: "#002b36", panel: "#00212b", element: "#073642", raised: "#06313c", border: "#2c4a52",
    text: "#93a1a1", muted: "#839496", subtle: "#586e75", accent: "#268bd2",
    success: "#859900", warning: "#b58900", error: "#dc322f", info: "#2aa198",
  }),
  make("kanagawa", "Kanagawa", {
    dark: true, bg: "#1f1f28", panel: "#16161d", element: "#2a2a37", raised: "#223249", border: "#363646",
    text: "#dcd7ba", muted: "#c8c093", subtle: "#727169", accent: "#957fb8",
    success: "#98bb6c", warning: "#e6c384", error: "#e82424", info: "#7e9cd8",
  }),
] as const;

export type BuiltinTheme = (typeof THEMES)[number];
export const DEFAULT_THEME = "catppuccin-mocha";

export function findTheme(name: string | undefined, custom: Theme[] = []): Theme {
  return custom.find((t) => t.name === name) ?? THEMES.find((t) => t.name === name) ?? THEMES.find((t) => t.name === DEFAULT_THEME)!;
}
