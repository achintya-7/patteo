import { createStore } from "zustand/vanilla";
import { saveSettings, type Settings } from "../config/settings";
import type { Theme } from "../theme/theme";

export interface SettingsState {
  settings: Settings;
  customThemes: Theme[];
}

/** Settings live in a store so the theme and toggles apply live; changes are saved (debounced). */
export function createSettingsStore(initial: Settings, customThemes: Theme[] = [], opts: { persist?: boolean } = {}) {
  const store = createStore<SettingsState>()(() => ({ settings: initial, customThemes }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    if (opts.persist === false) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveSettings(store.getState().settings), 300);
  };
  const actions = {
    update(patch: Partial<Settings>) {
      store.setState((s) => ({ settings: { ...s.settings, ...patch } }));
      save();
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        if (opts.persist !== false) saveSettings(store.getState().settings);
      }
    },
  };
  return Object.assign(store, { actions });
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
