import { OrbitCamera, project } from './camera.js';
import type { Groups } from './kit.js';
import { OB_PATH, ROOM_ANCHORS, VIEWS, type PlaySpot, type Pod } from './layout.js';
import { m4, Rx, Ry, T, type Mat4 } from './math.js';
import { agentAnchors, assignSpots, buildRings, PeopleBuilder, type Anchors, type SceneAgent } from './people.js';
import { buildStatic } from './staticScene.js';

// WebGL renderer for the office, ported from the mockup (initGL, upload,
// drawGroup, loop, draw, updateOB, placeLabels, pickAt).

const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec4 aC;uniform mat4 uVP;uniform mat4 uM;
varying vec3 vN;varying vec4 vC;varying float vY;
void main(){vec4 wp=uM*vec4(aP,1.0);vN=(uM*vec4(aN,0.0)).xyz;vC=aC;vY=wp.y;gl_Position=uVP*wp;}`;

const FS = `precision mediump float;varying vec3 vN;varying vec4 vC;varying float vY;
void main(){
if(vC.a>1.5){gl_FragColor=vec4(vC.rgb,1.0);return;}
vec3 N=normalize(vN);
vec3 L1=normalize(vec3(0.45,0.85,0.35));vec3 L2=normalize(vec3(-0.6,0.45,-0.5));
float d1=max(dot(N,L1),0.0);float d2=max(dot(N,L2),0.0);float hemi=0.5+0.5*N.y;
float ao=mix(0.82,1.0,clamp(vY/60.0,0.0,1.0));
vec3 col=vC.rgb*(0.30+0.24*hemi+0.48*d1+0.16*d2)*ao;
gl_FragColor=vec4(col,vC.a);}`;

const I4 = new Float32Array(T(0, 0, 0));
const OB_PARTS = ['obBody', 'obLegL', 'obLegR', 'obArmL', 'obArmR', 'obMop'] as const;

export interface RendererOptions {
  reduceMotion?: boolean;
  /** Called when the office boy starts or finishes a cleaning stop. */
  onCleanerAction?: (text: string) => void;
}

interface ObState {
  i: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  wait: number;
  mopT: number;
}

export class OfficeRenderer {
  readonly camera: OrbitCamera;
  /** Rotate the camera slowly; ignored when motion is reduced. */
  auto = false;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: { p: number; n: number; c: number; vp: WebGLUniformLocation; m: WebGLUniformLocation };
  private bufs: Record<string, WebGLBuffer> = {};
  private counts: Record<string, number> = {};
  private anchors: Anchors = { ...ROOM_ANCHORS };
  private labelRoot: HTMLElement | null = null;
  private agents: SceneAgent[] = [];
  private spots = new Map<string, PlaySpot>();
  private selected: string | null = null;
  private people = new PeopleBuilder();
  private needPeople = false;
  private needRings = false;
  private dirty = true;
  private raf = 0;
  private last = 0;
  private VP: number[] = [];
  private vw = 0;
  private vh = 0;
  private ob: ObState | null = null;
  private obM: Record<string, Mat4> | null = null;
  private readonly reduce: boolean;

  /** Throws when WebGL is unavailable; callers show a fallback message. */
  constructor(private readonly canvas: HTMLCanvasElement, pods: Pod[], private readonly opts: RendererOptions = {}) {
    this.reduce = !!opts.reduceMotion;
    this.camera = new OrbitCamera(VIEWS.kantor, this.reduce);
    const gl = (canvas.getContext('webgl', { antialias: true, alpha: false }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL tidak tersedia');
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Shader WebGL gagal');
    this.gl = gl;
    this.prog = prog;
    this.loc = {
      p: gl.getAttribLocation(prog, 'aP'),
      n: gl.getAttribLocation(prog, 'aN'),
      c: gl.getAttribLocation(prog, 'aC'),
      vp: gl.getUniformLocation(prog, 'uVP')!,
      m: gl.getUniformLocation(prog, 'uM')!,
    };
    gl.enableVertexAttribArray(this.loc.p);
    gl.enableVertexAttribArray(this.loc.n);
    gl.enableVertexAttribArray(this.loc.c);
    this.upload(buildStatic(pods));
    for (const p of pods) this.anchors['d:' + p.id] = p.id === 'qa' ? [p.x, 262, p.z - 110] : [p.x, 205, p.z];
    this.loop = this.loop.bind(this);
  }

  start(labelRoot: HTMLElement): void {
    this.labelRoot = labelRoot;
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    for (const b of Object.values(this.bufs)) gl.deleteBuffer(b);
    this.bufs = {};
    // Keep the context alive: React may mount a new renderer on the same canvas.
  }

  /** Replace the scene's agents. Unchanged agents reuse cached geometry. */
  setAgents(agents: SceneAgent[]): void {
    this.agents = agents;
    this.spots = assignSpots(agents);
    agentAnchors(agents, this.spots, this.anchors);
    this.needPeople = true;
    this.needRings = true;
  }

  /** Selection only rebuilds the floor rings. */
  setSelected(id: string | null): void {
    if (id === this.selected) return;
    this.selected = id;
    this.needRings = true;
  }

  spotOf(id: string): PlaySpot | undefined {
    return this.spots.get(id);
  }

  anchor(key: string): readonly number[] | undefined {
    return this.anchors[key];
  }

  /** Request a redraw (e.g. after label DOM changed). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Nearest agent to a canvas point within 70 px, or null. */
  pickAt(px: number, py: number): string | null {
    let best: string | null = null, bd = 70;
    for (const a of this.agents) {
      const p = this.anchors['h:' + a.id];
      if (!p) continue;
      const s = project(this.VP, p, this.vw, this.vh);
      if (!s) continue;
      const d = Math.hypot(s[0] - px, s[1] - py);
      if (d < bd) {
        bd = d;
        best = a.id;
      }
    }
    return best;
  }

  private upload(G: Groups | Record<string, Float32Array>, clearPrefix?: string): void {
    const gl = this.gl;
    if (clearPrefix) for (const k of Object.keys(this.counts)) if (k.startsWith(clearPrefix) && !G[k]) this.counts[k] = 0;
    for (const [k, data] of Object.entries(G)) {
      const arr = data instanceof Float32Array ? data : new Float32Array(data);
      if (!this.bufs[k]) this.bufs[k] = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k]!);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      this.counts[k] = arr.length / 10;
    }
  }

  private drawGroup(k: string): void {
    const gl = this.gl, n = this.counts[k];
    if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k]!);
    gl.vertexAttribPointer(this.loc.p, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(this.loc.n, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(this.loc.c, 4, gl.FLOAT, false, 40, 24);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }

  private loop(): void {
    this.raf = requestAnimationFrame(this.loop);
    const cv = this.canvas, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== Hh) {
      cv.width = W;
      cv.height = Hh;
      this.dirty = true;
    }
    if (this.auto && !this.reduce) this.camera.rotate(0.0025);
    let moving = this.camera.step();
    if (this.needPeople) {
      this.upload(this.people.build(this.agents, this.spots), 'i_');
      this.needPeople = false;
      this.dirty = true;
    }
    if (this.needRings) {
      this.upload(buildRings(this.agents, this.spots, this.selected));
      this.needRings = false;
      this.dirty = true;
    }
    const now = performance.now(), dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (this.updateOB(dt)) moving = true;
    if (this.spots.size && !this.reduce) moving = true; // playing animations
    if (!moving && !this.dirty) return;
    this.dirty = false;
    this.draw(w, h);
  }

  private hasWalker(): boolean {
    return this.agents.some((a) => a.walker);
  }

  /** Office boy walk along OB_PATH with mopping stops. Returns true if it moved. */
  private updateOB(dt: number): boolean {
    if (!this.hasWalker()) {
      this.obM = null;
      return false;
    }
    const P = OB_PATH;
    if (!this.ob) {
      this.ob = { i: 1, x: P[0]!.x, z: P[0]!.z, yaw: Math.PI, phase: 0, wait: 0, mopT: 0 };
      if (this.reduce) {
        const st = P[7]!;
        this.ob.x = st.x;
        this.ob.z = st.z;
        this.ob.wait = 1;
        this.opts.onCleanerAction?.('Membersihkan ' + st.stop![0]);
      }
    } else if (this.reduce && this.obM) {
      return false;
    }
    const o = this.ob;
    let walking = false;
    if (!this.reduce) {
      if (o.wait > 0) {
        o.wait -= dt;
        o.mopT += dt;
        if (o.wait <= 0) {
          this.opts.onCleanerAction?.('Berkeliling mencari cache…');
          o.i = (o.i + 1) % P.length;
        }
      } else {
        const t = P[o.i]!, dx = t.x - o.x, dz = t.z - o.z, d = Math.hypot(dx, dz);
        if (d < 1.5) {
          if (t.stop) {
            o.wait = 4.5;
            o.mopT = 0;
            this.opts.onCleanerAction?.('Membersihkan ' + t.stop[0]);
          } else {
            o.i = (o.i + 1) % P.length;
          }
        } else {
          const step = Math.min(78 * dt, d);
          o.x += (dx / d) * step;
          o.z += (dz / d) * step;
          o.phase += step * 0.085;
          walking = true;
          let dy = Math.atan2(dx, dz) - o.yaw;
          while (dy > Math.PI) dy -= 2 * Math.PI;
          while (dy < -Math.PI) dy += 2 * Math.PI;
          o.yaw += dy * Math.min(1, dt * 8);
        }
      }
    }
    const sw = walking ? Math.sin(o.phase) : 0, bob = walking ? Math.abs(Math.cos(o.phase)) * 1.8 : 0;
    const base = m4(T(o.x, bob, o.z), Ry(o.yaw));
    const piv = (px: number, py: number, pz: number, R: Mat4) => m4(base, m4(T(px, py, pz), m4(R, T(-px, -py, -pz))));
    const mop = o.wait > 0 ? Math.sin(o.mopT * 6) * 0.5 : 0;
    this.obM = {
      obBody: base,
      obLegL: piv(-8, 60, 0, Rx(sw * 0.5)),
      obLegR: piv(8, 60, 0, Rx(-sw * 0.5)),
      obArmL: piv(-17, 96, -1, Rx(-sw * 0.6)),
      obArmR: piv(17, 96, -1, Rx(mop * 0.2)),
      obMop: piv(18, 74, 22, Ry(mop)),
      T: T(o.x, 0, o.z),
    };
    const walker = this.agents.find((a) => a.walker);
    if (walker) {
      this.anchors['p:' + walker.id] = [o.x, 172, o.z];
      this.anchors['h:' + walker.id] = [o.x, 100, o.z];
    }
    return true;
  }

  private draw(w: number, h: number): void {
    const gl = this.gl;
    const eye = this.camera.eye();
    const M = this.camera.viewProj(w / h);
    this.VP = M;
    this.vw = w;
    this.vh = h;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.102, 0.118, 0.153, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.vp, false, new Float32Array(M));
    gl.uniformMatrix4fv(this.loc.m, false, I4);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.drawGroup('main');
    this.drawGroup('ppl');
    this.drawGroup('rings');
    // Hide walls between the camera and the room.
    if (eye[2] > -840) this.drawGroup('back');
    if (eye[0] > -1050) this.drawGroup('left');
    if (eye[0] < 1050) this.drawGroup('right');
    if (this.obM) {
      for (const k of OB_PARTS) {
        gl.uniformMatrix4fv(this.loc.m, false, new Float32Array(this.obM[k]!));
        this.drawGroup(k);
      }
      gl.uniformMatrix4fv(this.loc.m, false, I4);
    }
    if (this.spots.size) {
      const t = performance.now() / 1000;
      const anim: Record<string, (ph: number) => [number, number]> = {
        paddle: (ph) => [0, Math.sin(t * 4.4 + ph) * 0.22],
        rod: (ph) => [0, Math.sin(t * 7 + ph) * 0.14],
        joy: (ph) => [Math.abs(Math.sin(t * 8 + ph)) * 1.4, 0],
        pad: (ph) => [Math.abs(Math.sin(t * 3 + ph)) * 0.8, Math.sin(t * 2 + ph) * 0.05],
        cup: () => [0, 0],
      };
      let i = 0;
      for (const [id, sp] of this.spots) {
        const an = this.reduce ? [0, 0] : (anim[sp.hold] ?? anim.cup!)(i * 1.7);
        gl.uniformMatrix4fv(this.loc.m, false, new Float32Array(m4(T(sp.x, an[0]!, sp.z), Ry(sp.yaw + an[1]!))));
        this.drawGroup('i_' + id);
        i++;
      }
      if (this.counts.ball) {
        const u = this.reduce ? 0.3 : Math.sin(t * 2.2);
        const bounce = this.reduce ? 0 : Math.abs(Math.cos(t * 4.4)) * 26;
        const drift = this.reduce ? 0 : Math.sin(t * 1.3) * 30;
        gl.uniformMatrix4fv(this.loc.m, false, new Float32Array(T(500 + u * 150, 80 + bounce, 1150 + drift)));
        this.drawGroup('ball');
      }
      gl.uniformMatrix4fv(this.loc.m, false, I4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawGroup('pplT');
    if (this.obM) {
      gl.uniformMatrix4fv(this.loc.m, false, new Float32Array(this.obM.T!));
      this.drawGroup('obT');
      gl.uniformMatrix4fv(this.loc.m, false, I4);
    }
    this.drawGroup('trans');
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.placeLabels();
  }

  /** Position every `[data-k3d]` element over its 3D anchor. */
  private placeLabels(): void {
    const root = this.labelRoot;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-k3d]').forEach((el) => {
      const a = this.anchors[el.dataset.k3d!];
      const s = a ? project(this.VP, a, this.vw, this.vh) : null;
      if (!s || s[0] < -60 || s[1] < -10 || s[0] > this.vw + 60 || s[1] > this.vh + 60) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      // Nearer labels stack on top of farther ones.
      el.style.zIndex = String(Math.max(1, Math.round(20000 - s[2])));
      el.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px) translate(-50%,-100%)`;
    });
  }
}
