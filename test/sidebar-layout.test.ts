import { describe, expect, test } from "bun:test";
import { placeRows, scrollToShow } from "../src/ui/sidebar/layout";

const p = (key: string) => ({ kind: "project", key }) as any;
const w = (key: string) => ({ kind: "workspace", key }) as any;

describe("sidebar layout", () => {
  const rows = [p("A"), w("a1"), w("a2"), p("B"), w("b1")];
  const { placed, totalLines } = placeRows(rows);

  test("heights and gaps", () => {
    expect(placed.map((r) => [r.top, r.height])).toEqual([[0, 1], [1, 2], [3, 2], [5, 2], [7, 2]]);
    expect(totalLines).toBe(9);
  });

  test("scrolls down just enough, and up to the project header (skipping its gap)", () => {
    expect(scrollToShow(placed, totalLines, "b1", 0, 5)).toBe(4);
    expect(scrollToShow(placed, totalLines, "B", 4, 5)).toBe(4);
    expect(scrollToShow(placed, totalLines, "B", 7, 5)).toBe(4);
    expect(scrollToShow(placed, totalLines, "A", 3, 5)).toBe(0);
  });

  test("consecutive empty projects stack without gaps", () => {
    const e = (key: string) => ({ kind: "project", key, workspaceCount: 0 }) as any;
    const r = placeRows([p("A"), w("a1"), e("E1"), e("E2"), e("E3")]);
    expect(r.placed.map((x) => x.gapBefore)).toEqual([false, false, true, false, false]);
    expect(r.totalLines).toBe(7);
  });

  test("clamps when content shrinks", () => expect(scrollToShow(placed, 3, "zzz", 6, 5)).toBe(0));
});
