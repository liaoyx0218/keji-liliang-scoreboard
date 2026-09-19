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

export async function addScore(sessionId: string, groupId: string) {
  return json(
    await fetch(`/api/sessions/${sessionId}/groups/${groupId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
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

export function wsUrl(sessionId: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
