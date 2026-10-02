import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentWithRuntime, CleanerItem, Status } from '../../src/shared/types.js';
import { assignSpotsSticky, cleanerStops, pickQuip } from '../src/office/behavior.js';
import { exitChain, OB_PATH, pathLength, PLAY_SPOTS, pointAt, podsFrom, route, seatOf, type PlaySpot } from '../src/office/layout.js';
import { toSceneAgents } from '../src/sceneAgents.js';

const config = defaultConfig();
const pods = podsFrom(config.departments);
const withStatus = (status: (id: string) => Status): AgentWithRuntime[] =>
  config.agents.map((a) => ({ ...a, runtime: { status: a.walker ? 'bersih' : status(a.id), manualIdle: false, tokensToday: 0, costToday: 0 } }));
const scene = (status: (id: string) => Status) => toSceneAgents(withStatus(status), config.departments);

describe('assignSpotsSticky', () => {
  it('keeps spots for agents that stay idle when others leave', () => {
    const idle = new Set(['hendra', 'rina', 'ayu']);
    const first = assignSpotsSticky(scene((id) => (idle.has(id) ? 'idle' : 'kerja')), new Map());
    expect([...first.entries()].map(([id, s]) => [id, s.k])).toEqual([['hendra', 'pp1'], ['rina', 'pp2'], ['ayu', 'f1']]);
    idle.delete('hendra');
    idle.add('raka');
    const next = assignSpotsSticky(scene((id) => (idle.has(id) ? 'idle' : 'kerja')), first);
    expect(next.get('rina')?.k).toBe('pp2');
    expect(next.get('ayu')?.k).toBe('f1');
    expect(next.get('raka')?.k).toBe('pp1');
    expect(next.has('hendra')).toBe(false);
  });

  it('never exceeds the number of play spots', () => {
    expect(assignSpotsSticky(scene(() => 'idle'), new Map()).size).toBe(PLAY_SPOTS.length);
  });
});

describe('cleanerStops', () => {
  const agents = withStatus(() => 'kerja');
  const item = (label: string, bytes: number, agentId?: string): CleanerItem => ({ path: '/x/' + label, label, bytes, agentId });
  const areaIndex = (area: string) => OB_PATH.findIndex((w) => w.area === area);

  it('stops at the owning agent area, globals fill free areas, largest wins', () => {
    const stops = cleanerStops(
      [item('node_modules/.cache milik Raka', 3 * 1024 ** 3, 'raka'), item('.next/cache milik Dewi', 1024 ** 3, 'dewi'), item('cache npm', 2 * 1024 ** 2), item('cache Yoga', 5, 'yoga')],
      agents,
      (n) => `${n} B`,
    );
    expect(stops.get(areaIndex('eng'))).toBe(`node_modules/.cache milik Raka · ${3 * 1024 ** 3} B`);
    expect(stops.get(areaIndex('santai'))).toBe(`cache npm · ${2 * 1024 ** 2} B`);
    expect(stops.get(areaIndex('soc'))).toBe('cache Yoga · 5 B');
    expect(stops.size).toBe(3);
  });

  it('has no stops without scan data', () => {
    expect(cleanerStops([], agents, String).size).toBe(0);
  });
});

describe('pickQuip', () => {
  it('uses agent quips at the desk and spot quips while playing, skipping dimmed and current', () => {
    const s = scene((id) => (id === 'raka' ? 'idle' : 'kerja')).map((a) => ({ ...a, dim: a.id !== 'raka' && a.id !== 'nina' }));
    const spots = new Map<string, PlaySpot>([['raka', PLAY_SPOTS[0]!]]);
    const quips = (id: string) => config.agents.find((a) => a.id === id)?.quips;
    expect(pickQuip(s, quips, spots, null, () => 0)).toEqual({ id: 'raka', text: PLAY_SPOTS[0]!.quip });
    expect(pickQuip(s, quips, spots, 'raka', () => 0)).toEqual({ id: 'nina', text: 'Mode gelapnya sudah rapi!' });
    expect(pickQuip(s.map((a) => ({ ...a, dim: true })), quips, spots, null)).toBeNull();
  });
});

describe('walking routes', () => {
  it('goes from every desk seat to every play spot through the corridors', () => {
    for (const a of config.agents) {
      const s = seatOf(a, pods);
      if (!s) continue;
      for (const sp of PLAY_SPOTS) {
        const pts = route({ kind: 'seat', seat: s.seat }, { kind: 'spot', spot: sp });
        expect(pts[0]).toEqual([s.seat[0], s.seat[1]]);
        expect(pts[pts.length - 1]).toEqual([sp.x, sp.z]);
        // Desk-side points stay in the office; nothing leaves the building.
        for (const [x, z] of pts) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1050);
          expect(z).toBeGreaterThan(-840);
          expect(z).toBeLessThan(1350);
        }
      }
    }
  });

  it('private rooms exit through the glass door', () => {
    const chain = exitChain({ kind: 'seat', seat: [-775, -772, 0] });
    expect(chain).toContainEqual([-575, -520]);
    expect(chain).toContainEqual([-575, -380]);
  });

  it('interpolates position and heading along a path', () => {
    const pts: [number, number][] = [[0, 0], [100, 0], [100, 50]];
    expect(pathLength(pts)).toBe(150);
    expect(pointAt(pts, 50)).toMatchObject({ x: 50, z: 0 });
    expect(pointAt(pts, 125)).toMatchObject({ x: 100, z: 25, yaw: 0 });
    expect(pointAt(pts, 999)).toMatchObject({ x: 100, z: 50 });
  });
});

describe('assignSpotsSticky priority', () => {
  it('gives a manual break a spot even when never-active agents fill the lounge', () => {
    const base = scene(() => 'idle').map((a) => ({ ...a, idleRank: 2 }));
    const full = assignSpotsSticky(base, new Map());
    expect(full.has('mega')).toBe(false);
    const withBreak = base.map((a) => (a.id === 'mega' ? { ...a, idleRank: 0 } : a));
    const next = assignSpotsSticky(withBreak, full);
    expect(next.has('mega')).toBe(true);
    expect(next.size).toBe(PLAY_SPOTS.length);
    // Exactly one previous holder was bumped; everyone else kept their spot.
    const kept = [...full].filter(([id, s]) => next.get(id)?.k === s.k);
    expect(kept).toHaveLength(PLAY_SPOTS.length - 1);
  });
});
