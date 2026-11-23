import { createContext, useContext } from "react";

/** Semantic color tokens. Components never use raw colors. */
export interface Theme {
  name: string;
  bg: string;
  panel: string;
  element: string;
  /** Background of the user's messages. */
  raised: string;
  /** Solid surface for modals/toasts; stays opaque in transparent mode. */
  overlay: string;
  border: string;
  borderActive: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  selection: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  /** Reasoning ("Thought: …") text. */
  thought: string;
}

/** Default until the theme system lands (step 11). */
export const catppuccinMocha: Theme = {
  name: "catppuccin-mocha",
  bg: "#1e1e2e",
  panel: "#181825",
  element: "#313244",
  raised: "#262637",
  overlay: "#1e1e2e",
  border: "#45475a",
  borderActive: "#cba6f7",
  text: "#cdd6f4",
  muted: "#a6adc8",
  subtle: "#6c7086",
  accent: "#cba6f7",
  selection: "#313244",
  success: "#a6e3a1",
  warning: "#f9e2af",
  error: "#f38ba8",
  info: "#89b4fa",
  thought: "#b9a98a",
};

/** Sentinel OpenTUI treats as "no background": the terminal's own (possibly translucent) background shows through. */
export const TRANSPARENT = "transparent";

/**
 * Transparent mode: the app's base surfaces (bg, panel) draw no color, so terminal
 * transparency/blur is preserved. Highlights (raised, element, selection) stay solid
 * because they carry meaning: selection, your messages, code panels.
 */
export function withTransparency(theme: Theme, transparent: boolean): Theme {
  return transparent ? { ...theme, bg: TRANSPARENT, panel: TRANSPARENT } : theme;
}

export const ThemeContext = createContext<Theme>(catppuccinMocha);
export const useTheme = () => useContext(ThemeContext);
