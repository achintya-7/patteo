import { describe, expect, test } from "bun:test";
import { shimmerColors, spinnerGlyph } from "../src/ui/motion/Motion";

describe("motion", () => {
  test("shimmer has one bright cell inside the text and sweeps forward", () => {
    const a = shimmerColors(8, 5);
    expect(a.filter((x) => x === "hi")).toHaveLength(1);
    expect(a.indexOf("hi")).toBe(2);
    expect(shimmerColors(8, 6).indexOf("hi")).toBe(3);
  });
  test("shimmer wraps around after passing the end", () => {
    expect(shimmerColors(4, 0).every((x) => x !== "hi")).toBe(true);
    expect(shimmerColors(4, 10)).toEqual(shimmerColors(4, 0));
  });
  test("spinner cycles", () => expect(spinnerGlyph(0)).not.toBe(spinnerGlyph(1)));
});
