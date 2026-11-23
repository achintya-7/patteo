import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { parseArgs } from "node:util";
import { normalizeHostInput } from "./config/hosts";
import { persistUiState } from "./stores/persist";
import { AppRoot, createAppState } from "./app-root";
import pkg from "../package.json";

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    opaque: { type: "boolean" },
    theme: { type: "string" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
  allowPositionals: false,
});

if (values.version) {
  console.log(`patteo ${pkg.version}`);
  process.exit(0);
}

if (values.help) {
  console.log(`Usage: patteo [options]

  --host <host:port | ws://…>   also connect to another daemon
  --theme <name>                 start with a theme (e.g. gruvbox-dark, github-dark, tokyo-night)
  --version                      print the version and exit
  --opaque                       paint the theme background instead of keeping the terminal's (translucent) one

Settings: ~/.config/patteo/config.json · press , in the app`);
  process.exit(0);
}

const extraHost = values.host ? { id: "cli", label: values.host, url: normalizeHostInput(values.host) } : undefined;
const state = createAppState({
  persist: true,
  extraHost,
  settings: {
    ...(values.opaque || process.env.PATTEO_OPAQUE === "1" ? { transparent: false } : {}),
    ...(values.theme ? { theme: values.theme } : {}),
  },
});
state.runtimes.start(extraHost?.id);
const stopPersist = persistUiState(state.ui);

const renderer = await createCliRenderer({ exitOnCtrlC: false, backgroundColor: "transparent" });
renderer.on("destroy", () => {
  stopPersist();
  state.settings.actions.flush();
  void state.runtimes.disposeAll().finally(() => process.exit(0));
});

createRoot(renderer).render(<AppRoot state={state} />);
