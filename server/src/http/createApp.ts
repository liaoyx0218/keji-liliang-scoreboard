import express from "express";
import type { SessionStore } from "../store/SessionStore.js";
import type { LeaderboardPayload } from "@kl/shared";
import { seqToGroupName } from "@kl/shared";

export type CreateAppOptions = {
  onLeaderboard?: (payload: LeaderboardPayload) => void;
  onChange?: () => void;
};

export function createApp(store: SessionStore, opts?: CreateAppOptions) {
  const app = express();
  app.use(express.json());

  const notifyChange = () => {
    opts?.onChange?.();
  };

  const broadcast = (sessionId: string) => {
    const payload = store.leaderboard(sessionId);
    if ("error" in payload) return;
    opts?.onLeaderboard?.(payload);
  };

  app.post("/api/sessions", (_req, res) => {
    const s = store.createSession();
    notifyChange();
    res.status(201).json({
      sessionId: s.id,
      studentPath: `/s/${s.id}`,
      teacherPath: `/t/${s.id}`,
    });
  });

  app.post("/api/sessions/:sessionId/join", (req, res) => {
    const result = store.join(req.params.sessionId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
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
      return res.status(404).json({ error: result.error });
    }
    notifyChange();
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
    notifyChange();
    broadcast(req.params.sessionId);
    res.json({ resetAt: result.resetAt, entries: [] });
  });

  app.post("/api/sessions/:sessionId/clear-scores", (req, res) => {
    const result = store.clearScores(req.params.sessionId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcast(req.params.sessionId);
    const payload = store.leaderboard(req.params.sessionId);
    if ("error" in payload) return res.status(404).json({ error: payload.error });
    res.json(payload);
  });

  return app;
}
