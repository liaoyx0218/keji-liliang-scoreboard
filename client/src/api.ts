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
  return json(await fetch("/api/sessions", { method: "POST" })) as Promise<{
    sessionId: string;
    studentPath: string;
    teacherPath: string;
  }>;
}

export async function joinSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" }));
}

export type ScoreSource = "self" | "peer" | "teacher";

function teacherHeaders(teacherKey: string, jsonBody = false): HeadersInit {
  const h: Record<string, string> = { "X-Teacher-Key": teacherKey };
  if (jsonBody) h["Content-Type"] = "application/json";
  return h;
}

export async function verifyTeacherKey(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/teacher/verify`, {
      headers: teacherHeaders(teacherKey),
    })
  ) as Promise<{ ok: boolean }>;
}

export async function addScore(
  sessionId: string,
  groupId: string,
  opts?: { source?: ScoreSource; fromGroupId?: string; teacherKey?: string }
) {
  const body: { source?: ScoreSource; fromGroupId?: string } = {};
  if (opts?.source) body.source = opts.source;
  if (opts?.fromGroupId) body.fromGroupId = opts.fromGroupId;
  const headers: HeadersInit =
    opts?.source === "teacher" && opts.teacherKey
      ? teacherHeaders(opts.teacherKey, true)
      : { "Content-Type": "application/json" };
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/score`, {
      method: "POST",
      headers,
      body: JSON.stringify(Object.keys(body).length ? body : {}),
    })
  );
}

export async function fetchLeaderboard(sessionId: string, init?: RequestInit) {
  return json(await fetch(`/api/sessions/${sessionId}/leaderboard`, init));
}

export async function resetSession(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/reset`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function clearScores(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/clear-scores`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function startWishMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/wish/start`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function stopWishMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/wish/stop`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function startPeerMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/peer/start`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function stopPeerMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/peer/stop`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function startSortMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/sort/start`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function stopSortMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/sort/stop`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
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

export async function startPosterMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/poster/start`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
}

export async function stopPosterMode(sessionId: string, teacherKey: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/poster/stop`, {
      method: "POST",
      headers: teacherHeaders(teacherKey),
    })
  );
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
