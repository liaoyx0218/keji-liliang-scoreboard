import { nanoid } from "nanoid";
import {
  type Session,
  type Group,
  type Wish,
  type Poster,
  type PosterFields,
  type SortSubmission,
  type LeaderboardPayload,
  type WishesPayload,
  type PostersPayload,
  type SortSubmissionsPayload,
  seqToGroupName,
  seqToTheme,
  isSortCorrect,
  getSortPuzzle,
} from "@kl/shared";

type IdFn = () => string;
type NowFn = () => string;

function normalizeSession(s: Session, newTeacherKey: IdFn): Session {
  const key = typeof s.teacherKey === "string" ? s.teacherKey.trim() : "";
  return {
    ...s,
    teacherKey: key.length >= 16 ? key : newTeacherKey(),
    wishActive: Boolean(s.wishActive),
    peerActive: Boolean(s.peerActive),
    sortActive: Boolean(s.sortActive),
    posterActive: Boolean(s.posterActive),
  };
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private groups = new Map<string, Group[]>();
  private wishes = new Map<string, Wish[]>();
  /** sessionId -> groupId -> Poster */
  private posters = new Map<string, Map<string, Poster>>();
  /** sessionId -> groupId -> SortSubmission */
  private sorts = new Map<string, Map<string, SortSubmission>>();

  constructor(
    private readonly newSessionId: IdFn = () => nanoid(16),
    private readonly newGroupId: IdFn = () => nanoid(12),
    private readonly now: NowFn = () => new Date().toISOString(),
    private readonly newWishId: IdFn = () => nanoid(12),
    private readonly newPosterId: IdFn = () => nanoid(12),
    private readonly newTeacherKey: IdFn = () => nanoid(32)
  ) {}

  createSession(): Session {
    this.sessions.clear();
    this.groups.clear();
    this.wishes.clear();
    this.posters.clear();
    this.sorts.clear();
    const ts = this.now();
    const session: Session = {
      id: this.newSessionId(),
      teacherKey: this.newTeacherKey(),
      status: "active",
      createdAt: ts,
      resetAt: ts,
      nextGroupSeq: 1,
      wishActive: false,
      peerActive: false,
      sortActive: false,
      posterActive: false,
    };
    this.sessions.set(session.id, session);
    this.groups.set(session.id, []);
    this.wishes.set(session.id, []);
    this.posters.set(session.id, new Map());
    this.sorts.set(session.id, new Map());
    return session;
  }

  /** 校验教师大屏密钥（常量时间比较） */
  verifyTeacherKey(sessionId: string, teacherKey: string | undefined): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.teacherKey || !teacherKey) return false;
    const a = session.teacherKey;
    const b = teacherKey;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  listSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getGroup(sessionId: string, groupId: string): Group | undefined {
    return (this.groups.get(sessionId) ?? []).find((g) => g.id === groupId);
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

  isPeerActive(sessionId: string): boolean {
    return Boolean(this.sessions.get(sessionId)?.peerActive);
  }

  reset(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    this.groups.set(sessionId, []);
    this.wishes.set(sessionId, []);
    this.posters.set(sessionId, new Map());
    this.sorts.set(sessionId, new Map());
    session.nextGroupSeq = 1;
    session.resetAt = this.now();
    session.wishActive = false;
    session.peerActive = false;
    session.sortActive = false;
    session.posterActive = false;
    return session;
  }

  clearScores(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    for (const g of this.groups.get(sessionId) ?? []) {
      g.score = 0;
    }
    return session;
  }

  private clearOtherModes(session: Session, keep: "wish" | "peer" | "sort" | "poster") {
    const turned: { wish?: boolean; peer?: boolean; sort?: boolean; poster?: boolean } = {};
    if (keep !== "wish" && session.wishActive) {
      session.wishActive = false;
      turned.wish = true;
    }
    if (keep !== "peer" && session.peerActive) {
      session.peerActive = false;
      turned.peer = true;
    }
    if (keep !== "sort" && session.sortActive) {
      session.sortActive = false;
      turned.sort = true;
    }
    if (keep !== "poster" && session.posterActive) {
      session.posterActive = false;
      turned.poster = true;
    }
    return turned;
  }

  setWishActive(sessionId: string, active: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const turnedOff = active ? this.clearOtherModes(session, "wish") : {};
    session.wishActive = active;
    return { session, turnedOff };
  }

  setPeerActive(sessionId: string, active: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const turnedOff = active ? this.clearOtherModes(session, "peer") : {};
    session.peerActive = active;
    return { session, turnedOff };
  }

  setSortActive(sessionId: string, active: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const turnedOff = active ? this.clearOtherModes(session, "sort") : {};
    session.sortActive = active;
    return { session, turnedOff };
  }

  submitSort(sessionId: string, groupId: string, order: string[]) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    if (!session.sortActive) return { error: "SORT_INACTIVE" as const };
    const group = (this.groups.get(sessionId) ?? []).find((g) => g.id === groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      return { error: "INVALID_ORDER" as const };
    }
    const theme = seqToTheme(group.seq);
    const puzzle = getSortPuzzle(theme);
    if (order.length !== puzzle.order.length) return { error: "INVALID_ORDER" as const };
    const ids = new Set(puzzle.cards.map((c) => c.id));
    if (order.some((id) => !ids.has(id)) || new Set(order).size !== order.length) {
      return { error: "INVALID_ORDER" as const };
    }
    const submission: SortSubmission = {
      groupId,
      groupName: seqToGroupName(group.seq),
      seq: group.seq,
      theme,
      order: [...order],
      correct: isSortCorrect(theme, order),
      submittedAt: this.now(),
    };
    if (!this.sorts.has(sessionId)) this.sorts.set(sessionId, new Map());
    this.sorts.get(sessionId)!.set(groupId, submission);
    return { submission };
  }

  sortsPayload(sessionId: string): SortSubmissionsPayload | { error: "NOT_FOUND" } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" };
    const map = this.sorts.get(sessionId) ?? new Map();
    const submissions = [...map.values()].sort((a, b) => a.seq - b.seq);
    return {
      type: "sorts",
      sessionId,
      sortActive: session.sortActive,
      submissions,
    };
  }

  setPosterActive(sessionId: string, active: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    const turnedOff = active ? this.clearOtherModes(session, "poster") : {};
    session.posterActive = active;
    return { session, turnedOff };
  }

  addWish(sessionId: string, groupId: string, text: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    if (!session.wishActive) return { error: "WISH_INACTIVE" as const };
    const trimmed = text.trim();
    if (!trimmed) return { error: "EMPTY_TEXT" as const };
    const group = (this.groups.get(sessionId) ?? []).find((g) => g.id === groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    const wish: Wish = {
      id: this.newWishId(),
      sessionId,
      groupId,
      groupName: seqToGroupName(group.seq),
      text: trimmed.slice(0, 200),
      createdAt: this.now(),
    };
    const list = this.wishes.get(sessionId) ?? [];
    list.push(wish);
    this.wishes.set(sessionId, list);
    return { wish };
  }

  upsertPosterDraft(sessionId: string, groupId: string, fields: PosterFields) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    if (!session.posterActive) return { error: "POSTER_INACTIVE" as const };
    const group = this.getGroup(sessionId, groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    const ts = this.now();
    const map = this.posters.get(sessionId) ?? new Map<string, Poster>();
    const prev = map.get(groupId);
    const poster: Poster = {
      id: prev?.id ?? this.newPosterId(),
      sessionId,
      groupId,
      groupName: seqToGroupName(group.seq),
      fields,
      imageUrl: prev?.imageUrl ?? "",
      prompt: prev?.prompt ?? "",
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    };
    map.set(groupId, poster);
    this.posters.set(sessionId, map);
    return { poster };
  }

  applyPosterImage(
    sessionId: string,
    groupId: string,
    fields: PosterFields,
    imageUrl: string,
    prompt: string
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" as const };
    if (!session.posterActive) return { error: "POSTER_INACTIVE" as const };
    const group = this.getGroup(sessionId, groupId);
    if (!group) return { error: "GROUP_NOT_FOUND" as const };
    const ts = this.now();
    const map = this.posters.get(sessionId) ?? new Map<string, Poster>();
    const prev = map.get(groupId);
    const poster: Poster = {
      id: prev?.id ?? this.newPosterId(),
      sessionId,
      groupId,
      groupName: seqToGroupName(group.seq),
      fields,
      imageUrl,
      prompt,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    };
    map.set(groupId, poster);
    this.posters.set(sessionId, map);
    return { poster };
  }

  getPoster(sessionId: string, groupId: string): Poster | undefined {
    return this.posters.get(sessionId)?.get(groupId);
  }

  wishesPayload(sessionId: string): WishesPayload | { error: "NOT_FOUND" } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" };
    return {
      type: "wishes",
      sessionId,
      wishActive: session.wishActive,
      wishes: [...(this.wishes.get(sessionId) ?? [])],
    };
  }

  postersPayload(sessionId: string): PostersPayload | { error: "NOT_FOUND" } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "NOT_FOUND" };
    const map = this.posters.get(sessionId) ?? new Map();
    const posters = [...map.values()].sort((a, b) => a.groupName.localeCompare(b.groupName, "zh"));
    return {
      type: "posters",
      sessionId,
      posterActive: session.posterActive,
      posters,
    };
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

  replaceAll(
    sessions: Session[],
    groupsBySession: Record<string, Group[]>,
    wishesBySession: Record<string, Wish[]> = {},
    postersBySession: Record<string, Poster[]> = {},
    sortsBySession: Record<string, SortSubmission[]> = {}
  ) {
    this.sessions.clear();
    this.groups.clear();
    this.wishes.clear();
    this.posters.clear();
    this.sorts.clear();
    for (const s of sessions) this.sessions.set(s.id, normalizeSession(s, this.newTeacherKey));
    for (const [id, gs] of Object.entries(groupsBySession)) this.groups.set(id, gs);
    for (const [id, ws] of Object.entries(wishesBySession)) this.wishes.set(id, ws);
    for (const [id, list] of Object.entries(postersBySession)) {
      const map = new Map<string, Poster>();
      for (const p of list) map.set(p.groupId, p);
      this.posters.set(id, map);
    }
    for (const [id, list] of Object.entries(sortsBySession)) {
      const map = new Map<string, SortSubmission>();
      for (const s of list) map.set(s.groupId, s);
      this.sorts.set(id, map);
    }
    for (const id of this.sessions.keys()) {
      if (!this.groups.has(id)) this.groups.set(id, []);
      if (!this.wishes.has(id)) this.wishes.set(id, []);
      if (!this.posters.has(id)) this.posters.set(id, new Map());
      if (!this.sorts.has(id)) this.sorts.set(id, new Map());
    }
  }

  dump() {
    const postersBySession: Record<string, Poster[]> = {};
    for (const [id, map] of this.posters.entries()) {
      postersBySession[id] = [...map.values()];
    }
    const sortsBySession: Record<string, SortSubmission[]> = {};
    for (const [id, map] of this.sorts.entries()) {
      sortsBySession[id] = [...map.values()];
    }
    return {
      sessions: [...this.sessions.values()],
      groupsBySession: Object.fromEntries(this.groups.entries()),
      wishesBySession: Object.fromEntries(this.wishes.entries()),
      postersBySession,
      sortsBySession,
    };
  }
}
