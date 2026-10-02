import type { AgentWithRuntime, CleanerItem } from '../../../src/shared/types.js';
import { areaOfSeat, OB_PATH, PLAY_SPOTS, type CleanerArea, type PlaySpot } from './layout.js';
import type { SceneAgent } from './people.js';

/**
 * Sticky play-spot assignment: an idle agent keeps its spot while it stays
 * idle; newly idle agents take free spots in roster order. Prevents everyone
 * reshuffling (and walking around) when one agent goes back to work. When
 * spots run out, higher-priority idlers (manual break) can take a spot over.
 */
export function assignSpotsSticky(agents: SceneAgent[], prev: Map<string, PlaySpot>): Map<string, PlaySpot> {
  // Who gets a spot: manual breaks first, then agents idle after a session,
  // then agents that never had one. Ties keep current holders, then roster order.
  const idle = agents
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !a.walker && a.status === 'idle')
    .sort((x, y) => (x.a.idleRank ?? 2) - (y.a.idleRank ?? 2) || Number(!prev.has(x.a.id)) - Number(!prev.has(y.a.id)) || x.i - y.i)
    .slice(0, PLAY_SPOTS.length)
    .map(({ a }) => a);
  const out = new Map<string, PlaySpot>();
  const taken = new Set<string>();
  for (const a of idle) {
    const p = prev.get(a.id);
    if (p && !taken.has(p.k)) {
      out.set(a.id, p);
      taken.add(p.k);
    }
  }
  for (const a of agents) {
    if (!idle.includes(a) || out.has(a.id)) continue;
    const free = PLAY_SPOTS.find((s) => !taken.has(s.k));
    if (!free) break;
    out.set(a.id, free);
    taken.add(free.k);
  }
  return out;
}

/** Where machine-wide caches (no owning agent) are "mopped", in order of preference. */
const GLOBAL_AREAS: CleanerArea[] = ['santai', 'sofa', 'soc', 'data', 'pmo', 'produk', 'eng', 'ceo', 'cto'];

/**
 * Map cache items to office boy stops: a project cache stops at its agent's
 * area, machine-wide caches at free areas. Largest items win when two share
 * an area. Returns OB_PATH index -> stop label ("<cache> · <size>").
 */
export function cleanerStops(items: CleanerItem[], agents: AgentWithRuntime[], formatSize: (n: number) => string): Map<number, string> {
  const byArea = new Map<CleanerArea, CleanerItem>();
  const globals: CleanerItem[] = [];
  for (const it of [...items].sort((a, b) => b.bytes - a.bytes)) {
    const agent = it.agentId ? agents.find((a) => a.id === it.agentId) : undefined;
    const area = agent ? areaOfSeat(agent.seat) : undefined;
    if (area && !byArea.has(area)) byArea.set(area, it);
    else if (!area) globals.push(it);
  }
  for (const it of globals) {
    const area = GLOBAL_AREAS.find((a) => !byArea.has(a));
    if (!area) break;
    byArea.set(area, it);
  }
  const out = new Map<number, string>();
  OB_PATH.forEach((w, i) => {
    const it = w.area ? byArea.get(w.area) : undefined;
    if (it) out.set(i, `${it.label} · ${formatSize(it.bytes)}`);
  });
  return out;
}

/** Pick the next speech bubble: a random visible, undimmed agent other than the current one. */
export function pickQuip(
  agents: SceneAgent[],
  quipsOf: (id: string) => string[] | undefined,
  spots: Map<string, PlaySpot>,
  current: string | null,
  rnd: () => number = Math.random,
): { id: string; text: string } | null {
  const pool = agents
    .map((a) => {
      const spot = spots.get(a.id);
      const list = spot ? [spot.quip] : quipsOf(a.id) ?? [];
      return { a, list };
    })
    .filter(({ a, list }) => !a.dim && a.id !== current && list.length > 0);
  if (!pool.length) return null;
  const pick = pool[Math.floor(rnd() * pool.length)]!;
  return { id: pick.a.id, text: pick.list[Math.floor(rnd() * pick.list.length)]! };
}
