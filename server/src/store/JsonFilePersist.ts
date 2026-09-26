import fs from "node:fs";
import path from "node:path";
import type { Group, Poster, Session, SortSubmission, Wish } from "@kl/shared";
import { SessionStore } from "./SessionStore.js";

type DumpShape = {
  sessions: Session[];
  groupsBySession: Record<string, Group[]>;
  wishesBySession?: Record<string, Wish[]>;
  postersBySession?: Record<string, Poster[]>;
  sortsBySession?: Record<string, SortSubmission[]>;
};

export function saveStore(filePath: string, store: SessionStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store.dump(), null, 2), "utf8");
}

export function loadStore(filePath: string): SessionStore {
  const store = new SessionStore();
  if (!fs.existsSync(filePath)) return store;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as DumpShape;
  store.replaceAll(
    raw.sessions ?? [],
    raw.groupsBySession ?? {},
    raw.wishesBySession ?? {},
    raw.postersBySession ?? {},
    raw.sortsBySession ?? {}
  );
  return store;
}
