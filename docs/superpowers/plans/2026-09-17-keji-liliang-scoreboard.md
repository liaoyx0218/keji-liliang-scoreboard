# 科技力量大 · 小组积分赛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现单场公开课 Web 积分赛：教师取码备课、大屏实时能量榜、学生端一设备一组「能量 +2」。

**Architecture:** Node/Express HTTP API + `ws` 按 `sessionId` 广播完整排行榜；领域逻辑集中在可单测的 `SessionStore`；JSON 文件轻量持久化。Vite + React 三页：`/` 取码、`/t/:sessionId` 大屏、`/s/:sessionId` 学生端；学生绑定存 `localStorage`。

**Tech Stack:** Node.js 20+、TypeScript、Express、ws、Vite、React 18、Vitest、supertest、qrcode、nanoid

## Global Constraints

- 单场工具；无登录、无历史场次、无暂停/单组改分/限速
- 一设备一组；每组显示名「组一」「组二」…；每次加分固定 +2
- 全场唯一学生二维码，**大屏不展示二维码**；初始化不更换 `sessionId`
- 恢复规则：`session.resetAt === localStorage.resetAt` 且组仍存在才恢复
- +2 **不做乐观更新**；失败文案：「没加上，再试一次」
- 重置文案：「本场已重新开始，点一下重新加入」
- 大屏标题：「科技力量大 · 小组能量榜」；按钮文案：「能量 +2」
- 视觉：科技风（深色 + 青/电蓝），面向三年级，大字大按钮；避免紫白渐变套模板与英文术语
- Spec：`docs/superpowers/specs/2026-09-17-keji-liliang-scoreboard-design.md`

## File Structure

```
package.json                 # workspaces: server, client, shared
shared/
  package.json
  src/types.ts               # Session, Group, Leaderboard DTOs
  src/groupName.ts           # seq → 「组一」
  src/groupName.test.ts
server/
  package.json
  src/store/SessionStore.ts  # 领域：create/join/addScore/reset/snapshot
  src/store/SessionStore.test.ts
  src/store/JsonFilePersist.ts
  src/http/createApp.ts      # Express routes
  src/http/createApp.test.ts
  src/ws/hub.ts              # sessionId → Set<WebSocket>
  src/index.ts               # listen HTTP + attach ws
  data/                      # runtime JSON（gitignore）
client/
  package.json
  index.html
  vite.config.ts
  src/main.tsx
  src/App.tsx                # routes
  src/api.ts                 # fetch helpers + ws URL
  src/storage.ts             # localStorage bind helpers
  src/storage.test.ts
  src/pages/CreatePage.tsx
  src/pages/TeacherBoard.tsx
  src/pages/StudentPage.tsx
  src/styles/theme.css
README.md
.gitignore
```

---

### Task 1: Monorepo scaffold + shared types

**Files:**
- Create: `package.json`, `.gitignore`, `shared/package.json`, `shared/src/types.ts`, `shared/src/groupName.ts`, `shared/src/groupName.test.ts`, `shared/tsconfig.json`, `server/package.json`, `server/tsconfig.json`, `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`

**Interfaces:**
- Consumes: none
- Produces: `Session`, `Group`, `LeaderboardEntry`, `LeaderboardPayload`; `seqToGroupName(seq: number): string`

- [ ] **Step 1: Root workspace + gitignore**

`package.json`:
```json
{
  "name": "keji-liliang-scoreboard",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "test": "npm run test -w shared && npm run test -w server && npm run test -w client",
    "dev": "npm run dev -w server",
    "build": "npm run build -w shared && npm run build -w client && npm run build -w server"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
server/data/
*.log
.DS_Store
```

- [ ] **Step 2: Shared types + groupName with failing test**

`shared/src/types.ts`:
```ts
export type Session = {
  id: string;
  status: "active";
  createdAt: string; // ISO
  resetAt: string;   // ISO
  nextGroupSeq: number;
};

export type Group = {
  id: string;
  sessionId: string;
  seq: number;
  score: number;
  createdAt: string;
};

export type LeaderboardEntry = {
  groupId: string;
  name: string;
  seq: number;
  score: number;
};

export type LeaderboardPayload = {
  type: "leaderboard";
  sessionId: string;
  resetAt: string;
  entries: LeaderboardEntry[];
};
```

`shared/src/groupName.ts` — leave empty export stub first:
```ts
export function seqToGroupName(seq: number): string {
  throw new Error("not implemented");
}
```

`shared/src/groupName.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { seqToGroupName } from "./groupName.js";

describe("seqToGroupName", () => {
  it("maps 1..10 to 组一..组十", () => {
    expect(seqToGroupName(1)).toBe("组一");
    expect(seqToGroupName(2)).toBe("组二");
    expect(seqToGroupName(10)).toBe("组十");
  });
  it("maps 11 and 20", () => {
    expect(seqToGroupName(11)).toBe("组十一");
    expect(seqToGroupName(20)).toBe("组二十");
  });
});
```

`shared/package.json` scripts: `"test": "vitest run"`, depend on `vitest`, `typescript`.

- [ ] **Step 3: Run shared test — expect FAIL**

Run: `npm install` from repo root, then `npm run test -w shared`  
Expected: FAIL (`not implemented` or assertion fail)

- [ ] **Step 4: Implement seqToGroupName**

```ts
const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function seqToGroupName(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) {
    throw new Error(`seq out of range: ${seq}`);
  }
  if (seq < 10) return `组${DIGITS[seq]}`;
  if (seq === 10) return "组十";
  if (seq < 20) return `组十${DIGITS[seq - 10]}`;
  const tens = Math.floor(seq / 10);
  const ones = seq % 10;
  return ones === 0 ? `组${DIGITS[tens]}十` : `组${DIGITS[tens]}十${DIGITS[ones]}`;
}
```

- [ ] **Step 5: Re-run shared tests — expect PASS**

Run: `npm run test -w shared`  
Expected: PASS

- [ ] **Step 6: Minimal client/server package stubs so workspaces resolve**

- `server/package.json`: name `@kl/server`, `"type": "module"`, deps later
- `client/package.json`: name `@kl/client`, vite react stubs: `main.tsx` renders `<div>ok</div>`, `App.tsx` export default
- `client/vite.config.ts`: React plugin; proxy `/api` and `/ws` to `http://localhost:3000` (ws proxy in Task 6)

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore shared server client
git commit -m "chore: scaffold monorepo with shared groupName"
```

---

### Task 2: SessionStore domain (in-memory) TDD

**Files:**
- Create: `server/src/store/SessionStore.ts`, `server/src/store/SessionStore.test.ts`
- Modify: `server/package.json` (vitest, typescript, nanoid, dependency on `shared` via workspace)

**Interfaces:**
- Consumes: `Session`, `Group`, `LeaderboardEntry`, `seqToGroupName` from shared
- Produces:
  - `class SessionStore`
  - `createSession(): Session`
  - `getSession(sessionId: string): Session | undefined`
  - `join(sessionId: string): { group: Group; resetAt: string } | { error: "NOT_FOUND" }`
  - `addScore(sessionId: string, groupId: string, delta?: number): { group: Group } | { error: "NOT_FOUND" | "GROUP_NOT_FOUND" }`
  - `reset(sessionId: string): Session | { error: "NOT_FOUND" }`
  - `leaderboard(sessionId: string): LeaderboardPayload | { error: "NOT_FOUND" }`
  - Default `delta = 2`

- [ ] **Step 1: Write failing SessionStore tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "./SessionStore.js";

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => {
    store = new SessionStore(() => "fixed-session", () => "fixed-group", () => "2026-01-01T00:00:00.000Z");
  });

  it("createSession returns active session with nextGroupSeq 1", () => {
    const s = store.createSession();
    expect(s.id).toBe("fixed-session");
    expect(s.status).toBe("active");
    expect(s.nextGroupSeq).toBe(1);
    expect(s.resetAt).toBe(s.createdAt);
  });

  it("join assigns 组一 then 组二", () => {
    store.createSession();
    const a = store.join("fixed-session");
    const b = store.join("fixed-session");
    expect("group" in a && a.group.seq).toBe(1);
    expect("group" in b && b.group.seq).toBe(2);
    expect(store.leaderboard("fixed-session")).toMatchObject({
      entries: [
        { name: "组一", score: 0, seq: 1 },
        { name: "组二", score: 0, seq: 2 },
      ],
    });
  });

  it("addScore +2 and sorts by score desc then seq asc", () => {
    store.createSession();
    const g1 = store.join("fixed-session");
    const g2 = store.join("fixed-session");
    if (!("group" in g1) || !("group" in g2)) throw new Error("join failed");
    store.addScore("fixed-session", g2.group.id);
    store.addScore("fixed-session", g2.group.id);
    store.addScore("fixed-session", g1.group.id);
    const board = store.leaderboard("fixed-session");
    if ("error" in board) throw new Error("missing");
    expect(board.entries.map((e) => e.name)).toEqual(["组二", "组一"]);
    expect(board.entries[0].score).toBe(4);
    expect(board.entries[1].score).toBe(2);
  });

  it("reset clears groups and bumps resetAt", () => {
    let t = 0;
    store = new SessionStore(
      () => "s1",
      () => `g${t}`,
      () => `2026-01-01T00:00:0${t++}.000Z`
    );
    store.createSession();
    store.join("s1");
    const before = store.getSession("s1")!.resetAt;
    store.reset("s1");
    const after = store.getSession("s1")!;
    expect(after.nextGroupSeq).toBe(1);
    expect(after.resetAt).not.toBe(before);
    const board = store.leaderboard("s1");
    expect("entries" in board && board.entries).toEqual([]);
    const again = store.join("s1");
    expect("group" in again && again.group.seq).toBe(1);
  });

  it("addScore on unknown group returns GROUP_NOT_FOUND", () => {
    store.createSession();
    expect(store.addScore("fixed-session", "nope")).toEqual({ error: "GROUP_NOT_FOUND" });
  });
});
```

Note: inject `id`/`now` factories for determinism; production uses `nanoid` + `new Date().toISOString()`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test -w server`  
Expected: FAIL (module not found / not implemented)

- [ ] **Step 3: Implement SessionStore**

```ts
import { nanoid } from "nanoid";
import {
  type Session,
  type Group,
  type LeaderboardPayload,
} from "../../shared/src/types.js"; // or workspace package export — prefer `@kl/shared`
import { seqToGroupName } from "../../shared/src/groupName.js";

type IdFn = () => string;
type NowFn = () => string;

export class SessionStore {
  private sessions = new Map<string, Session>();
  private groups = new Map<string, Group[]>(); // sessionId → groups

  constructor(
    private readonly newSessionId: IdFn = () => nanoid(16),
    private readonly newGroupId: IdFn = () => nanoid(12),
    private readonly now: NowFn = () => new Date().toISOString()
  ) {}

  createSession(): Session {
    const ts = this.now();
    const session: Session = {
      id: this.newSessionId(),
      status: "active",
      createdAt: ts,
      resetAt: ts,
      nextGroupSeq: 1,
    };
    this.sessions.set(session.id, session);
    this.groups.set(session.id, []);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  join(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const group: Group = {
      id: this.newGroupId(),
      sessionId,
      seq: session.nextGroupSeq,
      score: 0,
      createdAt: this.now(),
    };
    session.nextGroupSeq += 1;
    this.groups.get(sessionId)!.push(group);
    return { group, resetAt: session.resetAt };
  }

  addScore(sessionId: string, groupId: string, delta = 2) {
    if (!this.sessions.has(sessionId)) return { error: "NOT_FOUND" as const };
    const list = this.groups.get(sessionId)!;
    const group = list.find((g) => g.id === groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    group.score += delta;
    return { group };
  }

  reset(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    this.groups.set(sessionId, []);
    session.nextGroupSeq = 1;
    session.resetAt = this.now();
    return session;
  }

  leaderboard(sessionId: string): LeaderboardPayload | { error: "NOT_FOUND" } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" };
    const entries = [...(this.groups.get(sessionId) ?? [])]
      .map((g) => ({
        groupId: g.id,
        name: seqToGroupName(g.seq),
        seq: g.seq,
        score: g.score,
      }))
      .sort((a, b) => b.score - a.score || a.seq - b.seq);
    return {
      type: "leaderboard",
      sessionId,
      resetAt: session.resetAt,
      entries,
    };
  }

  /** For persistence hydrate */
  replaceAll(sessions: Session[], groupsBySession: Record<string, Group[]>) {
    this.sessions.clear();
    this.groups.clear();
    for (const s of sessions) this.sessions.set(s.id, s);
    for (const [id, gs] of Object.entries(groupsBySession)) this.groups.set(id, gs);
  }

  dump() {
    return {
      sessions: [...this.sessions.values()],
      groupsBySession: Object.fromEntries(this.groups.entries()),
    };
  }
}
```

Wire `@kl/shared` exports in `shared/package.json` `"exports": { ".": "./src/types.ts" }` or build step — implementer: use workspace package name consistently (`"@kl/shared": "*"`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test -w server`  
Expected: all SessionStore tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/store shared/package.json server/package.json
git commit -m "feat: add SessionStore domain with tests"
```

---

### Task 3: JSON file persistence

**Files:**
- Create: `server/src/store/JsonFilePersist.ts`, `server/src/store/JsonFilePersist.test.ts`

**Interfaces:**
- Consumes: `SessionStore.dump` / `replaceAll`
- Produces: `loadStore(filePath: string): SessionStore`, `saveStore(filePath: string, store: SessionStore): void`; auto-save wrapper `withAutoSave(store, filePath)` calling `saveStore` after mutating methods used by HTTP

- [ ] **Step 1: Failing test — save then load restores leaderboard**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionStore } from "./SessionStore.js";
import { loadStore, saveStore } from "./JsonFilePersist.js";

describe("JsonFilePersist", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kl-"));
    file = path.join(dir, "data.json");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("round-trips session and scores", () => {
    const store = new SessionStore();
    const s = store.createSession();
    const j = store.join(s.id);
    if (!("group" in j)) throw new Error("join");
    store.addScore(s.id, j.group.id);
    saveStore(file, store);
    const loaded = loadStore(file);
    const board = loaded.leaderboard(s.id);
    expect("entries" in board && board.entries[0].score).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement save/load**

```ts
import fs from "node:fs";
import path from "node:path";
import { SessionStore } from "./SessionStore.js";

export function saveStore(filePath: string, store: SessionStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store.dump(), null, 2), "utf8");
}

export function loadStore(filePath: string): SessionStore {
  const store = new SessionStore();
  if (!fs.existsSync(filePath)) return store;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as ReturnType<SessionStore["dump"]>;
  store.replaceAll(raw.sessions, raw.groupsBySession);
  return store;
}
```

- [ ] **Step 4: Tests PASS; commit**

```bash
git add server/src/store/JsonFilePersist.ts server/src/store/JsonFilePersist.test.ts
git commit -m "feat: persist SessionStore to JSON file"
```

---

### Task 4: HTTP API

**Files:**
- Create: `server/src/http/createApp.ts`, `server/src/http/createApp.test.ts`

**Interfaces:**
- Consumes: `SessionStore`
- Produces: `createApp(store: SessionStore, opts?: { onLeaderboard?: (payload: LeaderboardPayload) => void }): Express`
- Routes:
  - `POST /api/sessions` → `{ sessionId, studentPath, teacherPath }`
  - `POST /api/sessions/:sessionId/join` → `{ groupId, name, seq, score, resetAt }`
  - `POST /api/sessions/:sessionId/groups/:groupId/score` body `{ delta?: number }` default 2 → `{ groupId, score }`
  - `GET /api/sessions/:sessionId/leaderboard` → `LeaderboardPayload`
  - `POST /api/sessions/:sessionId/reset` → `{ resetAt, entries: [] }`
- After join/score/reset: call `onLeaderboard(store.leaderboard(...))` when not error

- [ ] **Step 1: Write API tests with supertest**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { SessionStore } from "../store/SessionStore.js";
import { createApp } from "./createApp.js";

describe("HTTP API", () => {
  let store: SessionStore;
  let onLeaderboard: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    store = new SessionStore();
    onLeaderboard = vi.fn();
  });

  it("POST /api/sessions creates session", async () => {
    const app = createApp(store, { onLeaderboard });
    const res = await request(app).post("/api/sessions").expect(201);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.studentPath).toMatch(/^\/s\//);
    expect(res.body.teacherPath).toMatch(/^\/t\//);
  });

  it("join + score + leaderboard + reset", async () => {
    const app = createApp(store, { onLeaderboard });
    const { body: created } = await request(app).post("/api/sessions");
    const id = created.sessionId as string;
    const j1 = await request(app).post(`/api/sessions/${id}/join`).expect(201);
    expect(j1.body.name).toBe("组一");
    await request(app)
      .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.score).toBe(2));
    const board = await request(app).get(`/api/sessions/${id}/leaderboard`).expect(200);
    expect(board.body.entries[0].score).toBe(2);
    expect(onLeaderboard).toHaveBeenCalled();
    await request(app).post(`/api/sessions/${id}/reset`).expect(200);
    const empty = await request(app).get(`/api/sessions/${id}/leaderboard`);
    expect(empty.body.entries).toEqual([]);
  });

  it("score unknown group → 404", async () => {
    const app = createApp(store);
    const { body } = await request(app).post("/api/sessions");
    await request(app)
      .post(`/api/sessions/${body.sessionId}/groups/x/score`)
      .send({})
      .expect(404);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement createApp**

```ts
import express from "express";
import type { SessionStore } from "../store/SessionStore.js";
import type { LeaderboardPayload } from "@kl/shared";
import { seqToGroupName } from "@kl/shared";

export function createApp(
  store: SessionStore,
  opts?: { onLeaderboard?: (p: LeaderboardPayload) => void }
) {
  const app = express();
  app.use(express.json());

  const broadcast = (sessionId: string) => {
    const payload = store.leaderboard(sessionId);
    if ("error" in payload) return;
    opts?.onLeaderboard?.(payload);
  };

  app.post("/api/sessions", (_req, res) => {
    const s = store.createSession();
    res.status(201).json({
      sessionId: s.id,
      studentPath: `/s/${s.id}`,
      teacherPath: `/t/${s.id}`,
    });
  });

  app.post("/api/sessions/:sessionId/join", (req, res) => {
    const result = store.join(req.params.sessionId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    broadcast(req.params.sessionId);
    res.status(201).json({
      groupId: result.group.id,
      name: seqToGroupName(result.group.seq),
      seq: result.group.seq,
      score: result.group.score,
      resetAt: result.resetAt,
    });
  });

  app.post("/api/sessions/:sessionId/groups/:groupId/score", (req, res) => {
    const delta = req.body?.delta === undefined ? 2 : Number(req.body.delta);
    if (delta !== 2) return res.status(400).json({ error: "DELTA_MUST_BE_2" });
    const result = store.addScore(req.params.sessionId, req.params.groupId, 2);
    if ("error" in result) {
      const code = result.error === "NOT_FOUND" ? 404 : 404;
      return res.status(code).json({ error: result.error });
    }
    broadcast(req.params.sessionId);
    res.json({ groupId: result.group.id, score: result.group.score });
  });

  app.get("/api/sessions/:sessionId/leaderboard", (req, res) => {
    const payload = store.leaderboard(req.params.sessionId);
    if ("error" in payload) return res.status(404).json({ error: payload.error });
    res.json(payload);
  });

  app.post("/api/sessions/:sessionId/reset", (req, res) => {
    const result = store.reset(req.params.sessionId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    broadcast(req.params.sessionId);
    res.json({ resetAt: result.resetAt, entries: [] });
  });

  return app;
}
```

Also persist: in `index` (Task 5) wrap mutations with `saveStore`. For tests, pure in-memory is enough.

- [ ] **Step 4: Tests PASS; commit**

```bash
git add server/src/http
git commit -m "feat: add Express session API"
```

---

### Task 5: WebSocket hub + server entry

**Files:**
- Create: `server/src/ws/hub.ts`, `server/src/index.ts`
- Modify: `server/package.json` scripts `"dev": "tsx watch src/index.ts"`

**Interfaces:**
- Consumes: `createApp`, `loadStore`/`saveStore`, `LeaderboardPayload`
- Produces: `LeaderboardHub` with `subscribe(sessionId, ws)`, `broadcast(payload)`, `unsubscribe(ws)`; HTTP server on `PORT` (default 3000); WS path `/ws?sessionId=`

- [ ] **Step 1: Implement hub**

```ts
import type { WebSocket } from "ws";
import type { LeaderboardPayload } from "@kl/shared";

export class LeaderboardHub {
  private rooms = new Map<string, Set<WebSocket>>();

  subscribe(sessionId: string, ws: WebSocket) {
    if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new Set());
    this.rooms.get(sessionId)!.add(ws);
  }

  unsubscribe(ws: WebSocket) {
    for (const set of this.rooms.values()) set.delete(ws);
  }

  broadcast(payload: LeaderboardPayload) {
    const set = this.rooms.get(payload.sessionId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  }
}
```

- [ ] **Step 2: index.ts — attach http + ws, save after each broadcast path**

```ts
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createApp } from "./http/createApp.js";
import { loadStore, saveStore } from "./store/JsonFilePersist.js";
import { LeaderboardHub } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? path.join(__dirname, "../data/store.json");
const store = loadStore(dataFile);
const hub = new LeaderboardHub();

const persistAndBroadcast = (payload: import("@kl/shared").LeaderboardPayload) => {
  saveStore(dataFile, store);
  hub.broadcast(payload);
};

const app = createApp(store, { onLeaderboard: persistAndBroadcast });
// In production also serve client/dist:
// app.use(express.static(...)); app.get('*', spa fallback) — add after client build exists

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    ws.close();
    return;
  }
  hub.subscribe(sessionId, ws);
  const snap = store.leaderboard(sessionId);
  if (!("error" in snap)) ws.send(JSON.stringify(snap));
  ws.on("close", () => hub.unsubscribe(ws));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
```

Also: after `createSession` persist once (extend `createApp` to accept `onSessionCreated` **or** save inside create route via callback). Simplest fix: call `saveStore` in create route through optional `onChange` hook:

Add to Task 4's `createApp` if missing:
```ts
opts?: { onLeaderboard?: ...; onChange?: () => void }
```
Call `onChange` after create/join/score/reset; in index set `onChange: () => saveStore(dataFile, store)` and keep `onLeaderboard` for hub.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev -w server`  
`curl -X POST http://localhost:3000/api/sessions` → 201 JSON  
Expected: JSON with `sessionId`

- [ ] **Step 4: Commit**

```bash
git add server/src/ws server/src/index.ts server/package.json
git commit -m "feat: WebSocket leaderboard hub and server entry"
```

---

### Task 6: Client API helpers + storage TDD

**Files:**
- Create: `client/src/api.ts`, `client/src/storage.ts`, `client/src/storage.test.ts`
- Modify: `client/vite.config.ts` proxy; `client/package.json` vitest

**Interfaces:**
- Produces:
  - `createSession()`, `join(sessionId)`, `addScore(sessionId, groupId)`, `fetchLeaderboard(sessionId)`, `resetSession(sessionId)`
  - `wsUrl(sessionId): string`
  - `loadBinding(sessionId)`, `saveBinding({sessionId, groupId, resetAt})`, `clearBinding(sessionId)`
  - storage key: `kl-bind:${sessionId}`

- [ ] **Step 1: storage tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadBinding, saveBinding, clearBinding } from "./storage";

beforeEach(() => localStorage.clear());

it("round-trips binding", () => {
  saveBinding({ sessionId: "s", groupId: "g", resetAt: "t1" });
  expect(loadBinding("s")).toEqual({ sessionId: "s", groupId: "g", resetAt: "t1" });
  clearBinding("s");
  expect(loadBinding("s")).toBeNull();
});
```

Use `vitest` with `environment: "jsdom"` in client config.

- [ ] **Step 2: Implement storage + api**

```ts
// storage.ts
export type Binding = { sessionId: string; groupId: string; resetAt: string };
const key = (sessionId: string) => `kl-bind:${sessionId}`;

export function loadBinding(sessionId: string): Binding | null {
  const raw = localStorage.getItem(key(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Binding;
  } catch {
    return null;
  }
}

export function saveBinding(b: Binding) {
  localStorage.setItem(key(b.sessionId), JSON.stringify(b));
}

export function clearBinding(sessionId: string) {
  localStorage.removeItem(key(sessionId));
}
```

```ts
// api.ts
const json = async (res: Response) => {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export async function createSession() {
  return json(await fetch("/api/sessions", { method: "POST" }));
}

export async function joinSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" }));
}

export async function addScore(sessionId: string, groupId: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  );
}

export async function fetchLeaderboard(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/leaderboard`));
}

export async function resetSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/reset`, { method: "POST" }));
}

export function wsUrl(sessionId: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
```

Vite proxy:
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  test: { environment: "jsdom" },
});
```

- [ ] **Step 3: Tests PASS; commit**

```bash
git add client/src/api.ts client/src/storage.ts client/src/storage.test.ts client/vite.config.ts
git commit -m "feat: client API and localStorage binding"
```

---

### Task 7: Create page (取码) + routing

**Files:**
- Create: `client/src/pages/CreatePage.tsx`
- Modify: `client/src/App.tsx`, `client/src/main.tsx`, `client/package.json` (react-router-dom, qrcode.react)

**Interfaces:**
- Routes: `/` → CreatePage; `/t/:sessionId` → placeholder; `/s/:sessionId` → placeholder
- CreatePage: button「创建本场」→ show student absolute URL, QR (`QRCodeSVG`), copy button, download QR (optional: render canvas), link「打开大屏」

- [ ] **Step 1: Implement CreatePage**

```tsx
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createSession } from "../api";

export function CreatePage() {
  const [info, setInfo] = useState<{ sessionId: string; studentUrl: string; teacherUrl: string } | null>(null);
  const [err, setErr] = useState("");

  async function onCreate() {
    try {
      setErr("");
      const data = await createSession();
      const origin = window.location.origin;
      setInfo({
        sessionId: data.sessionId,
        studentUrl: `${origin}${data.studentPath}`,
        teacherUrl: `${origin}${data.teacherPath}`,
      });
    } catch {
      setErr("创建失败，请重试");
    }
  }

  return (
    <main className="page create-page">
      <h1>科技力量大 · 开赛准备</h1>
      <p>生成学生端二维码，放到课件里；大屏用旁边按钮打开。</p>
      <button type="button" onClick={onCreate}>创建本场</button>
      {err && <p className="error">{err}</p>}
      {info && (
        <section>
          <p>学生端链接（唯一）：</p>
          <code>{info.studentUrl}</code>
          <button type="button" onClick={() => navigator.clipboard.writeText(info.studentUrl)}>复制链接</button>
          <div className="qr-wrap">
            <QRCodeSVG value={info.studentUrl} size={256} />
          </div>
          <a href={info.teacherUrl} target="_blank" rel="noreferrer">打开大屏</a>
        </section>
      )}
    </main>
  );
}
```

`App.tsx` with `BrowserRouter` / `Routes`.

- [ ] **Step 2: Manual check**

Run server + `npm run dev -w client`  
Open `/` → 创建本场 → QR encodes student URL  
Expected: QR + copy + 打开大屏

- [ ] **Step 3: Commit**

```bash
git add client/src
git commit -m "feat: teacher create page with QR for slides"
```

---

### Task 8: Teacher leaderboard page

**Files:**
- Create: `client/src/pages/TeacherBoard.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- On mount: `fetchLeaderboard` + open `WebSocket(wsUrl(sessionId))`；on message replace entries
- UI: title「科技力量大 · 小组能量榜」； list rank, name, score； empty state「等待小组加入…」
- **No QR**
- Hidden reset: click `.secret-reset` 3 times within 2s → `confirm("清空本场？")` → `resetSession`（WS will push empty board）

- [ ] **Step 1: Implement TeacherBoard**

```tsx
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchLeaderboard, resetSession, wsUrl } from "../api";
import type { LeaderboardEntry } from "@kl/shared";

export function TeacherBoard() {
  const { sessionId = "" } = useParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });

  useEffect(() => {
    let ws: WebSocket | undefined;
    let dead = false;
    (async () => {
      try {
        const snap = await fetchLeaderboard(sessionId);
        if (!dead) setEntries(snap.entries);
      } catch {
        /* session missing */
      }
      ws = new WebSocket(wsUrl(sessionId));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "leaderboard") setEntries(msg.entries);
      };
    })();
    return () => {
      dead = true;
      ws?.close();
    };
  }, [sessionId]);

  async function onSecretClick() {
    const now = Date.now();
    if (now - clicks.current.t > 2000) clicks.current.n = 0;
    clicks.current.t = now;
    clicks.current.n += 1;
    if (clicks.current.n < 3) return;
    clicks.current.n = 0;
    if (!confirm("清空本场？")) return;
    await resetSession(sessionId);
  }

  return (
    <main className="page teacher-board">
      <header>
        <h1>科技力量大 · 小组能量榜</h1>
        <button type="button" className="secret-reset" aria-label="init" onClick={onSecretClick} />
      </header>
      {entries.length === 0 ? (
        <p className="empty">等待小组加入…</p>
      ) : (
        <ol className="rank-list">
          {entries.map((e, i) => (
            <li key={e.groupId} className={i === 0 ? "lead" : undefined}>
              <span className="rank">{i + 1}</span>
              <span className="name">{e.name}</span>
              <span className="score">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
```

CSS for `.secret-reset`: 12×12px, opacity 0.15, corner positioned.

- [ ] **Step 2: Manual** — two curl joins + score; board updates live

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TeacherBoard.tsx client/src/App.tsx
git commit -m "feat: teacher realtime leaderboard with hidden reset"
```

---

### Task 9: Student page

**Files:**
- Create: `client/src/pages/StudentPage.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Flow:
  1. `loadBinding(sessionId)`
  2. If binding: `fetchLeaderboard`; find entry by `groupId`; if missing **or** `snap.resetAt !== binding.resetAt` → show reset gate
  3. Else show play UI with score from entry (or join fresh)
  4. No binding → `joinSession` → `saveBinding` → play UI
  5. +2: await `addScore`; on success setScore from response; on failure show「没加上，再试一次」（do not increment locally first）
  6. Optional: also subscribe WS to keep score in sync if another tab (not required)

Reset gate UI: text「本场已重新开始，点一下重新加入」+ button → `clearBinding` → join again

- [ ] **Step 1: Implement StudentPage** (full component in implementation; must include states: `loading | play | needRejoin | error`)

Key handlers:
```ts
async function ensureGroup() {
  const binding = loadBinding(sessionId);
  const snap = await fetchLeaderboard(sessionId);
  if (binding && snap.resetAt === binding.resetAt) {
    const entry = snap.entries.find((e) => e.groupId === binding.groupId);
    if (entry) {
      setGroup({ id: entry.groupId, name: entry.name, score: entry.score });
      setMode("play");
      return;
    }
  }
  if (binding) {
    setMode("needRejoin");
    return;
  }
  await doJoin();
}

async function doJoin() {
  clearBinding(sessionId);
  const j = await joinSession(sessionId);
  saveBinding({ sessionId, groupId: j.groupId, resetAt: j.resetAt });
  setGroup({ id: j.groupId, name: j.name, score: j.score });
  setMode("play");
}

async function onPlus() {
  setFailMsg("");
  try {
    const r = await addScore(sessionId, group!.id);
    setGroup((g) => (g ? { ...g, score: r.score } : g));
    // brief CSS class "pulse" on button
  } catch {
    setFailMsg("没加上，再试一次");
  }
}
```

Play UI: show `group.name`, 「能量 {score}」, button「能量 +2」.

- [ ] **Step 2: Manual acceptance**

1. Phone A → 组一; Phone B → 组二  
2. +2 reflects on teacher board  
3. Refresh A → still 组一  
4. Hidden reset → A sees rejoin copy; rejoin → 组一 again; QR URL unchanged  

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/StudentPage.tsx
git commit -m "feat: student energy +2 page with binding restore"
```

---

### Task 10: Tech theme CSS + serve static in production

**Files:**
- Create: `client/src/styles/theme.css`
- Modify: `client/src/main.tsx` import theme; `server/src/index.ts` static + SPA fallback; `README.md`

**Interfaces:**
- CSS variables: `--bg`, `--cyan`, `--text`, `--danger`; grid background; large student button (min 160px); teacher rank list cinematic type
- Fonts: use a distinctive pair via Google Fonts or `@fontsource` — e.g. display `Orbitron` or Chinese-friendly tech: `"ZCOOL QingKe HuangYou"` + `"Noto Sans SC"` (avoid Inter/Roboto/Arial-only)
- README: how to `npm install`, `npm run dev -w server` + `npm run dev -w client`, LAN access tip (`--host` for vite), 公开课把学生码放进课件

- [ ] **Step 1: theme.css + wire pages classNames already used**

- [ ] **Step 2: Production static**

After `npm run build -w client`, server:
```ts
import express from "express";
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api)(?!\/ws).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});
```
(Register static **after** API routes — `createApp` returns app; attach static on same app in `index.ts` before listen.)

- [ ] **Step 3: README with acceptance checklist from spec §9**

- [ ] **Step 4: Full test suite**

Run: `npm test`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/styles README.md server/src/index.ts
git commit -m "feat: tech theme UI and production static serving"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| 单场、一码、大屏无码 | 7, 8 |
| 一设备一组、组一… | 2, 9 |
| +2 可重复、非乐观 | 2, 4, 9 |
| localStorage + resetAt | 6, 9 |
| 隐式初始化、码不变 | 8, 2 |
| WebSocket 实时榜 | 5, 8 |
| JSON 持久化 | 3 |
| 科技风三年级文案 | 7–10 |
| 验收 1–6 | Task 9 Step 2 + README |

## Placeholder / consistency check

- Delta locked to 2 in API (400 otherwise) — matches spec.
- `LeaderboardPayload.type === "leaderboard"` used by teacher WS handler.
- `@kl/shared` package name must be used consistently when wiring imports (implementer: set `shared/package.json` `"name": "@kl/shared"`).
- No TBD left in tasks.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-17-keji-liliang-scoreboard.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派一个新子代理，Task 之间做审查，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 连续执行，设检查点

你选哪一种？
