/**
 * The system clipboard, for selecting text and for pasting when a terminal forwards ⌘V
 * instead of pasting itself. Native tools first (they work in Terminal.app, which ignores
 * OSC 52); OSC 52 as well, which is what saves you over SSH.
 */
export type ClipPlatform = "darwin" | "win32" | "linux" | "other";

export interface ClipTool {
  cmd: string[];
  /** Puts the text on the tool's stdin. */
  stdin: boolean;
}

const has = (name: string) => typeof Bun !== "undefined" && !!Bun.which(name);

/** The command that writes to the clipboard, or null when this platform has no known tool. */
export function writeTool(platform: ClipPlatform = process.platform as ClipPlatform, env: Record<string, string | undefined> = process.env, which = has): ClipTool | null {
  if (platform === "darwin") return which("pbcopy") ? { cmd: ["pbcopy"], stdin: true } : null;
  if (platform === "win32") return which("clip") || which("clip.exe") ? { cmd: ["clip"], stdin: true } : null;
  if (platform === "linux") {
    if (env.WAYLAND_DISPLAY && which("wl-copy")) return { cmd: ["wl-copy"], stdin: true };
    if (which("xclip")) return { cmd: ["xclip", "-selection", "clipboard"], stdin: true };
    if (which("xsel")) return { cmd: ["xsel", "--clipboard", "--input"], stdin: true };
  }
  return null;
}

/** The command that reads the clipboard, or null. */
export function readTool(platform: ClipPlatform = process.platform as ClipPlatform, env: Record<string, string | undefined> = process.env, which = has): string[] | null {
  if (platform === "darwin") return which("pbpaste") ? ["pbpaste"] : null;
  if (platform === "win32") return which("powershell") ? ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"] : null;
  if (platform === "linux") {
    if (env.WAYLAND_DISPLAY && which("wl-paste")) return ["wl-paste", "--no-newline"];
    if (which("xclip")) return ["xclip", "-selection", "clipboard", "-o"];
    if (which("xsel")) return ["xsel", "--clipboard", "--output"];
  }
  return null;
}

/** Puts `text` on the system clipboard; true if a native tool took it. */
export async function writeClipboardNative(text: string): Promise<boolean> {
  const tool = writeTool();
  if (!tool) return false;
  try {
    const proc = Bun.spawn(tool.cmd, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
    proc.stdin.write(text);
    proc.stdin.end();
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/** Reads the system clipboard, or null when it can't be read. */
export async function readClipboard(): Promise<string | null> {
  const cmd = readTool();
  if (!cmd) return null;
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    return (await proc.exited) === 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Copies for the user: the native clipboard and OSC 52 (so it also reaches the local
 * machine over SSH). `osc52` is the renderer's `copyToClipboardOSC52`, injected so this
 * stays testable.
 */
export async function copyForUser(
  text: string,
  osc52?: (t: string) => boolean,
  nativeWrite: (t: string) => Promise<boolean> = writeClipboardNative,
): Promise<boolean> {
  let native = false;
  try {
    native = await nativeWrite(text);
  } catch {
    native = false;
  }
  let osc = false;
  try {
    osc = osc52 ? osc52(text) : false;
  } catch {
    osc = false;
  }
  return native || osc;
}

/**
 * True for the keys a terminal may forward when the user asks to paste: ⌘V (macOS sends it
 * as `super`, sometimes as `meta`), Ctrl+V, and Ctrl+Shift+V (terminals that reserve Ctrl+V).
 */
export function isPasteKey(key: { name?: string; ctrl?: boolean; meta?: boolean; super?: boolean }): boolean {
  if (key.name !== "v") return false;
  return !!(key.super || key.meta || key.ctrl);
}
