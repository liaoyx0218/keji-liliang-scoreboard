import { describe, it, expect } from "vitest";
import { isSortCorrect, getSortPuzzle } from "./sortPuzzles.js";

describe("sortPuzzles", () => {
  it("yi puzzle has 5 stages in correct order check", () => {
    const p = getSortPuzzle("yi");
    expect(p.order).toHaveLength(5);
    expect(isSortCorrect("yi", p.order)).toBe(true);
    expect(isSortCorrect("yi", [...p.order].reverse())).toBe(false);
  });
});
