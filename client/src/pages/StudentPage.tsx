import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { LeaderboardEntry } from "@kl/shared";
import { seqToTheme } from "@kl/shared";
import {
  addScore,
  fetchLeaderboard,
  fetchNlsToken,
  fetchSessionModes,
  fetchWishes,
  isNeedRejoinError,
  joinSession,
  submitWish,
  wsUrl,
} from "../api";
import { PosterEditor } from "../components/PosterEditor";
import { SortPuzzlePanel } from "../components/SortPuzzle";
import { TechBackdrop } from "../components/TechBackdrop";
import { startNlsAsr, type NlsAsrSession } from "../lib/nlsAsr";
import { clearBinding, loadBinding, saveBinding } from "../storage";
import "./StudentPage.css";

type Mode = "loading" | "play" | "needRejoin" | "error";
type GroupState = { id: string; name: string; score: number; seq: number };

export function StudentPage() {
  const { sessionId = "" } = useParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [group, setGroup] = useState<GroupState | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [failMsg, setFailMsg] = useState("");
  const [pulse, setPulse] = useState(false);
  const [wishActive, setWishActive] = useState(false);
  const [peerActive, setPeerActive] = useState(false);
  const [sortActive, setSortActive] = useState(false);
  const [posterActive, setPosterActive] = useState(false);
  const [wishDraft, setWishDraft] = useState("");
  const [wishListening, setWishListening] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);
  const [wishHint, setWishHint] = useState("");
  const [wishOk, setWishOk] = useState("");
  const asrRef = useRef<NlsAsrSession | null>(null);

  const loadModes = useCallback(async () => {
    try {
      const m = await fetchSessionModes(sessionId);
      setWishActive(Boolean(m.wishActive));
      setPeerActive(Boolean(m.peerActive));
      setSortActive(Boolean(m.sortActive));
      setPosterActive(Boolean(m.posterActive));
    } catch {
      try {
        const w = await fetchWishes(sessionId);
        setWishActive(Boolean(w.wishActive));
      } catch {
        setWishActive(false);
      }
      setPeerActive(false);
      setSortActive(false);
      setPosterActive(false);
    }
  }, [sessionId]);

  const doJoin = useCallback(async () => {
    setMode("loading");
    setFailMsg("");
    try {
      clearBinding(sessionId);
      const j = await joinSession(sessionId);
      saveBinding({ sessionId, groupId: j.groupId, resetAt: j.resetAt });
      setGroup({ id: j.groupId, name: j.name, score: j.score, seq: j.seq });
      const snap = await fetchLeaderboard(sessionId);
      setEntries(snap.entries);
      await loadModes();
      setMode("play");
    } catch {
      setMode("error");
    }
  }, [sessionId, loadModes]);

  const ensureGroup = useCallback(async () => {
    setMode("loading");
    setFailMsg("");
    try {
      const binding = loadBinding(sessionId);
      const snap = await fetchLeaderboard(sessionId);
      if (binding && snap.resetAt === binding.resetAt) {
        const entry = snap.entries.find((e) => e.groupId === binding.groupId);
        if (entry) {
          setEntries(snap.entries);
          setGroup({ id: entry.groupId, name: entry.name, score: entry.score, seq: entry.seq });
          await loadModes();
          setMode("play");
          return;
        }
      }
      if (binding) {
        setMode("needRejoin");
        return;
      }
      await doJoin();
    } catch {
      setMode("error");
    }
  }, [sessionId, doJoin, loadModes]);

  useEffect(() => {
    void ensureGroup();
  }, [ensureGroup]);

  useEffect(() => {
    if (mode !== "play") return;
    const binding = loadBinding(sessionId);
    if (!binding) return;

    let dead = false;
    let ws: WebSocket | undefined;

    const onStaleReset = () => {
      if (!dead) {
        setWishActive(false);
        setPeerActive(false);
        setSortActive(false);
        setPosterActive(false);
        setWishDraft("");
        setMode("needRejoin");
      }
    };

    ws = new WebSocket(wsUrl(sessionId));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as {
        type?: string;
        resetAt?: string;
        entries?: LeaderboardEntry[];
        active?: boolean;
        wishActive?: boolean;
        posterActive?: boolean;
      };
      if (msg.type === "wish_mode") {
        setWishActive(Boolean(msg.active));
        if (msg.active) {
          setPeerActive(false);
          setSortActive(false);
          setPosterActive(false);
        }
        if (!msg.active) {
          setWishDraft("");
          setWishHint("");
          setWishOk("");
        }
        return;
      }
      if (msg.type === "peer_mode") {
        setPeerActive(Boolean(msg.active));
        if (msg.active) {
          setWishActive(false);
          setSortActive(false);
          setPosterActive(false);
        }
        return;
      }
      if (msg.type === "sort_mode") {
        setSortActive(Boolean(msg.active));
        if (msg.active) {
          setWishActive(false);
          setPeerActive(false);
          setPosterActive(false);
        }
        return;
      }
      if (msg.type === "poster_mode") {
        setPosterActive(Boolean(msg.active));
        if (msg.active) {
          setWishActive(false);
          setPeerActive(false);
          setSortActive(false);
        }
        return;
      }
      if (msg.type === "wishes") {
        setWishActive(Boolean(msg.wishActive));
        return;
      }
      if (msg.type === "posters") {
        setPosterActive(Boolean(msg.posterActive));
        return;
      }
      if (msg.type !== "leaderboard") return;
      if (msg.resetAt && msg.resetAt !== binding.resetAt) {
        onStaleReset();
        return;
      }
      if (msg.entries) {
        setEntries(msg.entries);
        setGroup((g) => {
          if (!g) return g;
          const entry = msg.entries!.find((e) => e.groupId === g.id);
          if (!entry) return g;
          return { ...g, score: entry.score, name: entry.name, seq: entry.seq };
        });
      }
    };

    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const snap = await fetchLeaderboard(sessionId);
          if (!dead && snap.resetAt !== binding.resetAt) onStaleReset();
        } catch {
          /* ignore */
        }
      })();
    }, 15_000);

    return () => {
      dead = true;
      ws?.close();
      window.clearInterval(poll);
    };
  }, [mode, sessionId]);

  useEffect(() => {
    return () => {
      void asrRef.current?.stop();
      asrRef.current = null;
    };
  }, []);

  async function onRejoin() {
    clearBinding(sessionId);
    await doJoin();
  }

  async function onPlusSelf() {
    if (!group) return;
    setFailMsg("");
    try {
      const r = await addScore(sessionId, group.id, { source: "self" });
      setGroup((g) => (g ? { ...g, score: r.score } : g));
      setPulse(true);
      window.setTimeout(() => setPulse(false), 300);
    } catch (e) {
      if (isNeedRejoinError(e)) {
        setMode("needRejoin");
        return;
      }
      setFailMsg("没加上，再试一次");
    }
  }

  async function onPlusPeer(targetGroupId: string) {
    if (!group) return;
    setFailMsg("");
    try {
      await addScore(sessionId, targetGroupId, {
        source: "peer",
        fromGroupId: group.id,
      });
    } catch (e) {
      if (isNeedRejoinError(e)) {
        setMode("needRejoin");
        return;
      }
      setFailMsg("没加上，再试一次");
    }
  }

  async function onWishPointerDown() {
    if (!wishActive || wishBusy || wishListening) return;
    setWishHint("");
    setWishOk("");
    setWishBusy(true);
    try {
      const { token, appkey } = await fetchNlsToken();
      const session = await startNlsAsr(token, appkey, (ev) => {
        if (ev.type === "partial" || ev.type === "final") setWishDraft(ev.text);
        if (ev.type === "error") setWishHint(ev.message);
      });
      asrRef.current = session;
      setWishListening(true);
    } catch {
      setWishHint("打不开麦克风或听写，请检查权限后重试");
    } finally {
      setWishBusy(false);
    }
  }

  async function onWishPointerUp() {
    if (!asrRef.current) return;
    const session = asrRef.current;
    asrRef.current = null;
    setWishListening(false);
    setWishBusy(true);
    try {
      const text = await session.stop();
      if (text) setWishDraft(text);
      else if (!wishDraft) setWishHint("没听清，再说一次吧");
    } catch {
      setWishHint("听写结束失败，请重试");
    } finally {
      setWishBusy(false);
    }
  }

  async function onSubmitWish() {
    if (!group || !wishDraft.trim()) return;
    setWishBusy(true);
    setWishHint("");
    setWishOk("");
    try {
      await submitWish(sessionId, group.id, wishDraft.trim());
      setWishDraft("");
      setWishOk("已提交，可以说下一条");
    } catch (e) {
      if (isNeedRejoinError(e)) {
        setMode("needRejoin");
        return;
      }
      setWishHint("提交失败，再试一次");
    } finally {
      setWishBusy(false);
    }
  }

  const others = entries.filter((e) => e.groupId !== group?.id);

  if (mode === "loading") {
    return (
      <main className="page student-page">
        <TechBackdrop />
        <div className="status-block" role="status" aria-live="polite">
          <span className="status-kicker">CONNECT</span>
          <p className="loading-dots">正在接入能量场</p>
        </div>
      </main>
    );
  }

  if (mode === "error") {
    return (
      <main className="page student-page">
        <TechBackdrop />
        <div className="status-block">
          <span className="status-kicker">ERROR</span>
          <p className="error" role="alert">
            无法加入本场，请检查链接或稍后重试。
          </p>
          <button type="button" onClick={() => void ensureGroup()}>
            重试
          </button>
        </div>
      </main>
    );
  }

  if (mode === "needRejoin") {
    return (
      <main className="page student-page">
        <TechBackdrop />
        <div className="status-block">
          <span className="status-kicker">RESET</span>
          <p>本场已重新开始，点一下重新加入</p>
          <button type="button" onClick={() => void onRejoin()}>
            重新加入
          </button>
        </div>
      </main>
    );
  }

  if (wishActive) {
    return (
      <main className="page student-page student-page--play student-page--wish">
        <TechBackdrop />
        <header className="student-top">科技心愿卡</header>
        <div className="wish-card" aria-live="polite">
          <p className="wish-prompt">用一句话说出你的科技小愿望</p>
          <p className="wish-group">{group!.name}</p>
          <textarea
            className="wish-draft"
            rows={3}
            maxLength={200}
            value={wishDraft}
            onChange={(e) => setWishDraft(e.target.value)}
            placeholder="按住说话后，文字会出现在这里，也可以手改"
          />
          <button
            type="button"
            className={wishListening ? "wish-mic listening" : "wish-mic"}
            disabled={wishBusy}
            onPointerDown={(e) => {
              e.preventDefault();
              void onWishPointerDown();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              void onWishPointerUp();
            }}
            onPointerCancel={() => void onWishPointerUp()}
            onPointerLeave={() => {
              if (wishListening) void onWishPointerUp();
            }}
          >
            {wishListening ? "松开结束" : "按住说话"}
          </button>
          <button
            type="button"
            className="wish-submit"
            disabled={wishBusy || !wishDraft.trim()}
            onClick={() => void onSubmitWish()}
          >
            提交心愿
          </button>
          {wishHint && (
            <p className="error" role="alert">
              {wishHint}
            </p>
          )}
          {wishOk && <p className="wish-ok">{wishOk}</p>}
        </div>
      </main>
    );
  }

  if (sortActive && group) {
    return (
      <main className="page student-page student-page--play student-page--sort">
        <TechBackdrop />
        <header className="student-top">时光排序</header>
        <SortPuzzlePanel theme={seqToTheme(group.seq)} groupName={group.name} />
      </main>
    );
  }

  if (posterActive && group) {
    return (
      <main className="page student-page student-page--play student-page--poster">
        <TechBackdrop />
        <header className="student-top">AI 手抄报</header>
        <PosterEditor
          sessionId={sessionId}
          groupId={group.id}
          groupName={group.name}
          onNeedRejoin={() => setMode("needRejoin")}
        />
      </main>
    );
  }

  if (peerActive) {
    return (
      <main className="page student-page student-page--play student-page--peer">
        <TechBackdrop />
        <header className="student-top">小组互评</header>
        <div className="peer-panel">
          <p className="peer-panel-hint">
            你是 <strong>{group!.name}</strong> · 给别的组点能量吧
          </p>
          {failMsg && (
            <p className="error" role="alert">
              {failMsg}
            </p>
          )}
          <section className="student-peer-list">
            {others.length === 0 ? (
              <p className="peer-empty">还没有其他组</p>
            ) : (
              <ul>
                {others.map((e) => (
                  <li key={e.groupId} className="peer-row">
                    <span className="peer-name">{e.name}</span>
                    <span className="peer-score">能量 {e.score}</span>
                    <button
                      type="button"
                      className="peer-plus"
                      onClick={() => void onPlusPeer(e.groupId)}
                    >
                      +2
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page student-page student-page--play">
      <TechBackdrop />
      <header className="student-top">科技力量大</header>
      <div className="student-landscape student-landscape--self">
        <section className="student-info" aria-live="polite">
          <h1>{group!.name}</h1>
          <p className="energy">
            <span className="energy-label">能量</span>
            {group!.score}
          </p>
          {failMsg && (
            <p className="error" role="alert">
              {failMsg}
            </p>
          )}
        </section>
        <section className="student-action">
          <button
            type="button"
            className={pulse ? "plus-btn pulse" : "plus-btn"}
            onClick={() => void onPlusSelf()}
            aria-label="能量加二"
          >
            能量 +2
          </button>
        </section>
      </div>
    </main>
  );
}
