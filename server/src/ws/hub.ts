import type { WebSocket } from "ws";
import type { SessionWsPayload } from "@kl/shared";

export class LeaderboardHub {
  private rooms = new Map<string, Set<WebSocket>>();

  subscribe(sessionId: string, ws: WebSocket) {
    if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new Set());
    this.rooms.get(sessionId)!.add(ws);
  }

  unsubscribe(ws: WebSocket) {
    for (const set of this.rooms.values()) set.delete(ws);
  }

  broadcast(payload: SessionWsPayload) {
    const set = this.rooms.get(payload.sessionId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  }
}
