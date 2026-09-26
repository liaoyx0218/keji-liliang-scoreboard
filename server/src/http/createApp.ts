import path from "node:path";
import express from "express";
import type { SessionStore } from "../store/SessionStore.js";
import type { SessionWsPayload } from "@kl/shared";
import {
  seqToGroupName,
  getPosterTemplate,
  normalizePosterFields,
  buildPosterPrompt,
} from "@kl/shared";
import { createNlsToken } from "../nls/token.js";
import { getArkConfigFromEnv } from "../ark/images.js";
import { generateAndSavePosterImage } from "../ark/saveImage.js";

export type CreateAppOptions = {
  onBroadcast?: (payload: SessionWsPayload) => void;
  /** @deprecated use onBroadcast */
  onLeaderboard?: (payload: SessionWsPayload) => void;
  onChange?: () => void;
  /** Absolute dir for poster image files */
  posterDir?: string;
  /** Inject for tests */
  generatePosterImage?: typeof generateAndSavePosterImage;
  getArkConfig?: typeof getArkConfigFromEnv;
  /** Cooldown ms between generates per group */
  posterCooldownMs?: number;
  /** Max generates per group per session lifetime */
  posterMaxPerGroup?: number;
};

type RateEntry = { lastAt: number; count: number };

export function createApp(store: SessionStore, opts?: CreateAppOptions) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const posterDir = opts?.posterDir;
  const cooldownMs = opts?.posterCooldownMs ?? 20_000;
  const maxPerGroup = opts?.posterMaxPerGroup ?? 5;
  const rate = new Map<string, RateEntry>();
  const generateFn = opts?.generatePosterImage ?? generateAndSavePosterImage;
  const arkConfigFn = opts?.getArkConfig ?? getArkConfigFromEnv;

  const notifyChange = () => {
    opts?.onChange?.();
  };

  const emit = (payload: SessionWsPayload) => {
    opts?.onBroadcast?.(payload);
    opts?.onLeaderboard?.(payload);
  };

  const broadcastLeaderboard = (sessionId: string) => {
    const payload = store.leaderboard(sessionId);
    if ("error" in payload) return;
    emit(payload);
  };

  const broadcastWishes = (sessionId: string) => {
    const payload = store.wishesPayload(sessionId);
    if ("error" in payload) return;
    emit(payload);
  };

  const broadcastPosters = (sessionId: string) => {
    const payload = store.postersPayload(sessionId);
    if ("error" in payload) return;
    emit(payload);
  };

  const broadcastWishMode = (sessionId: string, active: boolean) => {
    emit({ type: "wish_mode", sessionId, active });
  };

  const broadcastPeerMode = (sessionId: string, active: boolean) => {
    emit({ type: "peer_mode", sessionId, active });
  };

  const broadcastSortMode = (sessionId: string, active: boolean) => {
    emit({ type: "sort_mode", sessionId, active });
  };

  const broadcastPosterMode = (sessionId: string, active: boolean) => {
    emit({ type: "poster_mode", sessionId, active });
  };

  const broadcastTurnedOff = (
    sessionId: string,
    turnedOff: { wish?: boolean; peer?: boolean; sort?: boolean; poster?: boolean }
  ) => {
    if (turnedOff.wish) {
      broadcastWishMode(sessionId, false);
      broadcastWishes(sessionId);
    }
    if (turnedOff.peer) broadcastPeerMode(sessionId, false);
    if (turnedOff.sort) broadcastSortMode(sessionId, false);
    if (turnedOff.poster) {
      broadcastPosterMode(sessionId, false);
      broadcastPosters(sessionId);
    }
  };

  app.post("/api/sessions", (_req, res) => {
    const previousIds = store.listSessionIds();
    const s = store.createSession();
    for (const oldId of previousIds) {
      emit({
        type: "leaderboard",
        sessionId: oldId,
        resetAt: s.resetAt,
        entries: [],
      });
      emit({
        type: "wishes",
        sessionId: oldId,
        wishActive: false,
        wishes: [],
      });
      emit({
        type: "posters",
        sessionId: oldId,
        posterActive: false,
        posters: [],
      });
      emit({ type: "wish_mode", sessionId: oldId, active: false });
      emit({ type: "peer_mode", sessionId: oldId, active: false });
      emit({ type: "sort_mode", sessionId: oldId, active: false });
      emit({ type: "poster_mode", sessionId: oldId, active: false });
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
    broadcastLeaderboard(req.params.sessionId);
    res.status(201).json({
      groupId: result.group.id,
      name: seqToGroupName(result.group.seq),
      seq: result.group.seq,
      score: result.group.score,
      resetAt: result.resetAt,
    });
  });

  app.get("/api/sessions/:sessionId/modes", (req, res) => {
    const session = store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({
      wishActive: session.wishActive,
      peerActive: session.peerActive,
      sortActive: session.sortActive,
      posterActive: session.posterActive,
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
      if (!store.isPeerActive(sessionId)) {
        return res.status(400).json({ error: "PEER_INACTIVE" });
      }
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
    broadcastLeaderboard(sessionId);
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
    for (const key of [...rate.keys()]) {
      if (key.startsWith(`${req.params.sessionId}:`)) rate.delete(key);
    }
    notifyChange();
    broadcastLeaderboard(req.params.sessionId);
    broadcastWishMode(req.params.sessionId, false);
    broadcastPeerMode(req.params.sessionId, false);
    broadcastSortMode(req.params.sessionId, false);
    broadcastPosterMode(req.params.sessionId, false);
    broadcastWishes(req.params.sessionId);
    broadcastPosters(req.params.sessionId);
    res.json({ resetAt: result.resetAt, entries: [] });
  });

  app.post("/api/sessions/:sessionId/clear-scores", (req, res) => {
    const result = store.clearScores(req.params.sessionId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastLeaderboard(req.params.sessionId);
    const payload = store.leaderboard(req.params.sessionId);
    if ("error" in payload) return res.status(404).json({ error: payload.error });
    res.json(payload);
  });

  app.post("/api/sessions/:sessionId/wish/start", (req, res) => {
    const result = store.setWishActive(req.params.sessionId, true);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastTurnedOff(req.params.sessionId, result.turnedOff);
    broadcastWishMode(req.params.sessionId, true);
    broadcastWishes(req.params.sessionId);
    res.json({ wishActive: true, peerActive: false, sortActive: false, posterActive: false });
  });

  app.post("/api/sessions/:sessionId/wish/stop", (req, res) => {
    const result = store.setWishActive(req.params.sessionId, false);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastWishMode(req.params.sessionId, false);
    broadcastWishes(req.params.sessionId);
    res.json({ wishActive: false });
  });

  app.post("/api/sessions/:sessionId/peer/start", (req, res) => {
    const result = store.setPeerActive(req.params.sessionId, true);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastTurnedOff(req.params.sessionId, result.turnedOff);
    broadcastPeerMode(req.params.sessionId, true);
    res.json({ peerActive: true, wishActive: false, sortActive: false, posterActive: false });
  });

  app.post("/api/sessions/:sessionId/peer/stop", (req, res) => {
    const result = store.setPeerActive(req.params.sessionId, false);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastPeerMode(req.params.sessionId, false);
    res.json({ peerActive: false });
  });

  app.post("/api/sessions/:sessionId/sort/start", (req, res) => {
    const result = store.setSortActive(req.params.sessionId, true);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastTurnedOff(req.params.sessionId, result.turnedOff);
    broadcastSortMode(req.params.sessionId, true);
    res.json({ sortActive: true, wishActive: false, peerActive: false, posterActive: false });
  });

  app.post("/api/sessions/:sessionId/sort/stop", (req, res) => {
    const result = store.setSortActive(req.params.sessionId, false);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastSortMode(req.params.sessionId, false);
    res.json({ sortActive: false });
  });

  app.post("/api/sessions/:sessionId/poster/start", (req, res) => {
    const result = store.setPosterActive(req.params.sessionId, true);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastTurnedOff(req.params.sessionId, result.turnedOff);
    broadcastPosterMode(req.params.sessionId, true);
    broadcastPosters(req.params.sessionId);
    res.json({ posterActive: true, wishActive: false, peerActive: false, sortActive: false });
  });

  app.post("/api/sessions/:sessionId/poster/stop", (req, res) => {
    const result = store.setPosterActive(req.params.sessionId, false);
    if ("error" in result) return res.status(404).json({ error: result.error });
    notifyChange();
    broadcastPosterMode(req.params.sessionId, false);
    broadcastPosters(req.params.sessionId);
    res.json({ posterActive: false });
  });

  app.get("/api/sessions/:sessionId/wishes", (req, res) => {
    const payload = store.wishesPayload(req.params.sessionId);
    if ("error" in payload) return res.status(404).json({ error: payload.error });
    res.json(payload);
  });

  app.post("/api/sessions/:sessionId/wishes", (req, res) => {
    const groupId = req.body?.groupId;
    const text = req.body?.text;
    if (typeof groupId !== "string" || !groupId) {
      return res.status(400).json({ error: "INVALID_GROUP" });
    }
    if (typeof text !== "string") {
      return res.status(400).json({ error: "EMPTY_TEXT" });
    }
    const result = store.addWish(req.params.sessionId, groupId, text);
    if ("error" in result) {
      const status =
        result.error === "WISH_INACTIVE" || result.error === "EMPTY_TEXT" ? 400 : 404;
      return res.status(status).json({ error: result.error });
    }
    notifyChange();
    broadcastWishes(req.params.sessionId);
    res.status(201).json({ wish: result.wish });
  });

  app.get("/api/sessions/:sessionId/posters", (req, res) => {
    const payload = store.postersPayload(req.params.sessionId);
    if ("error" in payload) return res.status(404).json({ error: payload.error });
    res.json(payload);
  });

  app.get("/api/sessions/:sessionId/poster/template", (req, res) => {
    const session = store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    const groupId = String(req.query.groupId ?? "");
    if (!groupId) return res.status(400).json({ error: "INVALID_GROUP" });
    const group = store.getGroup(req.params.sessionId, groupId);
    if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
    const template = getPosterTemplate(group.seq);
    const saved = store.getPoster(req.params.sessionId, groupId);
    res.json({
      groupId,
      groupName: seqToGroupName(group.seq),
      seq: group.seq,
      theme: template.theme,
      themeLabel: template.themeLabel,
      role: template.role,
      roleLabel: template.roleLabel,
      layoutHint: template.layoutHint,
      defaults: template.defaults,
      fields: saved?.fields ?? template.defaults,
      imageUrl: saved?.imageUrl ?? "",
      posterActive: session.posterActive,
    });
  });

  app.put("/api/sessions/:sessionId/groups/:groupId/poster", (req, res) => {
    const fields = normalizePosterFields(req.body?.fields ?? req.body);
    if (!fields) return res.status(400).json({ error: "INVALID_FIELDS" });
    const result = store.upsertPosterDraft(req.params.sessionId, req.params.groupId, fields);
    if ("error" in result) {
      const status = result.error === "POSTER_INACTIVE" ? 400 : 404;
      return res.status(status).json({ error: result.error });
    }
    notifyChange();
    broadcastPosters(req.params.sessionId);
    res.json({ poster: result.poster });
  });

  app.post("/api/sessions/:sessionId/groups/:groupId/poster/generate", async (req, res) => {
    const sessionId = req.params.sessionId;
    const groupId = req.params.groupId;
    const session = store.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "NOT_FOUND" });
    if (!session.posterActive) return res.status(400).json({ error: "POSTER_INACTIVE" });

    const group = store.getGroup(sessionId, groupId);
    if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });

    const fields =
      normalizePosterFields(req.body?.fields) ??
      store.getPoster(sessionId, groupId)?.fields ??
      getPosterTemplate(group.seq).defaults;

    const ark = arkConfigFn();
    if (!ark) return res.status(503).json({ error: "ARK_NOT_CONFIGURED" });
    if (!posterDir) return res.status(503).json({ error: "POSTER_DIR_MISSING" });

    const rateKey = `${sessionId}:${groupId}`;
    const now = Date.now();
    const entry = rate.get(rateKey) ?? { lastAt: 0, count: 0 };
    if (entry.count >= maxPerGroup) {
      return res.status(429).json({ error: "POSTER_LIMIT" });
    }
    if (now - entry.lastAt < cooldownMs) {
      return res.status(429).json({ error: "POSTER_COOLDOWN" });
    }

    const template = getPosterTemplate(group.seq);
    const groupName = seqToGroupName(group.seq);
    const prompt = buildPosterPrompt(template, fields, groupName);
    const fileName = `${groupId}.png`;
    const destPath = path.join(posterDir, sessionId, fileName);
    const imageUrl = `/media/posters/${sessionId}/${fileName}?t=${now}`;

    try {
      await generateFn({
        apiKey: ark.apiKey,
        model: ark.model,
        prompt,
        destPath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ARK_GENERATE_FAILED";
      if (msg.startsWith("ARK_")) {
        return res.status(502).json({ error: msg.split(":")[0] });
      }
      return res.status(502).json({ error: "ARK_GENERATE_FAILED" });
    }

    rate.set(rateKey, { lastAt: now, count: entry.count + 1 });
    const result = store.applyPosterImage(sessionId, groupId, fields, imageUrl, prompt);
    if ("error" in result) {
      const status = result.error === "POSTER_INACTIVE" ? 400 : 404;
      return res.status(status).json({ error: result.error });
    }
    notifyChange();
    broadcastPosters(sessionId);
    res.json({ poster: result.poster });
  });

  app.get("/api/nls/token", async (_req, res) => {
    try {
      const token = await createNlsToken();
      res.json(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "NLS_TOKEN_FAILED";
      if (msg === "NLS_NOT_CONFIGURED" || msg === "NLS_APPKEY_MISSING") {
        return res.status(503).json({ error: msg });
      }
      return res.status(502).json({ error: "NLS_TOKEN_FAILED" });
    }
  });

  return app;
}
