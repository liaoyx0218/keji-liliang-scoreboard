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

  it("round-trips session and scores", () => {
    const store = new SessionStore();
    const s = store.createSession();
    const j = store.join(s.id);
    if (!("group" in j)) throw new Error("join");
    store.addScore(s.id, j.group.id);
    saveStore(file, store);
    const loaded = loadStore(file);
    const board = loaded.leaderboard(s.id);
    expect("entries" in board && board.entries[0].score).toBe(2);
  });
});
