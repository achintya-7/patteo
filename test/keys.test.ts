import { describe, expect, test } from "bun:test";
import { keyLabel, matchKey } from "../src/keyboard/keys";

const k = (name: string, o: Partial<{ ctrl: boolean; shift: boolean; meta: boolean; sequence: string }> = {}) => ({ name, ctrl: false, meta: false, shift: false, ...o });

describe("key matching", () => {
  test("modifiers must match exactly", () => {
    expect(matchKey(k("k", { ctrl: true }), "ctrl+k")).toBe(true);
    expect(matchKey(k("k"), "ctrl+k")).toBe(false);
    expect(matchKey(k("k", { ctrl: true, meta: true }), "ctrl+k")).toBe(false);
  });
  test("symbols compare the produced character", () => {
    expect(matchKey(k("/", { shift: true, sequence: "?" }), "?")).toBe(true);
    expect(matchKey(k(",", { sequence: "," }), ",")).toBe(true);
  });
  test("uppercase means shift", () => {
    expect(matchKey(k("g", { shift: true }), "G")).toBe(true);
    expect(matchKey(k("g"), "G")).toBe(false);
    expect(matchKey(k("tab", { shift: true }), "shift+tab")).toBe(true);
    expect(matchKey(k("tab"), "shift+tab")).toBe(false);
  });
  test("aliases", () => expect(matchKey(k("return"), "enter")).toBe(true));
  test("labels", () => {
    expect(keyLabel("ctrl+k")).toBe("^K");
    expect(keyLabel("shift+tab")).toBe("⇧Tab");
    expect(keyLabel("?")).toBe("?");
  });
});
