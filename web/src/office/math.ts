// Column-major 4x4 matrices and small vector helpers (ported from the mockup renderer).

export type Vec3 = [number, number, number];
export type Mat4 = number[];

export const T = (x: number, y: number, z: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

export const Ry = (a: number): Mat4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
};

export const Rx = (a: number): Mat4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};

export function m4(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row]! * b[col * 4 + k]!;
      o[col * 4 + row] = s;
    }
  }
  return o;
}

/** Local seat frame: (lx, ly, lz) relative to a seat at (x, z) facing `yaw`. */
export function seatPoint(seat: readonly [number, number, number], lx: number, ly: number, lz: number): Vec3 {
  const y = seat[2];
  const f = [Math.sin(y), 0, Math.cos(y)], r = [Math.cos(y), 0, -Math.sin(y)];
  return [seat[0] + r[0]! * lx + f[0]! * lz, ly, seat[1] + r[2]! * lx + f[2]! * lz];
}
