const json = async (res: Response) => {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

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

export async function fetchLeaderboard(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/leaderboard`));
}

export async function resetSession(sessionId: string) {
  return json(await fetch(`/api/sessions/${sessionId}/reset`, { method: "POST" }));
}

export function wsUrl(sessionId: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
