export type Session = {
  id: string;
  /** 教师大屏专用密钥，不出现在学生链接里 */
  teacherKey: string;
  status: "active";
  createdAt: string; // ISO
  resetAt: string; // ISO
  nextGroupSeq: number;
  wishActive: boolean;
  peerActive: boolean;
  sortActive: boolean;
  posterActive: boolean;
};

export type Group = {
  id: string;
  sessionId: string;
  seq: number;
  score: number;
  createdAt: string;
};

export type Wish = {
  id: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  text: string;
  createdAt: string;
};

export type PosterFields = {
  title: string;
  subtitle: string;
  body: string;
  summary: string;
};

/** 每组最新一张手抄报（可仅有草稿字段、尚无图） */
export type Poster = {
  id: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  fields: PosterFields;
  /** 浏览器可访问路径，如 /media/posters/...；无图时为空 */
  imageUrl: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaderboardEntry = {
  groupId: string;
  name: string;
  seq: number;
  score: number;
};

export type LeaderboardPayload = {
  type: "leaderboard";
  sessionId: string;
  resetAt: string;
  entries: LeaderboardEntry[];
};

export type WishModePayload = {
  type: "wish_mode";
  sessionId: string;
  active: boolean;
};

export type PeerModePayload = {
  type: "peer_mode";
  sessionId: string;
  active: boolean;
};

export type SortModePayload = {
  type: "sort_mode";
  sessionId: string;
  active: boolean;
};

export type SortSubmission = {
  groupId: string;
  groupName: string;
  seq: number;
  theme: "yi" | "shi" | "zhu";
  /** 学生提交的卡片 id 顺序（古→今） */
  order: string[];
  correct: boolean;
  submittedAt: string;
};

export type SortSubmissionsPayload = {
  type: "sorts";
  sessionId: string;
  sortActive: boolean;
  submissions: SortSubmission[];
};

export type PosterModePayload = {
  type: "poster_mode";
  sessionId: string;
  active: boolean;
};

export type WishesPayload = {
  type: "wishes";
  sessionId: string;
  wishActive: boolean;
  wishes: Wish[];
};

export type PostersPayload = {
  type: "posters";
  sessionId: string;
  posterActive: boolean;
  posters: Poster[];
};

export type SessionWsPayload =
  | LeaderboardPayload
  | WishModePayload
  | PeerModePayload
  | SortModePayload
  | SortSubmissionsPayload
  | PosterModePayload
  | WishesPayload
  | PostersPayload;
