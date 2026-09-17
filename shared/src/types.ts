export type Session = {
  id: string;
  status: "active";
  createdAt: string; // ISO
  resetAt: string; // ISO
  nextGroupSeq: number;
};

export type Group = {
  id: string;
  sessionId: string;
  seq: number;
  score: number;
  createdAt: string;
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
