import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { RuntimeManager } from "../paseo/runtime-manager";
import type { SessionState, SessionStore } from "./session";
import type { UiState, UiStore } from "./ui";
import type { SettingsState, SettingsStore } from "./settings";

export interface AppContextValue {
  store: SessionStore;
  ui: UiStore;
  runtimes: RuntimeManager;
  settings: SettingsStore;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext missing");
  return v;
}

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useStore(useApp().store, selector);
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(useApp().ui, selector);
}

/** The active host's state (or null before any host is configured). */
export function useActiveHost() {
  return useSession((s) => (s.activeHostId ? s.hosts[s.activeHostId] ?? null : null));
}

export function useSettings<T>(selector: (s: SettingsState) => T): T {
  return useStore(useApp().settings, selector);
}
