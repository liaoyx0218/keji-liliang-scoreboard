# 小组互加与老师加分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在同一能量分上支持学生自加、组间互加（白送 +2）、教师大屏点气泡 +2，并带弹出「+2」动效。

**Architecture:** 扩展现有 `POST .../groups/:groupId/score`：body 增加 `source`（`self`|`peer`|`teacher`）与互加必填的 `fromGroupId`；校验通过后仍走 `SessionStore.addScore` 原子 +2 并 WS 广播。学生端页签切换自加/互加；大屏气泡可点，成功后本地播 float「+2」。

**Tech Stack:** 现有 monorepo（Express、Vitest、supertest、React、Vite、CSS）

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-26-peer-teacher-scoring-design.md`
- 每次加分固定 **+2**；互加 **白送**（目标 +2，来源组不变）；可反复
- 保留学生自加；学生端布局：**给我组 / 给别组** 两个页签
- 大屏：**点气泡立刻 +2**（无确认框）；成功后该组旁跳出「+2」上浮淡出
- 失败：不做乐观更新；文案 **「没加上，再试一次」**；不播 +2 动效
- **不**做来源分栏、次数上限、转赠、模式开关、登录
- 清空能量 / 隐式初始化 / 颁奖 / 创建页行为不变
- `source` 缺省按 `"self"`，兼容现网 `body: "{}"`

## File Structure

```
server/src/store/SessionStore.ts       # hasGroup(sessionId, groupId) helper (optional) — or validate in HTTP
server/src/store/SessionStore.test.ts  # peer-related existence helpers if added
server/src/http/createApp.ts           # score body: source + fromGroupId validation
server/src/http/createApp.test.ts      # peer/teacher/self HTTP cases
client/src/api.ts                      # addScore(..., opts)
client/src/pages/StudentPage.tsx       # tabs + peer list + WS entries
client/src/pages/StudentPage.css       # tabs + peer rows
client/src/pages/TeacherBoard.tsx      # bubble click → teacher score + floaters
client/src/pages/TeacherBoard.css      # +2 floater animation
```

---

### Task 1: Score API — source / peer validation (TDD)

**Files:**
- Modify: `server/src/http/createApp.ts`
- Modify: `server/src/http/createApp.test.ts`
- Modify (only if needed for clean lookup): `server/src/store/SessionStore.ts`, `server/src/store/SessionStore.test.ts`

**Interfaces:**
- Consumes: existing `store.addScore(sessionId, groupId, delta?)`, `store.leaderboard` / group list
- Produces: `POST /api/sessions/:sessionId/groups/:groupId/score`
  - body: `{ delta?: 2, source?: "self"|"peer"|"teacher", fromGroupId?: string }`
  - `source` 缺省 `"self"`
  - `source=peer`: require `fromGroupId`; must exist in session; must `!== groupId` → else **400** `{ error: "INVALID_PEER" }`
  - `fromGroupId` 组不存在 → **404** `{ error: "GROUP_NOT_FOUND" }`（与目标组缺失一致）
  - `source=teacher` | `self`: 不要求 `fromGroupId`；忽略多余 `fromGroupId`
  - 成功：目标组 `score += 2`，`onChange` + broadcast，`200` `{ groupId, score }`
  - 仍拒绝 `delta !== 2` → 400 `DELTA_MUST_BE_2`

- [ ] **Step 1: Write failing HTTP tests**

在 `server/src/http/createApp.test.ts` 追加：

```ts
it("peer score +2 does not change from-group score", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j1 = await request(app).post(`/api/sessions/${id}/join`);
  const j2 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j2.body.groupId}/score`)
    .send({ source: "peer", fromGroupId: j1.body.groupId })
    .expect(200)
    .expect(({ body }) => {
      expect(body.groupId).toBe(j2.body.groupId);
      expect(body.score).toBe(2);
    });
  const board = await request(app).get(`/api/sessions/${id}/leaderboard`);
  const byId = Object.fromEntries(board.body.entries.map((e: { groupId: string; score: number }) => [e.groupId, e.score]));
  expect(byId[j2.body.groupId]).toBe(2);
  expect(byId[j1.body.groupId]).toBe(0);
});

it("peer score with from===to → 400 INVALID_PEER", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j1 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
    .send({ source: "peer", fromGroupId: j1.body.groupId })
    .expect(400)
    .expect(({ body }) => expect(body.error).toBe("INVALID_PEER"));
});

it("peer score missing fromGroupId → 400 INVALID_PEER", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j1 = await request(app).post(`/api/sessions/${id}/join`);
  const j2 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j2.body.groupId}/score`)
    .send({ source: "peer" })
    .expect(400)
    .expect(({ body }) => expect(body.error).toBe("INVALID_PEER"));
});

it("peer score with unknown fromGroupId → 404 GROUP_NOT_FOUND", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j2 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j2.body.groupId}/score`)
    .send({ source: "peer", fromGroupId: "nope" })
    .expect(404)
    .expect(({ body }) => expect(body.error).toBe("GROUP_NOT_FOUND"));
});

it("teacher source +2 works like self", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j1 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
    .send({ source: "teacher" })
    .expect(200)
    .expect(({ body }) => expect(body.score).toBe(2));
});

it("empty body still self +2 (compat)", async () => {
  const app = createApp(store);
  const { body: created } = await request(app).post("/api/sessions");
  const id = created.sessionId as string;
  const j1 = await request(app).post(`/api/sessions/${id}/join`);
  await request(app)
    .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
    .send({})
    .expect(200)
    .expect(({ body }) => expect(body.score).toBe(2));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -w server -- src/http/createApp.test.ts`

Expected: FAIL on new cases（旧用例仍过；新 peer/teacher 未实现或仍当 self）

- [ ] **Step 3: Implement validation in `createApp` score handler**

替换 `createApp.ts` 中 score 路由为：

```ts
app.post("/api/sessions/:sessionId/groups/:groupId/score", (req, res) => {
  const delta = req.body?.delta === undefined ? 2 : Number(req.body.delta);
  if (delta !== 2) return res.status(400).json({ error: "DELTA_MUST_BE_2" });

  const sourceRaw = req.body?.source;
  const source =
    sourceRaw === undefined || sourceRaw === null || sourceRaw === ""
      ? "self"
      : String(sourceRaw);
  if (source !== "self" && source !== "peer" && source !== "teacher") {
    return res.status(400).json({ error: "INVALID_SOURCE" });
  }

  const sessionId = req.params.sessionId;
  const groupId = req.params.groupId;

  if (source === "peer") {
    const fromGroupId = req.body?.fromGroupId;
    if (typeof fromGroupId !== "string" || !fromGroupId || fromGroupId === groupId) {
      return res.status(400).json({ error: "INVALID_PEER" });
    }
    const board = store.leaderboard(sessionId);
    if ("error" in board) return res.status(404).json({ error: board.error });
    const fromExists = board.entries.some((e) => e.groupId === fromGroupId);
    if (!fromExists) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  }

  const result = store.addScore(sessionId, groupId, 2);
  if ("error" in result) {
    return res.status(404).json({ error: result.error });
  }
  notifyChange();
  broadcast(sessionId);
  res.json({ groupId: result.group.id, score: result.group.score });
});
```

（若 `leaderboard` 在 session 缺失返回 `NOT_FOUND`，保持 404。）

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -w server`

Expected: PASS（含全部 createApp / SessionStore 既有用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/http/createApp.ts server/src/http/createApp.test.ts
git commit -m "feat: validate peer/teacher source on score API"
```

---

### Task 2: Client `addScore` options

**Files:**
- Modify: `client/src/api.ts`

**Interfaces:**
- Consumes: Task 1 HTTP contract
- Produces: `addScore(sessionId: string, groupId: string, opts?: { source?: "self"|"peer"|"teacher"; fromGroupId?: string })`

- [ ] **Step 1: Update `addScore`**

```ts
export type ScoreSource = "self" | "peer" | "teacher";

export async function addScore(
  sessionId: string,
  groupId: string,
  opts?: { source?: ScoreSource; fromGroupId?: string }
) {
  const body: { source?: ScoreSource; fromGroupId?: string } = {};
  if (opts?.source) body.source = opts.source;
  if (opts?.fromGroupId) body.fromGroupId = opts.fromGroupId;
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.keys(body).length ? body : {}),
    })
  );
}
```

（自加仍可 `addScore(sessionId, group.id)` 不传 opts。）

- [ ] **Step 2: Typecheck / client tests unchanged**

Run: `npm test -w client`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/api.ts
git commit -m "feat: pass score source options from client API"
```

---

### Task 3: StudentPage — tabs + peer list

**Files:**
- Modify: `client/src/pages/StudentPage.tsx`
- Modify: `client/src/pages/StudentPage.css`

**Interfaces:**
- Consumes: `addScore(..., { source: "peer", fromGroupId })`, `fetchLeaderboard`, WS `leaderboard`
- Produces: UI tabs `"self" | "peer"`；peer 列表排除本组；空态「还没有其他组」

- [ ] **Step 1: Extend state + WS to keep `entries`**

在 `StudentPage.tsx`：

- 增加 `type Tab = "self" | "peer"`，`const [tab, setTab] = useState<Tab>("self")`
- 增加 `const [entries, setEntries] = useState<LeaderboardEntry[]>([])`
- 在 `ensureGroup` 成功拿到 `snap` 时：`setEntries(snap.entries)`
- 在 play 模式 WS `onmessage`：若 `msg.type === "leaderboard"`，除 reset 检测外 `setEntries(msg.entries)`；并用 entries 更新本组 `score`/`name`（若仍在榜上）
- `others = entries.filter((e) => e.groupId !== group?.id)`

- [ ] **Step 2: Wire self + peer handlers**

```ts
async function onPlusSelf() {
  if (!group) return;
  setFailMsg("");
  try {
    const r = await addScore(sessionId, group.id, { source: "self" });
    setGroup((g) => (g ? { ...g, score: r.score } : g));
    setPulse(true);
    window.setTimeout(() => setPulse(false), 300);
  } catch (e) {
    if (isNeedRejoinError(e)) {
      setMode("needRejoin");
      return;
    }
    setFailMsg("没加上，再试一次");
  }
}

async function onPlusPeer(targetGroupId: string) {
  if (!group) return;
  setFailMsg("");
  try {
    await addScore(sessionId, targetGroupId, {
      source: "peer",
      fromGroupId: group.id,
    });
    // 不改本组 score；等待 WS/下次榜更新 others 分数
  } catch (e) {
    if (isNeedRejoinError(e)) {
      setMode("needRejoin");
      return;
    }
    setFailMsg("没加上，再试一次");
  }
}
```

- [ ] **Step 3: Render tabs in play UI**

在 `student-landscape` 内、info/action 之上或整合为：

```tsx
<div className="student-tabs" role="tablist">
  <button
    type="button"
    role="tab"
    aria-selected={tab === "self"}
    className={tab === "self" ? "student-tab active" : "student-tab"}
    onClick={() => setTab("self")}
  >
    给我组
  </button>
  <button
    type="button"
    role="tab"
    aria-selected={tab === "peer"}
    className={tab === "peer" ? "student-tab active" : "student-tab"}
    onClick={() => setTab("peer")}
  >
    给别组
  </button>
</div>

{/* info 区始终显示组名与能量 */}

{tab === "self" ? (
  <section className="student-action">
    <button type="button" className={pulse ? "plus-btn pulse" : "plus-btn"} onClick={() => void onPlusSelf()}>
      能量 +2
    </button>
  </section>
) : (
  <section className="student-peer-list">
    {others.length === 0 ? (
      <p className="peer-empty">还没有其他组</p>
    ) : (
      <ul>
        {others.map((e) => (
          <li key={e.groupId} className="peer-row">
            <span className="peer-name">{e.name}</span>
            <span className="peer-score">能量 {e.score}</span>
            <button type="button" className="peer-plus" onClick={() => void onPlusPeer(e.groupId)}>
              +2
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
)}
```

从 `@kl/shared` import `LeaderboardEntry`（与 TeacherBoard 一致）。

- [ ] **Step 4: CSS for tabs / peer rows**

在 `StudentPage.css` 追加（贴合现有 cyan 科技风，勿引入新设计系统）：

```css
.student-tabs {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 0.75rem;
}
.student-tab {
  min-height: 44px;
  padding: 0.5rem 1.25rem;
  border-radius: 12px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  background: rgba(12, 28, 48, 0.6);
  color: var(--cyan-dim);
  font-family: var(--font-display);
  cursor: pointer;
}
.student-tab.active {
  color: var(--cyan);
  border-color: rgba(0, 229, 255, 0.55);
  box-shadow: 0 0 16px rgba(0, 229, 255, 0.15);
}
.student-peer-list {
  width: min(100%, 420px);
}
.student-peer-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.peer-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.peer-name {
  flex: 1;
  font-family: var(--font-display);
  font-size: 1.25rem;
}
.peer-plus {
  min-width: 56px;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(0, 229, 255, 0.4);
  background: rgba(0, 229, 255, 0.15);
  color: var(--cyan);
  font-weight: 700;
  cursor: pointer;
}
.peer-empty {
  text-align: center;
  opacity: 0.7;
}
```

横屏 media query 下保持页签在上方、列表可滚动；**「给我组」大按钮尺寸约束不变**（≥200×200 若现有 media 有规定则保留）。

- [ ] **Step 5: Manual smoke (dev)**

Run server + client；两标签加入两组；A 给 B +2；确认 B 涨 A 不变。

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/StudentPage.tsx client/src/pages/StudentPage.css
git commit -m "feat: student tabs for self and peer +2"
```

---

### Task 4: TeacherBoard — tap bubble + float「+2」

**Files:**
- Modify: `client/src/pages/TeacherBoard.tsx`
- Modify: `client/src/pages/TeacherBoard.css`
- Modify: `client/src/api.ts`（若 Task 2 已含 teacher，仅 import `addScore`）

**Interfaces:**
- Consumes: `addScore(sessionId, groupId, { source: "teacher" })`
- Produces: 点击气泡成功后本地 floater；失败无 floater；分数仍以 WS/HTTP 为准（可先 await 成功再 setEntries 或等广播）

- [ ] **Step 1: Floater state + click handler**

```ts
type Floater = { id: string; groupId: string; x: number; y: number };

// inside TeacherBoard:
const [floaters, setFloaters] = useState<Floater[]>([]);
const [awardFail, setAwardFail] = useState(""); // or reuse a small toast; optional — prefer silent + optional fail text near board-actions

async function onBubbleClick(groupId: string, size: number, left: number, top: number) {
  try {
    await addScore(sessionId, groupId, { source: "teacher" });
    const fid = `${groupId}-${Date.now()}`;
    setFloaters((f) => [
      ...f,
      { id: fid, groupId, x: left + size * 0.65, y: top + size * 0.15 },
    ]);
    window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => x.id !== fid));
    }, 900);
    // score update via existing WS / pulse effect
  } catch {
    // no floater; optional: set brief fail toast「没加上，再试一次」
  }
}
```

Import `addScore` from `../api`.

- [ ] **Step 2: Make bubble clickable**

将气泡 `div` 改为 `button`（或 `div` + `role="button"` + `tabIndex={0}` + Enter/Space）。推荐 `button type="button"` 重置样式：

```tsx
<button
  type="button"
  key={e.groupId}
  className={`energy-bubble${pulseIds.has(e.groupId) ? " score-pulse" : ""}`}
  style={{ /* same left/top/width/height/CSS vars */ }}
  onClick={() => onBubbleClick(e.groupId, p.size, p.x, p.y)}
  aria-label={`${e.name} 能量加2`}
>
  <span className="bubble-name">{e.name}</span>
  <span className="bubble-score">{e.score}</span>
</button>
```

在 canvas 内渲染 floaters：

```tsx
{floaters.map((f) => (
  <span
    key={f.id}
    className="score-floater"
    style={{ left: f.x, top: f.y }}
    aria-hidden
  >
    +2
  </span>
))}
```

- [ ] **Step 3: CSS floater + button reset**

```css
.teacher-board .energy-bubble {
  /* if switching to button: */
  appearance: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.teacher-board .score-floater {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  color: #7dffb3;
  text-shadow: 0 0 12px rgba(80, 255, 160, 0.8);
  animation: score-float-up 0.85s ease-out forwards;
  transform: translate(-50%, -50%);
}

@keyframes score-float-up {
  0% {
    opacity: 1;
    transform: translate(-50%, -40%) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -120%) scale(1.2);
  }
}
```

确认现有 `.energy-bubble` 规则与 `button` 不冲突；保留 float 漂移动画。

- [ ] **Step 4: Failure toast (required by spec copy)**

在 `board-actions` 旁增加短暂错误提示状态 `failMsg`，catch 里 `setFailMsg("没加上，再试一次")`，1.5s 后清空。成功路径清空 `failMsg`。

- [ ] **Step 5: Manual smoke**

大屏点组 → 分 +2 + 绿色「+2」上浮；断网或停后端再点 → 提示失败、无 floater。

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TeacherBoard.tsx client/src/pages/TeacherBoard.css client/src/api.ts
git commit -m "feat: teacher tap bubble awards +2 with floater"
```

---

### Task 5: Full regression + README note

**Files:**
- Modify: `README.md`（教师大屏操作说明增两行）

- [ ] **Step 1: Full test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: README 补充**

在「教师大屏操作说明」增加：

```markdown
- **点组气泡**：给该组能量 +2（弹出 +2 动效）。
```

在学生相关处一句：

```markdown
学生端页签：**给我组**（自加）、**给别组**（给其他组 +2，本组不变）。
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note peer and teacher +2 in README"
```

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| 自加保留 | Task 3 |
| 互加白送 +2、可反复 | Task 1 + 3 |
| 师加点气泡 +2 | Task 4 |
| 大屏 +2 弹出动效 | Task 4 |
| 同一 score / 排名不变 | Task 1（仍用 addScore） |
| 页签 B | Task 3 |
| 失败文案 / 无乐观更新 / 无动效 | Task 3 + 4 |
| INVALID_PEER / from 校验 | Task 1 |
| 空态「还没有其他组」 | Task 3 |
| 不做来源分栏/上限/登录 | 全任务 YAGNI |
| clear / reset / 颁奖不变 | 未改那些路径 |

## Placeholder / consistency self-review

- 无 TBD；错误码统一 `INVALID_PEER` / `GROUP_NOT_FOUND` / `DELTA_MUST_BE_2`
- `addScore` opts 与 HTTP body 字段名一致：`source`, `fromGroupId`
- 浮层仅在 teacher 请求 **成功后** 插入
