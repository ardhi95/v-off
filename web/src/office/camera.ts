import { VIEWS, type CameraView } from './layout.js';

export interface CamState {
  tx: number;
  ty: number;
  tz: number;
  yaw: number;
  pitch: number;
  dist: number;
}
type Key = keyof CamState;
const KEYS: Key[] = ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist'];

export const DIST_MIN = 280;
export const DIST_MAX = 5200;
export const PITCH_MIN = 0.12;
export const PITCH_MAX = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Orbit camera that eases `cam` toward `goal` (instantly when motion is reduced). */
export class OrbitCamera {
  cam: CamState;
  goal: CamState;

  constructor(start: CameraView = VIEWS.kantor!, private readonly reduceMotion = false) {
    this.goal = { tx: start.tx, ty: start.ty, tz: start.tz, yaw: start.yaw, pitch: start.pitch, dist: start.dist };
    this.cam = reduceMotion
      ? { ...this.goal }
      : { ...this.goal, yaw: start.yaw + 0.5, pitch: start.pitch + 0.15, dist: start.dist * 1.25 };
  }

  /** Advance easing one frame. Returns true while still moving. */
  step(): boolean {
    let moving = false;
    for (const k of KEYS) {
      const d = this.goal[k] - this.cam[k];
      if (!this.reduceMotion && Math.abs(d) > 0.0005) {
        this.cam[k] += d * 0.1;
        moving = true;
      } else {
        this.cam[k] = this.goal[k];
      }
    }
    return moving;
  }

  view(v: CameraView): void {
    this.goal.tx = v.tx;
    this.goal.ty = v.ty;
    this.goal.tz = v.tz;
    this.goal.pitch = v.pitch;
    this.goal.dist = v.dist;
    // Take the short way round.
    const tw = Math.PI * 2;
    let y = v.yaw;
    while (y - this.goal.yaw > Math.PI) y -= tw;
    while (this.goal.yaw - y > Math.PI) y += tw;
    this.goal.yaw = y;
  }

  rotate(d: number): void {
    this.goal.yaw += d;
  }

  zoom(f: number): void {
    this.goal.dist = clamp(this.goal.dist * f, DIST_MIN, DIST_MAX);
  }

  focus(x: number, z: number): void {
    this.goal.tx = x;
    this.goal.ty = 80;
    this.goal.tz = z;
    this.goal.dist = 430;
    this.goal.pitch = 0.42;
  }

  /** Direct drag: both cam and goal follow the pointer. */
  orbitTo(yaw: number, pitch: number): void {
    this.goal.yaw = this.cam.yaw = yaw;
    this.goal.pitch = this.cam.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX);
  }

  eye(): [number, number, number] {
    const c = this.cam;
    return [
      c.tx + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw),
      c.ty + c.dist * Math.sin(c.pitch),
      c.tz + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw),
    ];
  }

  /** View-projection matrix (19° half-FOV, near 10, far 14000), column-major. */
  viewProj(aspect: number): number[] {
    const c = this.cam, eye = this.eye();
    const f = 1 / Math.tan((19 * Math.PI) / 180), nr = 10, fr = 14000;
    const P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, (2 * fr * nr) / (nr - fr), 0];
    const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
    const nrm = (a: number[]) => {
      const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
      return [a[0]! / l, a[1]! / l, a[2]! / l];
    };
    const crs = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const z = nrm(sub(eye, [c.tx, c.ty, c.tz])), x = nrm(crs([0, 1, 0], z)), y = crs(z, x);
    const V = [x[0]!, y[0]!, z[0]!, 0, x[1]!, y[1]!, z[1]!, 0, x[2]!, y[2]!, z[2]!, 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    const o = new Array<number>(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += P[k * 4 + row]! * V[col * 4 + k]!;
      o[col * 4 + row] = s;
    }
    return o;
  }
}

/** Project a world point to CSS pixels plus clip depth, or null when behind the camera. */
export function project(M: number[], p: readonly number[], w: number, h: number): [number, number, number] | null {
  const x = M[0]! * p[0]! + M[4]! * p[1]! + M[8]! * p[2]! + M[12]!;
  const y = M[1]! * p[0]! + M[5]! * p[1]! + M[9]! * p[2]! + M[13]!;
  const ww = M[3]! * p[0]! + M[7]! * p[1]! + M[11]! * p[2]! + M[15]!;
  if (ww <= 1) return null;
  return [((x / ww) * 0.5 + 0.5) * w, (0.5 - (y / ww) * 0.5) * h, ww];
}
