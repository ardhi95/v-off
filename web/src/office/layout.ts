import type { Agent, Department, Species, Status } from '../../../src/shared/types.js';

// Floor plan constants from design/mockup/Main.dc.html. Units: cm, Y up,
// default camera looks from +Z. The office spans x -1050..1050, z -840..1350
// (lounge from z = 690).

export interface Pod {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  divider: boolean;
  label: string;
  c: string;
  rug: string;
}

export interface CameraView {
  label: string;
  tx: number;
  ty: number;
  tz: number;
  yaw: number;
  pitch: number;
  dist: number;
}

export const VIEWS: Record<string, CameraView> = {
  kantor: { label: 'Seluruh kantor', tx: 0, ty: 60, tz: 250, yaw: -0.38, pitch: 0.7, dist: 3500 },
  tim: { label: 'Meja tim', tx: 0, ty: 70, tz: 60, yaw: -0.3, pitch: 0.62, dist: 2000 },
  soc: { label: 'Pusat keamanan', tx: 0, ty: 110, tz: 330, yaw: -0.25, pitch: 0.42, dist: 900 },
  ceo: { label: 'Ruang CEO', tx: -775, ty: 80, tz: -650, yaw: 0.35, pitch: 0.5, dist: 950 },
  cto: { label: 'Ruang CTO', tx: 775, ty: 80, tz: -650, yaw: -0.35, pitch: 0.5, dist: 950 },
  santai: { label: 'Ruang santai', tx: 0, ty: 60, tz: 1020, yaw: -0.3, pitch: 0.62, dist: 1700 },
  asrama: { label: 'Asrama', tx: -1520, ty: 40, tz: 260, yaw: 0.42, pitch: 0.78, dist: 2900 },
  atas: { label: 'Tampak atas', tx: -465, ty: 0, tz: 250, yaw: 0, pitch: 1.48, dist: 4500 },
};

export const ROOM_SEATS = {
  ceo: [-775, -772, 0],
  cto: [775, -772, 0],
} as const;

/** Desks with physical monitors: CEO single, CTO and SOC/Data dual. Others use laptops. */
const DESK_MONITORS: Record<string, 0 | 1 | 2> = { ceo: 1, cto: 2, qa: 2, data: 2 };

export function podsFrom(departments: Department[]): Pod[] {
  return departments
    .filter((d) => d.desk)
    .map((d) => ({ id: d.id, ...d.desk!, label: d.label, c: d.color, rug: d.rug ?? '#4a4e58' }));
}

export type SeatXYZ = [number, number, number];

export function podSeat(p: Pod, side: 'b' | 'f' | 'e', ox: number): SeatXYZ {
  if (side === 'e') return [p.x + p.w / 2 + 30, p.z + ox, -Math.PI / 2];
  return side === 'b' ? [p.x + ox, p.z - p.d / 2 - 30, 0] : [p.x + ox, p.z + p.d / 2 + 30, Math.PI];
}

export function seatOf(agent: Agent, pods: Pod[]): { seat: SeatXYZ; monitors: 0 | 1 | 2 } | null {
  const s = agent.seat;
  if (!s) return null;
  if ('room' in s) return { seat: [...ROOM_SEATS[s.room]] as SeatXYZ, monitors: DESK_MONITORS[s.room] ?? 0 };
  const p = pods.find((x) => x.id === s.pod);
  if (!p) return null;
  return { seat: podSeat(p, s.side, s.offset), monitors: DESK_MONITORS[p.id] ?? 0 };
}

/** Free seats for agents without one (guests): both long sides of every desk, 60 cm apart. */
export function freeSeats(pods: Pod[], taken: SeatXYZ[]): SeatXYZ[] {
  const out: SeatXYZ[] = [];
  const near = (a: SeatXYZ) => taken.some((t) => Math.hypot(t[0] - a[0], t[1] - a[1]) < 50);
  for (const p of pods) {
    for (const side of ['f', 'b'] as const) {
      const half = Math.floor((p.w / 2 - 30) / 60) * 60;
      for (let ox = -half; ox <= half; ox += 60) {
        const s = podSeat(p, side, ox);
        if (!near(s)) out.push(s);
      }
    }
  }
  return out;
}

export type Hold = 'paddle' | 'rod' | 'joy' | 'pad' | 'cup' | 'desk';

export interface PlaySpot {
  k: string;
  x: number;
  z: number;
  yaw: number;
  pose: 'stand' | 'sit';
  yo?: number;
  hold: Hold;
  act: string;
  quip: string;
  /** Path from the lounge corridor (z = 640) to the spot that avoids furniture. */
  via?: [number, number][];
}

const H = Math.PI / 2;
export const PLAY_SPOTS: PlaySpot[] = [
  { k: 'pp1', x: 325, z: 1150, yaw: H, pose: 'stand', hold: 'paddle', act: 'main pingpong', quip: 'Smash! Rasakan ini!' },
  { k: 'pp2', x: 675, z: 1150, yaw: -H, pose: 'stand', hold: 'paddle', act: 'main pingpong', quip: 'Skor 10–9, ayo!', via: [[820, 640], [820, 1150]] },
  { k: 'f1', x: 700, z: 790, yaw: 0, pose: 'stand', hold: 'rod', act: 'main foosball', quip: 'Gooool!!' },
  { k: 'f2', x: 700, z: 930, yaw: Math.PI, pose: 'stand', hold: 'rod', act: 'main foosball', quip: 'Curang, putar-putar!', via: [[820, 640], [820, 930]] },
  { k: 'a1', x: -250, z: 845, yaw: Math.PI, pose: 'stand', hold: 'joy', act: 'main arcade', quip: 'Rekor baru!', via: [[-330, 640], [-330, 845]] },
  { k: 'a2', x: -160, z: 845, yaw: Math.PI, pose: 'stand', hold: 'joy', act: 'main arcade', quip: 'Satu nyawa lagi…', via: [[-330, 640], [-330, 845]] },
  { k: 's1', x: -760, z: 990, yaw: -H, pose: 'sit', yo: 8, hold: 'pad', act: 'main konsol di sofa', quip: 'Satu ronde lagi, deh.', via: [[-830, 640], [-830, 990]] },
  { k: 's2', x: -760, z: 1110, yaw: -H, pose: 'sit', yo: 8, hold: 'pad', act: 'main konsol di sofa', quip: 'Jangan dekat-dekat bos!', via: [[-830, 640], [-830, 1110]] },
  { k: 'b1', x: 930, z: 960, yaw: -H, pose: 'sit', yo: 26, hold: 'cup', act: 'ngopi di pantry', quip: 'Kopinya enak hari ini.', via: [[850, 640], [850, 960]] },
  { k: 'b2', x: 930, z: 1050, yaw: -H, pose: 'sit', yo: 26, hold: 'cup', act: 'ngopi di pantry', quip: 'Habis ini lanjut kerja.', via: [[850, 640], [850, 1050]] },
];

/**
 * Office boy loop through every area. `area` marks a point where he may stop to
 * mop when the cache scan found something there (see cleanerStops).
 */
export interface Waypoint {
  x: number;
  z: number;
  area?: CleanerArea;
}
export type CleanerArea = 'pmo' | 'produk' | 'ceo' | 'eng' | 'cto' | 'data' | 'santai' | 'sofa' | 'soc';
const D = (x: number, z: number): Waypoint => ({ x, z });
const S = (x: number, z: number, area: CleanerArea): Waypoint => ({ x, z, area });
export const OB_PATH: Waypoint[] = [
  D(-900, 600), S(-900, 380, 'pmo'), D(-900, -380), S(-575, -380, 'produk'), D(-575, -480), S(-600, -680, 'ceo'), D(-575, -480), D(-575, -380),
  S(420, -340, 'eng'), D(575, -380), D(575, -480), D(930, -480), S(930, -700, 'cto'), D(930, -480), D(575, -480), D(575, -380),
  D(900, -380), D(900, 600), S(700, 560, 'data'), D(450, 620), S(450, 1000, 'santai'), S(-450, 1050, 'sofa'), S(-200, 520, 'soc'),
];

/** Which floor area an agent's caches belong to (by seat). */
export function areaOfSeat(seat: Agent['seat']): CleanerArea | undefined {
  if (!seat) return undefined;
  if ('room' in seat) return seat.room;
  return ({ produk: 'produk', eng: 'eng', qa: 'soc', data: 'data', pmo: 'pmo' } as const)[seat.pod as 'produk'];
}

export const ROOM_ANCHORS: Record<string, [number, number, number]> = {
  'r:ceo': [-775, 268, -450],
  'r:cto': [775, 268, -450],
  'r:tv': [0, 252, -832],
  'r:santai': [0, 240, 1000],
  'r:asrama': [-1530, 250, -760],
};

/** Fur, accent, and muzzle colours per species (mockup ZOO), plus the Indonesian name. */
export const SPECIES: Record<Species, { skin: string; acc: string; muz: string; label: string }> = {
  lion: { skin: '#e3a64a', acc: '#a8582a', muz: '#f4dcae', label: 'Singa' },
  owl: { skin: '#9a7652', acc: '#5e4630', muz: '#efe0c4', label: 'Burung hantu' },
  rabbit: { skin: '#f6f2ee', acc: '#f4a3b4', muz: '#ffffff', label: 'Kelinci' },
  cat: { skin: '#f0a050', acc: '#c8742a', muz: '#fff4e6', label: 'Kucing' },
  fox: { skin: '#e8783a', acc: '#3a2a22', muz: '#fbf3ea', label: 'Rubah' },
  bear: { skin: '#8a5a3a', acc: '#6a4028', muz: '#d9b48a', label: 'Beruang' },
  panda: { skin: '#f4f4f2', acc: '#26262b', muz: '#ffffff', label: 'Panda' },
  koala: { skin: '#a3a8b0', acc: '#f0e6ea', muz: '#a3a8b0', label: 'Koala' },
  hamster: { skin: '#e9b97a', acc: '#f4a3b4', muz: '#fff6ea', label: 'Hamster' },
  frog: { skin: '#6cc04a', acc: '#4f9a36', muz: '#a8e08a', label: 'Katak' },
  penguin: { skin: '#2a2d36', acc: '#ffffff', muz: '#ffffff', label: 'Pinguin' },
  dog: { skin: '#d9b07a', acc: '#a8784a', muz: '#f6ead8', label: 'Anjing' },
  raccoon: { skin: '#8d8d95', acc: '#2a2a30', muz: '#f2f0ee', label: 'Rakun' },
  monkey: { skin: '#7a4e2e', acc: '#5e3a22', muz: '#f0c8a0', label: 'Monyet' },
  elephant: { skin: '#a3abb8', acc: '#f2b8c4', muz: '#a3abb8', label: 'Gajah' },
  wolf: { skin: '#8e939c', acc: '#4a4d55', muz: '#eceae6', label: 'Serigala' },
  beaver: { skin: '#9a6a42', acc: '#6e4a2c', muz: '#d8b48c', label: 'Berang-berang' },
  sheep: { skin: '#f2d9c4', acc: '#fbf6ea', muz: '#f6e4d6', label: 'Domba' },
};

/** Visual tokens per status (design/README.md). */
export const STATUS_STYLE: Record<Status, { label: string; fill: string; bg: string; fg: string; scr: string }> = {
  kerja: { label: 'Bekerja', fill: '#35b87a', bg: 'rgba(53,184,122,.16)', fg: '#7fe0ae', scr: '#8fd8ff' },
  macet: { label: 'Terblokir', fill: '#ef6a3c', bg: 'rgba(239,106,60,.16)', fg: '#ffa98a', scr: '#ff7a4d' },
  bicara: { label: 'Memimpin rapat', fill: '#8b7bff', bg: 'rgba(139,123,255,.18)', fg: '#c4b8ff', scr: '#c4b5ff' },
  simak: { label: 'Menyimak', fill: '#8a90a0', bg: 'rgba(138,144,160,.18)', fg: '#c5c9d3', scr: '#3a4256' },
  bersih: { label: 'Bersih-bersih', fill: '#2fb5c9', bg: 'rgba(47,181,201,.16)', fg: '#8fe3f0', scr: '#8fe3f0' },
  idle: { label: 'Istirahat · main', fill: '#ff7a9c', bg: 'rgba(255,122,156,.16)', fg: '#ffb3c6', scr: '#2a2f3a' },
};

/** Tag and panel style for agents asleep in the dorm (office off). */
export const SLEEP_STYLE = { label: 'Tidur · limit habis', fill: '#7b8cff', bg: 'rgba(123,140,255,.18)', fg: '#c3cbff' } as const;

// ---- walking routes between a desk seat and a play spot ----

export type XZ = [number, number];
export type Placement = { kind: 'seat'; seat: SeatXYZ } | { kind: 'spot'; spot: PlaySpot } | { kind: 'bed'; bed: Bed };

// ---- dorm ("Asrama"): bedrooms left of the office, used while the usage limit is out ----

/**
 * The dorm sits outside the office's left wall (x = -1050), across the full
 * depth. A hall at z 610..770 leads from a door in that wall (z 650..730) to a
 * corridor at x -1600..-1460. Bedrooms line both sides of the corridor:
 * 10 on the far (west) side, 7 + 3 on the office side around the hall.
 */
export const DORM = {
  X0: -1980, X1: -1062, CX0: -1600, CX1: -1460, HZ0: 610, HZ1: 770, DZ0: 650, DZ1: 730,
} as const;
const DORM_CX = (DORM.CX0 + DORM.CX1) / 2;
const DORM_HALL_Z = (DORM.DZ0 + DORM.DZ1) / 2;

export interface Bed {
  k: string;
  /** Headboard x (inside face). */
  x: number;
  /** Bed centre z. */
  z: number;
  /** +1: head toward +x (office side), -1: head toward -x. */
  dir: 1 | -1;
  /** Room extent along z, for walls and the door gap. */
  z0: number;
  z1: number;
  /** Door in the corridor wall, z centre. */
  doorZ: number;
}

/** Bed length and width (cm), mattress top height. */
export const BED = { L: 205, W: 110, TOP: 48 } as const;
/** Lying body: feet point sits this far from the headboard. */
const FEET_FROM_HEAD = 143;

function bedsIn(z0: number, z1: number, n: number, dir: 1 | -1, x: number, prefix: string): Bed[] {
  const w = (z1 - z0) / n;
  return Array.from({ length: n }, (_, i) => {
    const r0 = z0 + i * w, c = r0 + w / 2;
    return { k: `${prefix}${i}`, x, z: c - 30, dir, z0: r0, z1: r0 + w, doorZ: c + 60 };
  });
}

/** 20 beds: office side first (nearest the door), then the far side. */
export const BEDS: Bed[] = [
  ...bedsIn(-840, DORM.HZ0, 7, 1, DORM.X1 - 8, 'e'),
  ...bedsIn(DORM.HZ1, 1350, 3, 1, DORM.X1 - 8, 'e7'),
  ...bedsIn(-840, 1350, 10, -1, DORM.X0 + 8, 'w'),
];

/** Where the lying body's feet are (body extends toward the headboard). */
export function bedFeet(b: Bed): XZ {
  return [b.x - b.dir * FEET_FROM_HEAD, b.z];
}

/** Heading that lays a body (built standing, feet at origin) head-first toward the headboard. */
export function bedYaw(b: Bed): number {
  return b.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
}

/** Floor point at the foot end of the bed, inside the room. */
export function bedFoot(b: Bed): XZ {
  return [b.x - b.dir * (BED.L + 45), b.z];
}

/** Every visible agent gets a bed in roster order while the office is off; extras stay put. */
export function assignBeds(ids: string[]): Map<string, Bed> {
  const out = new Map<string, Bed>();
  ids.slice(0, BEDS.length).forEach((id, i) => out.set(id, BEDS[i]!));
  return out;
}

const CORRIDOR_X = 950;
const LOUNGE_Z = 620;

/** From a placement out to the shared corridor network (ends on z ≈ 620–640). */
export function exitChain(p: Placement): XZ[] {
  if (p.kind === 'bed') {
    const b = p.bed, doorX = b.dir === 1 ? DORM.CX1 : DORM.CX0;
    return [
      bedFeet(b), bedFoot(b), [doorX, b.doorZ], [DORM_CX, b.doorZ], [DORM_CX, DORM_HALL_Z],
      [DORM.X1, DORM_HALL_Z], [-CORRIDOR_X, DORM_HALL_Z], [-CORRIDOR_X, LOUNGE_Z],
    ];
  }
  if (p.kind === 'spot') {
    const s = p.spot;
    const via = s.via ?? [[s.x, 640]];
    return [[s.x, s.z], ...[...via].reverse()];
  }
  const seat = p.seat;
  const sgn = seat[0] < 0 ? -1 : 1;
  // Private rooms: leave through the glass door at x = ±575.
  if (Math.abs(seat[0]) > 700 && seat[1] < -600) {
    return [[seat[0], seat[1]], [sgn * 640, seat[1]], [sgn * 575, -520], [sgn * 575, -380], [sgn * CORRIDOR_X, -380], [sgn * CORRIDOR_X, LOUNGE_Z]];
  }
  const y = seat[2];
  const back: XZ = [seat[0] - Math.sin(y) * 60, seat[1] - Math.cos(y) * 60];
  return [[seat[0], seat[1]], back, [sgn * CORRIDOR_X, back[1]], [sgn * CORRIDOR_X, LOUNGE_Z]];
}

/** Waypoints from one placement to another, via the corridors. */
export function route(from: Placement, to: Placement): XZ[] {
  return [...exitChain(from), ...[...exitChain(to)].reverse()];
}

export function pathLength(pts: XZ[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return d;
}

/** Point and heading at distance `s` along the path. */
export function pointAt(pts: XZ[], s: number): { x: number; z: number; yaw: number } {
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rest <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, rest / seg) : 1;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    rest -= seg;
  }
  const p = pts[pts.length - 1] ?? [0, 0];
  return { x: p[0], z: p[1], yaw: 0 };
}
