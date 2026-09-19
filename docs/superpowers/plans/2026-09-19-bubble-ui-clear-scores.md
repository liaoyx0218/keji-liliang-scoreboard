# 气泡墙 + 平板学生端 + 清能量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教师大屏改为能量泡泡墙并支持长按 3 秒清空能量（仅分数）；学生端针对横屏平板优化布局；后端新增 clear-scores API。

**Architecture:** 后端 `SessionStore.clearScores` + `POST clear-scores` 与现有 broadcast 一致；前端 `layoutBubbles()` 纯函数（Vitest）；TeacherBoard 用 CSS 变量驱动泡尺寸/位置；StudentPage 横屏 grid；颁奖弹层 DOM/CSS 勿改。

**Tech Stack:** 现有 monorepo（Express, Vitest, React, Vite, CSS）

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-19-bubble-ui-clear-scores-design.md`
- 清能量：score→0，**不**改 resetAt、**不**删组；隐式 reset 行为不变
- 泡泡直径约 **88px～168px**；典型 **7～12 组**；位置按 groupId/seq **稳定**
- 学生端横屏：左 ~38% 信息、右 ~62% 按钮；「能量 +2」触控 **≥ 200×200px**
- 长按文案：**「长按 3 秒清空能量」**；成功 **「已全部清零」**；满 3s 执行，未满松手取消
- **不改** CreatePage、颁奖 overlay 结构与样式
- 既有 +2、binding、WS 逻辑不变

## File Structure

```
server/src/store/SessionStore.ts          # clearScores
server/src/store/SessionStore.test.ts
server/src/http/createApp.ts                # POST clear-scores
server/src/http/createApp.test.ts
client/src/api.ts                           # clearScores()
client/src/lib/bubbleLayout.ts              # layoutBubbles, scoreToSize
client/src/lib/bubbleLayout.test.ts
client/src/pages/TeacherBoard.tsx           # bubble canvas + long press
client/src/pages/TeacherBoard.css           # bubbles + long-press UI
client/src/pages/StudentPage.tsx            # landscape structure
client/src/pages/StudentPage.css            # landscape + button sizing
client/src/styles/theme.css                 # minimal: teacher max-width full bleed if needed
```

---

### Task 1: clearScores domain + HTTP API (TDD)

**Files:**
- Modify: `server/src/store/SessionStore.ts`, `server/src/store/SessionStore.test.ts`
- Modify: `server/src/http/createApp.ts`, `server/src/http/createApp.test.ts`

**Interfaces:**
- Produces: `clearScores(sessionId: string): Session | { error: "NOT_FOUND" }` — all groups score=0; resetAt unchanged
- Produces: `POST /api/sessions/:sessionId/clear-scores` → 200 + leaderboard broadcast via `onLeaderboard`; 404 NOT_FOUND

- [ ] **Step 1: Failing store tests**

```ts
it("clearScores zeros all scores without changing resetAt or groups", () => {
  store.createSession();
  const id = "fixed-session";
  // use existing test store with fixed id or create and read id
  const j1 = store.join(id);
  const j2 = store.join(id);
  if (!("group" in j1) || !("group" in j2)) throw new Error("join");
  store.addScore(id, j1.group.id);
  store.addScore(id, j2.group.id);
  store.addScore(id, j2.group.id);
  const resetAtBefore = store.getSession(id)!.resetAt;
  const result = store.clearScores(id);
  if ("error" in result) throw new Error("clear");
  expect(store.getSession(id)!.resetAt).toBe(resetAtBefore);
  const board = store.leaderboard(id);
  if ("error" in board) throw new Error("board");
  expect(board.entries).toHaveLength(2);
  expect(board.entries.every((e) => e.score === 0)).toBe(true);
});

it("clearScores on missing session returns NOT_FOUND", () => {
  expect(store.clearScores("missing")).toEqual({ error: "NOT_FOUND" });
});
```

Adapt IDs to match existing `SessionStore` test patterns (inject factories).

- [ ] **Step 2: Run server tests — expect FAIL**

Run: `npm run test -w server`

- [ ] **Step 3: Implement clearScores**

```ts
clearScores(sessionId: string) {
  const session = this.sessions.get(sessionId);
  if (!session) return { error: "NOT_FOUND" as const };
  for (const g of this.groups.get(sessionId) ?? []) {
    g.score = 0;
  }
  return session;
}
```

- [ ] **Step 4: HTTP route + tests**

```ts
app.post("/api/sessions/:sessionId/clear-scores", (req, res) => {
  const result = store.clearScores(req.params.sessionId);
  if ("error" in result) return res.status(404).json({ error: result.error });
  notifyChange();
  broadcast(req.params.sessionId);
  const payload = store.leaderboard(req.params.sessionId);
  if ("error" in payload) return res.status(404).json({ error: payload.error });
  res.json(payload);
});
```

Test: create session, join×2, score, POST clear-scores → entries all score 0; `onLeaderboard` called; resetAt unchanged (fetch session via store in unit test or assert WS payload resetAt same as before via two leaderboard GETs).

- [ ] **Step 5: Run `npm test` — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add server/src/store server/src/http
git commit -m "feat: clear all group scores without session reset"
```

---

### Task 2: layoutBubbles + scoreToSize (TDD)

**Files:**
- Create: `client/src/lib/bubbleLayout.ts`, `client/src/lib/bubbleLayout.test.ts`
- Modify: `client/package.json` if vitest needs no change (already jsdom)

**Interfaces:**
- Produces:
  - `scoreToSize(score: number, maxScore: number, count: number): number` — clamp 88..168, shrink min when count > 12
  - `layoutBubbles(entries: LeaderboardEntry[], width: number, height: number): Array<{ groupId: string; x: number; y: number; size: number }>`
  - Position: seed hash from `groupId`; initial grid jitter; pairwise push apart until min gap 8px; clamp margin 16px

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import { scoreToSize, layoutBubbles } from "./bubbleLayout";
import type { LeaderboardEntry } from "@kl/shared";

describe("scoreToSize", () => {
  it("returns min size for score 0", () => {
    expect(scoreToSize(0, 10, 8)).toBeGreaterThanOrEqual(88);
    expect(scoreToSize(0, 10, 8)).toBeLessThanOrEqual(100);
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

  it("returns stable positions for same groupId", () => {
    const a = layoutBubbles(entries, 900, 500);
    const b = layoutBubbles(entries, 900, 500);
    expect(a.map((p) => [p.groupId, p.x, p.y])).toEqual(b.map((p) => [p.groupId, p.x, p.y]));
  });

  it("does not overlap bubbles beyond tolerance", () => {
    const placed = layoutBubbles(entries, 900, 500);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[i].x - placed[j].x;
        const dy = placed[i].y - placed[j].y;
        const dist = Math.hypot(dx, dy);
        const minDist = (placed[i].size + placed[j].size) / 2 + 8;
        expect(dist).toBeGreaterThanOrEqual(minDist - 1);
      }
    }
  });
});
```

- [ ] **Step 2: Run client tests — FAIL**

Run: `npm run test -w client`

- [ ] **Step 3: Implement bubbleLayout.ts** (hash seed, spiral or grid slots, repulsion loop max 50 iter)

- [ ] **Step 4: PASS + commit**

```bash
git add client/src/lib
git commit -m "feat: bubble layout helper for teacher board"
```

---

### Task 3: TeacherBoard bubble wall UI

**Files:**
- Modify: `client/src/pages/TeacherBoard.tsx`, `client/src/pages/TeacherBoard.css`, `client/src/styles/theme.css` (optional `.teacher-board` full width)

**Interfaces:**
- Consumes: `layoutBubbles`, `scoreToSize` from Task 2
- Replace `<ol className="rank-list">` with `<div className="bubble-canvas" ref={canvasRef}>` + ResizeObserver for width/height
- Each bubble: `style={{ left, top, width: size, height: size, ['--bubble-glow' as string]: ... }}`
- Keep: award overlay JSX/CSS **unchanged** (only move list → canvas in main area)
- Animation: `.bubble.enter`, `.bubble.score-pulse` on score change (track prev scores ref)

- [ ] **Step 1: Wire canvas + bubbles**

- [ ] **Step 2: CSS** — radial gradient, glow, weak `@keyframes bubble-breathe`

- [ ] **Step 3: Manual — dev server, 8 groups mock or API joins, verify stable layout**

- [ ] **Step 4: `npm run build -w client` + commit**

```bash
git commit -m "feat: teacher leaderboard energy bubble wall"
```

---

### Task 4: Long-press clear scores (teacher)

**Files:**
- Modify: `client/src/api.ts` — `clearScores(sessionId)`
- Modify: `TeacherBoard.tsx`, `TeacherBoard.css`
- Optional: `client/src/hooks/useLongPress.ts` (3s progress) inline in TeacherBoard if <40 lines

**Interfaces:**
- `clearScores(sessionId)` → POST `/api/sessions/:sessionId/clear-scores`
- UI: button with `onPointerDown` start timer, `onPointerUp`/`onPointerLeave` cancel; progress ring 0→100% over 3000ms; on complete call API; show `clearedMsg` 「已全部清零」 3s
- Subtitle: 「组保留，分数归零」

- [ ] **Step 1: api.ts clearScores**

- [ ] **Step 2: Long press component + wire**

- [ ] **Step 3: HTTP test already in Task 1; manual: clear scores, student still play mode, +2 works**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: long-press 3s to clear all scores on teacher board"
```

---

### Task 5: StudentPage landscape tablet layout

**Files:**
- Modify: `client/src/pages/StudentPage.tsx`, `StudentPage.css`
- Modify: `theme.css` — adjust `.student-page` defaults only if needed (avoid breaking portrait entirely)

**Interfaces:**
- play 态结构:

```tsx
<main className="page student-page student-page--play">
  <header className="student-top">科技力量大</header>
  <div className="student-landscape">
    <section className="student-info">
      <h1>{group.name}</h1>
      <p className="energy">能量 {group.score}</p>
      {failMsg && <p className="error">{failMsg}</p>}
    </section>
    <section className="student-action">
      <button className="plus-btn ...">能量 +2</button>
    </section>
  </div>
</main>
```

- CSS `@media (orientation: landscape) and (min-width: 768px)`:
  - `.student-landscape { display: grid; grid-template-columns: 38% 1fr; min-height: calc(100vh - 4rem); align-items: center; }`
  - `.plus-btn { width: 100%; max-width: 420px; min-height: min(70vh, 420px); min-width: 200px; }`
- Portrait: keep stacked layout similar to today

- [ ] **Step 1: JSX structure**

- [ ] **Step 2: CSS landscape**

- [ ] **Step 3: `npm test` + build**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: landscape tablet layout for student page"
```

---

### Task 6: README + deploy note (optional smoke)

**Files:**
- Modify: `README.md` — add bullet: 长按清空能量 vs 隐式初始化

- [ ] **Step 1: README**

- [ ] **Step 2: Full `npm test`**

- [ ] **Step 3: Commit if README changed**

---

## Spec coverage self-review

| Requirement | Task |
|-------------|------|
| Bubble wall 7–12 | 2, 3 |
| Score → size/glow | 2, 3 |
| Long press 3s clear scores | 1, 4 |
| resetAt unchanged on clear | 1 |
| Student landscape tablet | 5 |
| Award unchanged | 3 (explicit) |
| Hidden reset unchanged | no code touch |

## Placeholder check

No TBD; all routes and filenames specified.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-19-bubble-ui-clear-scores.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 单独子代理 + 任务间审查  
2. **Inline Execution** — 本会话按 executing-plans 连续执行

你选哪一种？
