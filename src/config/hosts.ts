import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOSTS_FILE, PASEO_HOME } from "./paths";

export interface HostConfig {
  /** Stable local id ("local" for the auto-detected daemon). */
  id: string;
  label: string;
  /** WebSocket URL ending in /ws. */
  url: string;
  password?: string;
}

export interface HostsFile {
  defaultHostId: string;
  hosts: HostConfig[];
}

/** Reads the local daemon's listen address from ~/.paseo/paseo.pid, falling back to 127.0.0.1:6767. */
export function detectLocalDaemonUrl(home = PASEO_HOME): string {
  try {
    const pid = JSON.parse(readFileSync(join(home, "paseo.pid"), "utf8")) as { listen?: string };
    if (typeof pid.listen === "string" && /^[\w.-]+:\d+$/.test(pid.listen)) return `ws://${pid.listen}/ws`;
  } catch {
    // no pid file / not JSON: use default
  }
  return "ws://127.0.0.1:6767/ws";
}

/**
 * Turns user input into a WebSocket URL.
 * Accepts `host:port`, a bare port, `tcp://host:port`, `ws(s)://…`.
 * (ssh:// and pairing links are handled in step 8.)
 */
export function normalizeHostInput(input: string): string {
  const s = input.trim();
  if (/^\d+$/.test(s)) return `ws://127.0.0.1:${s}/ws`;
  if (/^wss?:\/\//.test(s)) return s.replace(/\/?$/, "").endsWith("/ws") ? s.replace(/\/$/, "") : `${s.replace(/\/$/, "")}/ws`;
  const hostPort = s.replace(/^tcp:\/\//, "");
  if (/^[\w.-]+:\d+$/.test(hostPort)) return `ws://${hostPort}/ws`;
  throw new Error(`Unrecognised host: ${input}`);
}

export function defaultHostsFile(): HostsFile {
  return { defaultHostId: "local", hosts: [{ id: "local", label: "local", url: detectLocalDaemonUrl() }] };
}

export function loadHosts(file = HOSTS_FILE): HostsFile {
  if (!existsSync(file)) return defaultHostsFile();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<HostsFile>;
    const hosts = Array.isArray(parsed.hosts) ? parsed.hosts.filter((h) => h && h.id && h.url) : [];
    if (hosts.length === 0) return defaultHostsFile();
    const defaultHostId = hosts.some((h) => h.id === parsed.defaultHostId) ? parsed.defaultHostId! : hosts[0]!.id;
    return { defaultHostId, hosts };
  } catch {
    return defaultHostsFile();
  }
}

export function saveHosts(data: HostsFile, file = HOSTS_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}
