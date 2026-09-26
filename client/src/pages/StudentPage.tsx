import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { LeaderboardEntry } from "@kl/shared";
import { addScore, fetchLeaderboard, isNeedRejoinError, joinSession, wsUrl } from "../api";
import { TechBackdrop } from "../components/TechBackdrop";
import { clearBinding, loadBinding, saveBinding } from "../storage";
import "./StudentPage.css";

type Mode = "loading" | "play" | "needRejoin" | "error";
type View = "home" | "peer";
type GroupState = { id: string; name: string; score: number };

export function StudentPage() {
  const { sessionId = "" } = useParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [view, setView] = useState<View>("home");
  const [group, setGroup] = useState<GroupState | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [failMsg, setFailMsg] = useState("");
  const [pulse, setPulse] = useState(false);

  const doJoin = useCallback(async () => {
    setMode("loading");
    setFailMsg("");
    try {
      clearBinding(sessionId);
      const j = await joinSession(sessionId);
      saveBinding({ sessionId, groupId: j.groupId, resetAt: j.resetAt });
      setGroup({ id: j.groupId, name: j.name, score: j.score });
      const snap = await fetchLeaderboard(sessionId);
      setEntries(snap.entries);
      setMode("play");
    } catch {
      setMode("error");
    }
  }, [sessionId]);

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
          setGroup({ id: entry.groupId, name: entry.name, score: entry.score });
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
  }, [sessionId, doJoin]);

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
      if (!dead) setMode("needRejoin");
    };

    ws = new WebSocket(wsUrl(sessionId));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as {
        type?: string;
        resetAt?: string;
        entries?: LeaderboardEntry[];
      };
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
          return { ...g, score: entry.score, name: entry.name };
        });
      }
    };

    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const snap = await fetchLeaderboard(sessionId);
          if (!dead && snap.resetAt !== binding.resetAt) onStaleReset();
        } catch {
          /* ignore transient errors */
        }
      })();
    }, 15_000);

    return () => {
      dead = true;
      ws?.close();
      window.clearInterval(poll);
    };
  }, [mode, sessionId]);

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

  if (view === "peer") {
    return (
      <main className="page student-page student-page--play student-page--peer">
        <TechBackdrop />
        <header className="peer-screen-header">
          <button type="button" className="peer-back-btn" onClick={() => setView("home")}>
            返回
          </button>
          <h1 className="peer-screen-title">小组互评</h1>
          <p className="peer-screen-sub">{group!.name}</p>
        </header>
        {failMsg && (
          <p className="error peer-fail" role="alert">
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
      </main>
    );
  }

  return (
    <main className="page student-page student-page--play">
      <TechBackdrop />
      <header className="student-top">科技力量大</header>
      <div className="student-landscape">
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
          <button
            type="button"
            className="peer-entry-btn"
            onClick={() => {
              setFailMsg("");
              setView("peer");
            }}
          >
            小组互评
          </button>
        </section>
      </div>
    </main>
  );
}
