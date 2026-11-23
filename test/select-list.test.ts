import { expect, test } from "bun:test";
import { filterItems, fuzzyScore } from "../src/ui/modals/SelectList";

test("fuzzy filter prefers direct substring matches, then tight subsequences", () => {
  const items = [{ id: "a", label: "Toggle sidebar" }, { id: "b", label: "New agent…" }, { id: "c", label: "Change theme…" }];
  expect(filterItems(items, "agent").map((i) => i.id)).toEqual(["b"]);
  expect(filterItems(items, "tsb").map((i) => i.id)).toEqual(["a"]);
  expect(filterItems(items, "").map((i) => i.id)).toEqual(["a", "b", "c"]);
  expect(fuzzyScore("zz", "abc")).toBe(-1);
});
