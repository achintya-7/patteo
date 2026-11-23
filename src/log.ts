import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config/paths";

/** The TUI owns stdout, so diagnostics go to a file, and only when PATTEO_DEBUG is set. */
const enabled = !!process.env.PATTEO_DEBUG;
const file = join(CONFIG_DIR, "patteo.log");
if (enabled) mkdirSync(CONFIG_DIR, { recursive: true });

function write(level: string, obj: unknown, msg?: string) {
  if (!enabled) return;
  try {
    appendFileSync(file, `${new Date().toISOString()} ${level} ${msg ?? ""} ${JSON.stringify(obj)}\n`);
  } catch {
    // never let logging crash the UI
  }
}

export const log = {
  debug: (obj: object, msg?: string) => write("debug", obj, msg),
  info: (obj: object, msg?: string) => write("info", obj, msg),
  warn: (obj: object, msg?: string) => write("warn", obj, msg),
  error: (obj: object, msg?: string) => write("error", obj, msg),
};
