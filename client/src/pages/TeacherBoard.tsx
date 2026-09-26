import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams } from "react-router-dom";
import {
  addScore,
  clearScores,
  fetchLeaderboard,
  fetchPosters,
  fetchSessionModes,
  fetchSorts,
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
  verifyTeacherKey,
  wsUrl,
} from "../api";
import { TechBackdrop } from "../components/TechBackdrop";
import { layoutBubbles, SIZE_MAX, SIZE_MIN } from "../lib/bubbleLayout";
import type { LeaderboardEntry, Poster, SortSubmission, SortTheme, Wish } from "@kl/shared";
import { getSortPuzzle, seqToTheme, stripThemePrefix } from "@kl/shared";
import "./TeacherBoard.css";

const WS_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const LONG_PRESS_MS = 3000;

const PLACE_LABEL = ["冠军", "亚军", "季军"] as const;
const PLACE_MEDAL = ["🥇", "🥈", "🥉"] as const;

type Floater = { id: string; groupId: string; x: number; y: number };
type BoardView = "energy" | "wish" | "poster" | "sort";

export function TeacherBoard() {
  const { sessionId = "", teacherKey = "" } = useParams();
  const [auth, setAuth] = useState<"loading" | "ok" | "bad">("loading");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [sorts, setSorts] = useState<SortSubmission[]>([]);
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

  const wishThemeColumns = useMemo(() => {
    const cols: { key: SortTheme; label: string; wishes: Wish[] }[] = [
      { key: "yi", label: "衣", wishes: [] },
      { key: "shi", label: "食", wishes: [] },
      { key: "zhu", label: "住", wishes: [] },
    ];
    const seqByGroup = new Map(entries.map((e) => [e.groupId, e.seq]));
    const themeOf = (w: Wish): SortTheme => {
      const seq = seqByGroup.get(w.groupId);
      if (seq !== undefined) return seqToTheme(seq);
      const m = w.groupName.match(/^"([衣食住])"/);
      if (m?.[1] === "食") return "shi";
      if (m?.[1] === "住") return "zhu";
      return "yi";
    };
    for (const w of wishes) {
      const col = cols.find((c) => c.key === themeOf(w));
      col?.wishes.push(w);
    }
    return cols;
  }, [wishes, entries]);

  const sortCards = useMemo(() => {
    const byId = new Map(sorts.map((s) => [s.groupId, s]));
    const ordered = [...entries].sort((a, b) => a.seq - b.seq);
    if (ordered.length === 0) {
      return sorts
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((s) => ({ groupId: s.groupId, groupName: s.groupName, seq: s.seq, submission: s }));
    }
    return ordered.map((e) => ({
      groupId: e.groupId,
      groupName: e.name,
      seq: e.seq,
      submission: byId.get(e.groupId),
    }));
  }, [entries, sorts]);

  const posterCards = useMemo(() => {
    const withImage = posters.filter((p) => p.imageUrl);
    const byId = new Map(withImage.map((p) => [p.groupId, p]));
    const ordered = [...entries].sort((a, b) => a.seq - b.seq);
    if (ordered.length === 0) {
      return withImage.map((p) => ({
        groupId: p.groupId,
        groupName: p.groupName,
        poster: p as Poster,
      }));
    }
    return ordered.map((e) => ({
      groupId: e.groupId,
      groupName: e.name,
      poster: byId.get(e.groupId),
    }));
  }, [entries, posters]);

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
        if (msg.type === "sorts") {
          setSorts(msg.submissions ?? []);
          setSortActive(Boolean(msg.sortActive));
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
            setView("energy");
          }
        }
        if (msg.type === "sort_mode") {
          setSortActive(Boolean(msg.active));
          if (msg.active) {
            setWishActive(false);
            setPeerActive(false);
            setPosterActive(false);
            setView("sort");
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
      if (!sessionId || !teacherKey) {
        if (!dead) setAuth("bad");
        return;
      }
      try {
        await verifyTeacherKey(sessionId, teacherKey);
        if (dead) return;
        setAuth("ok");
      } catch {
        if (!dead) setAuth("bad");
        return;
      }
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
          else if (modes.sortActive) setView("sort");
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
      try {
        const s = await fetchSorts(sessionId, { signal: ac.signal });
        if (!dead) {
          setSorts(s.submissions ?? []);
          if (s.sortActive) {
            setSortActive(true);
            setView("sort");
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
  }, [sessionId, teacherKey]);

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
      const snap = await clearScores(sessionId, teacherKey);
      setEntries(snap.entries);
      setClearedMsg("已清零");
      window.setTimeout(() => setClearedMsg(""), 3000);
    } catch {
      setClearedMsg("清零失败");
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
    await resetSession(sessionId, teacherKey);
    setWishes([]);
    setPosters([]);
    setSorts([]);
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
      await addScore(sessionId, groupId, { source: "teacher", teacherKey });
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

  async function stopAllModes() {
    const tasks: Promise<unknown>[] = [];
    if (wishActive) {
      tasks.push(
        stopWishMode(sessionId, teacherKey).then(() => {
          setWishActive(false);
        })
      );
    }
    if (peerActive) {
      tasks.push(
        stopPeerMode(sessionId, teacherKey).then(() => {
          setPeerActive(false);
        })
      );
    }
    if (sortActive) {
      tasks.push(
        stopSortMode(sessionId, teacherKey).then(() => {
          setSortActive(false);
        })
      );
    }
    if (posterActive) {
      tasks.push(
        stopPosterMode(sessionId, teacherKey).then(() => {
          setPosterActive(false);
        })
      );
    }
    await Promise.all(tasks);
  }

  async function onOpenWish() {
    try {
      if (!wishActive) {
        await startWishMode(sessionId, teacherKey);
        setWishActive(true);
        setPeerActive(false);
        setSortActive(false);
        setPosterActive(false);
      }
      setView("wish");
      setFailMsg("");
    } catch {
      setFailMsg("心愿卡失败");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onOpenPeer() {
    try {
      if (!peerActive) {
        await startPeerMode(sessionId, teacherKey);
        setPeerActive(true);
        setWishActive(false);
        setSortActive(false);
        setPosterActive(false);
      }
      setView("energy");
      setFailMsg("");
    } catch {
      setFailMsg("互评失败");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onOpenSort() {
    try {
      if (!sortActive) {
        await startSortMode(sessionId, teacherKey);
        setSortActive(true);
        setWishActive(false);
        setPeerActive(false);
        setPosterActive(false);
      }
      setView("sort");
      setFailMsg("");
    } catch {
      setFailMsg("排序失败");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onOpenPoster() {
    try {
      if (!posterActive) {
        await startPosterMode(sessionId, teacherKey);
        setPosterActive(true);
        setWishActive(false);
        setPeerActive(false);
        setSortActive(false);
      }
      setView("poster");
      setFailMsg("");
    } catch {
      setFailMsg("手抄报失败");
      window.setTimeout(() => setFailMsg(""), 2500);
    }
  }

  async function onOpenEnergy() {
    try {
      await stopAllModes();
      setView("energy");
      setFailMsg("");
    } catch {
      setFailMsg("切换失败");
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

  if (auth === "loading") {
    return (
      <main className="page teacher-board">
        <TechBackdrop />
        <div className="status-block" role="status">
          <span className="status-kicker">HOST</span>
          <p className="loading-dots">校验中…</p>
        </div>
      </main>
    );
  }

  if (auth === "bad") {
    return (
      <main className="page teacher-board">
        <TechBackdrop />
        <div className="status-block">
          <span className="status-kicker">HOST</span>
          <p className="error" role="alert">
            链接无效
          </p>
        </div>
      </main>
    );
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
                : view === "sort"
                  ? "科技力量大 · 时光排序"
                  : peerActive
                    ? "科技力量大 · 小组互评"
                    : "科技力量大 · 小组能量榜"
          }
        >
          <span className={view === "energy" && !peerActive ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 小组能量榜
          </span>
          <span className={view === "energy" && peerActive ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 小组互评
          </span>
          <span className={view === "sort" ? "is-active" : ""} aria-hidden="true">
            科技力量大 · 时光排序
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
              {!wishActive && wishes.length === 0 ? (
                <div className="empty-panel" role="status">
                  <p className="empty">点「心愿卡」开始</p>
                </div>
              ) : (
                <div className="wish-theme-cols">
                  {wishThemeColumns.map((col) => (
                    <section
                      key={col.key}
                      className="wish-theme-col"
                      aria-label={`${col.label}主题心愿`}
                    >
                      <header className="wish-theme-head">
                        <span className="wish-theme-label">「{col.label}」</span>
                        <span className="wish-theme-count">{col.wishes.length}</span>
                      </header>
                      <div className="wish-theme-scroll">
                        {col.wishes.length === 0 ? (
                          <p className="wish-theme-empty">
                            {wishActive ? "等待许愿…" : "暂无"}
                          </p>
                        ) : (
                          <ul className="wish-chat-list">
                            {col.wishes.map((w) => (
                              <li key={w.id}>
                                <button
                                  type="button"
                                  className={
                                    enterIds.has(w.id)
                                      ? "wish-bubble enter"
                                      : "wish-bubble"
                                  }
                                  onClick={() => setFocusWish(w)}
                                  tabIndex={view === "wish" ? 0 : -1}
                                >
                                  <span className="wish-bubble-name">
                                    {stripThemePrefix(w.groupName)}
                                  </span>
                                  <span className="wish-bubble-text">{w.text}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
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
              {posterCards.length === 0 ? (
                <div className="empty-panel" role="status">
                  <p className="empty">{posterActive ? "等待小组加入…" : "点「手抄报」开始"}</p>
                </div>
              ) : (
                <ul className="poster-grid">
                  {posterCards.map((card) => (
                    <li key={card.groupId}>
                      {card.poster?.imageUrl ? (
                        <button
                          type="button"
                          className="poster-tile"
                          onClick={() => setFocusPoster(card.poster!)}
                          tabIndex={view === "poster" ? 0 : -1}
                        >
                          <img src={card.poster.imageUrl} alt="" />
                          <span className="poster-tile-group">
                            {stripThemePrefix(card.groupName)}
                          </span>
                        </button>
                      ) : (
                        <div className="poster-tile is-pending" aria-label={`${card.groupName} 待生成`}>
                          <div className="poster-tile-placeholder">等待生成…</div>
                          <span className="poster-tile-group">
                            {stripThemePrefix(card.groupName)}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className={view === "sort" ? "board-pane is-active" : "board-pane"}
            aria-hidden={view !== "sort"}
            role="region"
            aria-label="时光排序"
          >
            <div className="sort-wall">
              {sortCards.length === 0 ? (
                <div className="empty-panel" role="status">
                  <p className="empty">{sortActive ? "等待小组加入…" : "点「时光排序」开始"}</p>
                </div>
              ) : (
                <ul className="sort-result-grid">
                  {sortCards.map((card) => {
                    const s = card.submission;
                    if (!s) {
                      return (
                        <li key={card.groupId} className="sort-result-card is-pending">
                          <div className="sort-result-head">
                            <span className="sort-result-group">
                              {stripThemePrefix(card.groupName)}
                            </span>
                            <span className="sort-result-theme">待提交</span>
                          </div>
                          <p className="sort-result-wait">等待提交…</p>
                        </li>
                      );
                    }
                    const puzzle = getSortPuzzle(s.theme);
                    const byId = new Map(puzzle.cards.map((c) => [c.id, c]));
                    return (
                      <li
                        key={card.groupId}
                        className={s.correct ? "sort-result-card is-ok" : "sort-result-card is-bad"}
                      >
                        <div className="sort-result-head">
                          <span className="sort-result-group">
                            {stripThemePrefix(s.groupName)}
                          </span>
                          <span className="sort-result-theme">{puzzle.themeLabel}</span>
                        </div>
                        <ol className="sort-result-strip" aria-label="提交顺序">
                          {s.order.map((id, i) => {
                            const item = byId.get(id);
                            return (
                              <li key={`${s.groupId}-${id}-${i}`}>
                                {item ? (
                                  <img src={item.image} alt={item.label} />
                                ) : (
                                  <span className="sort-result-missing">?</span>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div
            className={view === "energy" ? "board-pane is-active" : "board-pane"}
            aria-hidden={view !== "energy"}
            role="region"
            aria-label={peerActive ? "小组互评" : "小组能量榜"}
          >
            {entries.length === 0 ? (
              <div className="empty-panel" role="status">
                <p className="empty">等待小组加入…</p>
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
                        ["--bubble-size" as string]: String(p.size),
                        ["--bubble-glow" as string]: String(glow),
                        ["--float-dur" as string]: floatDur,
                        ["--float-delay" as string]: floatDelay,
                      }}
                      onClick={() => onBubbleClick(e.groupId, p.size, p.x, p.y)}
                      aria-label={`${e.name} 能量球`}
                      tabIndex={view === "energy" ? 0 : -1}
                    >
                      <span className="bubble-name">{stripThemePrefix(e.name)}</span>
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
          <button
            type="button"
            className={view === "energy" && !peerActive && !sortActive ? "view-toggle-btn is-on" : "view-toggle-btn"}
            aria-pressed={view === "energy" && !peerActive && !sortActive}
            onClick={() => void onOpenEnergy()}
          >
            能量榜
          </button>
          <button
            type="button"
            className={sortActive ? "sort-toggle-btn is-on" : "sort-toggle-btn"}
            aria-pressed={sortActive}
            onClick={() => void onOpenSort()}
          >
            时光排序
          </button>
          <button
            type="button"
            className={posterActive ? "poster-toggle-btn is-on" : "poster-toggle-btn"}
            aria-pressed={posterActive}
            onClick={() => void onOpenPoster()}
          >
            手抄报
          </button>
          <button
            type="button"
            className={wishActive ? "wish-toggle-btn is-on" : "wish-toggle-btn"}
            aria-pressed={wishActive}
            onClick={() => void onOpenWish()}
          >
            心愿卡
          </button>
          <button
            type="button"
            className={peerActive ? "peer-toggle-btn is-on" : "peer-toggle-btn"}
            aria-pressed={peerActive}
            onClick={() => void onOpenPeer()}
          >
            小组互评
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
          <button type="button" className="award-btn" onClick={openAward} disabled={entries.length === 0}>
            颁发科技小达人
          </button>
          <div className="board-actions-status" aria-live="polite">
            {clearedMsg && <p className="cleared-toast">{clearedMsg}</p>}
            {failMsg && <p className="award-fail-toast">{failMsg}</p>}
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
          className="poster-focus-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="手抄报放大展示"
          onClick={() => setFocusPoster(null)}
        >
          <button
            type="button"
            className="poster-focus-close"
            aria-label="关闭"
            onClick={() => setFocusPoster(null)}
          >
            ×
          </button>
          <img
            className="poster-focus-img"
            src={focusPoster.imageUrl}
            alt={`${focusPoster.groupName}手抄报`}
            onClick={(e) => e.stopPropagation()}
          />
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
            {awardStep >= 1 && <p className="award-sub pop-in">前三名</p>}
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
