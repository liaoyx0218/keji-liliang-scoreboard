import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { LeaderboardPayload } from "@kl/shared";
import { WebSocketServer } from "ws";
import { createApp } from "./http/createApp.js";
import { loadStore, saveStore } from "./store/JsonFilePersist.js";
import { LeaderboardHub } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? path.join(__dirname, "../data/store.json");
const store = loadStore(dataFile);
const hub = new LeaderboardHub();

const persistAndBroadcast = (payload: LeaderboardPayload) => {
  saveStore(dataFile, store);
  hub.broadcast(payload);
};

const app = createApp(store, {
  onLeaderboard: persistAndBroadcast,
  onChange: () => saveStore(dataFile, store),
});

const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api)(?!\/ws).*/, (_req, res) => {
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
  ws.on("close", () => hub.unsubscribe(ws));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
