import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentWithRuntime, AgentRuntime, StateSnapshot, Status } from '../../src/shared/types.js';
import { applyAgentUpdate, applyEvent } from '../src/api.js';
import { OrbitCamera, project } from '../src/office/camera.js';
import { Kit } from '../src/office/kit.js';
import { freeSeats, podSeat, podsFrom, PLAY_SPOTS, seatOf, VIEWS } from '../src/office/layout.js';
import { assignSpots, buildRings, PeopleBuilder } from '../src/office/people.js';
import { buildStatic } from '../src/office/staticScene.js';
import { toSceneAgents } from '../src/sceneAgents.js';

const config = defaultConfig();
const pods = podsFrom(config.departments);
const runtime = (status: Status): AgentRuntime => ({ status, manualIdle: false, tokensToday: 0, costToday: 0 });
const withStatus = (status: (id: string) => Status): AgentWithRuntime[] =>
  config.agents.map((a) => ({ ...a, runtime: runtime(a.walker ? 'bersih' : status(a.id)) }));

describe('layout', () => {
  it('builds pods only for departments with desks', () => {
    expect(pods.map((p) => p.id)).toEqual(['produk', 'eng', 'qa', 'data', 'pmo']);
  });

  it('computes seats like the mockup', () => {
    const eng = pods.find((p) => p.id === 'eng')!;
    expect(podSeat(eng, 'b', 0)).toEqual([480, -225, 0]);
    expect(podSeat(eng, 'e', 0)).toEqual([690, -120, -Math.PI / 2]);
    const hendra = config.agents.find((a) => a.id === 'hendra')!;
    expect(seatOf(hendra, pods)).toEqual({ seat: [-775, -772, 0], monitors: 1 });
    const yoga = config.agents.find((a) => a.id === 'yoga')!;
    expect(seatOf(yoga, pods)?.monitors).toBe(2);
  });

  it('finds free seats away from taken ones', () => {
    const taken = config.agents.map((a) => seatOf(a, pods)?.seat).filter((s) => s !== undefined);
    const free = freeSeats(pods, taken);
    expect(free.length).toBeGreaterThan(0);
    for (const f of free) for (const t of taken) expect(Math.hypot(f[0] - t[0], f[1] - t[1])).toBeGreaterThanOrEqual(50);
  });
});

describe('toSceneAgents', () => {
  it('maps every visible agent with species colours and seats', () => {
    const scene = toSceneAgents(withStatus(() => 'kerja'), config.departments);
    expect(scene).toHaveLength(18);
    const raka = scene.find((a) => a.id === 'raka')!;
    expect(raka).toMatchObject({ animal: 'panda', skin: '#f4f4f2', status: 'kerja', dim: false, monitors: 0 });
    expect(raka.seat).not.toBeNull();
    expect(scene.find((a) => a.id === 'udin')).toMatchObject({ walker: true, seat: null });
  });

  it('gives guests a free desk seat and leaves hidden agents out', () => {
    const agents = withStatus(() => 'kerja');
    agents[0] = { ...agents[0]!, hidden: true };
    agents.push({ id: 'tamu-1', name: 'Agent tanpa nama', role: 'Tamu', short: 'Tamu', dept: 'tamu', animal: 'dog', shirt: '#8a90a0', tool: 'Claude Code', match: [], guest: true, runtime: runtime('kerja') });
    const scene = toSceneAgents(agents, config.departments, (a) => a.id === 'raka');
    expect(scene.find((a) => a.id === agents[0]!.id)).toBeUndefined();
    expect(scene.find((a) => a.id === 'tamu-1')?.seat).not.toBeNull();
    expect(scene.find((a) => a.id === 'raka')?.dim).toBe(true);
  });
});

describe('people geometry', () => {
  it('sends idle agents to play spots in order, never the office boy', () => {
    const scene = toSceneAgents(withStatus(() => 'idle'), config.departments);
    const spots = assignSpots(scene);
    expect(spots.size).toBe(PLAY_SPOTS.length);
    expect(spots.has('udin')).toBe(false);
    expect(spots.get('hendra')?.k).toBe('pp1');
  });

  it('caches per-agent geometry and rebuilds only changed agents', () => {
    const builder = new PeopleBuilder();
    const scene = toSceneAgents(withStatus(() => 'kerja'), config.departments);
    const g1 = builder.build(scene, new Map());
    expect(g1.ppl!.length % 10).toBe(0);
    expect(g1.ppl).toBeInstanceOf(Float32Array);
    expect(g1.obBody!.length).toBeGreaterThan(0);
    const cache = (builder as unknown as { cache: Map<string, { groups: object }> }).cache;
    const before = new Map([...cache].map(([k, v]) => [k, v.groups]));
    const changed = scene.map((a) => (a.id === 'yoga' ? { ...a, status: 'macet' as const } : a));
    builder.build(changed, new Map());
    for (const [id, entry] of cache) {
      if (id === 'yoga') expect(entry.groups).not.toBe(before.get(id));
      else expect(entry.groups).toBe(before.get(id));
    }
  });

  it('builds playing bodies and the ping-pong ball for idle agents', () => {
    const scene = toSceneAgents(withStatus(() => 'idle'), config.departments);
    const spots = assignSpots(scene);
    const g = new PeopleBuilder().build(scene, spots);
    expect(g['i_hendra']!.length).toBeGreaterThan(0);
    expect(g.ball!.length).toBeGreaterThan(0);
  });

  it('rings highlight the selection', () => {
    const scene = toSceneAgents(withStatus(() => 'kerja'), config.departments);
    const plain = buildRings(scene, new Map(), null);
    const sel = buildRings(scene, new Map(), 'raka');
    expect(plain.rings!.length).toBe(sel.rings!.length);
    expect(plain.rings).not.toEqual(sel.rings);
  });

  it('static scene has geometry in every group', () => {
    const g = buildStatic(pods);
    for (const k of ['main', 'trans', 'back', 'left', 'right']) expect(g[k]!.length).toBeGreaterThan(0);
  });

  it('kit box emits 36 vertices of 10 floats', () => {
    const g = { a: [] as number[] };
    new Kit(g).ab(0, 0, 0, 1, 1, 1, [1, 1, 1, 1]);
    expect(g.a.length).toBe(36 * 10);
  });
});

describe('camera', () => {
  it('eases toward a preset and takes the short way round', () => {
    const cam = new OrbitCamera(VIEWS.kantor);
    cam.goal.yaw = 6;
    cam.view(VIEWS.atas!);
    expect(cam.goal.yaw).toBeCloseTo(2 * Math.PI);
    for (let i = 0; i < 400 && cam.step(); i++);
    expect(cam.cam.dist).toBeCloseTo(VIEWS.atas!.dist, 2);
  });

  it('snaps immediately when motion is reduced', () => {
    const cam = new OrbitCamera(VIEWS.kantor, true);
    cam.view(VIEWS.ceo!);
    expect(cam.step()).toBe(false);
    expect(cam.cam.tx).toBe(VIEWS.ceo!.tx);
  });

  it('clamps zoom and projects the target to the screen centre', () => {
    const cam = new OrbitCamera(VIEWS.kantor, true);
    for (let i = 0; i < 50; i++) cam.zoom(0.5);
    expect(cam.goal.dist).toBe(280);
    cam.step();
    const p = project(cam.viewProj(2), [cam.cam.tx, cam.cam.ty, cam.cam.tz], 800, 400)!;
    expect(p[0]).toBeCloseTo(400, 3);
    expect(p[1]).toBeCloseTo(200, 3);
  });
});

describe('SSE state updates', () => {
  const snap: StateSnapshot = { agents: withStatus(() => 'idle'), departments: config.departments, events: [], cleaner: { mode: 'dry-run', items: [], totalBytes: 0, lastScanAt: null }, ambience: config.ambience, limit: null };

  it('replaces or appends agents', () => {
    const raka = { ...snap.agents.find((a) => a.id === 'raka')!, runtime: runtime('kerja') };
    const s1 = applyAgentUpdate(snap, raka);
    expect(s1.agents.find((a) => a.id === 'raka')!.runtime.status).toBe('kerja');
    expect(s1.agents).toHaveLength(18);
    const guest = { ...raka, id: 'tamu-x' };
    expect(applyAgentUpdate(s1, guest).agents).toHaveLength(19);
  });

  it('keeps the newest 50 events first', () => {
    let s = snap;
    for (let i = 0; i < 60; i++) s = applyEvent(s, { ts: i, agentId: 'raka', sessionId: 's', source: 'claude-code', kind: 'edit', detail: String(i) });
    expect(s.events).toHaveLength(50);
    expect(s.events[0]!.ts).toBe(59);
  });
});
