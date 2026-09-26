import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionStore } from "./SessionStore.js";
import { loadStore, saveStore } from "./JsonFilePersist.js";

describe("JsonFilePersist", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kl-"));
    file = path.join(dir, "data.json");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("loadStore on missing file returns empty store usable like fresh", () => {
    const missing = path.join(dir, "does-not-exist.json");
    expect(fs.existsSync(missing)).toBe(false);
    const loaded = loadStore(missing);
    expect(loaded.dump()).toEqual(new SessionStore().dump());
    const s = loaded.createSession();
    const board = loaded.leaderboard(s.id);
    if ("error" in board) throw new Error("expected session");
    expect(board).toMatchObject({ type: "leaderboard", sessionId: s.id, entries: [] });
  });

  it("round-trips session and scores", () => {
    const store = new SessionStore();
    const s = store.createSession();
    const j = store.join(s.id);
    if (!("group" in j)) throw new Error("join");
    store.addScore(s.id, j.group.id);
    store.setWishActive(s.id, true);
    store.addWish(s.id, j.group.id, "心愿");
    saveStore(file, store);
    const loaded = loadStore(file);
    const board = loaded.leaderboard(s.id);
    expect("entries" in board && board.entries[0].score).toBe(2);
    const wishes = loaded.wishesPayload(s.id);
    expect("wishes" in wishes && wishes.wishes[0].text).toBe("心愿");
    expect("wishActive" in wishes && wishes.wishActive).toBe(true);

    loaded.setPosterActive(s.id, true);
    loaded.upsertPosterDraft(s.id, j.group.id, {
      title: "报",
      subtitle: "副",
      body: "文",
      summary: "结",
    });
    saveStore(file, loaded);
    const loaded2 = loadStore(file);
    const posters = loaded2.postersPayload(s.id);
    expect("posters" in posters && posters.posters[0].fields.title).toBe("报");
    expect(loaded2.getSession(s.id)?.posterActive).toBe(true);
  });

  it("loads legacy dump without wishesBySession / wishActive", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        sessions: [
          {
            id: "legacy",
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            resetAt: "2026-01-01T00:00:00.000Z",
            nextGroupSeq: 1,
          },
        ],
        groupsBySession: { legacy: [] },
      }),
      "utf8"
    );
    const loaded = loadStore(file);
    expect(loaded.getSession("legacy")?.wishActive).toBe(false);
    expect(loaded.wishesPayload("legacy")).toMatchObject({ wishes: [], wishActive: false });
  });
});
