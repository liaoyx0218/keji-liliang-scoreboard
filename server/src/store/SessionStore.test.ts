import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "./SessionStore.js";

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => {
    let groupN = 0;
    store = new SessionStore(
      () => "fixed-session",
      () => `fixed-group-${++groupN}`,
      () => "2026-01-01T00:00:00.000Z"
    );
  });

  it("createSession returns active session with nextGroupSeq 1", () => {
    const s = store.createSession();
    expect(s.id).toBe("fixed-session");
    expect(s.status).toBe("active");
    expect(s.nextGroupSeq).toBe(1);
    expect(s.resetAt).toBe(s.createdAt);
  });

  it("createSession clears all previous sessions and groups", () => {
    let n = 0;
    store = new SessionStore(
      () => `sess-${++n}`,
      () => `g-${n}`,
      () => "2026-01-01T00:00:00.000Z"
    );
    store.createSession();
    store.join("sess-1");
    const g = store.join("sess-1");
    if (!("group" in g)) throw new Error("join");
    store.addScore("sess-1", g.group.id);

    const second = store.createSession();
    expect(second.id).toBe("sess-2");
    expect(store.getSession("sess-1")).toBeUndefined();
    expect(store.leaderboard("sess-1")).toEqual({ error: "NOT_FOUND" });
    expect(store.leaderboard("sess-2")).toMatchObject({ entries: [] });
    const again = store.join("sess-2");
    expect("group" in again && again.group.seq).toBe(1);
  });

  it("join assigns 组一 then 组二", () => {
    store.createSession();
    const a = store.join("fixed-session");
    const b = store.join("fixed-session");
    expect("group" in a && a.group.seq).toBe(1);
    expect("group" in b && b.group.seq).toBe(2);
    expect(store.leaderboard("fixed-session")).toMatchObject({
      entries: [
        { name: "组一", score: 0, seq: 1 },
        { name: "组二", score: 0, seq: 2 },
      ],
    });
  });

  it("addScore +2 and sorts by score desc then seq asc", () => {
    store.createSession();
    const g1 = store.join("fixed-session");
    const g2 = store.join("fixed-session");
    if (!("group" in g1) || !("group" in g2)) throw new Error("join failed");
    store.addScore("fixed-session", g2.group.id);
    store.addScore("fixed-session", g2.group.id);
    store.addScore("fixed-session", g1.group.id);
    const board = store.leaderboard("fixed-session");
    if ("error" in board) throw new Error("missing");
    expect(board.entries.map((e) => e.name)).toEqual(["组二", "组一"]);
    expect(board.entries[0].score).toBe(4);
    expect(board.entries[1].score).toBe(2);
  });

  it("reset clears groups and bumps resetAt", () => {
    let t = 0;
    store = new SessionStore(
      () => "s1",
      () => `g${t}`,
      () => `2026-01-01T00:00:0${t++}.000Z`
    );
    store.createSession();
    store.join("s1");
    const before = store.getSession("s1")!.resetAt;
    store.reset("s1");
    const after = store.getSession("s1")!;
    expect(after.nextGroupSeq).toBe(1);
    expect(after.resetAt).not.toBe(before);
    const board = store.leaderboard("s1");
    expect("entries" in board && board.entries).toEqual([]);
    const again = store.join("s1");
    expect("group" in again && again.group.seq).toBe(1);
  });

  it("addScore on unknown group returns GROUP_NOT_FOUND", () => {
    store.createSession();
    expect(store.addScore("fixed-session", "nope")).toEqual({ error: "GROUP_NOT_FOUND" });
  });

  it("join on missing session returns NOT_FOUND", () => {
    expect(store.join("missing-session")).toEqual({ error: "NOT_FOUND" });
  });

  it("reset on missing session returns NOT_FOUND", () => {
    expect(store.reset("missing-session")).toEqual({ error: "NOT_FOUND" });
  });

  it("leaderboard on missing session returns NOT_FOUND", () => {
    expect(store.leaderboard("missing-session")).toEqual({ error: "NOT_FOUND" });
  });

  it("addScore on missing session returns NOT_FOUND", () => {
    expect(store.addScore("missing-session", "any-group")).toEqual({ error: "NOT_FOUND" });
  });

  it("clearScores zeros all scores without changing resetAt or group count", () => {
    store.createSession();
    const g1 = store.join("fixed-session");
    const g2 = store.join("fixed-session");
    if (!("group" in g1) || !("group" in g2)) throw new Error("join failed");
    store.addScore("fixed-session", g1.group.id);
    store.addScore("fixed-session", g2.group.id);
    store.addScore("fixed-session", g2.group.id);
    const resetAtBefore = store.getSession("fixed-session")!.resetAt;
    const result = store.clearScores("fixed-session");
    if ("error" in result) throw new Error("clearScores failed");
    expect(store.getSession("fixed-session")!.resetAt).toBe(resetAtBefore);
    const board = store.leaderboard("fixed-session");
    if ("error" in board) throw new Error("board missing");
    expect(board.entries).toHaveLength(2);
    expect(board.entries.every((e) => e.score === 0)).toBe(true);
  });

  it("clearScores on missing session returns NOT_FOUND", () => {
    expect(store.clearScores("missing-session")).toEqual({ error: "NOT_FOUND" });
  });
});
