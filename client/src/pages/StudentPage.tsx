import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { addScore, fetchLeaderboard, isNeedRejoinError, joinSession, wsUrl } from "../api";
import { clearBinding, loadBinding, saveBinding } from "../storage";
import "./StudentPage.css";

type Mode = "loading" | "play" | "needRejoin" | "error";
type GroupState = { id: string; name: string; score: number };

export function StudentPage() {
  const { sessionId = "" } = useParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [group, setGroup] = useState<GroupState | null>(null);
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
      const msg = JSON.parse(ev.data) as { type?: string; resetAt?: string };
      if (msg.type === "leaderboard" && msg.resetAt && msg.resetAt !== binding.resetAt) {
        onStaleReset();
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

  async function onPlus() {
    if (!group) return;
    setFailMsg("");
    try {
      const r = await addScore(sessionId, group.id);
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

  if (mode === "loading") {
    return (
      <main className="page student-page">
        <p>加载中…</p>
      </main>
    );
  }

  if (mode === "error") {
    return (
      <main className="page student-page">
        <p className="error">无法加入本场，请检查链接或稍后重试。</p>
        <button type="button" onClick={() => void ensureGroup()}>
          重试
        </button>
      </main>
    );
  }

  if (mode === "needRejoin") {
    return (
      <main className="page student-page">
        <p>本场已重新开始，点一下重新加入</p>
        <button type="button" onClick={() => void onRejoin()}>
          重新加入
        </button>
      </main>
    );
  }

  return (
    <main className="page student-page student-page--play">
      <header className="student-top">科技力量大</header>
      <div className="student-landscape">
        <section className="student-info">
          <h1>{group!.name}</h1>
          <p className="energy">能量 {group!.score}</p>
          {failMsg && <p className="error">{failMsg}</p>}
        </section>
        <section className="student-action">
          <button
            type="button"
            className={pulse ? "plus-btn pulse" : "plus-btn"}
            onClick={() => void onPlus()}
          >
            能量 +2
          </button>
        </section>
      </div>
    </main>
  );
}
