import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams } from "react-router-dom";
import {
  addScore,
  clearScores,
  fetchLeaderboard,
  fetchPosters,
  fetchSessionModes,
  fetchWishes,
  resetSession,
  startPeerMode,
  startPosterMode,
  startSortMode,
  startWishMode,
  stopPeerMode,
  stopPosterMode,
  stopSortMode,
  stopWishMode,
  wsUrl,
} from "../api";
import { TechBackdrop } from "../components/TechBackdrop";
import { layoutBubbles, SIZE_MAX, SIZE_MIN } from "../lib/bubbleLayout";
import type { LeaderboardEntry, Poster, Wish } from "@kl/shared";
import "./TeacherBoard.css";

const WS_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const LONG_PRESS_MS = 3000;

const PLACE_LABEL = ["冠军", "亚军", "季军"] as const;
const PLACE_MEDAL = ["🥇", "🥈", "🥉"] as const;

type Floater = { id: string; groupId: string; x: number; y: number };
type BoardView = "energy" | "wish" | "poster";

export function TeacherBoard() {
  const { sessionId = "" } = useParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [wishActive, setWishActive] = useState(false);
  const [peerActive, setPeerActive] = useState(false);
  const [sortActive, setSortActive] = useState(false);
  const [posterActive, setPosterActive] = useState(false);
  const [view, setView] = useState<BoardView>("energy");
  const [focusWish, setFocusWish] = useState<Wish | null>(null);
  const [focusPoster, setFocusPoster] = useState<Poster | null>(null);
  const [showAward, setShowAward] = useState(false);
  const [awardStep, setAwardStep] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 480 });
  const [clearProgress, setClearProgress] = useState(0);
  const [clearedMsg, setClearedMsg] = useState("");
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [failMsg, setFailMsg] = useState("");
  const [enterIds, setEnterIds] = useState<Set<string>>(new Set());
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevScores = useRef<Map<string, number>>(new Map());
  const prevWishIds = useRef<Set<string>>(new Set());
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
    const nextIds = new Set(wishes.map((w) => w.id));
    const fresh = wishes.filter((w) => !prevWishIds.current.has(w.id)).map((w) => w.id);
    prevWishIds.current = nextIds;
    if (fresh.length === 0) return;
    setEnterIds(new Set(fresh));
    const t = window.setTimeout(() => setEnterIds(new Set()), 700);
    return () => clearTimeout(t);
  }, [wishes]);

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
        const msg = JSON.parse(ev.data) as {
          type?: string;
          entries?: LeaderboardEntry[];
          wishes?: Wish[];
          posters?: Poster[];
          active?: boolean;
          wishActive?: boolean;
          posterActive?: boolean;
        };
        if (msg.type === "leaderboard" && msg.entries) setEntries(msg.entries);
        if (msg.type === "wishes") {
          setWishes(msg.wishes ?? []);
          setWishActive(Boolean(msg.wishActive));
        }
        if (msg.type === "posters") {
          setPosters(msg.posters ?? []);
          setPosterActive(Boolean(msg.posterActive));
        }
        if (msg.type === "wish_mode") {
          setWishActive(Boolean(msg.active));
          if (msg.active) {
            setPeerActive(false);
            setSortActive(false);
            setPosterActive(false);
            setView("wish");
          }
        }
        if (msg.type === "peer_mode") {
          setPeerActive(Boolean(msg.active));
          if (msg.active) {
            setWishActive(false);
            setSortActive(false);
            setPosterActive(false);
          }
        }
        if (msg.type === "sort_mode") {
          setSortActive(Boolean(msg.active));
          if (msg.active) {
            setWishActive(false);
            setPeerActive(false);
            setPosterActive(false);
          }
        }
        if (msg.type === "poster_mode") {
          setPosterActive(Boolean(msg.active));
          if (msg.active) {
            setWishActive(false);
            setPeerActive(false);
            setSortActive(false);
            setView("poster");
          }
        }
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
      try {
        const modes = await fetchSessionModes(sessionId, { signal: ac.signal });
        if (!dead) {
          setWishActive(Boolean(modes.wishActive));
          setPeerActive(Boolean(modes.peerActive));
          setSortActive(Boolean(modes.sortActive));
          setPosterActive(Boolean(modes.posterActive));
          if (modes.posterActive) setView("poster");
          else if (modes.wishActive) setView("wish");
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
      try {
        const w = await fetchWishes(sessionId, { signal: ac.signal });
        if (!dead) {
          setWishes(w.wishes ?? []);
          if (w.wishActive) {
            setWishActive(true);
            setView("wish");
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
      try {
        const p = await fetchPosters(sessionId, { signal: ac.signal });
        if (!dead) {
          setPosters(p.posters ?? []);
          if (p.posterActive) {
            setPosterActive(true);
            setView("poster");
          }
        }
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

  function onClearPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
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
    setWishes([]);
    setPosters([]);
    setWishActive(false);
    setPeerActive(false);
    setSortActive(false);
    setPosterActive(false);
    setFocusWish(null);
    setFocusPoster(null);
    setView("energy");
  }

  function openAward() {
    if (entries.length === 0) {
      window.alert("还没有小组，先让大家加分吧");
      return;
    }
    setShowAward(true);
  }

  async function onBubbleClick(groupId: string, size: number, left: number, top: number) {
    try {
      await addScore(sessionId, groupId, { source: "teacher" });
      setFailMsg("");
      const fid = `${groupId}-${Date.now()}`;
      setFloaters((f) => [
        ...f,
        { id: fid, groupId, x: left + size * 0.65, y: top + size * 0.15 },
      ]);
      window.setTimeout(() => {
        setFloaters((f) => f.filter((x) => x.id !== fid));
      }, 900);
    } catch {
      setFailMsg("没加上，再试一次");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onToggleWish() {
    try {
      if (wishActive) {
        await stopWishMode(sessionId);
        setWishActive(false);
      } else {
        await startWishMode(sessionId);
        setWishActive(true);
        setPeerActive(false);
        setSortActive(false);
        setPosterActive(false);
        setView("wish");
      }
      setFailMsg("");
    } catch {
      setFailMsg("心愿卡操作失败，请重试");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onTogglePeer() {
    try {
      if (peerActive) {
        await stopPeerMode(sessionId);
        setPeerActive(false);
      } else {
        await startPeerMode(sessionId);
        setPeerActive(true);
        setWishActive(false);
        setSortActive(false);
        setPosterActive(false);
      }
      setFailMsg("");
    } catch {
      setFailMsg("互评操作失败，请重试");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onToggleSort() {
    try {
      if (sortActive) {
        await stopSortMode(sessionId);
        setSortActive(false);
      } else {
        await startSortMode(sessionId);
        setSortActive(true);
        setWishActive(false);
        setPeerActive(false);
        setPosterActive(false);
      }
      setFailMsg("");
    } catch {
      setFailMsg("闯关操作失败，请重试");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onTogglePoster() {
    try {
      if (posterActive) {
        await stopPosterMode(sessionId);
        setPosterActive(false);
      } else {
        await startPosterMode(sessionId);
        setPosterActive(true);
        setWishActive(false);
        setPeerActive(false);
        setSortActive(false);
        setView("poster");
      }
      setFailMsg("");
    } catch {
      setFailMsg("手抄报操作失败，请重试");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
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
      <TechBackdrop />
      <header>
        <span className="brand-kicker">科技力 × 能量场</span>
        <h1
          className="board-title"
          aria-label={
            view === "wish"
              ? "科技力量大 · 科技心愿墙"
              : view === "poster"
                ? "科技力量大 · 手抄报墙"
                : "科技力量大 · 小组能量榜"
          }
        >
          <span className={view === "energy" ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 小组能量榜
          </span>
          <span className={view === "wish" ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 科技心愿墙
          </span>
          <span className={view === "poster" ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 手抄报墙
          </span>
        </h1>
        <button type="button" className="secret-reset" aria-label="隐式初始化" onClick={onSecretClick} />
      </header>

      <div className="board-layout">
        <div className="board-main">
          <div
            className={view === "wish" ? "board-pane is-active" : "board-pane"}
            aria-hidden={view !== "wish"}
            role="region"
            aria-label="科技心愿墙"
          >
            <div className="wish-wall">
              {wishes.length === 0 ? (
                <div className="empty-panel" role="status">
                  <p className="empty-title">心愿墙待机中</p>
                  <p className="empty">
                    {wishActive ? "等待小组说出心愿…" : "点击右侧「心愿卡」开始收集"}
                  </p>
                </div>
              ) : (
                <ul className="wish-grid">
                  {wishes.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className={enterIds.has(w.id) ? "wish-tile enter" : "wish-tile"}
                        onClick={() => setFocusWish(w)}
                        tabIndex={view === "wish" ? 0 : -1}
                      >
                        <span className="wish-tile-group">{w.groupName}</span>
                        <span className="wish-tile-text">{w.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className={view === "poster" ? "board-pane is-active" : "board-pane"}
            aria-hidden={view !== "poster"}
            role="region"
            aria-label="手抄报墙"
          >
            <div className="poster-wall">
              {posters.filter((p) => p.imageUrl).length === 0 ? (
                <div className="empty-panel" role="status">
                  <p className="empty-title">手抄报墙待机中</p>
                  <p className="empty">
                    {posterActive
                      ? "等待小组生成手抄报…"
                      : "点击右侧「手抄报」开始制作"}
                  </p>
                </div>
              ) : (
                <ul className="poster-grid">
                  {posters
                    .filter((p) => p.imageUrl)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="poster-tile"
                          onClick={() => setFocusPoster(p)}
                          tabIndex={view === "poster" ? 0 : -1}
                        >
                          <img src={p.imageUrl} alt="" />
                          <span className="poster-tile-group">{p.groupName}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className={view === "energy" ? "board-pane is-active" : "board-pane"}
            aria-hidden={view !== "energy"}
            role="region"
            aria-label="小组能量榜"
          >
            {entries.length === 0 ? (
              <div className="empty-panel" role="status">
                <p className="empty-title">能量场待机中</p>
                <p className="empty">等待小组扫码加入，气泡将在此汇聚…</p>
              </div>
            ) : (
              <div className="bubble-canvas" ref={canvasRef}>
                {entries.map((e) => {
                  const p = placementById.get(e.groupId);
                  if (!p) return null;
                  const glow =
                    0.2 + ((p.size - SIZE_MIN) / Math.max(1, SIZE_MAX - SIZE_MIN)) * 0.8;
                  const floatDur = `${5.5 + (e.seq % 5) * 0.7}s`;
                  const floatDelay = `${-((e.seq * 0.85) % 6)}s`;
                  return (
                    <button
                      type="button"
                      key={e.groupId}
                      className={`energy-bubble${pulseIds.has(e.groupId) ? " score-pulse" : ""}`}
                      style={{
                        left: p.x,
                        top: p.y,
                        width: p.size,
                        height: p.size,
                        ["--bubble-glow" as string]: String(glow),
                        ["--float-dur" as string]: floatDur,
                        ["--float-delay" as string]: floatDelay,
                      }}
                      onClick={() => onBubbleClick(e.groupId, p.size, p.x, p.y)}
                      aria-label={`${e.name} 能量球`}
                      tabIndex={view === "energy" ? 0 : -1}
                    >
                      <span className="bubble-name">{e.name}</span>
                      <span className="bubble-score">{e.score}</span>
                    </button>
                  );
                })}
                {floaters.map((f) => (
                  <span
                    key={f.id}
                    className="score-floater"
                    style={{ left: f.x, top: f.y }}
                    aria-hidden
                  >
                    +2
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside
          className="board-actions"
          aria-label="课堂操作"
          onContextMenu={(e) => e.preventDefault()}
        >
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
            onContextMenu={(e) => e.preventDefault()}
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
          <button
            type="button"
            className={sortActive ? "sort-toggle-btn is-on" : "sort-toggle-btn"}
            aria-pressed={sortActive}
            onClick={() => void onToggleSort()}
          >
            时光排序
          </button>
          <button
            type="button"
            className={posterActive ? "poster-toggle-btn is-on" : "poster-toggle-btn"}
            aria-pressed={posterActive}
            onClick={() => void onTogglePoster()}
          >
            手抄报
          </button>
          <button
            type="button"
            className={wishActive ? "wish-toggle-btn is-on" : "wish-toggle-btn"}
            aria-pressed={wishActive}
            onClick={() => void onToggleWish()}
          >
            心愿卡
          </button>
          <button
            type="button"
            className={peerActive ? "peer-toggle-btn is-on" : "peer-toggle-btn"}
            aria-pressed={peerActive}
            onClick={() => void onTogglePeer()}
          >
            小组互评
          </button>
          <button
            type="button"
            className={
              view === "wish" || view === "poster" ? "view-toggle-btn is-on" : "view-toggle-btn"
            }
            aria-pressed={view !== "energy"}
            onClick={() => {
              if (view === "energy") setView(posterActive ? "poster" : "wish");
              else if (view === "wish") setView("poster");
              else setView("energy");
            }}
          >
            {view === "energy" ? "成果墙" : view === "wish" ? "手抄报墙" : "能量榜"}
          </button>
          <div className="board-actions-status" aria-live="polite">
            {clearedMsg && <p className="cleared-toast">{clearedMsg}</p>}
            {failMsg && <p className="award-fail-toast">{failMsg}</p>}
            {sortActive && <p className="sort-live-hint">排序闯关中</p>}
            {posterActive && <p className="poster-live-hint">手抄报制作中</p>}
            {wishActive && <p className="wish-live-hint">收集中</p>}
            {peerActive && <p className="peer-live-hint">互评中</p>}
          </div>
        </aside>
      </div>

      {focusWish && (
        <div
          className="wish-focus-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="心愿放大展示"
          onClick={() => setFocusWish(null)}
        >
          <div className="wish-focus-card" onClick={(e) => e.stopPropagation()}>
            <p className="wish-focus-group">{focusWish.groupName}</p>
            <p className="wish-focus-text">{focusWish.text}</p>
            <button type="button" className="award-close" onClick={() => setFocusWish(null)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {focusPoster && (
        <div
          className="wish-focus-overlay poster-focus-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="手抄报放大展示"
          onClick={() => setFocusPoster(null)}
        >
          <div className="poster-focus-card" onClick={(e) => e.stopPropagation()}>
            <p className="wish-focus-group">{focusPoster.groupName}</p>
            <img src={focusPoster.imageUrl} alt={`${focusPoster.groupName}手抄报`} />
            <button type="button" className="award-close" onClick={() => setFocusPoster(null)}>
              关闭
            </button>
          </div>
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
