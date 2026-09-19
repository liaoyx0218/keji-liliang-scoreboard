import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { clearScores, fetchLeaderboard, resetSession, wsUrl } from "../api";
import { layoutBubbles } from "../lib/bubbleLayout";
import type { LeaderboardEntry } from "@kl/shared";
import "./TeacherBoard.css";

const WS_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const LONG_PRESS_MS = 3000;

const PLACE_LABEL = ["冠军", "亚军", "季军"] as const;
const PLACE_MEDAL = ["🥇", "🥈", "🥉"] as const;

export function TeacherBoard() {
  const { sessionId = "" } = useParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [showAward, setShowAward] = useState(false);
  const [awardStep, setAwardStep] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 480 });
  const [clearProgress, setClearProgress] = useState(0);
  const [clearedMsg, setClearedMsg] = useState("");
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevScores = useRef<Map<string, number>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressStart = useRef(0);

  const topThree = entries.slice(0, 3);

  const placements = useMemo(
    () => layoutBubbles(entries, canvasSize.w, canvasSize.h),
    [entries, canvasSize.w, canvasSize.h]
  );

  const placementById = useMemo(() => new Map(placements.map((p) => [p.groupId, p])), [placements]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [entries.length]);

  useEffect(() => {
    const next = new Map<string, number>();
    const pulsing = new Set<string>();
    for (const e of entries) {
      const prev = prevScores.current.get(e.groupId);
      if (prev !== undefined && prev !== e.score) pulsing.add(e.groupId);
      next.set(e.groupId, e.score);
    }
    prevScores.current = next;
    if (pulsing.size > 0) {
      setPulseIds(pulsing);
      const t = window.setTimeout(() => setPulseIds(new Set()), 400);
      return () => clearTimeout(t);
    }
  }, [entries]);

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
    timers.push(setTimeout(() => setAwardStep(1), 400));
    const n = Math.min(3, topThree.length);
    for (let i = 0; i < n; i++) {
      timers.push(setTimeout(() => setAwardStep(2 + i), 1200 + i * 1100));
    }
    timers.push(setTimeout(() => setAwardStep(5), 1200 + n * 1100 + 400));
    return () => timers.forEach(clearTimeout);
  }, [showAward, topThree.length]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearInterval(longPressTimer.current);
    };
  }, []);

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearInterval(longPressTimer.current);
      longPressTimer.current = null;
    }
    setClearProgress(0);
  }

  async function finishClearScores() {
    cancelLongPress();
    try {
      const snap = await clearScores(sessionId);
      setEntries(snap.entries);
      setClearedMsg("已全部清零");
      window.setTimeout(() => setClearedMsg(""), 3000);
    } catch {
      setClearedMsg("清零失败，请重试");
      window.setTimeout(() => setClearedMsg(""), 3000);
    }
  }

  function onClearPointerDown() {
    if (entries.length === 0) return;
    cancelLongPress();
    longPressStart.current = Date.now();
    longPressTimer.current = setInterval(() => {
      const elapsed = Date.now() - longPressStart.current;
      const p = Math.min(100, (elapsed / LONG_PRESS_MS) * 100);
      setClearProgress(p);
      if (p >= 100) void finishClearScores();
    }, 50);
  }

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

  function revealedPlaces(): { entry: LeaderboardEntry; placeIndex: number }[] {
    const n = topThree.length;
    const out: { entry: LeaderboardEntry; placeIndex: number }[] = [];
    const revealedCount = Math.max(0, Math.min(n, awardStep - 1));
    for (let k = 0; k < revealedCount; k++) {
      const placeIndex = n - 1 - k;
      out.push({ entry: topThree[placeIndex], placeIndex });
    }
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
        <button
          type="button"
          className="clear-scores-btn"
          disabled={entries.length === 0}
          onPointerDown={onClearPointerDown}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
        >
          清空能量
          {clearProgress > 0 && (
            <span
              className="clear-scores-progress"
              style={{ width: `${clearProgress}%` }}
              aria-hidden
            />
          )}
        </button>
        {clearedMsg && <p className="cleared-toast">{clearedMsg}</p>}
      </div>

      {entries.length === 0 ? (
        <p className="empty">等待小组加入…</p>
      ) : (
        <div className="bubble-canvas" ref={canvasRef}>
          {entries.map((e) => {
            const p = placementById.get(e.groupId);
            if (!p) return null;
            const glow = 0.35 + (p.size - 88) / (168 - 88) * 0.65;
            return (
              <div
                key={e.groupId}
                className={`energy-bubble${pulseIds.has(e.groupId) ? " score-pulse" : ""}`}
                style={{
                  left: p.x,
                  top: p.y,
                  width: p.size,
                  height: p.size,
                  ["--bubble-glow" as string]: String(glow),
                }}
              >
                <span className="bubble-name">{e.name}</span>
                <span className="bubble-score">{e.score}</span>
              </div>
            );
          })}
        </div>
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
            {awardStep >= 1 && <p className="award-title pop-in">科技小达人</p>}
            {awardStep >= 1 && <p className="award-sub pop-in">能量榜前三名 · 颁发勋章</p>}
            <ul className="award-list">
              {revealedPlaces().map(({ entry, placeIndex }) => (
                <li key={entry.groupId} className={`award-card place-${placeIndex} pop-in`}>
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
