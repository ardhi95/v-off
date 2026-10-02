import type { AgentEvent, SessionSummary } from '../../src/shared/types.js';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  resolve: (id: string) => call<{ ok: true }>('POST', `/api/agents/${encodeURIComponent(id)}/resolve`, {}),
  setIdle: (id: string, idle: boolean) => call<{ ok: true }>('POST', `/api/agents/${encodeURIComponent(id)}/idle`, { idle }),
  log: (id: string) => call<AgentEvent[]>('GET', `/api/agents/${encodeURIComponent(id)}/log`),
  session: (id: string) => call<SessionSummary>('GET', `/api/sessions/${encodeURIComponent(id)}`),
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
