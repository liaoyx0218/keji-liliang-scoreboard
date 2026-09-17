import fs from "node:fs";
import path from "node:path";
import { SessionStore } from "./SessionStore.js";

export function saveStore(filePath: string, store: SessionStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store.dump(), null, 2), "utf8");
}

export function loadStore(filePath: string): SessionStore {
  const store = new SessionStore();
  if (!fs.existsSync(filePath)) return store;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as ReturnType<SessionStore["dump"]>;
  store.replaceAll(raw.sessions, raw.groupsBySession);
  return store;
}
