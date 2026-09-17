import { nanoid } from "nanoid";
import {
  type Session,
  type Group,
  type LeaderboardPayload,
  seqToGroupName,
} from "@kl/shared";

type IdFn = () => string;
type NowFn = () => string;

export class SessionStore {
  private sessions = new Map<string, Session>();
  private groups = new Map<string, Group[]>();

  constructor(
    private readonly newSessionId: IdFn = () => nanoid(16),
    private readonly newGroupId: IdFn = () => nanoid(12),
    private readonly now: NowFn = () => new Date().toISOString()
  ) {}

  createSession(): Session {
    const ts = this.now();
    const session: Session = {
      id: this.newSessionId(),
      status: "active",
      createdAt: ts,
      resetAt: ts,
      nextGroupSeq: 1,
    };
    this.sessions.set(session.id, session);
    this.groups.set(session.id, []);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  join(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const group: Group = {
      id: this.newGroupId(),
      sessionId,
      seq: session.nextGroupSeq,
      score: 0,
      createdAt: this.now(),
    };
    session.nextGroupSeq += 1;
    this.groups.get(sessionId)!.push(group);
    return { group, resetAt: session.resetAt };
  }

  addScore(sessionId: string, groupId: string, delta = 2) {
    if (!this.sessions.has(sessionId)) return { error: "NOT_FOUND" as const };
    const list = this.groups.get(sessionId)!;
    const group = list.find((g) => g.id === groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    group.score += delta;
    return { group };
  }

  reset(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    this.groups.set(sessionId, []);
    session.nextGroupSeq = 1;
    session.resetAt = this.now();
    return session;
  }

  leaderboard(sessionId: string): LeaderboardPayload | { error: "NOT_FOUND" } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" };
    const entries = [...(this.groups.get(sessionId) ?? [])]
      .map((g) => ({
        groupId: g.id,
        name: seqToGroupName(g.seq),
        seq: g.seq,
        score: g.score,
      }))
      .sort((a, b) => b.score - a.score || a.seq - b.seq);
    return {
      type: "leaderboard",
      sessionId,
      resetAt: session.resetAt,
      entries,
    };
  }

  replaceAll(sessions: Session[], groupsBySession: Record<string, Group[]>) {
    this.sessions.clear();
    this.groups.clear();
    for (const s of sessions) this.sessions.set(s.id, s);
    for (const [id, gs] of Object.entries(groupsBySession)) this.groups.set(id, gs);
  }

  dump() {
    return {
      sessions: [...this.sessions.values()],
      groupsBySession: Object.fromEntries(this.groups.entries()),
    };
  }
}
