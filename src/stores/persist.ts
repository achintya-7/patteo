import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "../config/paths";
import { log } from "../log";
import type { PersistedUi, UiStore } from "./ui";

export const STATE_FILE = join(CONFIG_DIR, "state.json");

export function loadUiState(file = STATE_FILE): Partial<PersistedUi> {
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<PersistedUi>;
    const out: Partial<PersistedUi> = {};
    if (raw.collapsed && typeof raw.collapsed === "object") out.collapsed = raw.collapsed;
    if (raw.selectedWorkspace && typeof raw.selectedWorkspace === "object") out.selectedWorkspace = raw.selectedWorkspace;
    if (raw.tabs && typeof raw.tabs === "object") {
      out.tabs = Object.fromEntries(
        Object.entries(raw.tabs).filter(([, t]) => t && Array.isArray(t.tabs) && Array.isArray(t.mru)),
      );
    }
    if (typeof raw.sidebarVisible === "boolean") out.sidebarVisible = raw.sidebarVisible;
    return out;
  } catch (err) {
    log.warn({ err: String(err) }, "ignoring unreadable state.json");
    return {};
  }
}

/** Writes the persisted subset whenever it changes, debounced. Returns a flush-and-stop function. */
export function persistUiState(ui: UiStore, file = STATE_FILE, delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pick = (): PersistedUi => {
    const s = ui.getState();
    return { collapsed: s.collapsed, selectedWorkspace: s.selectedWorkspace, tabs: s.tabs, sidebarVisible: s.sidebarVisible };
  };
  let last = JSON.stringify(pick());
  const write = () => {
    timer = null;
    const json = JSON.stringify(pick());
    if (json === last) return;
    last = json;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file + ".tmp", json + "\n");
      renameSync(file + ".tmp", file); // atomic replace
    } catch (err) {
      log.warn({ err: String(err) }, "failed to write state.json");
    }
  };
  const unsub = ui.subscribe(() => {
    if (!timer) timer = setTimeout(write, delayMs);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    write();
  };
}
