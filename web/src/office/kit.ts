import type { Vec3 } from './math.js';

// Geometry kit ported from design/mockup/Main.dc.html (kit()). Every vertex is
// 10 floats: position(3) normal(3) colour(4). Colour alpha > 1.5 means
// "emissive" (unlit) in the shader, used for screens and lamps.

export type RGBA = [number, number, number, number];
export type Groups = Record<string, number[]>;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lin = (C: Vec3, R: Vec3, U: Vec3, F: Vec3, x: number, y: number, z: number): Vec3 => [
  C[0] + R[0] * x + U[0] * y + F[0] * z,
  C[1] + R[1] * x + U[1] * y + F[1] * z,
  C[2] + R[2] * x + U[2] * y + F[2] * z,
];

export function col(h: string, a?: number): RGBA {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a ?? 1];
}

export function mix(h: string, g: string, t: number): string {
  const a = col(h), b = col(g);
  return '#' + a.slice(0, 3).map((x, i) => Math.round((x + (b[i]! - x) * t) * 255).toString(16).padStart(2, '0')).join('');
}

export type FaceColors = Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', RGBA>>;

export class Kit {
  readonly X: Vec3 = [1, 0, 0];
  readonly Y: Vec3 = [0, 1, 0];
  readonly Z: Vec3 = [0, 0, 1];
  readonly add = add;
  readonly sub = sub;
  readonly mul = mul;
  readonly norm = norm;
  readonly lin = lin;
  private cur: number[];
  private seed = 11;

  constructor(private readonly G: Groups) {
    this.cur = G[Object.keys(G)[0]!]!;
  }

  use(k: string): void {
    if (!this.G[k]) this.G[k] = [];
    this.cur = this.G[k]!;
  }

  /** Deterministic pseudo-random, same sequence as the mockup. */
  rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private vert(p: Vec3, n: Vec3, c: RGBA): void {
    this.cur.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3]);
  }

  tri(a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3, ca: RGBA, cb?: RGBA, cc?: RGBA): void {
    this.vert(a, na, ca);
    this.vert(b, nb, cb ?? ca);
    this.vert(c, nc, cc ?? ca);
  }

  q4(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, c0: RGBA): void {
    this.tri(a, b, c, n, n, n, c0);
    this.tri(a, c, d, n, n, n, c0);
  }

  box(C: Vec3, R: Vec3, U: Vec3, F: Vec3, hw: number, hh: number, hd: number, c0: RGBA, fc: FaceColors = {}): void {
    const P = (i: number, j: number, k: number) => lin(C, R, U, F, i * hw, j * hh, k * hd);
    const faces: [keyof FaceColors, Vec3, [number, number, number][]][] = [
      ['px', R, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
      ['nx', mul(R, -1), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      ['py', U, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
      ['ny', mul(U, -1), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
      ['pz', F, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      ['nz', mul(F, -1), [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
    ];
    for (const [k, nv, cs] of faces) {
      const p = cs.map((q) => P(q[0], q[1], q[2]));
      this.q4(p[0]!, p[1]!, p[2]!, p[3]!, norm(nv), fc[k] ?? c0);
    }
  }

  /** Append prebuilt vertices (10 floats each), transformed by a column-major 4x4 matrix (rotation + translation). */
  append(data: ArrayLike<number>, M: readonly number[]): void {
    for (let i = 0; i < data.length; i += 10) {
      const x = data[i]!, y = data[i + 1]!, z = data[i + 2]!, nx = data[i + 3]!, ny = data[i + 4]!, nz = data[i + 5]!;
      this.cur.push(
        M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!,
        M[0]! * nx + M[4]! * ny + M[8]! * nz, M[1]! * nx + M[5]! * ny + M[9]! * nz, M[2]! * nx + M[6]! * ny + M[10]! * nz,
        data[i + 6]!, data[i + 7]!, data[i + 8]!, data[i + 9]!,
      );
    }
  }

  /** Axis-aligned box standing on y0. */
  ab(x: number, y0: number, z: number, w: number, h: number, d: number, c0: RGBA, fc?: FaceColors): void {
    this.box([x, y0 + h / 2, z], this.X, this.Y, this.Z, w / 2, h / 2, d / 2, c0, fc);
  }

  ellip(C: Vec3, R: Vec3, U: Vec3, F: Vec3, a: number, b: number, c: number, c0: RGBA, su = 16, sv = 10): void {
    const rows: [Vec3, Vec3][][] = [];
    for (let j = 0; j <= sv; j++) {
      const th = (j / sv) * Math.PI, row: [Vec3, Vec3][] = [];
      for (let i = 0; i <= su; i++) {
        const ph = (i / su) * 2 * Math.PI;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        row.push([lin(C, R, U, F, x * a, y * b, z * c), norm(lin([0, 0, 0], R, U, F, x / a, y / b, z / c))]);
      }
      rows.push(row);
    }
    for (let j = 0; j < sv; j++) {
      for (let i = 0; i < su; i++) {
        const p00 = rows[j]![i]!, p10 = rows[j]![i + 1]!, p11 = rows[j + 1]![i + 1]!, p01 = rows[j + 1]![i]!;
        this.tri(p00[0], p10[0], p11[0], p00[1], p10[1], p11[1], c0);
        this.tri(p00[0], p11[0], p01[0], p00[1], p11[1], p01[1], c0);
      }
    }
  }

  sph(C: Vec3, r: number, c0: RGBA, su?: number, sv?: number): void {
    this.ellip(C, this.X, this.Y, this.Z, r, r, r, c0, su, sv);
  }

  tube(A: Vec3, B: Vec3, r: number, c0: RGBA, seg = 12, cap = true): void {
    const d = norm(sub(B, A));
    const t: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(d, t)), v = cross(d, u);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
      const n0 = add(mul(u, Math.cos(a0)), mul(v, Math.sin(a0))), n1 = add(mul(u, Math.cos(a1)), mul(v, Math.sin(a1)));
      const p0 = add(A, mul(n0, r)), p1 = add(A, mul(n1, r)), q0 = add(B, mul(n0, r)), q1 = add(B, mul(n1, r));
      this.tri(p0, p1, q1, n0, n1, n1, c0);
      this.tri(p0, q1, q0, n0, n1, n0, c0);
    }
    if (cap) {
      this.sph(A, r, c0, 8, 5);
      this.sph(B, r, c0, 8, 5);
    }
  }

  arc(C: Vec3, R: Vec3, U: Vec3, rad: number, a0: number, a1: number, th: number, c0: RGBA, seg = 14): void {
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
      const p0 = add(C, add(mul(R, Math.cos(t0) * rad), mul(U, Math.sin(t0) * rad)));
      const p1 = add(C, add(mul(R, Math.cos(t1) * rad), mul(U, Math.sin(t1) * rad)));
      this.tube(p0, p1, th, c0, 6, false);
      this.sph(p1, th, c0, 6, 4);
    }
  }

  cone(A: Vec3, B: Vec3, r: number, c0: RGBA, seg = 12): void {
    const d = norm(sub(B, A)), t: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(d, t)), v = cross(d, u), len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
      const e0 = add(mul(u, Math.cos(a0)), mul(v, Math.sin(a0))), e1 = add(mul(u, Math.cos(a1)), mul(v, Math.sin(a1)));
      const n0 = norm(add(e0, mul(d, r / len))), n1 = norm(add(e1, mul(d, r / len)));
      this.tri(add(A, mul(e0, r)), add(A, mul(e1, r)), B, n0, n1, norm(add(n0, n1)), c0);
      const nd = mul(d, -1);
      this.tri(A, add(A, mul(e1, r)), add(A, mul(e0, r)), nd, nd, nd, c0);
    }
  }

  /** Superellipse prism: n = 2 ellipse, higher n = rounder rectangle. */
  cyl(x: number, y0: number, z: number, a0: number, b0: number, a1: number, b1: number, h: number, c0: RGBA, seg = 32, n = 2, capCol?: RGBA): void {
    const e = 2 / n, sp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
    const ring: { b: Vec3; t: Vec3; n: Vec3 }[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
      const nx = (Math.sign(c) * Math.pow(Math.abs(c), 2 - e)) / a0, nz = (Math.sign(s) * Math.pow(Math.abs(s), 2 - e)) / b0;
      ring.push({ b: [x + a0 * sp(c), y0, z + b0 * sp(s)], t: [x + a1 * sp(c), y0 + h, z + b1 * sp(s)], n: norm([nx, 0, nz]) });
    }
    const top: Vec3 = [x, y0 + h, z], bot: Vec3 = [x, y0, z], cc = capCol ?? c0, down: Vec3 = [0, -1, 0];
    for (let i = 0; i < seg; i++) {
      const A = ring[i]!, B = ring[i + 1]!;
      this.tri(A.b, B.b, B.t, A.n, B.n, B.n, c0);
      this.tri(A.b, B.t, A.t, A.n, B.n, A.n, c0);
      this.tri(top, A.t, B.t, this.Y, this.Y, this.Y, cc);
      this.tri(bot, B.b, A.b, down, down, down, c0);
    }
  }

  /** Flat disc with a centre colour fading to a rim colour (soft shadows). */
  disc(x: number, y: number, z: number, a: number, b: number, cC: RGBA, cR: RGBA, seg = 36, n = 2): void {
    const e = 2 / n, sp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * 2 * Math.PI, t1 = ((i + 1) / seg) * 2 * Math.PI;
      this.tri([x, y, z], [x + a * sp(Math.cos(t0)), y, z + b * sp(Math.sin(t0))], [x + a * sp(Math.cos(t1)), y, z + b * sp(Math.sin(t1))], this.Y, this.Y, this.Y, cC, cR, cR);
    }
  }

  ring(x: number, y: number, z: number, r0: number, r1: number, c0: RGBA, seg = 40): void {
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * 2 * Math.PI, t1 = ((i + 1) / seg) * 2 * Math.PI;
      const a: Vec3 = [x + r0 * Math.cos(t0), y, z + r0 * Math.sin(t0)], b: Vec3 = [x + r1 * Math.cos(t0), y, z + r1 * Math.sin(t0)];
      const c: Vec3 = [x + r1 * Math.cos(t1), y, z + r1 * Math.sin(t1)], d: Vec3 = [x + r0 * Math.cos(t1), y, z + r0 * Math.sin(t1)];
      this.q4(a, b, c, d, this.Y, c0);
    }
  }
}
