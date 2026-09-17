import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchLeaderboard, resetSession, wsUrl } from "../api";
import type { LeaderboardEntry } from "@kl/shared";
import "./TeacherBoard.css";

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
