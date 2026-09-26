import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { SessionWsPayload } from "@kl/shared";
import { WebSocketServer } from "ws";
import { createApp } from "./http/createApp.js";
import { loadStore, saveStore } from "./store/JsonFilePersist.js";
import { LeaderboardHub } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(__dirname, "../../.env"));
loadDotEnv(path.join(__dirname, "../.env"));

const dataFile = process.env.DATA_FILE ?? path.join(__dirname, "../data/store.json");
const posterDir = process.env.POSTER_DIR ?? path.join(__dirname, "../data/posters");
const store = loadStore(dataFile);
const hub = new LeaderboardHub();

const persistAndBroadcast = (payload: SessionWsPayload) => {
  saveStore(dataFile, store);
  hub.broadcast(payload);
};

const app = createApp(store, {
  onBroadcast: persistAndBroadcast,
  onChange: () => saveStore(dataFile, store),
  posterDir,
});

fs.mkdirSync(posterDir, { recursive: true });
app.use("/media/posters", express.static(posterDir));

const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api)(?!\/ws)(?!\/media).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

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
  const wishes = store.wishesPayload(sessionId);
  if (!("error" in wishes)) {
    ws.send(JSON.stringify(wishes));
    ws.send(JSON.stringify({ type: "wish_mode", sessionId, active: wishes.wishActive }));
  }
  const posters = store.postersPayload(sessionId);
  if (!("error" in posters)) {
    ws.send(JSON.stringify(posters));
    ws.send(JSON.stringify({ type: "poster_mode", sessionId, active: posters.posterActive }));
  }
  const session = store.getSession(sessionId);
  if (session) {
    ws.send(JSON.stringify({ type: "peer_mode", sessionId, active: session.peerActive }));
    ws.send(JSON.stringify({ type: "sort_mode", sessionId, active: session.sortActive }));
  }
  ws.on("close", () => hub.unsubscribe(ws));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
