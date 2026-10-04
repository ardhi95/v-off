import type { AgentEvent, SessionOverview, SessionSummary } from '../../src/shared/types.js';

export const UNREACHABLE = 'server v-off tidak bisa dihubungi. Jalankan ulang server (npx v-off atau npm run dev).';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(UNREACHABLE); // connection refused: the server is not running
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // The server always answers errors in JSON; a bare 5xx comes from the dev proxy with no server behind it.
  if (!res.ok) throw new Error(data.error ?? (res.status >= 500 ? UNREACHABLE : `HTTP ${res.status}`));
  return data;
}

export const api = {
  resolve: (id: string) => call<{ ok: true }>('POST', `/api/agents/${encodeURIComponent(id)}/resolve`, {}),
  setIdle: (id: string, idle: boolean) => call<{ ok: true }>('POST', `/api/agents/${encodeURIComponent(id)}/idle`, { idle }),
  log: (id: string) => call<AgentEvent[]>('GET', `/api/agents/${encodeURIComponent(id)}/log`),
  sessions: (id: string) => call<SessionOverview[]>('GET', `/api/agents/${encodeURIComponent(id)}/sessions`),
  session: (id: string) => call<SessionSummary>('GET', `/api/sessions/${encodeURIComponent(id)}`),
  openOffice: () => call<{ ok: true }>('POST', '/api/limit/clear', {}),
};

/** Copy text; returns false when the clipboard is unavailable (e.g. not a secure context). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
