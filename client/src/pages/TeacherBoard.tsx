import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchLeaderboard, resetSession, wsUrl } from "../api";
import type { LeaderboardEntry } from "@kl/shared";
import "./TeacherBoard.css";

const WS_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

const PLACE_LABEL = ["冠军", "亚军", "季军"] as const;
const PLACE_MEDAL = ["🥇", "🥈", "🥉"] as const;

export function TeacherBoard() {
  const { sessionId = "" } = useParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [showAward, setShowAward] = useState(false);
  const [awardStep, setAwardStep] = useState(0);
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });

  const topThree = entries.slice(0, 3);

  useEffect(() => {
    let dead = false;
    let ws: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const ac = new AbortController();

    const connectWs = () => {
      if (dead) return;
      ws = new WebSocket(wsUrl(sessionId));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "leaderboard") setEntries(msg.entries);
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onclose = () => {
        if (dead) return;
        ws = undefined;
        const delay = WS_BACKOFF_MS[Math.min(attempt, WS_BACKOFF_MS.length - 1)];
        attempt += 1;
        reconnectTimer = setTimeout(connectWs, delay);
      };
    };

    void (async () => {
      try {
        const snap = await fetchLeaderboard(sessionId, { signal: ac.signal });
        if (!dead) setEntries(snap.entries);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        /* session missing */
      }
      if (dead) return;
      connectWs();
    })();

    return () => {
      dead = true;
      ac.abort();
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!showAward) {
      setAwardStep(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    // step 1 title, then reveal 3rd→2nd→1st (indices from end of topThree)
    timers.push(setTimeout(() => setAwardStep(1), 400));
    const n = Math.min(3, topThree.length);
    for (let i = 0; i < n; i++) {
      timers.push(setTimeout(() => setAwardStep(2 + i), 1200 + i * 1100));
    }
    timers.push(setTimeout(() => setAwardStep(5), 1200 + n * 1100 + 400));
    return () => timers.forEach(clearTimeout);
  }, [showAward, topThree.length]);

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

  function openAward() {
    if (entries.length === 0) {
      window.alert("还没有小组，先让大家加分吧");
      return;
    }
    setShowAward(true);
  }

  /** Reveal order: 3rd place first, then 2nd, then 1st */
  function revealedPlaces(): { entry: LeaderboardEntry; placeIndex: number }[] {
    const n = topThree.length;
    const out: { entry: LeaderboardEntry; placeIndex: number }[] = [];
    // awardStep 2 → show last of top3 (3rd if 3 teams), step 3 → mid, step 4 → first
    const revealedCount = Math.max(0, Math.min(n, awardStep - 1));
    for (let k = 0; k < revealedCount; k++) {
      const placeIndex = n - 1 - k; // from worst of top3 toward champion
      out.push({ entry: topThree[placeIndex], placeIndex });
    }
    // display champion last visually at top: reverse so 1st appears first in DOM when all revealed
    return out.slice().reverse();
  }

  return (
    <main className="page teacher-board">
      <header>
        <h1>科技力量大 · 小组能量榜</h1>
        <button type="button" className="secret-reset" aria-label="init" onClick={onSecretClick} />
      </header>

      <div className="board-actions">
        <button type="button" className="award-btn" onClick={openAward} disabled={entries.length === 0}>
          颁发科技小达人
        </button>
      </div>

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

      {showAward && (
        <div
          className="award-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="科技小达人颁奖"
          onClick={() => setShowAward(false)}
        >
          <div className="award-stage" onClick={(e) => e.stopPropagation()}>
            <div className="award-burst" aria-hidden />
            {awardStep >= 1 && (
              <p className="award-title pop-in">科技小达人</p>
            )}
            {awardStep >= 1 && (
              <p className="award-sub pop-in">能量榜前三名 · 颁发勋章</p>
            )}
            <ul className="award-list">
              {revealedPlaces().map(({ entry, placeIndex }) => (
                <li
                  key={entry.groupId}
                  className={`award-card place-${placeIndex} pop-in`}
                >
                  <span className="medal" aria-hidden>
                    {PLACE_MEDAL[placeIndex]}
                  </span>
                  <div className="award-meta">
                    <span className="place-label">{PLACE_LABEL[placeIndex]}</span>
                    <span className="award-name">{entry.name}</span>
                    <span className="award-badge">科技小达人勋章</span>
                  </div>
                  <span className="award-score">{entry.score}</span>
                </li>
              ))}
            </ul>
            {awardStep >= 5 && (
              <button type="button" className="award-close pop-in" onClick={() => setShowAward(false)}>
                关闭
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
