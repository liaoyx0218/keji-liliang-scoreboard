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
    const previousIds = store.listSessionIds();
    const s = store.createSession();
    for (const oldId of previousIds) {
      opts?.onLeaderboard?.({
        type: "leaderboard",
        sessionId: oldId,
        resetAt: s.resetAt,
        entries: [],
      });
    }
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
