import { describe, expect, test } from "bun:test";
import { copyForUser, readTool, writeTool } from "../src/util/clipboard";

const which = (names: string[]) => (name: string) => names.includes(name);

describe("clipboard tools", () => {
  test("picks the platform's own tool", () => {
    expect(writeTool("darwin", {}, which(["pbcopy"]))).toEqual({ cmd: ["pbcopy"], stdin: true });
    expect(writeTool("darwin", {}, which([]))).toBeNull();
    expect(writeTool("win32", {}, which(["clip"]))).toEqual({ cmd: ["clip"], stdin: true });
    expect(readTool("darwin", {}, which(["pbpaste"]))).toEqual(["pbpaste"]);
    expect(readTool("win32", {}, which(["powershell"]))!.slice(0, 3)).toEqual(["powershell", "-NoProfile", "-Command"]);
  });

  test("on Linux prefers Wayland, then xclip, then xsel", () => {
    expect(writeTool("linux", { WAYLAND_DISPLAY: "wayland-0" }, which(["wl-copy", "xclip"]))!.cmd).toEqual(["wl-copy"]);
    expect(writeTool("linux", {}, which(["wl-copy", "xclip"]))!.cmd).toEqual(["xclip", "-selection", "clipboard"]);
    expect(writeTool("linux", {}, which(["xsel"]))!.cmd).toEqual(["xsel", "--clipboard", "--input"]);
    expect(readTool("linux", { WAYLAND_DISPLAY: "w" }, which(["wl-paste"]))).toEqual(["wl-paste", "--no-newline"]);
    expect(writeTool("linux", {}, which([]))).toBeNull();
  });

  test("an unsupported platform has no tool", () => {
    expect(writeTool("other", {}, which(["pbcopy", "xclip"]))).toBeNull();
    expect(readTool("other", {}, which(["pbcopy"]))).toBeNull();
  });

  test("copyForUser succeeds if either path works, and never throws", async () => {
    const yes = async () => true;
    const no = async () => false;
    expect(await copyForUser("hello", () => false, yes)).toBe(true); // native only
    expect(await copyForUser("hello", () => true, no)).toBe(true); // OSC 52 only (e.g. over SSH)
    expect(await copyForUser("hello", () => false, no)).toBe(false); // neither
    expect(await copyForUser("hello", () => false, async () => { throw new Error("boom"); })).toBe(false);
    expect(await copyForUser("hello", () => { throw new Error("boom"); }, no)).toBe(false);
  });
});

import { watchSelection } from "../src/ui/clipboard-selection";
import { isPasteKey } from "../src/util/clipboard";

describe("selecting text copies it", () => {
  function harness() {
    const handlers: ((s: { getSelectedText?: () => string } | null) => void)[] = [];
    const host = { on: (_e: string, h: never) => { handlers.push(h); return host; }, off: (_e: string, h: never) => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); return host; } };
    const copied: string[] = [];
    const toasts: string[] = [];
    const stop = watchSelection(host as never, async (text) => { copied.push(text); return true; }, (m) => toasts.push(m));
    return { handlers, copied, toasts, stop, emit: (text: string | null) => handlers.forEach((h) => h(text === null ? null : { getSelectedText: () => text })) };
  }

  test("a selection is copied and confirmed once", async () => {
    const h = harness();
    h.emit("const answer = 42;");
    await Bun.sleep(0);
    expect(h.copied).toEqual(["const answer = 42;"]);
    expect(h.toasts).toEqual(["Copied 18 characters"]);
  });

  test("empty selections and clicks are ignored", async () => {
    const h = harness();
    h.emit("");
    h.emit("   \n ");
    h.emit(null);
    await Bun.sleep(0);
    expect(h.copied).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  test("a failed copy stays quiet; stopping removes the listener", async () => {
    const handlers: never[] = [];
    const host = { on: (_e: string, h: never) => { handlers.push(h); return host; }, off: () => { handlers.length = 0; return host; } };
    const toasts: string[] = [];
    const stop = watchSelection(host as never, async () => false, (m) => toasts.push(m));
    (handlers[0] as (s: unknown) => void)({ getSelectedText: () => "x" });
    await Bun.sleep(0);
    expect(toasts).toEqual([]);
    stop();
    expect(handlers.length).toBe(0);
  });

  test("paste keys are ⌘V, Ctrl+V and Ctrl+Shift+V, not plain v", () => {
    expect(isPasteKey({ name: "v", super: true })).toBe(true);
    expect(isPasteKey({ name: "v", meta: true })).toBe(true);
    expect(isPasteKey({ name: "v", ctrl: true })).toBe(true);
    expect(isPasteKey({ name: "v" })).toBe(false);
    expect(isPasteKey({ name: "c", super: true })).toBe(false);
  });
});
