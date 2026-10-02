import { col as C, Kit, type Groups } from './kit.js';
import { BED, BEDS, DORM, type Pod } from './layout.js';
import type { Vec3 } from './math.js';

// Static office geometry, ported from buildStatic() in design/mockup/Main.dc.html.
// Groups: main (opaque), trans (glass, shadows), back/left/right/dormW (walls
// hidden when the camera is behind them), dormOn/dormOff (dorm lamps lit only
// while the office is off).

export const BOUNDS = { X0: -1050, X1: 1050, ZB: -840, ZL: 690, ZF: 1350 };

export function buildStatic(pods: Pod[]): Groups {
  const G: Groups = { main: [], trans: [], back: [], left: [], right: [], dormW: [], dormOn: [], dormOff: [] };
  const K = new Kit(G);
  const { X0, X1, ZB, ZL, ZF } = BOUNDS;
  const pod = (id: string) => pods.find((p) => p.id === id);
  K.use('main');

  // office carpet tiles
  const nx = 30, nz = 23, tw = (X1 - X0) / nx, td = (ZL - ZB) / nz;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x0 = X0 + ix * tw, z0 = ZB + iz * td;
      K.q4([x0, 0, z0], [x0, 0, z0 + td], [x0 + tw, 0, z0 + td], [x0 + tw, 0, z0], K.Y, C((ix + iz) % 2 ? '#a9adb4' : '#a2a6ad'));
    }
  }
  // lounge floor (warm wood)
  for (let p = 0; p < 33; p++) {
    const z0 = ZL + p * 20;
    K.q4([X0, 0, z0], [X0, 0, z0 + 20], [X1, 0, z0 + 20], [X1, 0, z0], K.Y, C(p % 2 ? '#c49a6e' : '#bb9166'));
  }
  K.ab(0, 0, ZL, X1 - X0, 1.2, 6, C('#6b4429'));
  // private office wood floors
  for (const [x0, x1] of [[X0, -500], [500, X1]] as const) {
    for (let p = 0; p < 20; p++) {
      const z0 = ZB + p * 19.5;
      K.q4([x0, 0.4, z0], [x0, 0.4, z0 + 19.5], [x1, 0.4, z0 + 19.5], [x1, 0.4, z0], K.Y, C(p % 2 ? '#8a5f3d' : '#936643'));
    }
  }
  K.cyl(-775, 0.5, -600, 120, 70, 120, 70, 0.8, C('#7a3a2f'), 40, 4);
  K.cyl(775, 0.5, -600, 120, 70, 120, 70, 0.8, C('#30455e'), 40, 4);

  // ===== team desks (rectangular bench desks) =====
  for (const p of pods) {
    K.cyl(p.x, 0, p.z, p.w / 2 + 120, p.d / 2 + 125, p.w / 2 + 120, p.d / 2 + 125, 0.8, C(p.rug), 48, 8);
    K.ab(p.x, 71, p.z, p.w, 4.5, p.d, C('#c9ab80'), { py: C('#dcc39c') });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      K.ab(p.x + sx * (p.w / 2 - 8), 0, p.z + sz * (p.d / 2 - 8), 5, 71, 5, C('#e3e5ea'));
    }
    K.ab(p.x, 58, p.z, p.w - 16, 4, 6, C('#e3e5ea'));
    if (p.divider) {
      K.ab(p.x, 75.5, p.z, p.w - 80, 34, 3, C(p.c));
      K.ab(p.x, 109.5, p.z, p.w - 80, 1.5, 4, C('#e3e5ea'));
    }
    const pz = p.z + (p.divider ? 14 : -40);
    K.cyl(p.x + p.w / 2 - 22, 75.5, pz, 6, 6, 7, 7, 9, C('#f2f0ea'), 14);
    for (let i = 0; i < 4; i++) {
      K.sph([p.x + p.w / 2 - 22 + (K.rnd() - 0.5) * 7, 90 + K.rnd() * 5, pz + (K.rnd() - 0.5) * 7], 4.5 + K.rnd() * 2, C(['#4f9a57', '#3f7d4a'][i % 2]!), 10, 7);
    }
  }

  // ===== security operations corner (SOC) =====
  const sq = pod('qa');
  const wz = sq ? sq.z - 110 : 0;
  if (sq) {
    for (const x of [-172, 172]) K.ab(x, 0, wz, 8, 236, 8, C('#3a3f49'));
    K.ab(0, 0, wz, 300, 3, 60, C('#3a3f49'));
    const screens = [[-110, 192], [0, 192], [110, 192], [-110, 128], [0, 128], [110, 128]] as const;
    const scz = wz + 3.3;
    const Q = (x0: number, y0: number, x1: number, y1: number, cc: string, dz = 0) =>
      K.q4([x0, y0, scz + dz], [x1, y0, scz + dz], [x1, y1, scz + dz], [x0, y1, scz + dz], K.Z, C(cc, 2));
    screens.forEach(([x, y], i) => {
      K.ab(x, y - 31, wz, 106, 62, 6, C('#15171c'));
      Q(x - 50, y - 28, x + 50, y + 28, '#0f1a2a');
      Q(x - 48, y + 19, x + 48, y + 26, i === 4 ? '#ef6a3c' : '#24324a', 0.1);
      if (i === 0) {
        for (let b = 0; b < 12; b++) {
          const h = 6 + Math.abs(Math.sin(b * 1.3)) * 30;
          Q(x - 46 + b * 8, y - 24, x - 41 + b * 8, y - 24 + h, '#35d07f', 0.1);
        }
      }
      if (i === 1) {
        Q(x - 12, y - 6, x + 12, y + 14, '#35d07f', 0.1);
        K.tri([x - 12, y - 6, scz + 0.1], [x + 12, y - 6, scz + 0.1], [x, y - 20, scz + 0.1], K.Z, K.Z, K.Z, C('#35d07f', 2));
        Q(x - 4, y, x + 4, y + 8, '#0f1a2a', 0.2);
      }
      if (i === 2) {
        for (let d = 0; d < 22; d++) {
          const px = x - 44 + K.rnd() * 88, py = y - 24 + K.rnd() * 40;
          Q(px, py, px + 3, py + 3, d % 5 ? '#2fb5c9' : '#ef6a3c', 0.1);
        }
      }
      if (i === 3) [18, 30, 12, 26, 36, 20].forEach((h, b) => Q(x - 40 + b * 14, y - 24, x - 31 + b * 14, y - 24 + h, '#5b8def', 0.1));
      if (i === 4) for (let l = 0; l < 4; l++) Q(x - 44, y + 8 - l * 9, x - 44 + 30 + ((l * 17) % 50), y + 12 - l * 9, '#ffd2c2', 0.1);
      if (i === 5) for (let l = 0; l < 6; l++) Q(x - 46, y + 12 - l * 7, x - 46 + 40 + ((l * 23) % 50), y + 15 - l * 7, l % 3 ? '#7fe0ae' : '#9aa1b2', 0.1);
    });
    // siren + CCTV
    K.cyl(172, 236, wz, 6, 6, 6, 6, 4, C('#2a2d33'), 14);
    K.sph([172, 245, wz], 6, C('#ff4d4d', 2), 12, 8);
    K.ab(-172, 222, wz + 8, 12, 9, 18, C('#e8e8ea'));
    K.tube([-172, 226.5, wz + 17], [-172, 226.5, wz + 21], 3.4, C('#1d1d22'), 10, false);
    // server racks
    for (const x of [-262, -196]) {
      K.ab(x, 0, sq.z - 70, 62, 200, 80, C('#1f2228'), { pz: C('#262a32') });
      const fz = sq.z - 70 + 40.3;
      for (let i = 0; i < 11; i++) {
        const y = 16 + i * 16.5;
        K.q4([x - 26, y, fz], [x + 26, y, fz], [x + 26, y + 12, fz], [x - 26, y + 12, fz], K.Z, C('#2e333d'));
        K.q4([x - 22, y + 4, fz + 0.1], [x - 16, y + 4, fz + 0.1], [x - 16, y + 8, fz + 0.1], [x - 22, y + 8, fz + 0.1], K.Z, C(i % 4 === 1 ? '#f5b83d' : '#35d07f', 2));
        K.q4([x - 12, y + 5, fz + 0.1], [x + 20, y + 5, fz + 0.1], [x + 20, y + 7, fz + 0.1], [x - 12, y + 7, fz + 0.1], K.Z, C('#3d4350'));
      }
    }
    // firewall / network cabinet + router
    K.ab(236, 0, sq.z - 60, 84, 92, 60, C('#2a2d33'));
    for (let i = 0; i < 4; i++) {
      const y = 14 + i * 19, fz = sq.z - 60 + 30.3;
      K.q4([200, y, fz], [272, y, fz], [272, y + 14, fz], [200, y + 14, fz], K.Z, C('#353a45'));
      for (let j = 0; j < 8; j++) {
        K.q4([204 + j * 8, y + 5, fz + 0.1], [208 + j * 8, y + 5, fz + 0.1], [208 + j * 8, y + 9, fz + 0.1], [204 + j * 8, y + 9, fz + 0.1], K.Z, C(j % 3 ? '#35d07f' : '#f5b83d', 2));
      }
    }
    K.ab(236, 92, sq.z - 60, 44, 7, 26, C('#e8e8ea'));
    for (const sx of [-1, 1]) K.tube([236 + sx * 16, 98, sq.z - 70], [236 + sx * 22, 124, sq.z - 72], 1.3, C('#2a2d33'), 6, true);
    // QA test devices on the security desk
    for (const [x, cc] of [[96, '#8fd8ff'], [106, '#b28dff'], [116, '#35d07f']] as const) {
      K.ab(x, 75.5, sq.z + 38, 8, 1.2, 15, C('#1d1d22'), { py: C(cc, 2) });
    }
    K.ab(-108, 75.5, sq.z + 38, 22, 1.2, 16, C('#1d1d22'), { py: C('#5b8def', 2) });
  }

  // ===== data team: database stack =====
  const dt = pod('data');
  if (dt) {
    for (let i = 0; i < 3; i++) {
      K.cyl(dt.x, 75.5 + i * 11, dt.z + 40, 14, 14, 14, 14, 9, C('#5b8def'), 24, 2, C('#7fa6f2'));
      K.ring(dt.x, 75.5 + i * 11 + 9.2, dt.z + 40, 11, 13, C('#8fd8ff', 2), 24);
    }
  }
  // ===== PMO: Gantt & risk board =====
  const pm = pod('pmo');
  if (pm) {
    const bx = pm.x - 210, bzz = pm.z;
    for (const sx of [-1, 1]) {
      K.ab(bx + sx * 88, 0, bzz, 5, 200, 5, C('#9aa3ad'));
      K.ab(bx + sx * 88, 0, bzz, 40, 3, 30, C('#6b707b'));
    }
    K.ab(bx, 70, bzz, 180, 120, 3, C('#e6e8ec'), { pz: C('#ffffff') });
    const gz = bzz + 1.7;
    const GQ = (x0: number, y0: number, x1: number, y1: number, cc: string) => K.q4([x0, y0, gz], [x1, y0, gz], [x1, y1, gz], [x0, y1, gz], K.Z, C(cc));
    GQ(bx - 84, 174, bx + 84, 186, '#2b3450');
    ([['#5b8def', 0, 50], ['#5b8def', 30, 80], ['#35b87a', 50, 110], ['#f5b83d', 90, 140], ['#ef6a3c', 120, 160], ['#b28dff', 60, 150]] as const)
      .forEach(([cc, a, b], i) => GQ(bx - 70 + a, 160 - i * 13, bx - 70 + b, 168 - i * 13, cc));
    for (let i = 0; i < 6; i++) GQ(bx - 82, 160 - i * 13, bx - 74, 168 - i * 13, '#9aa1b2');
    for (const [cc, o] of [['#35b87a', -30], ['#f5b83d', 0], ['#ef6a3c', 30]] as const) K.sph([bx + 60 + o * 0.6, 84, gz + 1], 4, C(cc, 2), 10, 6);
    K.ab(pm.x + 60, 75.5, pm.z + 20, 26, 6, 34, C('#f2f0ea'));
    K.ab(pm.x + 60, 81.5, pm.z + 20, 24, 0.6, 32, C('#b28dff'));
  }

  // ===== executive offices =====
  const desk = (x: number, z: number) => {
    K.ab(x, 71, z, 172, 4.5, 78, C('#5b3a24'), { py: C('#6b4429') });
    K.ab(x - 80, 0, z, 6, 71, 74, C('#4a2f1d'));
    K.ab(x + 80, 0, z, 6, 71, 74, C('#4a2f1d'));
    K.ab(x, 20, z + 33, 156, 51, 4, C('#4a2f1d'));
    K.ab(x + 60, 0, z - 4, 34, 62, 60, C('#4a2f1d'));
    K.cyl(x - 62, 75.5, z + 18, 4, 4, 4.5, 4.5, 9, C('#f2f0ea'), 14);
    K.ab(x + 50, 75.5, z + 14, 22, 1.4, 28, C('#e8e3d6'));
  };
  desk(-775, -700);
  desk(775, -700);
  const guestChair = (x: number, z: number, yaw: number, cc: string) => {
    const f: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)], r: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const L = (lx: number, ly: number, lz: number): Vec3 => [x + r[0] * lx + f[0] * lz, ly, z + r[2] * lx + f[2] * lz];
    K.box(L(0, 44, 0), r, K.Y, f, 23, 5, 22, C(cc));
    K.box(L(0, 72, -20), r, K.Y, f, 22, 22, 3.5, C(cc));
    for (const [a, b] of [[-18, -16], [18, -16], [-18, 16], [18, 16]] as const) K.tube(L(a, 0, b), L(a, 40, b), 1.8, C('#2a2d33'), 8, false);
    K.box(L(-23, 58, 0), r, K.Y, f, 2.5, 12, 18, C(cc));
    K.box(L(23, 58, 0), r, K.Y, f, 2.5, 12, 18, C(cc));
  };
  guestChair(-820, -600, Math.PI, '#6b4f3a');
  guestChair(-730, -600, Math.PI, '#6b4f3a');
  guestChair(775, -600, Math.PI, '#3e4a5c');
  const shelf = (x: number, z: number, dir: number) => {
    const R: Vec3 = [0, 0, dir], F: Vec3 = [dir, 0, 0], wood = C('#4a2f1d');
    K.box(K.lin([x, 95, z], R, K.Y, F, 0, 0, -13), R, K.Y, F, 82, 95, 2, wood);
    K.box(K.lin([x, 95, z], R, K.Y, F, -80, 0, 0), R, K.Y, F, 2, 95, 15, wood);
    K.box(K.lin([x, 95, z], R, K.Y, F, 80, 0, 0), R, K.Y, F, 2, 95, 15, wood);
    K.box([x, 188, z], R, K.Y, F, 82, 2, 15, wood);
    const books = ['#8e3b2e', '#2e5a8e', '#d8b45a', '#3b6b4a', '#e9e3d3', '#5b4b8a'];
    for (let s = 0; s < 4; s++) {
      const y0 = 12 + s * 45;
      let p = -74;
      while (p < 72) {
        const w = 3 + K.rnd() * 3, hgt = 26 + K.rnd() * 12;
        if (K.rnd() > 0.12) K.box(K.lin([x, y0 + hgt / 2, z], R, K.Y, F, p + w / 2, 0, 4), R, K.Y, F, w / 2, hgt / 2, 10, C(books[Math.floor(K.rnd() * 6)]!));
        p += w + 0.6;
      }
      K.box([x, y0 - 1, z], R, K.Y, F, 80, 1.5, 15, C('#5b3a24'));
    }
  };
  shelf(-1034, -660, 1);
  K.ab(1018, 0, -760, 44, 180, 64, C('#22252c'), { nx: C('#2a2e36') });
  for (let i = 0; i < 9; i++) {
    K.q4([995.5, 30 + i * 16, -780], [995.5, 30 + i * 16, -774], [995.5, 33 + i * 16, -774], [995.5, 33 + i * 16, -780], [-1, 0, 0], C(i % 3 ? '#35d07f' : '#f5b83d', 2));
  }
  const plant = (x: number, z: number, s: number) => {
    K.cyl(x, 0, z, 13 * s, 13 * s, 17 * s, 17 * s, 36 * s, C('#d9d3c4'), 24);
    K.disc(x, 36 * s + 0.2, z, 15 * s, 15 * s, C('#3b2a1e'), C('#3b2a1e'), 20);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283 + K.rnd(), rr = (6 + K.rnd() * 10) * s;
      K.ellip([x + Math.cos(a) * rr, (52 + K.rnd() * 40) * s, z + Math.sin(a) * rr], K.X, K.Y, K.Z, (14 + K.rnd() * 6) * s, (18 + K.rnd() * 10) * s, (14 + K.rnd() * 6) * s, C(['#3f7d4a', '#4f9a57', '#2f6a3d'][i % 3]!), 12, 8);
    }
  };
  plant(-1015, -485, 0.9); plant(1015, -485, 0.9); plant(-260, -805, 0.9); plant(260, -805, 0.9); plant(0, -200, 1.1);
  plant(-1010, 640, 1.1); plant(1010, 640, 1.1); plant(100, 1320, 1.1); plant(850, 1320, 1);
  K.ab(0, 0, -815, 260, 56, 42, C('#2f323a'), { py: C('#6b4429') });
  K.ab(-1010, 0, 200, 32, 96, 32, C('#e8e8ea'));
  K.cyl(-1010, 96, 200, 12, 12, 12, 12, 36, C('#8fc6e8'), 20);
  K.ab(1012, 0, 200, 46, 70, 52, C('#d9dbe0'), { py: C('#3a3f49') });

  // ===== lounge =====
  const ppx = 500, ppz = 1150, py = 76.1;
  K.ab(ppx, 73, ppz, 274, 3, 152, C('#1f5f8b'), { py: C('#2470a3') });
  const line = (x0: number, z0: number, x1: number, z1: number) => K.q4([x0, py, z0], [x0, py, z1], [x1, py, z1], [x1, py, z0], K.Y, C('#f4f4f4'));
  line(ppx - 137, ppz - 76, ppx + 137, ppz - 74); line(ppx - 137, ppz + 74, ppx + 137, ppz + 76);
  line(ppx - 137, ppz - 76, ppx - 135, ppz + 76); line(ppx + 135, ppz - 76, ppx + 137, ppz + 76);
  line(ppx - 137, ppz - 0.4, ppx + 137, ppz + 0.4);
  K.ab(ppx, 76, ppz, 1, 15, 162, C('#ececec'));
  for (const [a, b] of [[-110, -60], [110, -60], [-110, 60], [110, 60]] as const) K.tube([ppx + a, 0, ppz + b], [ppx + a, 73, ppz + b], 3, C('#2a2d33'), 8, false);
  K.ellip([ppx - 90, 76.8, ppz + 30], K.X, K.Y, K.Z, 8, 0.9, 9, C('#d94040'), 12, 4);
  // foosball
  const fx = 700, fz = 860;
  K.ab(fx, 60, fz, 120, 4, 70, C('#2f8a4a'));
  K.ab(fx, 60, fz - 34, 120, 26, 3, C('#6b4429')); K.ab(fx, 60, fz + 34, 120, 26, 3, C('#6b4429'));
  K.ab(fx - 59, 60, fz, 3, 26, 70, C('#6b4429')); K.ab(fx + 59, 60, fz, 3, 26, 70, C('#6b4429'));
  for (const [a, b] of [[-50, -28], [50, -28], [-50, 28], [50, 28]] as const) K.ab(fx + a, 0, fz + b, 6, 60, 6, C('#4a2f1d'));
  for (let i = 0; i < 8; i++) {
    const rx = fx - 52 + i * 15;
    K.tube([rx, 80, fz - 46], [rx, 80, fz + 46], 1, C('#c9ccd3'), 6, false);
    K.sph([rx, 80, fz + (i % 2 ? 48 : -48)], 2.6, C('#1d1d22'), 8, 5);
    for (const o of [-16, 0, 16]) K.ellip([rx, 74, fz + o], K.X, K.Y, K.Z, 2.4, 6.5, 2.4, C(i % 2 ? '#d94040' : '#3d6fd6'), 8, 6);
  }
  // sofa corner with console TV
  const sx = -760, sz = 1050, sofa = C('#d0704f'), soft = C('#e08a69');
  K.cyl(-860, 0.6, sz, 210, 200, 210, 200, 0.8, C('#6a5aa0'), 48, 3);
  K.ab(sx, 0, sz, 90, 42, 210, sofa);
  K.ab(sx + 38, 42, sz, 16, 46, 210, sofa);
  K.ab(sx - 3, 42, sz - 98, 84, 22, 16, sofa); K.ab(sx - 3, 42, sz + 98, 84, 22, 16, sofa);
  for (const o of [-60, 0, 60]) K.ab(sx - 8, 42, sz + o, 70, 10, 58, soft);
  K.ab(sx + 26, 58, sz - 50, 10, 28, 30, C('#f5b83d')); K.ab(sx + 26, 58, sz + 50, 10, 28, 30, C('#5b8def'));
  K.cyl(sx - 120, 0, sz, 8, 8, 8, 8, 36, C('#3a3f49'), 14);
  K.cyl(sx - 120, 36, sz, 40, 40, 40, 40, 4, C('#7d5537'), 32);
  K.ab(sx - 125, 40, sz - 8, 14, 3, 9, C('#2a2d33')); K.ab(sx - 112, 40, sz + 10, 14, 3, 9, C('#f2f0ea'));
  K.cyl(sx - 120, 40, sz + 24, 7, 7, 8, 8, 6, C('#e9a23b'), 14);
  K.ab(-1025, 0, sz, 40, 40, 150, C('#2f323a'), { py: C('#6b4429') });
  K.q4([-1004.8, 18, sz - 20], [-1004.8, 18, sz - 14], [-1004.8, 21, sz - 14], [-1004.8, 21, sz - 20], [1, 0, 0], C('#35d07f', 2));
  // bean bags
  K.ellip([-900, 24, 860], K.X, K.Y, K.Z, 34, 24, 34, C('#e9a23b'), 16, 10);
  K.ellip([-900, 24, 1250], K.X, K.Y, K.Z, 34, 24, 34, C('#5b8def'), 16, 10);
  // arcade cabinets
  for (const [x, body, mq] of [[-250, '#7a3fd1', '#f5b83d'], [-160, '#d9405a', '#35d07f']] as const) {
    const az = 760, fzz = az + 35.3;
    K.ab(x, 0, az, 66, 175, 70, C(body), { pz: C('#1d1d22') });
    K.q4([x - 26, 112, fzz], [x + 26, 112, fzz], [x + 26, 150, fzz], [x - 26, 150, fzz], K.Z, C('#2b5fd9', 2));
    K.q4([x - 18, 120, fzz + 0.2], [x - 4, 120, fzz + 0.2], [x - 4, 132, fzz + 0.2], [x - 18, 132, fzz + 0.2], K.Z, C('#f5b83d', 2));
    K.q4([x + 4, 128, fzz + 0.2], [x + 16, 128, fzz + 0.2], [x + 16, 140, fzz + 0.2], [x + 4, 140, fzz + 0.2], K.Z, C('#ff7a9c', 2));
    K.q4([x - 30, 156, fzz], [x + 30, 156, fzz], [x + 30, 172, fzz], [x - 30, 172, fzz], K.Z, C(mq, 2));
    K.ab(x, 92, az + 45, 62, 8, 20, C('#1b1b26'));
    K.sph([x - 14, 101, az + 45], 3, C('#2a2d33'), 8, 6);
    K.tube([x - 14, 100, az + 45], [x - 14, 107, az + 45], 1, C('#2a2d33'), 6, false);
    K.sph([x - 14, 108, az + 45], 2.4, C('#d94040'), 8, 6);
    for (const [o, cc] of [[6, '#35d07f'], [14, '#f5b83d'], [22, '#5b8def']] as const) K.sph([x + o, 100.5, az + 45], 2.3, C(cc), 8, 6);
  }
  // pantry: counter, coffee machine, fruit, fridge, bar stools
  K.ab(990, 0, 1070, 60, 92, 340, C('#3a3f49'), { py: C('#e8e3d6') });
  K.ab(998, 92, 980, 40, 38, 36, C('#c9ccd3'));
  K.q4([977.8, 118, 974], [977.8, 118, 980], [977.8, 122, 980], [977.8, 122, 974], [-1, 0, 0], C('#ef6a3c', 2));
  [1020, 1035, 1050].forEach((z, i) => K.cyl(980, 92, z, 4, 4, 4.5, 4.5, 9, C(['#f2f0ea', '#f5b83d', '#5b8def'][i]!), 14));
  K.cyl(992, 92, 1160, 16, 16, 18, 18, 6, C('#e8e3d6'), 20);
  for (const [cc, a, b] of [['#f5b83d', 0, 0], ['#d94040', 7, 4], ['#4f9a57', -6, 5]] as const) K.sph([992 + a, 103, 1160 + b], 5.5, C(cc), 10, 7);
  K.ab(998, 0, 1290, 56, 180, 52, C('#e2e4e8'));
  K.ab(969.6, 100, 1275, 1.2, 40, 3, C('#9aa3ad'));
  for (const z of [960, 1050, 1140]) {
    K.tube([930, 0, z], [930, 64, z], 2.5, C('#9aa3ad'), 8, false);
    K.cyl(930, 0, z, 16, 16, 16, 16, 2, C('#6b707b'), 18);
    K.cyl(930, 64, z, 18, 18, 18, 18, 6, C('#2f323a'), 20);
  }

  // shadows
  K.use('trans');
  const shadow = (x: number, z: number, a: number, b: number, al: number, n = 2) => K.disc(x, 1.3, z, a, b, C('#000000', al), C('#000000', 0), 40, n);
  for (const p of pods) shadow(p.x, p.z, p.w / 2 + 25, p.d / 2 + 25, 0.24, 8);
  shadow(-775, -700, 120, 60, 0.25, 4); shadow(775, -700, 120, 60, 0.25, 4);
  shadow(ppx, ppz, 170, 100, 0.25, 4); shadow(fx, fz, 80, 50, 0.25, 4); shadow(sx, sz, 70, 130, 0.25, 4);
  if (sq) {
    shadow(-229, sq.z - 70, 85, 55, 0.3, 6);
    shadow(0, wz, 190, 30, 0.25, 6);
  }
  // glass walls of the CEO and CTO rooms
  const glassZ = (x0: number, x1: number, z: number) => {
    K.use('trans'); K.q4([x0, 2, z], [x1, 2, z], [x1, 240, z], [x0, 240, z], K.Z, C('#bfe0ee', 0.16));
    K.use('main'); K.ab((x0 + x1) / 2, 240, z, x1 - x0, 6, 4, C('#9aa3ad')); K.ab((x0 + x1) / 2, 0, z, x1 - x0, 5, 4, C('#9aa3ad'));
    for (let x = x0; x <= x1 + 0.1; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 130))) K.ab(x, 0, z, 3.5, 246, 4.5, C('#9aa3ad'));
  };
  const glassX = (z0: number, z1: number, x: number) => {
    K.use('trans'); K.q4([x, 2, z0], [x, 2, z1], [x, 240, z1], [x, 240, z0], K.X, C('#bfe0ee', 0.16));
    K.use('main'); K.ab(x, 240, (z0 + z1) / 2, 4, 6, z1 - z0, C('#9aa3ad')); K.ab(x, 0, (z0 + z1) / 2, 4, 5, z1 - z0, C('#9aa3ad'));
    for (let z = z0; z <= z1 + 0.1; z += (z1 - z0) / 3) K.ab(x, 0, z, 4.5, 246, 3.5, C('#9aa3ad'));
  };
  glassZ(X0, -620, -450); glassZ(-530, -500, -450); glassX(ZB, -450, -500);
  glassZ(500, 530, -450); glassZ(620, X1, -450); glassX(ZB, -450, 500);
  K.use('main');
  K.ab(-575, 150, -447.5, 44, 12, 1, C('#f5b83d', 2)); K.ab(575, 150, -447.5, 44, 12, 1, C('#f5b83d', 2));

  // back wall + sprint TV + decor
  K.use('back');
  const bz = ZB - 6;
  K.ab(0, 0, bz, X1 - X0 + 24, 270, 12, C('#e7e2d8'), { pz: C('#ebe6dc') });
  K.ab(0, 0, ZB + 0.5, X1 - X0, 10, 1, C('#4a4e58'));
  K.ab(0, 112, ZB + 3, 290, 166, 5, C('#15171c'));
  const tz = ZB + 5.6;
  K.q4([-138, 118, tz], [138, 118, tz], [138, 272, tz], [-138, 272, tz], K.Z, C('#1d2431', 2));
  for (const [cx, cards] of [[-90, ['#f5b83d', '#f5b83d']], [0, ['#5b8def', '#5b8def', '#ef6a3c']], [90, ['#35b87a', '#35b87a', '#35b87a', '#35b87a']]] as const) {
    K.q4([cx - 38, 250, tz + 0.4], [cx + 38, 250, tz + 0.4], [cx + 38, 262, tz + 0.4], [cx - 38, 262, tz + 0.4], K.Z, C('#3a4256', 2));
    cards.forEach((cc, i) => {
      const y = 228 - i * 26;
      K.q4([cx - 36, y, tz + 0.4], [cx + 36, y, tz + 0.4], [cx + 36, y + 18, tz + 0.4], [cx - 36, y + 18, tz + 0.4], K.Z, C(cc, 2));
    });
  }
  for (const [x, a, b] of [[-900, '#c96f4a', '#2f4f6f'], [-775, '#d9b45a', '#3d6b55'], [-650, '#5a7fb0', '#e8d9b8']] as const) {
    K.ab(x, 140, ZB + 2.5, 80, 60, 3, C('#2a1d14'));
    K.q4([x - 34, 146, ZB + 4.2], [x + 34, 146, ZB + 4.2], [x + 34, 194, ZB + 4.2], [x - 34, 194, ZB + 4.2], K.Z, C(a));
    K.q4([x - 34, 146, ZB + 4.4], [x + 2, 146, ZB + 4.4], [x + 2, 176, ZB + 4.4], [x - 34, 176, ZB + 4.4], K.Z, C(b));
  }
  K.ab(775, 100, ZB + 2, 230, 120, 3, C('#f4f5f6'), { pz: C('#ffffff') });
  for (const [x, y, cc] of [[715, 190, '#5b8def'], [775, 190, '#35b87a'], [835, 190, '#5b8def'], [745, 140, '#ef6a3c'], [805, 140, '#b28dff']] as const) {
    K.q4([x - 20, y - 10, ZB + 3.8], [x + 20, y - 10, ZB + 3.8], [x + 20, y + 10, ZB + 3.8], [x - 20, y + 10, ZB + 3.8], K.Z, C(cc));
  }
  for (const [x0, y0, x1, y1] of [[715, 180, 745, 150], [775, 180, 775, 160], [835, 180, 805, 150]] as const) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx2 = (-dy / l) * 1.2, ny2 = (dx / l) * 1.2;
    K.q4([x0 + nx2, y0 + ny2, ZB + 3.7], [x1 + nx2, y1 + ny2, ZB + 3.7], [x1 - nx2, y1 - ny2, ZB + 3.7], [x0 - nx2, y0 - ny2, ZB + 3.7], K.Z, C('#3a3f49'));
  }
  const sideWall = (gx: string, sgn: number, wins: [number, number][], door?: [number, number]) => {
    K.use(gx);
    const x = sgn * (X1 + 6), xi = sgn * (X1 - 0.6), zc = (ZB + ZF) / 2, zl = ZF - ZB;
    const face = sgn < 0 ? { px: C('#e7e2d8') } : { nx: C('#e7e2d8') };
    if (door) {
      // Wall pieces around the doorway, a lintel above it, and a frame.
      const [d0, d1] = door;
      for (const [z0, z1] of [[ZB - 6, d0], [d1, ZF + 6]] as const) {
        K.ab(x, 0, (z0 + z1) / 2, 12, 270, z1 - z0, C('#e2ddd2'), face);
        K.ab(xi, 0, (z0 + z1) / 2, 1, 10, z1 - z0, C('#4a4e58'));
      }
      K.ab(x, 215, (d0 + d1) / 2, 12, 55, d1 - d0, C('#e2ddd2'), face);
      K.ab(x, 0, d0 + 2, 16, 215, 4, C('#8f98a3'));
      K.ab(x, 0, d1 - 2, 16, 215, 4, C('#8f98a3'));
      K.ab(x, 211, (d0 + d1) / 2, 16, 4, d1 - d0, C('#8f98a3'));
    } else {
      K.ab(x, 0, zc, 12, 270, zl + 12, C('#e2ddd2'), face);
      K.ab(xi, 0, zc, 1, 10, zl, C('#4a4e58'));
    }
    for (const [z0, z1] of wins) {
      K.q4([xi, 80, z0], [xi, 80, z1], [xi, 238, z1], [xi, 238, z0], [-sgn, 0, 0], C('#cfe4f2', 2));
      K.ab(xi, 76, (z0 + z1) / 2, 3, 6, z1 - z0 + 8, C('#8f98a3'));
      K.ab(xi, 236, (z0 + z1) / 2, 3, 6, z1 - z0 + 8, C('#8f98a3'));
      K.ab(xi, 78, z0, 3, 162, 5, C('#8f98a3')); K.ab(xi, 78, z1, 3, 162, 5, C('#8f98a3')); K.ab(xi, 78, (z0 + z1) / 2, 3, 162, 4, C('#8f98a3'));
    }
  };
  sideWall('left', -1, [[-810, -480], [-380, -60], [40, 360], [440, 620], [760, 940], [1180, 1320]], [DORM.DZ0, DORM.DZ1]);
  sideWall('right', 1, [[-810, -480], [-380, -60], [40, 360], [440, 640], [740, 940], [1020, 1220]]);
  // lounge wall TV (console)
  K.use('left');
  K.ab(-1047, 105, sz, 5, 92, 164, C('#15171c'));
  K.q4([-1044.2, 110, sz - 78], [-1044.2, 110, sz + 78], [-1044.2, 192, sz + 78], [-1044.2, 192, sz - 78], [1, 0, 0], C('#24305a', 2));
  for (const [dz, y, w, h, cc] of [[-60, 130, 30, 20, '#35d07f'], [-10, 150, 22, 22, '#f5b83d'], [35, 125, 26, 34, '#ff7a9c'], [-45, 165, 60, 8, '#8fd8ff']] as const) {
    K.q4([-1044, y, sz + dz], [-1044, y, sz + dz + w], [-1044, y + h, sz + dz + w], [-1044, y + h, sz + dz], [1, 0, 0], C(cc, 2));
  }
  buildDorm(K);
  return G;
}

/**
 * Dorm ("Asrama") left of the office: hall from the office door, a corridor,
 * and one bedroom per bed (see BEDS). Room walls are low so the sleepers stay
 * visible from above. Night lamps glow only while the office is off.
 */
function buildDorm(K: Kit): void {
  const { ZB, ZF } = BOUNDS;
  const { X0, X1, CX0, CX1, HZ0, HZ1, DZ0, DZ1 } = DORM;
  const wood = C('#6b4a32'), woodDark = C('#4a3222'), partition = C('#d9d2c4');
  K.use('main');
  // corridor + hall floor (light wood), rooms carpeted
  for (let p = 0; p < 55; p++) {
    const z0 = ZB + p * ((ZF - ZB) / 55), z1 = ZB + (p + 1) * ((ZF - ZB) / 55);
    K.q4([X0, 0, z0], [X0, 0, z1], [X1, 0, z1], [X1, 0, z0], K.Y, C(p % 2 ? '#c8b48f' : '#c0ab86'));
  }
  const rug = (x0: number, x1: number, z0: number, z1: number, i: number) =>
    K.q4([x0, 0.3, z0], [x0, 0.3, z1], [x1, 0.3, z1], [x1, 0.3, z0], K.Y, C(i % 2 ? '#4b5876' : '#44506c'));
  const wallZ = (x0: number, x1: number, z: number) => K.ab((x0 + x1) / 2, 0, z, x1 - x0, 120, 6, partition, { py: C('#bfb6a5') });
  const wallX = (x: number, z0: number, z1: number) => z1 - z0 > 1 && K.ab(x, 0, (z0 + z1) / 2, 6, 120, z1 - z0, partition, { py: C('#bfb6a5') });
  BEDS.forEach((b, i) => {
    const east = b.dir === 1;
    const rx0 = east ? CX1 : X0, rx1 = east ? X1 : CX0;
    rug(rx0, rx1, b.z0, b.z1, i);
    // room walls: the shared walls along z, and the corridor wall with a door gap
    wallZ(rx0, rx1, b.z0);
    if (!BEDS.some((o) => o.dir === b.dir && Math.abs(o.z0 - b.z1) < 1)) wallZ(rx0, rx1, b.z1);
    const cw = east ? CX1 : CX0;
    wallX(cw, b.z0, b.doorZ - 30);
    wallX(cw, b.doorZ + 30, b.z1);
    // bed: frame, legs, mattress, headboard, pillow, folded blanket at the foot
    const bx = b.x - (b.dir * BED.L) / 2;
    K.ab(bx, 12, b.z, BED.L, 28, BED.W, wood, { py: woodDark });
    K.ab(bx, BED.TOP - 8, b.z, BED.L - 6, 8, BED.W - 6, C('#f4f1ea'));
    K.ab(b.x - b.dir * 3, 0, b.z, 6, 96, BED.W + 8, woodDark, { py: wood });
    for (const [lx, lz] of [[8, -48], [8, 48], [BED.L - 8, -48], [BED.L - 8, 48]] as const) K.ab(b.x - b.dir * lx, 0, b.z + lz, 6, 12, 6, woodDark);
    K.ellip([b.x - b.dir * 26, BED.TOP + 6, b.z], K.X, K.Y, K.Z, 15, 6, 34, C('#ffffff'), 14, 8);
    K.ab(b.x - b.dir * (BED.L - 20), BED.TOP, b.z, 30, 6, BED.W - 8, C('#8a9bc0'));
    // nightstand + lamp beside the head, on the door side
    const nx = b.x - b.dir * 26, nz = b.z + BED.W / 2 + 28;
    K.ab(nx, 0, nz, 40, 50, 38, wood, { py: woodDark });
    K.cyl(nx, 50, nz, 6, 6, 6, 6, 3, C('#3a3f49'), 12);
    K.tube([nx, 53, nz], [nx, 70, nz], 1.2, C('#3a3f49'), 6, false);
    K.use('dormOn');
    K.cyl(nx, 68, nz, 11, 11, 7, 7, 14, C('#ffd48a', 2), 16);
    K.disc(nx, 50.5, nz, 18, 18, C('#ffe2a8', 2), C('#ffe2a8', 2), 16);
    K.use('dormOff');
    K.cyl(nx, 68, nz, 11, 11, 7, 7, 14, C('#d8cbb0'), 16);
    K.use('main');
  });
  // walls between the hall and the rooms either side of it are the room walls at HZ0/HZ1
  // back wall and far (west) wall
  K.use('back');
  K.ab((X0 + X1) / 2 - 6, 0, ZB - 6, X1 - X0 + 12, 270, 12, C('#e2ddd2'), { pz: C('#e7e2d8') });
  K.use('dormW');
  const wx = X0 - 6, zc = (ZB + ZF) / 2;
  K.ab(wx, 0, zc, 12, 270, ZF - ZB + 12, C('#e2ddd2'), { px: C('#e7e2d8') });
  for (let i = 0; i < 10; i++) {
    const b = BEDS.find((x) => x.k === 'w' + i)!;
    const z0 = b.z0 + 40, z1 = b.z1 - 40, xi = X0 + 0.6;
    K.q4([xi, 120, z0], [xi, 120, z1], [xi, 230, z1], [xi, 230, z0], [1, 0, 0], C('#1d2a4a', 2));
    K.ab(xi, 116, (z0 + z1) / 2, 3, 5, z1 - z0 + 8, C('#8f98a3'));
    K.ab(xi, 228, (z0 + z1) / 2, 3, 5, z1 - z0 + 8, C('#8f98a3'));
  }
  // lit sign over the office door, both sides; mat in the hall
  K.use('dormOn');
  for (const x of [-1043.5, -1068.5]) K.ab(x, 222, (DZ0 + DZ1) / 2, 1, 10, 56, C('#f5b83d', 2));
  K.use('dormOff');
  for (const x of [-1043.5, -1068.5]) K.ab(x, 222, (DZ0 + DZ1) / 2, 1, 10, 56, C('#6b707b'));
  K.use('main');
  K.ab((CX1 + X1) / 2, 0.5, (HZ0 + HZ1) / 2, 120, 0.6, 70, C('#7a3a2f'));
  // corridor runner
  K.ab((CX0 + CX1) / 2, 0.4, (ZB + ZF) / 2, 70, 0.5, ZF - ZB - 80, C('#2f4a6b'));
}
