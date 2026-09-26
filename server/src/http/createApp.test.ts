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
    expect(onLeaderboard).not.toHaveBeenCalled();
  });

  it("creating a new session wipes previous session data", async () => {
    const app = createApp(store, { onLeaderboard });
    const { body: first } = await request(app).post("/api/sessions");
    const id1 = first.sessionId as string;
    const j1 = await request(app).post(`/api/sessions/${id1}/join`);
    await request(app).post(`/api/sessions/${id1}/groups/${j1.body.groupId}/score`).send({});
    onLeaderboard.mockClear();

    const { body: second } = await request(app).post("/api/sessions").expect(201);
    expect(second.sessionId).not.toBe(id1);
    await request(app).get(`/api/sessions/${id1}/leaderboard`).expect(404);
    const empty = await request(app).get(`/api/sessions/${second.sessionId}/leaderboard`).expect(200);
    expect(empty.body.entries).toEqual([]);
    expect(onLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: id1, entries: [] })
    );
  });

  it("join + score + leaderboard + reset", async () => {
    const app = createApp(store, { onLeaderboard });
    const { body: created } = await request(app).post("/api/sessions");
    expect(onLeaderboard).toHaveBeenCalledTimes(0);
    const id = created.sessionId as string;
    const j1 = await request(app).post(`/api/sessions/${id}/join`).expect(201);
    expect(j1.body.name).toBe("组一");
    expect(onLeaderboard).toHaveBeenCalledTimes(1);
    await request(app)
      .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.score).toBe(2));
    expect(onLeaderboard).toHaveBeenCalledTimes(2);
    const board = await request(app).get(`/api/sessions/${id}/leaderboard`).expect(200);
    expect(board.body.entries[0].score).toBe(2);
    expect(onLeaderboard).toHaveBeenCalledTimes(2);
    await request(app).post(`/api/sessions/${id}/reset`).expect(200);
    expect(onLeaderboard).toHaveBeenCalledTimes(3);
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

  it("missing session → 404 on join, leaderboard, reset", async () => {
    const app = createApp(store);
    await request(app).post("/api/sessions/missing/join").expect(404);
    await request(app).get("/api/sessions/missing/leaderboard").expect(404);
    await request(app).post("/api/sessions/missing/reset").expect(404);
  });

  it("clear-scores zeros scores and keeps groups", async () => {
    const app = createApp(store, { onLeaderboard });
    const { body: created } = await request(app).post("/api/sessions");
    const id = created.sessionId as string;
    const before = await request(app).get(`/api/sessions/${id}/leaderboard`);
    const resetAtBefore = before.body.resetAt as string;
    const j1 = await request(app).post(`/api/sessions/${id}/join`);
    await request(app).post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`).send({});
    const cleared = await request(app).post(`/api/sessions/${id}/clear-scores`).expect(200);
    expect(cleared.body.resetAt).toBe(resetAtBefore);
    expect(cleared.body.entries).toHaveLength(1);
    expect(cleared.body.entries[0].score).toBe(0);
    expect(onLeaderboard).toHaveBeenCalled();
  });

  it("clear-scores on missing session → 404", async () => {
    const app = createApp(store);
    await request(app).post("/api/sessions/missing/clear-scores").expect(404);
  });

  it("rejects score delta other than 2", async () => {
    const app = createApp(store);
    const { body: created } = await request(app).post("/api/sessions");
    const j1 = await request(app).post(`/api/sessions/${created.sessionId}/join`);
    await request(app)
      .post(`/api/sessions/${created.sessionId}/groups/${j1.body.groupId}/score`)
      .send({ delta: 3 })
      .expect(400)
      .expect(({ body }) => expect(body.error).toBe("DELTA_MUST_BE_2"));
  });

  it("onChange fires on create, join, score, reset", async () => {
    const onChange = vi.fn();
    const app = createApp(store, { onChange });
    const { body: created } = await request(app).post("/api/sessions");
    expect(onChange).toHaveBeenCalledTimes(1);
    const id = created.sessionId as string;
    const j1 = await request(app).post(`/api/sessions/${id}/join`);
    await request(app)
      .post(`/api/sessions/${id}/groups/${j1.body.groupId}/score`)
      .send({});
    await request(app).post(`/api/sessions/${id}/reset`);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

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
});
