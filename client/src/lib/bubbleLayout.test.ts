import { describe, it, expect } from "vitest";
import { scoreToSize, layoutBubbles } from "./bubbleLayout";
import type { LeaderboardEntry } from "@kl/shared";

describe("scoreToSize", () => {
  it("returns min-ish size for score 0", () => {
    const s = scoreToSize(0, 10, 8);
    expect(s).toBeGreaterThanOrEqual(88);
    expect(s).toBeLessThanOrEqual(120);
  });

  it("returns larger size for leader", () => {
    expect(scoreToSize(20, 20, 8)).toBeGreaterThan(scoreToSize(0, 20, 8));
  });
});

describe("layoutBubbles", () => {
  const entries: LeaderboardEntry[] = Array.from({ length: 8 }, (_, i) => ({
    groupId: `g${i}`,
    name: `组${i + 1}`,
    seq: i + 1,
    score: i * 2,
  }));

  it("returns stable positions for same inputs", () => {
    const a = layoutBubbles(entries, 900, 500);
    const b = layoutBubbles(entries, 900, 500);
    expect(a.map((p) => [p.groupId, p.x, p.y])).toEqual(b.map((p) => [p.groupId, p.x, p.y]));
  });

  it("avoids bubble overlap beyond tolerance", () => {
    const placed = layoutBubbles(entries, 900, 500);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[i].x + placed[i].size / 2 - (placed[j].x + placed[j].size / 2);
        const dy = placed[i].y + placed[i].size / 2 - (placed[j].y + placed[j].size / 2);
        const dist = Math.hypot(dx, dy);
        const minDist = (placed[i].size + placed[j].size) / 2 + 8;
        expect(dist).toBeGreaterThanOrEqual(minDist - 2);
      }
    }
  });
});
