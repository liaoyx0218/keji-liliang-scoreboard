export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    body?: string
  ) {
    super(body ?? code);
    this.name = "ApiError";
  }
}

const json = async (res: Response) => {
  if (!res.ok) {
    const text = await res.text();
    let code = "";
    try {
      const body = JSON.parse(text) as { error?: string };
      code = body.error ?? "";
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, code, text);
  }
  return res.json();
};

/** Session reset or group removed — student should rejoin. */
export function isNeedRejoinError(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 404) return false;
  return e.code === "GROUP_NOT_FOUND" || e.code === "NOT_FOUND";
}

export async function createSession() {
  return json(await fetch("/api/sessions", { method: "POST" }));
}

export async function joinSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" }));
}

export type ScoreSource = "self" | "peer" | "teacher";

export async function addScore(
  sessionId: string,
  groupId: string,
  opts?: { source?: ScoreSource; fromGroupId?: string }
) {
  const body: { source?: ScoreSource; fromGroupId?: string } = {};
  if (opts?.source) body.source = opts.source;
  if (opts?.fromGroupId) body.fromGroupId = opts.fromGroupId;
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.keys(body).length ? body : {}),
    })
  );
}

export async function fetchLeaderboard(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/leaderboard`, init));
}

export async function resetSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/reset`, { method: "POST" }));
}

export async function clearScores(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/clear-scores`, { method: "POST" }));
}

export async function startWishMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/wish/start`, { method: "POST" }));
}

export async function stopWishMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/wish/stop`, { method: "POST" }));
}

export async function startPeerMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/peer/start`, { method: "POST" }));
}

export async function stopPeerMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/peer/stop`, { method: "POST" }));
}

export async function startSortMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/sort/start`, { method: "POST" }));
}

export async function stopSortMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/sort/stop`, { method: "POST" }));
}

export async function fetchSorts(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/sorts`, init));
}

export async function submitSort(sessionId: string, groupId: string, order: string[]) {
  return json(
    await fetch(`/api/sessions/${sessionId}/sorts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, order }),
    })
  );
}

export async function fetchSessionModes(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/modes`, init)) as Promise<{
    wishActive: boolean;
    peerActive: boolean;
    sortActive: boolean;
    posterActive: boolean;
  }>;
}

export async function fetchWishes(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/wishes`, init));
}

export async function submitWish(sessionId: string, groupId: string, text: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/wishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, text }),
    })
  );
}

export async function startPosterMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/poster/start`, { method: "POST" }));
}

export async function stopPosterMode(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/poster/stop`, { method: "POST" }));
}

export async function fetchPosters(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/posters`, init)) as Promise<{
    posters: import("@kl/shared").Poster[];
    posterActive: boolean;
  }>;
}

export async function fetchPosterTemplate(sessionId: string, groupId: string) {
  const q = new URLSearchParams({ groupId });
  return json(await fetch(`/api/sessions/${sessionId}/poster/template?${q}`)) as Promise<{
    groupId: string;
    groupName: string;
    seq: number;
    theme: string;
    themeLabel: string;
    role: string;
    roleLabel: string;
    layoutHint: string;
    defaults: { title: string; subtitle: string; body: string; summary: string };
    fields: { title: string; subtitle: string; body: string; summary: string };
    imageUrl: string;
    posterActive: boolean;
  }>;
}

export async function generatePoster(
  sessionId: string,
  groupId: string,
  fields: { title: string; subtitle: string; body: string; summary: string }
) {
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/poster/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    })
  );
}

export async function fetchNlsToken() {
  return json(await fetch("/api/nls/token")) as Promise<{
    token: string;
    appkey: string;
    expireTime: number;
  }>;
}

export function wsUrl(sessionId: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
