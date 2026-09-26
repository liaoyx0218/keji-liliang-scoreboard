# 学生端小组互评入口重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For visual polish on StudentPage, also apply frontend-ui-engineering (match existing tech theme; primary vs secondary CTA hierarchy).

**Goal:** 去掉学生端页签；主界面恢复大「能量 +2」并加「小组互评」；全屏互评列表给别组 +2，可返回。

**Architecture:** 客户端 `view: "home" | "peer"` 切换两套 play UI；复用现有 `onPlusSelf` / `onPlusPeer` 与 leaderboard/WS。无后端改动。

**Tech Stack:** React、现有 `StudentPage.tsx` / `StudentPage.css`、`addScore` API

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-26-student-peer-entry-redesign.md`
- 文案：**「小组互评」**、**「返回」**、空态 **「还没有其他组」**、失败 **「没加上，再试一次」**
- 全屏切换非弹层；自加按钮视觉权重最高；互评为次要 CTA
- 延续现有学生端科技风（cyan/coral、大触控自加）
- API / 老师端 / 清空重置 **不变**
- README 去掉「页签：给我组 / 给别组」表述

## File Structure

```
client/src/pages/StudentPage.tsx   # remove tabs; home | peer views
client/src/pages/StudentPage.css   # remove tab styles; peer CTA + peer screen chrome
README.md                          # update student copy
```

---

### Task 1: StudentPage home + peer full-screen views

**Files:**
- Modify: `client/src/pages/StudentPage.tsx`
- Modify: `client/src/pages/StudentPage.css`

**Interfaces:**
- Consumes: existing `addScore` self/peer, `entries` / `others`, fail/rejoin handlers
- Produces: `type View = "home" | "peer"`; default `"home"`; no `Tab` / tablist

- [ ] **Step 1: Replace tab state with view state**

In `StudentPage.tsx`:

- Remove `type Tab` and `tab` / `setTab`
- Add `type View = "home" | "peer"` and `const [view, setView] = useState<View>("home")`
- Keep `onPlusSelf`, `onPlusPeer`, `others`, WS/`entries` as-is

- [ ] **Step 2: Render home view (default play UI)**

When `mode === "play"` and `view === "home"`:

```tsx
<main className="page student-page student-page--play">
  <TechBackdrop />
  <header className="student-top">科技力量大</header>
  <div className="student-landscape">
    <section className="student-info" aria-live="polite">
      <h1>{group!.name}</h1>
      <p className="energy">
        <span className="energy-label">能量</span>
        {group!.score}
      </p>
      {failMsg && (
        <p className="error" role="alert">
          {failMsg}
        </p>
      )}
    </section>
    <section className="student-action">
      <button
        type="button"
        className={pulse ? "plus-btn pulse" : "plus-btn"}
        onClick={() => void onPlusSelf()}
        aria-label="能量加二"
      >
        能量 +2
      </button>
      <button
        type="button"
        className="peer-entry-btn"
        onClick={() => {
          setFailMsg("");
          setView("peer");
        }}
      >
        小组互评
      </button>
    </section>
  </div>
</main>
```

- [ ] **Step 3: Render peer view (full screen)**

When `view === "peer"`:

```tsx
<main className="page student-page student-page--play student-page--peer">
  <TechBackdrop />
  <header className="peer-screen-header">
    <button type="button" className="peer-back-btn" onClick={() => setView("home")}>
      返回
    </button>
    <h1 className="peer-screen-title">小组互评</h1>
    <p className="peer-screen-sub">{group!.name}</p>
  </header>
  {failMsg && (
    <p className="error peer-fail" role="alert">
      {failMsg}
    </p>
  )}
  <section className="student-peer-list">
    {others.length === 0 ? (
      <p className="peer-empty">还没有其他组</p>
    ) : (
      <ul>
        {others.map((e) => (
          <li key={e.groupId} className="peer-row">
            <span className="peer-name">{e.name}</span>
            <span className="peer-score">能量 {e.score}</span>
            <button
              type="button"
              className="peer-plus"
              onClick={() => void onPlusPeer(e.groupId)}
            >
              +2
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
</main>
```

- [ ] **Step 4: CSS — remove tabs; style entry + peer screen**

In `StudentPage.css`:

- Delete `.student-tabs` / `.student-tab` rules (and landscape rules that only served tabs)
- Keep landscape `:has(.student-action)` row layout for home (info + big button)
- Style secondary CTA under plus button:

```css
.student-action {
  /* existing flex center; stack children */
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
}

.peer-entry-btn {
  position: relative;
  z-index: 1;
  min-height: 48px;
  min-width: min(100%, 280px);
  padding: 0.65rem 1.5rem;
  border-radius: 14px;
  border: 1px solid rgba(61, 232, 255, 0.35);
  background: rgba(12, 28, 48, 0.55);
  color: var(--cyan);
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.peer-entry-btn:hover,
.peer-entry-btn:focus-visible {
  border-color: rgba(61, 232, 255, 0.65);
  box-shadow: 0 0 18px rgba(61, 232, 255, 0.2);
  outline: none;
}

.student-page--peer {
  /* column layout for peer screen */
}

.peer-screen-header {
  text-align: center;
  margin-bottom: 0.75rem;
  position: relative;
}

.peer-back-btn {
  position: absolute;
  left: 0;
  top: 0;
  min-height: 44px;
  padding: 0.4rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(12, 28, 48, 0.6);
  color: var(--text);
  font-family: var(--font-display);
  cursor: pointer;
}

.peer-screen-title {
  font-family: var(--font-display);
  margin: 0.25rem 0 0;
  color: var(--cyan);
}

.peer-screen-sub {
  margin: 0.25rem 0 0;
  opacity: 0.75;
}

.student-page--peer .student-peer-list {
  width: min(100%, 480px);
  margin: 0 auto;
  flex: 1;
  overflow-y: auto;
}

.peer-fail {
  text-align: center;
}
```

Tune spacing so home landscape still gives **≥200×200** feel to「能量 +2」where existing media queries apply; peer-entry sits below without shrinking the primary below touch targets.

- [ ] **Step 5: Manual smoke**

Run client+server or hit deployed later: home self +2; open 小组互评; peer +2; 返回.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/StudentPage.tsx client/src/pages/StudentPage.css
git commit -m "feat: student home plus peer full-screen entry"
```

---

### Task 2: README + regression

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README student wording**

Replace any「页签：给我组 / 给别组」with:

```markdown
学生端：主界面「能量 +2」自加；「小组互评」进入全屏列表给其他组 +2（可返回）。
```

Keep teacher bubble +2 note if present.

- [ ] **Step 2: Run tests**

Run: `npm test`  
Expected: PASS (no new unit tests required; UI-only)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: student peer entry copy in README"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| 去页签、主界面大 +2 | Task 1 |
| 小组互评 → 全屏列表 + 返回 | Task 1 |
| 空态 / 失败文案 | Task 1 |
| 视觉主次 CTA | Task 1 CSS |
| README | Task 2 |
| API/老师端不变 | 不改那些文件 |

## Self-review

- No TBD; copy strings match spec verbatim  
- `view` naming consistent; handlers unchanged  
