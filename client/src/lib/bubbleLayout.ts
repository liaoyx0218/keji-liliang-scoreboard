import type { LeaderboardEntry } from "@kl/shared";

export type BubblePlacement = {
  groupId: string;
  x: number;
  y: number;
  size: number;
};

const SIZE_MIN = 64;
const SIZE_MAX = 210;
const MARGIN = 16;
const MIN_GAP = 8;

export { SIZE_MIN, SIZE_MAX };

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Map score to bubble diameter (px). Low ≈ min, leader ≈ max. */
export function scoreToSize(score: number, maxScore: number, count: number): number {
  let min = SIZE_MIN;
  let max = SIZE_MAX;
  if (count > 12) {
    min = 52;
    max = 160;
  } else if (count <= 6) {
    min = 72;
    max = 230;
  }
  if (maxScore <= 0) return min;
  const t = Math.min(1, Math.max(0, score / maxScore));
  // Emphasize gap: near-zero stays small, leaders grow fast
  const eased = Math.pow(t, 0.75);
  return Math.round(min + (max - min) * eased);
}

export function layoutBubbles(
  entries: LeaderboardEntry[],
  width: number,
  height: number
): BubblePlacement[] {
  if (entries.length === 0 || width <= 0 || height <= 0) return [];

  const maxScore = Math.max(...entries.map((e) => e.score), 0);
  const count = entries.length;

  const placed: BubblePlacement[] = entries.map((e) => {
    const size = scoreToSize(e.score, maxScore, count);
    const h = hashSeed(e.groupId);
    const nx = ((h % 1000) / 1000) * 0.85 + 0.075;
    const ny = (((h / 1000) % 1000) / 1000) * 0.85 + 0.075;
    const x = MARGIN + nx * (width - size - MARGIN * 2);
    const y = MARGIN + ny * (height - size - MARGIN * 2);
    return { groupId: e.groupId, x, y, size };
  });

  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const cxA = a.x + a.size / 2;
        const cyA = a.y + a.size / 2;
        const cxB = b.x + b.size / 2;
        const cyB = b.y + b.size / 2;
        let dx = cxB - cxA;
        let dy = cyB - cyA;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.size / 2 + b.size / 2 + MIN_GAP;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          dx /= dist;
          dy /= dist;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
          moved = true;
        }
      }
    }
    for (const p of placed) {
      p.x = Math.max(MARGIN, Math.min(width - MARGIN - p.size, p.x));
      p.y = Math.max(MARGIN, Math.min(height - MARGIN - p.size, p.y));
    }
    if (!moved) break;
  }

  return placed;
}
