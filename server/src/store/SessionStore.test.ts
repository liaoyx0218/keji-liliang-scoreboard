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
    expect(s.wishActive).toBe(false);
    expect(s.peerActive).toBe(false);
    expect(s.posterActive).toBe(false);
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

  it("join assigns 衣 then 衣二", () => {
    store.createSession();
    const a = store.join("fixed-session");
    const b = store.join("fixed-session");
    expect("group" in a && a.group.seq).toBe(1);
    expect("group" in b && b.group.seq).toBe(2);
    expect(store.leaderboard("fixed-session")).toMatchObject({
      entries: [
        { name: '"衣"时光溯源队', score: 0, seq: 1 },
        { name: '"衣"科技赋能队', score: 0, seq: 2 },
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
    expect(board.entries.map((e) => e.name)).toEqual(['"衣"科技赋能队', '"衣"时光溯源队']);
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

  it("addWish appends multiple per group when active; inactive rejects", () => {
    store.createSession();
    const g = store.join("fixed-session");
    if (!("group" in g)) throw new Error("join");
    expect(store.addWish("fixed-session", g.group.id, "A")).toEqual({ error: "WISH_INACTIVE" });
    store.setWishActive("fixed-session", true);
    const a = store.addWish("fixed-session", g.group.id, "我想自动浇花");
    const b = store.addWish("fixed-session", g.group.id, "我想整理书包");
    expect("wish" in a && a.wish.text).toBe("我想自动浇花");
    expect("wish" in b && b.wish.groupName).toBe('"衣"时光溯源队');
    const payload = store.wishesPayload("fixed-session");
    if ("error" in payload) throw new Error("missing");
    expect(payload.wishes).toHaveLength(2);
    expect(payload.wishActive).toBe(true);
  });

  it("reset clears wishes and wishActive; clearScores keeps wishes", () => {
    store.createSession();
    const g = store.join("fixed-session");
    if (!("group" in g)) throw new Error("join");
    store.setWishActive("fixed-session", true);
    store.addWish("fixed-session", g.group.id, "心愿一");
    store.clearScores("fixed-session");
    expect(store.wishesPayload("fixed-session")).toMatchObject({
      wishes: [{ text: "心愿一" }],
      wishActive: true,
    });
    store.reset("fixed-session");
    expect(store.wishesPayload("fixed-session")).toEqual({
      type: "wishes",
      sessionId: "fixed-session",
      wishActive: false,
      wishes: [],
    });
    expect(store.getSession("fixed-session")!.peerActive).toBe(false);
  });

  it("peer and wish modes are mutually exclusive", () => {
    store.createSession();
    store.setPeerActive("fixed-session", true);
    expect(store.getSession("fixed-session")).toMatchObject({
      peerActive: true,
      wishActive: false,
      sortActive: false,
      posterActive: false,
    });
    const wish = store.setWishActive("fixed-session", true);
    expect("session" in wish && wish.turnedOff.peer).toBe(true);
    expect(store.getSession("fixed-session")).toMatchObject({
      peerActive: false,
      wishActive: true,
      sortActive: false,
      posterActive: false,
    });
  });

  it("poster draft and image upsert; reset clears posters; clearScores keeps", () => {
    store.createSession();
    const g = store.join("fixed-session");
    if (!("group" in g)) throw new Error("join");
    const fields = {
      title: "标题",
      subtitle: "副标题",
      body: "正文",
      summary: "总结",
    };
    expect(store.upsertPosterDraft("fixed-session", g.group.id, fields)).toEqual({
      error: "POSTER_INACTIVE",
    });
    store.setPosterActive("fixed-session", true);
    const draft = store.upsertPosterDraft("fixed-session", g.group.id, fields);
    expect("poster" in draft && draft.poster.fields.title).toBe("标题");
    expect("poster" in draft && draft.poster.imageUrl).toBe("");
    const imaged = store.applyPosterImage(
      "fixed-session",
      g.group.id,
      fields,
      "/media/posters/x.png",
      "prompt"
    );
    expect("poster" in imaged && imaged.poster.imageUrl).toBe("/media/posters/x.png");
    store.clearScores("fixed-session");
    expect(store.postersPayload("fixed-session")).toMatchObject({
      posters: [{ imageUrl: "/media/posters/x.png" }],
      posterActive: true,
    });
    store.reset("fixed-session");
    expect(store.postersPayload("fixed-session")).toEqual({
      type: "posters",
      sessionId: "fixed-session",
      posterActive: false,
      posters: [],
    });
  });

  it("poster mode turns off sort", () => {
    store.createSession();
    store.setSortActive("fixed-session", true);
    const r = store.setPosterActive("fixed-session", true);
    expect("session" in r && r.turnedOff.sort).toBe(true);
    expect(store.getSession("fixed-session")).toMatchObject({
      posterActive: true,
      sortActive: false,
    });
  });
});
