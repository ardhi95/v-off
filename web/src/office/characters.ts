import type { Species, Status } from '../../../src/shared/types.js';
import { col, Kit, mix, type Groups, type RGBA } from './kit.js';
import type { Hold, SeatXYZ } from './layout.js';
import { m4, Rx, seatPoint, T, type Mat4, type Vec3 } from './math.js';

// Animal characters, ported from animalHead(), tail(), sitBody(), standBody(),
// seated() and walker() in design/mockup/Main.dc.html. Expressions per status:
// macet = worried brows + small "o" mouth + sweat drop, bicara/idle = open
// mouth, tidur (asleep in the dorm) = closed eyes, others = smile.

/** Face to draw: an agent status, or asleep while the office is off. */
export type Face = Status | 'tidur';

export interface Look {
  animal: Species;
  skin: string;
  acc: string;
  muz: string;
  shirt: string;
  pants: string;
  shoe: string;
  glasses?: boolean;
  phones?: string;
  beret?: boolean;
  cap?: string;
  hood?: boolean;
  tie?: boolean;
  walker?: boolean;
}

export type Paint = (h: string, a?: number) => RGBA;
type Local = (x: number, y: number, z: number) => Vec3;

export function painter(dim: boolean): Paint {
  return (h, a) => col(dim ? mix(h, '#5a606c', 0.62) : h, a);
}

function animalHead(K: Kit, L: Local, r: Vec3, f: Vec3, hy: number, a: Look, s: Face, pc: Paint): void {
  const fur = pc(a.skin), acc = pc(a.acc), muz = pc(a.muz), dark = pc('#26222a'), pink = pc('#f4a3b4');
  const sp = a.animal, worried = s === 'macet';
  const W = sp === 'frog' ? 19 : 17, Hh = sp === 'frog' ? 14 : 16;
  K.ellip(L(0, hy, 0), r, K.Y, f, W, Hh, 16, fur, 20, 14);
  let eyeZ = 15, eyeStyle: 'dot' | 'ring' | 'none' = 'dot', noseCol = dark, muzzle = true;
  const roundEars = (size: number, inner: RGBA, x: number, y: number) => {
    for (const sx of [-1, 1]) {
      K.sph(L(sx * x, hy + y, -2), size, sp === 'panda' ? acc : fur, 12, 8);
      K.ellip(L(sx * x, hy + y, -2 + size * 0.62), r, K.Y, f, size * 0.6, size * 0.6, size * 0.3, inner, 10, 6);
    }
  };
  const pointEars = (c0: RGBA, inner: RGBA) => {
    for (const sx of [-1, 1]) {
      K.cone(L(sx * 9.5, hy + 10, -1), L(sx * 13.5, hy + 26, -1), 6.5, c0, 14);
      K.cone(L(sx * 9.9, hy + 11.5, 2.2), L(sx * 13, hy + 23, 1.6), 3.6, inner, 10);
    }
  };
  if (sp === 'lion') {
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2;
      K.ellip(L(Math.cos(t) * 17, hy + Math.sin(t) * 16, -5), r, K.Y, f, 8, 8, 7, acc, 10, 7);
    }
    roundEars(4.5, muz, 11, 14);
    noseCol = pc('#7a3e2e');
  } else if (sp === 'owl') {
    K.ellip(L(0, hy, 10.5), r, K.Y, f, 14, 12.5, 6.5, muz, 16, 10);
    for (const sx of [-1, 1]) K.cone(L(sx * 10, hy + 11, -1), L(sx * 15, hy + 23, -2), 4.5, acc, 10);
    for (const x of [-6.5, 6.5]) K.ellip(L(x, hy + 0.5, 15.6), r, K.Y, f, 5.2, 5.2, 1.6, pc('#f5c84a'), 14, 6);
    K.cone(L(0, hy - 3, 16.2), L(0, hy - 8.5, 19.5), 2.6, pc('#f0a030'), 10);
    eyeZ = 16.8;
    muzzle = false;
  } else if (sp === 'rabbit') {
    for (const sx of [-1, 1]) {
      K.ellip(L(sx * 6.5, hy + 26, -2), r, K.Y, f, 4.6, 13.5, 3.4, fur, 12, 10);
      K.ellip(L(sx * 6.5, hy + 26, 0.8), r, K.Y, f, 2.6, 10.5, 1.2, acc, 10, 8);
    }
    noseCol = pink;
  } else if (sp === 'cat' || sp === 'fox') {
    pointEars(fur, sp === 'fox' ? pc('#2a2226') : pink);
    if (sp === 'cat') noseCol = pink;
  } else if (sp === 'bear') {
    roundEars(5.5, muz, 12, 12);
  } else if (sp === 'panda') {
    roundEars(5.5, acc, 12, 12);
    for (const x of [-6.5, 6.5]) K.ellip(L(x, hy - 0.5, 13.6), r, K.Y, f, 4.8, 5.8, 2.6, acc, 12, 8);
    eyeStyle = 'ring';
  } else if (sp === 'koala') {
    for (const sx of [-1, 1]) {
      K.sph(L(sx * 15.5, hy + 9, -2), 9, fur, 14, 10);
      K.ellip(L(sx * 15.5, hy + 9, 4), r, K.Y, f, 6, 6, 2.5, acc, 10, 6);
    }
    K.ellip(L(0, hy - 3, 15.8), r, K.Y, f, 3.8, 4.8, 2.6, dark, 12, 8);
    muzzle = false;
  } else if (sp === 'hamster') {
    roundEars(4.2, pink, 11, 13);
    noseCol = pink;
    for (const sx of [-1, 1]) K.ellip(L(sx * 10, hy - 6, 10), r, K.Y, f, 6, 5, 5, muz, 12, 8);
  } else if (sp === 'frog') {
    for (const sx of [-1, 1]) {
      K.sph(L(sx * 7.5, hy + 11, 5), 6.2, fur, 14, 10);
      K.sph(L(sx * 7.5, hy + 11.5, 8.8), 4.4, pc('#ffffff'), 12, 8);
      K.sph(L(sx * 7.5, hy + 11.8, 12.2), 2.6, dark, 10, 7);
      K.sph(L(sx * 7.5 - 0.9, hy + 13, 14.4), 0.8, col('#ffffff', 2), 6, 4);
    }
    eyeStyle = 'none';
    muzzle = false;
  } else if (sp === 'penguin') {
    K.ellip(L(0, hy - 3, 8.5), r, K.Y, f, 13, 11, 9.5, muz, 16, 10);
    K.cone(L(0, hy - 4, 17), L(0, hy - 5.5, 23), 2.8, pc('#f0a030'), 10);
    eyeZ = 16.5;
    muzzle = false;
  } else if (sp === 'dog') {
    for (const sx of [-1, 1]) K.ellip(L(sx * 16.5, hy, -1), r, K.Y, f, 4.6, 10.5, 7, acc, 12, 8);
  } else if (sp === 'raccoon') {
    pointEars(fur, pc('#2a2a30'));
    K.ellip(L(0, hy + 0.5, 12.6), r, K.Y, f, 14.5, 4.8, 4.6, acc, 16, 8);
    eyeStyle = 'ring';
  } else if (sp === 'elephant') {
    for (const sx of [-1, 1]) {
      K.ellip(L(sx * 18.5, hy + 1, -3), r, K.Y, f, 3.2, 13, 11.5, fur, 14, 10);
      K.ellip(L(sx * 19.6, hy + 1, -1.5), r, K.Y, f, 1.4, 9.5, 8, acc, 12, 8);
    }
    const tr = [[0, -1, 15], [0, -8, 19], [0, -15, 20.5], [0, -20, 23.5]] as const;
    for (let i = 0; i < 3; i++) K.tube(L(tr[i]![0], hy + tr[i]![1], tr[i]![2]), L(tr[i + 1]![0], hy + tr[i + 1]![1], tr[i + 1]![2]), 4.2 - i * 0.7, fur, 10, true);
    muzzle = false;
  } else if (sp === 'wolf') {
    pointEars(fur, acc);
  } else if (sp === 'beaver') {
    roundEars(3.8, acc, 12.5, 11);
  } else if (sp === 'sheep') {
    for (let i = 0; i < 11; i++) {
      const t = (i / 11) * Math.PI * 2;
      K.sph(L(Math.cos(t) * 13, hy + 10 + Math.sin(t) * 3.5, -2 + Math.sin(t) * 9), 6.5, acc, 10, 7);
    }
    K.sph(L(0, hy + 15, 1), 7, acc, 10, 7);
    for (const sx of [-1, 1]) K.ellip(L(sx * 18, hy + 3, 0), r, K.Y, f, 7, 3.4, 4.4, pc('#6a5a52'), 10, 6);
    noseCol = pink;
  } else if (sp === 'monkey') {
    for (const sx of [-1, 1]) {
      K.sph(L(sx * 17.5, hy + 1, -1), 5.6, fur, 12, 8);
      K.sph(L(sx * 18.2, hy + 1, 0.5), 3.6, muz, 10, 6);
    }
    K.ellip(L(0, hy - 1, 10.4), r, K.Y, f, 12.5, 11, 7, muz, 16, 10);
    eyeZ = 16;
  }
  // muzzle, nose, mouth
  if (muzzle) {
    K.ellip(L(0, hy - 6, 12.5), r, K.Y, f, sp === 'lion' ? 9.5 : 8.5, 6, 5, muz, 14, 8);
    K.ellip(L(0, hy - 3.4, 17.2), r, K.Y, f, 2.7, 1.9, 1.6, noseCol, 10, 6);
  }
  if (sp === 'beaver') {
    K.box(L(-1.3, hy - 8.4, 17), r, K.Y, f, 1.2, 1.8, 0.6, pc('#ffffff'));
    K.box(L(1.3, hy - 8.4, 17), r, K.Y, f, 1.2, 1.8, 0.6, pc('#ffffff'));
  }
  const mouth = pc('#6a2a2e');
  const mz = muzzle ? 17.2 : sp === 'frog' ? 15.6 : 16.6, my = muzzle ? hy - 8.6 : sp === 'frog' ? hy - 4 : hy - 8;
  const mw = sp === 'frog' ? 9 : 3.4;
  if (s === 'bicara' || s === 'idle') {
    K.ellip(L(0, my - 0.6, mz - 0.6), r, K.Y, f, s === 'idle' ? 3.6 : 2.8, 2.6, 1.5, pc('#c2455a'), 10, 6);
  } else if (worried) {
    K.ellip(L(0, my - 0.4, mz - 0.5), r, K.Y, f, 1.7, 1.7, 1.1, mouth, 8, 6);
  } else {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = -1 + i / 3;
      pts.push(L(mw * t, my + 1.5 * t * t, mz - 1.0 * t * t * (sp === 'frog' ? 3 : 1)));
    }
    for (let i = 0; i < 6; i++) K.tube(pts[i]!, pts[i + 1]!, 0.7, mouth, 6, false);
  }
  if (sp === 'cat' || sp === 'fox') {
    for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) K.tube(L(sx * 6, hy - 5 + k * 1.6, 16.5), L(sx * 15, hy - 4.5 + k * 3, 15), 0.3, pc('#3a3036'), 4, false);
  }
  // eyes
  if (eyeStyle !== 'none') {
    for (const x of [-6.2, 6.2]) {
      if (s === 'tidur') {
        // Closed eyes: a small downward curve, no highlight.
        K.tube(L(x - 2.8, hy + 0.9, eyeZ + 1.2), L(x, hy - 0.2, eyeZ + 1.6), 0.6, dark, 6, true);
        K.tube(L(x, hy - 0.2, eyeZ + 1.6), L(x + 2.8, hy + 0.9, eyeZ + 1.2), 0.6, dark, 6, true);
        continue;
      }
      if (eyeStyle === 'ring') {
        K.ellip(L(x, hy + 0.3, eyeZ + 0.2), r, K.Y, f, 2.9, 3.3, 1.8, pc('#ffffff'), 10, 6);
        K.ellip(L(x, hy + 0.1, eyeZ + 1.6), r, K.Y, f, 2.0, 2.5, 1.2, dark, 10, 6);
      } else {
        K.ellip(L(x, hy + 0.5, eyeZ), r, K.Y, f, 2.9, 3.5, 2.0, dark, 10, 7);
      }
      K.sph(L(x - 0.9, hy + 1.8, eyeZ + 1.9), 0.9, col('#ffffff', 2), 6, 4);
      if (worried) {
        const t = x < 0 ? 0.4 : -0.4;
        K.box(L(x, hy + 6.3, eyeZ + 0.4), K.add(K.mul(r, Math.cos(t)), K.mul(K.Y, Math.sin(t))), K.sub(K.mul(K.Y, Math.cos(t)), K.mul(r, Math.sin(t))), f, 2.8, 0.7, 0.8, pc('#3a3036'));
      }
    }
  }
  if (sp !== 'frog') for (const x of [-11, 11]) K.ellip(L(x, hy - 5, 11.6), r, K.Y, f, 3.2, 2, 1.4, pink, 10, 6);
  if (worried) K.ellip(L(15.5, hy + 4, 8), r, K.Y, f, 1.8, 2.8, 1.8, col('#7cc7f0'), 8, 6);
  // accessories
  if (a.glasses) {
    for (const x of [-6.5, 6.5]) K.arc(L(x, hy + 0.5, eyeZ + 3), r, K.Y, 5, 0, Math.PI * 2, 0.6, pc('#1d1d22'), 16);
    K.tube(L(-1.5, hy + 1, eyeZ + 3.2), L(1.5, hy + 1, eyeZ + 3.2), 0.6, pc('#1d1d22'), 6, false);
  }
  if (a.phones) {
    K.arc(L(0, hy + 2, -1), r, K.Y, 19.5, 0, Math.PI, 1.8, pc('#2b2e35'), 16);
    for (const x of [-19.2, 19.2]) K.ellip(L(x, hy - 1, -1), r, K.Y, f, 3.6, 6.5, 6.5, pc(a.phones), 12, 8);
  }
  if (a.beret) {
    K.ellip(L(-3, hy + 14, -3), r, K.Y, f, 13, 4, 13, pc('#d64545'), 16, 8);
    K.sph(L(-3, hy + 18, -3), 1.6, pc('#d64545'), 6, 4);
  }
  if (a.cap) {
    K.ellip(L(0, hy + 10, -1), r, K.Y, f, 17.6, 8.5, 17.6, pc(a.cap), 18, 8);
    K.box(L(0, hy + 9, a.walker ? 19 : -19), r, K.Y, f, 9, 0.8, 6, pc(a.cap));
  }
}

function tail(K: Kit, L: Local, a: Look, pc: Paint, y0: number, standing: boolean): void {
  const fur = pc(a.skin), acc = pc(a.acc), muz = pc(a.muz), sp = a.animal;
  const pts: Vec3[] = standing
    ? [[0, y0, -11], [3, y0 - 8, -20], [8, y0 - 20, -24], [10, y0 - 32, -20]]
    : [[0, y0, -12], [14, y0 - 3, -16], [25, y0 - 11, -14], [29, y0 - 23, -9]];
  const P = (p: Vec3) => L(p[0], p[1], p[2]);
  const chain = (c0: RGBA, rr: number) => {
    for (let i = 0; i < pts.length - 1; i++) K.tube(P(pts[i]!), P(pts[i + 1]!), rr, c0, 8, true);
  };
  const end = pts[pts.length - 1]!, mid = pts[2]!;
  if (sp === 'cat' || sp === 'monkey') {
    chain(fur, 2.4);
    if (sp === 'monkey') K.arc(L(end[0], end[1] - 3, end[2]), K.X, K.Y, 3.5, 0, Math.PI * 1.6, 2.2, fur, 8);
  } else if (sp === 'lion') {
    chain(fur, 2.2);
    K.sph(P(end), 4.5, acc, 10, 7);
  } else if (sp === 'wolf') {
    K.ellip(P(mid), K.X, K.Y, K.Z, 6.5, 13, 6.5, fur, 12, 8);
    K.sph(L(end[0], end[1] + 2, end[2]), 4.6, muz, 10, 7);
  } else if (sp === 'beaver') {
    K.ellip(P(mid), K.X, K.Y, K.Z, 9, 14, 2.5, acc, 12, 8);
  } else if (sp === 'sheep') {
    K.sph(L(0, y0, standing ? -12 : -15), 6, acc, 10, 7);
  } else if (sp === 'elephant') {
    chain(fur, 1.4);
    K.sph(P(end), 2.6, pc('#4a4d55'), 8, 6);
  } else if (sp === 'fox') {
    K.ellip(P(mid), K.X, K.Y, K.Z, 7, 13, 7, fur, 12, 8);
    K.sph(L(end[0], end[1] + 2, end[2]), 5, muz, 10, 7);
  } else if (sp === 'raccoon') {
    for (let i = 0; i < pts.length - 1; i++) K.tube(P(pts[i]!), P(pts[i + 1]!), 4.6, i % 2 ? acc : fur, 10, true);
  } else if (sp === 'dog') {
    K.tube(P(pts[0]!), L(pts[1]![0], pts[1]![1] + 10, pts[1]![2]), 2.6, fur, 8, true);
  } else if (sp === 'rabbit' || sp === 'bear' || sp === 'panda' || sp === 'hamster') {
    K.sph(L(0, y0, standing ? -12 : -14), sp === 'rabbit' ? 5.5 : 3.5, sp === 'panda' ? acc : sp === 'rabbit' ? pc('#ffffff') : fur, 10, 7);
  }
}

export function sitBody(K: Kit, L: Local, r: Vec3, f: Vec3, a: Look, s: Face, pc: Paint, yo: number, hold: Hold): void {
  const shirt = pc(a.shirt), pants = pc(a.pants), skin = pc(a.skin), shoe = pc(a.shoe);
  K.ellip(L(0, 52 + yo, -3), r, K.Y, f, 16, 8, 13, pants, 14, 8);
  for (const x of [-8, 8]) {
    K.tube(L(x, 51 + yo, 0), L(x * 1.1, 50 + yo, 30), 8, pants, 10);
    K.tube(L(x * 1.1, 48 + yo, 31), L(x * 1.1, 8, 35), 6.5, pants, 10);
    K.ellip(L(x * 1.1, 5, 40), r, K.Y, f, 6.5, 5, 10, shoe, 10, 6);
  }
  K.ellip(L(0, 72 + yo, -3), r, K.Y, f, 17, 20, 13, shirt, 18, 10);
  if (a.hood) K.ellip(L(0, 91 + yo, -12), r, K.Y, f, 14, 8, 8, pc(mix(a.shirt, '#000000', 0.2)), 12, 8);
  if (a.tie) {
    K.box(L(0, 77 + yo, 10.4), r, K.Y, f, 2.4, 9, 0.8, pc('#c0392b'));
    K.sph(L(0, 86.5 + yo, 9.8), 2.3, pc('#c0392b'), 8, 6);
    K.box(L(0, 89.5 + yo, 7.8), r, K.Y, f, 6, 1.8, 2, pc('#f2f0ea'));
  }
  for (const sx of [-1, 1]) {
    K.tube(L(sx * 17, 86 + yo, -3), L(sx * 20, 71 + yo, 8), 5.5, shirt, 10);
    if (hold === 'pad') {
      K.tube(L(sx * 20, 71 + yo, 8), L(sx * 8, 70 + yo, 24), 5, shirt, 10);
      K.sph(L(sx * 7, 70 + yo, 27), 5.3, skin, 12, 8);
    } else {
      K.tube(L(sx * 20, 71 + yo, 8), L(sx * 14, 77 + yo, 28), 5, shirt, 10);
      K.sph(L(sx * 13, 77.5 + yo, 32), 5.3, skin, 12, 8);
    }
  }
  if (hold === 'pad') {
    K.box(L(0, 71 + yo, 28), r, K.Y, f, 9, 2, 4, pc('#2a2d33'));
    K.sph(L(-5, 73.5 + yo, 28), 1.4, pc('#ef6a3c'), 6, 4);
    K.sph(L(5, 73.5 + yo, 28), 1.4, pc('#35b87a'), 6, 4);
  }
  if (hold === 'cup') {
    const c = L(13, 0, 34);
    K.cyl(c[0], 79 + yo, c[2], 4, 4, 4.5, 4.5, 9, pc('#f2f0ea'), 14);
  }
  tail(K, L, a, pc, 52 + yo, false);
  animalHead(K, L, r, f, 110 + yo, a, s, pc);
}

export function standBody(K: Kit, L: Local, r: Vec3, f: Vec3, a: Look, s: Face, pc: Paint, hold: Hold): void {
  const shirt = pc(a.shirt), pants = pc(a.pants), skin = pc(a.skin), shoe = pc(a.shoe);
  K.ellip(L(0, 62, -1), r, K.Y, f, 15, 8, 11, pants, 14, 8);
  for (const x of [-8, 8]) {
    K.tube(L(x, 60, 0), L(x, 9, 1), 7, pants, 10);
    K.ellip(L(x, 5, 5), r, K.Y, f, 6.5, 5, 10, shoe, 10, 6);
  }
  K.ellip(L(0, 82, -1), r, K.Y, f, 17, 21, 12, shirt, 18, 10);
  if (a.hood) K.ellip(L(0, 101, -11), r, K.Y, f, 14, 8, 8, pc(mix(a.shirt, '#000000', 0.2)), 12, 8);
  if (a.tie) {
    K.box(L(0, 87, 10.8), r, K.Y, f, 2.4, 9, 0.8, pc('#c0392b'));
    K.sph(L(0, 96.5, 10), 2.3, pc('#c0392b'), 8, 6);
  }
  const arm = (sx: number, el: Vec3, hd: Vec3) => {
    K.tube(L(sx * 17, 96, -1), el, 5.5, shirt, 10);
    K.tube(el, hd, 5, shirt, 10);
    K.sph(hd, 5.3, skin, 12, 8);
  };
  if (hold === 'paddle') {
    arm(-1, L(-20, 80, 4), L(-21, 70, 6));
    arm(1, L(24, 84, 14), L(22, 92, 30));
    K.tube(L(22, 92, 32), L(22, 96, 36), 1.4, pc('#6b4429'), 6, false);
    K.ellip(L(22, 103, 38), r, K.Y, f, 8, 9, 1.2, pc('#d94040'), 14, 4);
  } else if (hold === 'rod') {
    for (const sx of [-1, 1]) arm(sx, L(sx * 20, 84, 12), L(sx * 22, 80, 30));
  } else if (hold === 'joy') {
    for (const sx of [-1, 1]) arm(sx, L(sx * 19, 88, 14), L(sx * 10, 99, 30));
  } else {
    for (const sx of [-1, 1]) arm(sx, L(sx * 20, 80, 4), L(sx * 21, 70, 6));
  }
  tail(K, L, a, pc, 62, true);
  animalHead(K, L, r, f, 118, a, s, pc);
}

/** Mattress top plus half the body depth: the back rests on the mattress. */
const SLEEP_LIFT = 61;

/**
 * Asleep on its back under a blanket, in bed-local space: feet at the origin,
 * head toward -z, front facing up. The standing body is built first and then
 * laid down (rotated -90° about x) so the character matches its desk look.
 */
export function sleepBody(K: Kit, a: Look, pc: Paint, M: Mat4): void {
  const G: Groups = { b: [] };
  const B = new Kit(G);
  standBody(B, (x, y, z) => [x, y, z], B.X, B.Z, a, 'tidur', pc, 'desk');
  // Blanket, in standing coordinates: covers feet to chest, thick enough to hide the arms.
  B.ab(0, -7, 3.5, 56, 104, 27, pc(mix(a.shirt, '#ffffff', 0.3)), { pz: pc(mix(a.shirt, '#ffffff', 0.45)) });
  B.ab(0, 90, 3.5, 57, 8, 28, pc('#f2f0ea'));
  K.append(G.b!, m4(M, m4(T(0, SLEEP_LIFT, 0), Rx(-Math.PI / 2))));
}

/**
 * Chair, workstation, and (unless away) the seated character at a desk seat.
 * `away` leaves the chair empty and the screen off.
 */
export function seated(K: Kit, a: Look, seat: SeatXYZ, monitors: 0 | 1 | 2, s: Status, pc: Paint, dim: boolean, away: boolean, screen: string): void {
  const yaw = seat[2], f: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)], r: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const L: Local = (lx, ly, lz) => seatPoint(seat, lx, ly, lz);
  K.use('ppl');
  const ch = pc('#2b2e35'), metal = pc('#6b707b');
  K.box(L(0, 44, -2), r, K.Y, f, 24, 3.5, 23, ch);
  K.box(L(0, 82, -27), r, K.Y, f, 22, 24, 2.6, ch);
  K.box(L(0, 54, -26), r, K.Y, f, 3, 8, 2, metal);
  K.tube(L(0, 7, -2), L(0, 41, -2), 2.4, metal, 10, false);
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * 6.283 + 0.3;
    const e = L(Math.cos(t) * 28, 3, -2 + Math.sin(t) * 28);
    K.tube(L(0, 6, -2), e, 2, ch, 8, false);
    K.sph(e, 2.8, ch, 8, 5);
  }
  for (const x of [-25, 25]) {
    K.box(L(x, 62, -2), r, K.Y, f, 2.6, 1.6, 12, ch);
    K.tube(L(x, 46, -8), L(x, 61, -8), 1.6, metal, 8, false);
  }
  if (!away) sitBody(K, L, r, f, a, s, pc, 0, 'desk');
  const scr = away ? pc('#2a2f3a') : pc(screen, dim ? 1 : 2);
  if (!monitors) {
    // laptop
    K.box(L(0, 76.2, 50), r, K.Y, f, 16, 0.8, 11, pc('#c3c7cf'), { py: pc('#9aa0aa') });
    const tilt = 0.26, U2 = K.add(K.mul(K.Y, Math.cos(tilt)), K.mul(f, Math.sin(tilt))), F2 = K.sub(K.mul(f, Math.cos(tilt)), K.mul(K.Y, Math.sin(tilt)));
    K.box(K.add(L(0, 77, 61), K.mul(U2, 11)), r, U2, F2, 16, 11, 0.6, pc('#c3c7cf'), { nz: scr });
    const cp = L(27, 0, 40);
    K.cyl(cp[0], 75.5, cp[2], 4, 4, 4.5, 4.5, 9, pc('#f2f0ea'), 14);
  } else {
    for (const mx of monitors === 2 ? [-29, 29] : [0]) {
      K.tube(L(mx, 75.5, 72), L(mx, 92, 72), 2, pc('#3a3f49'), 8, false);
      K.box(L(mx, 76, 72), r, K.Y, f, 9, 0.8, 7, pc('#3a3f49'));
      K.box(L(mx, 106, 71), r, K.Y, f, 28, 16, 1.4, pc('#1b1e24'), { nz: scr });
    }
    K.box(L(0, 76, 46), r, K.Y, f, 20, 0.8, 6.5, pc('#2a2d33'));
  }
  if (!away) {
    const c0 = L(0, 0, -2);
    K.use('pplT');
    K.disc(c0[0], 1.4, c0[2], 40, 40, col('#000000', 0.3), col('#000000', 0), 32);
  }
}

/** Office boy, split into groups so legs, arms, and mop can be animated. */
export function walker(K: Kit, a: Look, s: Status, pc: Paint): void {
  const r = K.X, f = K.Z, L: Local = (x, y, z) => [x, y, z];
  const shirt = pc(a.shirt), pants = pc(a.pants), skin = pc(a.skin), shoe = pc(a.shoe);
  K.use('obBody');
  K.ellip(L(0, 62, -1), r, K.Y, f, 15, 8, 11, pants, 14, 8);
  K.ellip(L(0, 82, -1), r, K.Y, f, 17, 21, 12, shirt, 18, 10);
  K.ellip(L(-12, 100, 0), r, K.Y, f, 6, 3, 13, pc('#f2f0ea'), 10, 6);
  K.box(L(7, 89, 10.6), r, K.Y, f, 3.2, 1.8, 0.4, pc('#ffffff'));
  tail(K, L, a, pc, 62, true);
  animalHead(K, L, r, f, 118, a, s, pc);
  for (const [g, x] of [['obLegL', -8], ['obLegR', 8]] as const) {
    K.use(g);
    K.tube(L(x, 60, 0), L(x, 9, 1), 7, pants, 10);
    K.ellip(L(x, 5, 5), r, K.Y, f, 6.5, 5, 10, shoe, 10, 6);
  }
  K.use('obArmL');
  K.tube(L(-17, 96, -1), L(-21, 74, 2), 5.5, shirt, 10);
  K.sph(L(-21, 69, 3), 5.3, skin, 12, 8);
  K.use('obArmR');
  K.tube(L(17, 96, -1), L(21, 80, 8), 5.5, shirt, 10);
  K.tube(L(21, 80, 8), L(18, 74, 20), 5, shirt, 10);
  K.sph(L(18, 74, 22), 5.3, skin, 12, 8);
  K.use('obMop');
  K.tube(L(19, 98, 20), L(24, 6, 52), 1.6, pc('#c9a36a'), 8, true);
  K.box(L(24, 4, 54), r, K.Y, f, 14, 2, 4, pc('#3a6fb0'));
  K.ellip(L(24, 2.5, 54), r, K.Y, f, 16, 2.5, 7, pc('#e8e4d8'), 14, 6);
}
