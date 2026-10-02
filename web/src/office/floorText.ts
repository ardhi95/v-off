import { project } from './camera.js';
import type { Pod } from './layout.js';

// Team names painted on the floor at the front edge of each team rug. Drawn in
// the WebGL scene (not as DOM overlays) so desks and characters occlude them and
// they never cover name tags. They fade out when too small to read.

const VS = `attribute vec3 aP;attribute vec2 aT;uniform mat4 uVP;varying vec2 vT;
void main(){vT=aT;gl_Position=uVP*vec4(aP,1.0);}`;
const FS = `precision mediump float;varying vec2 vT;uniform sampler2D uTex;uniform float uA;
void main(){vec4 c=texture2D(uTex,vT);gl_FragColor=vec4(c.rgb,c.a*uA);}`;

/** Letter height on the floor, cm. */
const TEXT_CM = 26;
/** Floor height just above the rug (rug top is 0.8). */
const Y = 1.2;
/** Opacity at full size: a floor marking, not a sign. */
const MAX_ALPHA = 0.6;
/** Fade between these projected letter heights, CSS px. */
const FADE_FROM = 6;
const FADE_TO = 10;
const FONT_PX = 64;

interface Decal {
  tex: WebGLTexture;
  buf: WebGLBuffer;
  /** Two floor points one letter-height apart (front-to-back), for the size test. */
  probe: [number[], number[]];
}

export class FloorText {
  private prog: WebGLProgram;
  private loc: { p: number; t: number; vp: WebGLUniformLocation; tex: WebGLUniformLocation; a: WebGLUniformLocation };
  private decals: Decal[] = [];

  constructor(private readonly gl: WebGLRenderingContext, private readonly pods: Pod[]) {
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
    this.prog = prog;
    this.loc = {
      p: gl.getAttribLocation(prog, 'aP'),
      t: gl.getAttribLocation(prog, 'aT'),
      vp: gl.getUniformLocation(prog, 'uVP')!,
      tex: gl.getUniformLocation(prog, 'uTex')!,
      a: gl.getUniformLocation(prog, 'uA')!,
    };
    this.build();
    // Repaint once the web font is ready so letters match the rest of the UI.
    document.fonts?.ready.then(() => this.build()).catch(() => {});
  }

  private build(): void {
    this.clear();
    const gl = this.gl;
    for (const p of this.pods) {
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      if (!ctx) continue;
      const text = p.label.toUpperCase();
      const font = `800 ${FONT_PX}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.font = font;
      ctx.letterSpacing = '8px';
      const pad = 8;
      const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
      const h = Math.ceil(FONT_PX * 1.3);
      cv.width = w;
      cv.height = h;
      ctx.font = font;
      ctx.letterSpacing = '8px';
      ctx.fillStyle = p.c;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 2);

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Quad lying on the floor, reading left-to-right from the default (+Z) view.
      const qh = (TEXT_CM * h) / FONT_PX, qw = (qh * w) / h;
      const cx = p.x, cz = p.z + p.d / 2 + 100;
      const x0 = cx - qw / 2, x1 = cx + qw / 2, z0 = cz - qh / 2, z1 = cz + qh / 2;
      const v = new Float32Array([
        x0, Y, z0, 0, 0, x1, Y, z0, 1, 0, x1, Y, z1, 1, 1,
        x0, Y, z0, 0, 0, x1, Y, z1, 1, 1, x0, Y, z1, 0, 1,
      ]);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      this.decals.push({ tex, buf, probe: [[cx, Y, cz - TEXT_CM / 2], [cx, Y, cz + TEXT_CM / 2]] });
    }
  }

  /**
   * Draw with depth test on (occluded by furniture) and depth writes off.
   * `restore` re-binds the main program's attributes afterwards.
   */
  draw(VP: number[], vw: number, vh: number, restore: () => void): void {
    if (!this.decals.length) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.vp, false, new Float32Array(VP));
    gl.uniform1i(this.loc.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.enableVertexAttribArray(this.loc.t);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    for (const d of this.decals) {
      const a = project(VP, d.probe[0], vw, vh), b = project(VP, d.probe[1], vw, vh);
      if (!a || !b) continue;
      const px = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const alpha = MAX_ALPHA * Math.min(1, Math.max(0, (px - FADE_FROM) / (FADE_TO - FADE_FROM)));
      if (alpha <= 0.01) continue;
      gl.uniform1f(this.loc.a, alpha);
      gl.bindTexture(gl.TEXTURE_2D, d.tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, d.buf);
      gl.vertexAttribPointer(this.loc.p, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(this.loc.t, 2, gl.FLOAT, false, 20, 12);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(this.loc.t);
    restore();
  }

  private clear(): void {
    for (const d of this.decals) {
      this.gl.deleteTexture(d.tex);
      this.gl.deleteBuffer(d.buf);
    }
    this.decals = [];
  }

  destroy(): void {
    this.clear();
  }
}
