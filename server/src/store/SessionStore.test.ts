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
});
