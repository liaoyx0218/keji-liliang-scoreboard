export type Binding = { sessionId: string; groupId: string; resetAt: string };
const key = (sessionId: string) => `kl-bind:${sessionId}`;

export function loadBinding(sessionId: string): Binding | null {
  const raw = localStorage.getItem(key(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Binding;
  } catch {
    return null;
  }
}

export function saveBinding(b: Binding) {
  localStorage.setItem(key(b.sessionId), JSON.stringify(b));
}

export function clearBinding(sessionId: string) {
  localStorage.removeItem(key(sessionId));
}
