import { inkOn } from './present.js';
import type { Postcard } from './reportModel.js';

/** Draw the end-of-day postcard on a canvas (2x for sharp PNGs). Mirrors the on-page card. */
export function drawPostcard(pc: Postcard, heading: string, scale = 2): HTMLCanvasElement {
  const W = 760, LEFT = 300, H = Math.max(220, 40 + Math.ceil(pc.people.length / 5) * 48 + 20);
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const g = cv.getContext('2d')!;
  g.scale(scale, scale);
  const font = (w: number, px: number) => `${w} ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;

  g.fillStyle = '#1d2431';
  g.fillRect(0, 0, LEFT, H);
  g.fillStyle = '#f4efe2';
  g.fillRect(LEFT, 0, W - LEFT, H);

  // Avatars: 5 per row, centred in the left panel.
  const per = 5, size = 40, gap = 8;
  const rows = Math.ceil(pc.people.length / per);
  const y0 = (H - (rows * size + (rows - 1) * gap)) / 2;
  pc.people.forEach((p, i) => {
    const row = Math.floor(i / per), col = i % per;
    const inRow = Math.min(per, pc.people.length - row * per);
    const x0 = (LEFT - (inRow * size + (inRow - 1) * gap)) / 2;
    const cx = x0 + col * (size + gap) + size / 2, cy = y0 + row * (size + gap) + size / 2;
    g.beginPath();
    g.arc(cx, cy, size / 2 + 1, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2);
    g.fillStyle = p.color;
    g.fill();
    g.fillStyle = inkOn(p.color);
    g.font = font(800, 15);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.initial, cx, cy + 1);
  });

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const x = LEFT + 20;
  g.fillStyle = '#8a6420';
  g.font = font(700, 12);
  g.fillText(heading.toUpperCase(), x, 36);
  g.fillStyle = '#1b1e2b';
  g.font = font(800, 20);
  g.fillText(pc.date, x, 66);
  g.font = font(500, 15);
  [pc.line1, pc.line2, pc.line3].forEach((l, i) => g.fillText(l, x, 100 + i * 28, W - LEFT - 40));
  return cv;
}

export async function downloadPostcard(pc: Postcard, heading: string, filename: string): Promise<void> {
  await document.fonts?.ready;
  const cv = drawPostcard(pc, heading);
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  if (!blob) throw new Error('PNG gagal dibuat');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
