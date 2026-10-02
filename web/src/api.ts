import { useEffect, useState } from 'react';
import type { AgentEvent, AgentWithRuntime, CleanerState, StateSnapshot } from '../../src/shared/types.js';

const MAX_EVENTS = 50;

export interface OfficeData {
  state: StateSnapshot | null;
  error: string | null;
  /** SSE stream connected. */
  live: boolean;
}

export function applyAgentUpdate(state: StateSnapshot, agent: AgentWithRuntime): StateSnapshot {
  const i = state.agents.findIndex((a) => a.id === agent.id);
  const agents = i === -1 ? [...state.agents, agent] : state.agents.map((a, j) => (j === i ? agent : a));
  return { ...state, agents };
}

export function applyEvent(state: StateSnapshot, ev: AgentEvent): StateSnapshot {
  return { ...state, events: [ev, ...state.events].slice(0, MAX_EVENTS) };
}

/** Initial snapshot from /api/state, kept current by the /api/stream SSE feed. */
export function useOfficeData(): OfficeData {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as StateSnapshot;
        if (!cancelled) {
          setState(snap);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(`Server v-off tidak bisa dihubungi (${(err as Error).message}).`);
      }
    };
    void load();

    const es = new EventSource('/api/stream');
    // Resync after every (re)connect so nothing missed while offline is lost.
    es.onopen = () => {
      setLive(true);
      void load();
    };
    es.onerror = () => setLive(false);
    es.addEventListener('agent-updated', (e) => {
      const agent = JSON.parse((e as MessageEvent<string>).data) as AgentWithRuntime;
      setState((s) => (s ? applyAgentUpdate(s, agent) : s));
    });
    es.addEventListener('event-added', (e) => {
      const ev = JSON.parse((e as MessageEvent<string>).data) as AgentEvent;
      setState((s) => (s ? applyEvent(s, ev) : s));
    });
    // Pengaturan saved (here or in another tab): roster and departments changed.
    es.addEventListener('config-updated', () => void load());
    es.addEventListener('cleaner-updated', (e) => {
      const cleaner = JSON.parse((e as MessageEvent<string>).data) as CleanerState;
      setState((s) => (s ? { ...s, cleaner } : s));
    });
    return () => {
      cancelled = true;
      es.close();
    };
  }, []);

  return { state, error, live };
}
