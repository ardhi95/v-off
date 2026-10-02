import type { Status } from '../../../src/shared/types.js';
import { seated, sitBody, sleepBody, standBody, painter, walker, type Look } from './characters.js';
import { col, Kit, type Groups } from './kit.js';
import { bedFeet, bedFoot, bedYaw, PLAY_SPOTS, SLEEP_STYLE, type Bed, type PlaySpot, type SeatXYZ } from './layout.js';
import { m4, Ry, seatPoint, T, type Vec3 } from './math.js';

export interface SceneAgent extends Look {
  id: string;
  status: Status;
  /** Filtered out: drawn greyed, never hidden. */
  dim: boolean;
  seat: SeatXYZ | null;
  monitors: 0 | 1 | 2;
  /** Lounge priority when idle: 0 manual break, 1 idle after a session, 2 never had a session. */
  idleRank?: number;
}

export const RING: Record<Status, string> = {
  kerja: '#35b87a', macet: '#ef6a3c', bicara: '#8b7bff', simak: '#8a90a0', bersih: '#2fb5c9', idle: '#ff7a9c',
};
const SCREEN: Record<Status, string> = {
  kerja: '#8fd8ff', macet: '#ff7a4d', bicara: '#c4b5ff', simak: '#3a4256', bersih: '#8fe3f0', idle: '#2a2f3a',
};

/** Idle agents take play spots in roster order; the rest stay at their desk. */
export function assignSpots(agents: SceneAgent[]): Map<string, PlaySpot> {
  const out = new Map<string, PlaySpot>();
  let i = 0;
  for (const a of agents) {
    if (!a.walker && a.status === 'idle' && i < PLAY_SPOTS.length) out.set(a.id, PLAY_SPOTS[i++]!);
  }
  return out;
}

export type Anchors = Record<string, Vec3>;

const NO_BEDS: ReadonlyMap<string, Bed> = new Map();

/** Label (p:) and pick (h:) anchors for every non-walker agent, and for anyone asleep in a bed. */
export function agentAnchors(agents: SceneAgent[], spots: Map<string, PlaySpot>, out: Anchors, beds: ReadonlyMap<string, Bed> = NO_BEDS): void {
  for (const a of agents) {
    const bed = beds.get(a.id);
    if (bed) {
      out['p:' + a.id] = [bed.x - bed.dir * 26, 118, bed.z];
      out['h:' + a.id] = [bed.x - bed.dir * 80, 70, bed.z];
      continue;
    }
    if (a.walker) continue;
    const sp = spots.get(a.id);
    if (sp) {
      out['p:' + a.id] = [sp.x, sp.pose === 'sit' ? 162 + (sp.yo ?? 0) : 172, sp.z];
      out['h:' + a.id] = [sp.x, sp.pose === 'sit' ? 95 + (sp.yo ?? 0) : 100, sp.z];
    } else if (a.seat) {
      out['p:' + a.id] = seatPoint(a.seat, 0, 162, 0);
      out['h:' + a.id] = seatPoint(a.seat, 0, 95, 4);
    } else {
      delete out['p:' + a.id];
      delete out['h:' + a.id];
    }
  }
}

interface CacheEntry {
  sig: string;
  groups: Record<string, Float32Array>;
}

export type PackedGroups = Record<string, Float32Array>;

function pack(G: Groups): Record<string, Float32Array> {
  return Object.fromEntries(Object.entries(G).filter(([, v]) => v.length).map(([k, v]) => [k, new Float32Array(v)]));
}

/**
 * Builds character geometry. Each agent's geometry is cached by a signature of
 * everything that affects it, so a status change rebuilds one agent, and a
 * selection change rebuilds only the rings.
 */
export class PeopleBuilder {
  private cache = new Map<string, CacheEntry>();

  /** `walking`: agents moving between desk and lounge (empty chair, body drawn by the renderer). */
  build(agents: SceneAgent[], spots: Map<string, PlaySpot>, walking: ReadonlySet<string> = new Set(), beds: ReadonlyMap<string, Bed> = NO_BEDS): PackedGroups {
    const parts: Record<string, Float32Array[]> = {};
    const seen = new Set<string>();
    for (const a of agents) {
      seen.add(a.id);
      const walk = walking.has(a.id);
      const sp = walk ? undefined : spots.get(a.id);
      const bed = walk ? undefined : beds.get(a.id);
      const sig = JSON.stringify([a, sp?.k, walk, bed?.k, beds.has(a.id)]);
      let entry = this.cache.get(a.id);
      if (!entry || entry.sig !== sig) {
        entry = { sig, groups: pack(this.buildOne(a, sp, walk, bed, beds.has(a.id))) };
        this.cache.set(a.id, entry);
      }
      for (const [k, arr] of Object.entries(entry.groups)) {
        const key = k === 'i' ? 'i_' + a.id : k === 'w' ? 'w_' + a.id : k;
        (parts[key] ??= []).push(arr);
      }
    }
    for (const id of this.cache.keys()) if (!seen.has(id)) this.cache.delete(id);
    if ([...spots.values()].some((s) => s.hold === 'paddle')) {
      const G: Groups = { ball: [] };
      new Kit(G).sph([0, 0, 0], 2, col('#ffffff', 2), 10, 7);
      parts.ball = [new Float32Array(G.ball!)];
    }
    // Always emit the shared groups so stale geometry is cleared on upload.
    const out: PackedGroups = {};
    for (const k of ['ppl', 'pplT', 'obBody', 'obLegL', 'obLegR', 'obArmL', 'obArmR', 'obMop', 'ball']) parts[k] ??= [];
    for (const [k, list] of Object.entries(parts)) {
      const merged = new Float32Array(list.reduce((n, a) => n + a.length, 0));
      let off = 0;
      for (const a of list) {
        merged.set(a, off);
        off += a.length;
      }
      out[k] = merged;
    }
    return out;
  }

  /** `bed`: asleep there; `toBed`: has a bed (asleep or walking to it), so the desk is empty. */
  private buildOne(a: SceneAgent, sp: PlaySpot | undefined, walking: boolean, bed?: Bed, toBed = false): Groups {
    const G: Groups = { ppl: [] };
    const K = new Kit(G);
    const pc = painter(a.dim);
    if (bed) {
      if (a.seat) seated(K, a, a.seat, a.monitors, a.status, pc, a.dim, true, SCREEN.idle);
      K.use('ppl');
      const [fx, fz] = bedFeet(bed);
      sleepBody(K, a, pc, m4(T(fx, 0, fz), Ry(bedYaw(bed))));
      return G;
    }
    if (a.walker) {
      walker(K, a, a.status, pc);
      return G;
    }
    if (a.seat) seated(K, a, a.seat, a.monitors, a.status, pc, a.dim, !!sp || walking || toBed, SCREEN[toBed ? 'idle' : a.status]);
    if (walking) {
      // Walking body at the origin; the renderer moves it along the route.
      K.use('w');
      standBody(K, (x, y, z) => [x, y, z], K.X, K.Z, a, a.status, pc, 'desk');
      return G;
    }
    if (sp) {
      // Playing body is built at the origin; the renderer places and animates it.
      K.use('i');
      const L0 = (x: number, y: number, z: number): Vec3 => [x, y, z];
      if (sp.pose === 'sit') sitBody(K, L0, K.X, K.Z, a, a.status, pc, sp.yo ?? 0, sp.hold);
      else standBody(K, L0, K.X, K.Z, a, a.status, pc, sp.hold);
      K.use('pplT');
      K.disc(sp.x, 1.4, sp.z, 32, 32, col('#000000', 0.28), col('#000000', 0), 28);
    }
    return G;
  }
}

export function buildRings(
  agents: SceneAgent[], spots: Map<string, PlaySpot>, selected: string | null,
  walking: ReadonlySet<string> = new Set(), beds: ReadonlyMap<string, Bed> = NO_BEDS,
): Groups {
  const G: Groups = { rings: [], obT: [] };
  const K = new Kit(G);
  for (const a of agents) {
    const sel = selected === a.id;
    const c = col(sel ? '#f5b83d' : a.dim ? '#6b717d' : RING[a.status], sel ? 2 : 1);
    const bed = beds.get(a.id);
    if (bed) {
      if (walking.has(a.id)) continue;
      // Asleep: ring on the floor at the foot of the bed, in the sleep colour.
      const [x, z] = bedFoot(bed);
      K.use('rings');
      K.ring(x, 1.6, z, sel ? 32 : 33, sel ? 42 : 37, sel || a.dim ? c : col(SLEEP_STYLE.fill), 48);
      continue;
    }
    if (a.walker) {
      K.use('obT');
      K.disc(0, 1.4, 0, 34, 34, col('#000000', 0.3), col('#000000', 0), 32);
      K.ring(0, 1.7, 0, sel ? 30 : 31, sel ? 40 : 35, c, 40);
      continue;
    }
    if (walking.has(a.id)) continue;
    const sp = spots.get(a.id);
    const c0 = sp ? [sp.x, 0, sp.z] : a.seat ? seatPoint(a.seat, 0, 0, -2) : null;
    if (!c0) continue;
    K.use('rings');
    K.ring(c0[0]!, 1.6, c0[2]!, sel ? (sp ? 32 : 40) : sp ? 33 : 41, sel ? (sp ? 42 : 50) : sp ? 37 : 45, c, 48);
  }
  return G;
}
