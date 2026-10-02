import type { AgentWithRuntime, Department } from '../../src/shared/types.js';
import { freeSeats, podsFrom, seatOf, SPECIES, type SeatXYZ } from './office/layout.js';
import type { SceneAgent } from './office/people.js';

const DEFAULT_PANTS = '#2f3542';
const DEFAULT_SHOE = '#2b2e35';

/**
 * Turn API agents into renderable scene agents: resolve seats from departments,
 * give guests ("Agent tanpa nama") a free desk seat, and apply species colours.
 * Hidden agents are left out. `dim` marks agents outside the active filter.
 */
export function toSceneAgents(
  agents: AgentWithRuntime[],
  departments: Department[],
  isDim: (a: AgentWithRuntime) => boolean = () => false,
): SceneAgent[] {
  const pods = podsFrom(departments);
  const visible = agents.filter((a) => !a.hidden);
  const seats = new Map<string, { seat: SeatXYZ; monitors: 0 | 1 | 2 }>();
  for (const a of visible) {
    const s = seatOf(a, pods);
    if (s) seats.set(a.id, s);
  }
  const free = freeSeats(pods, [...seats.values()].map((s) => s.seat));
  for (const a of visible) {
    if (!seats.has(a.id) && !a.walker && free.length) seats.set(a.id, { seat: free.shift()!, monitors: 0 });
  }

  return visible.map((a) => {
    const sp = SPECIES[a.animal] ?? SPECIES.dog;
    const s = seats.get(a.id);
    return {
      id: a.id,
      status: a.runtime.status,
      dim: isDim(a),
      seat: s?.seat ?? null,
      monitors: s?.monitors ?? 0,
      animal: SPECIES[a.animal] ? a.animal : 'dog',
      skin: sp.skin,
      acc: sp.acc,
      muz: sp.muz,
      shirt: a.shirt,
      pants: a.pants ?? DEFAULT_PANTS,
      shoe: a.shoe ?? DEFAULT_SHOE,
      glasses: a.accessories?.glasses,
      phones: a.accessories?.phones,
      beret: a.accessories?.beret,
      cap: a.accessories?.cap,
      hood: a.accessories?.hood,
      tie: a.accessories?.tie,
      walker: a.walker,
    };
  });
}
