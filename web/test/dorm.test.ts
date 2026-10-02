import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentRuntime, AgentWithRuntime, LimitState, Status } from '../../src/shared/types.js';
import { assignBeds, BED, bedFeet, BEDS, DORM, exitChain, podsFrom, route, seatOf } from '../src/office/layout.js';
import { agentAnchors, buildRings, PeopleBuilder, type Anchors } from '../src/office/people.js';
import { buildStatic } from '../src/office/staticScene.js';
import { locationOf, officeOffText } from '../src/present.js';
import { toSceneAgents } from '../src/sceneAgents.js';

const config = defaultConfig();
const pods = podsFrom(config.departments);
const runtime = (status: Status): AgentRuntime => ({ status, manualIdle: false, tokensToday: 0, costToday: 0 });
const agents: AgentWithRuntime[] = config.agents.map((a) => ({ ...a, runtime: runtime(a.walker ? 'bersih' : 'idle') }));

describe('dorm layout', () => {
  it('has one bedroom per default agent plus spares, all left of the office', () => {
    expect(BEDS.length).toBeGreaterThanOrEqual(config.agents.length);
    expect(new Set(BEDS.map((b) => b.k)).size).toBe(BEDS.length);
    for (const b of BEDS) {
      expect(b.x).toBeLessThan(-1050);
      expect(b.x).toBeGreaterThanOrEqual(DORM.X0);
      // The bed and its room fit; the door is inside the room.
      expect(b.z - BED.W / 2).toBeGreaterThanOrEqual(b.z0);
      expect(b.z + BED.W / 2).toBeLessThanOrEqual(b.z1);
      expect(b.doorZ).toBeGreaterThan(b.z0);
      expect(b.doorZ).toBeLessThan(b.z1);
    }
    // No bedroom overlaps the hall to the office door.
    for (const b of BEDS.filter((x) => x.dir === 1)) expect(b.z1 <= DORM.HZ0 || b.z0 >= DORM.HZ1).toBe(true);
  });

  it('gives beds in roster order and leaves extras without one', () => {
    const ids = Array.from({ length: BEDS.length + 2 }, (_, i) => `a${i}`);
    const beds = assignBeds(ids);
    expect(beds.size).toBe(BEDS.length);
    expect(beds.get('a0')).toBe(BEDS[0]);
    expect(beds.has(`a${BEDS.length}`)).toBe(false);
  });

  it('walks from every desk to every bed through the office door', () => {
    for (const a of config.agents) {
      const s = seatOf(a, pods);
      if (!s) continue;
      for (const bed of BEDS) {
        const path = route({ kind: 'seat', seat: s.seat }, { kind: 'bed', bed });
        expect(path[path.length - 1]).toEqual(bedFeet(bed));
        // Crosses the wall only through the doorway.
        for (let i = 1; i < path.length; i++) {
          const [x0, z0] = path[i - 1]!, [x1, z1] = path[i]!;
          if ((x0 + 1050) * (x1 + 1050) < 0) {
            expect(z0).toBe(z1);
            expect(z0).toBeGreaterThan(DORM.DZ0);
            expect(z0).toBeLessThan(DORM.DZ1);
          }
        }
      }
    }
    expect(exitChain({ kind: 'bed', bed: BEDS[0]! }).at(-1)).toEqual([-950, 620]);
  });
});

describe('sleeping agents', () => {
  const scene = toSceneAgents(agents, config.departments);
  const beds = assignBeds(scene.map((a) => a.id));

  it('builds sleepers into the shared people group, office boy included', () => {
    const b = new PeopleBuilder();
    const awake = b.build(scene, new Map());
    const asleep = b.build(scene, new Map(), new Set(), beds);
    expect(asleep.ppl!.length).toBeGreaterThan(awake.ppl!.length);
    expect(asleep.obBody!.length).toBe(0);
    // Sleepers lie in the dorm (x < -1050), on the bed (above the mattress, below the headboard).
    const raka = new PeopleBuilder().build(scene.filter((a) => a.id === 'raka'), new Map(), new Set(), beds).ppl!;
    let inBed = 0;
    for (let i = 0; i < raka.length; i += 10) if (raka[i]! < -1050) inBed++;
    expect(inBed).toBeGreaterThan(0);
  });

  it('anchors labels on the pillow and rings at the foot of the bed', () => {
    const out: Anchors = {};
    agentAnchors(scene, new Map(), out, beds);
    const bed = beds.get('udin')!;
    expect(out['p:udin']![0]).toBeCloseTo(bed.x - bed.dir * 26);
    expect(buildRings(scene, new Map(), null, new Set(), beds).obT!.length).toBe(0);
  });

  it('static scene has the dorm wall and both lamp states', () => {
    const G = buildStatic(pods);
    for (const k of ['dormW', 'dormOn', 'dormOff']) expect(G[k]!.length).toBeGreaterThan(0);
  });

  it('describes the office-off state', () => {
    const since = new Date('2026-10-02T13:00:00').getTime();
    const limit: LimitState = { since, resetsAt: new Date('2026-10-02T15:00:00').getTime(), until: 0, reason: '', agentId: 'raka' };
    expect(officeOffText(limit)).toMatch(/Kantor off.*Asrama.*15[.:]00/);
    expect(officeOffText({ ...limit, resetsAt: undefined, until: since + 5 * 3600_000 })).toMatch(/paling lambat 18[.:]00/);
    expect(locationOf(agents[0]!, config.departments, undefined, true)).toBe('Asrama · tidur di kamar');
  });
});
