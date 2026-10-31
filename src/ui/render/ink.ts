// The pen work laid over the painted map (terrain.ts), drawn at full resolution in map units: the inked coastline
// and the waterlines that ripple out from it, hachures down every slope, woods, cypresses, olive groves and
// vineyards, marsh tufts, wave marks, the villages, a compass rose and the sheet's ruled frame. Everything is
// drawn in a few large batched paths, so tens of thousands of strokes stay quick.
import { MAP } from '../../engine/data';
import type { Bounds, Pt } from './geom';
import { center, rng } from './geom';
import { landAt, landSpot } from './coast';
import { forEachRowPoint } from './patches';
import { noiseTile, tileAt, type NoiseTile } from './noise';

/** The painter's fields, one value per map unit over `b` (W x H). */
export interface InkFields {
  b: Bounds;
  W: number;
  H: number;
  /** How much of the point is land, 0-1, as painted. */
  land: Float32Array;
  /** The coast field: land where above one half. */
  coast: Float32Array;
  /** The land field blurred wide: its contours below one half run out to sea parallel to the coast. */
  water: Float32Array;
  /** Relief, smoothed, and the light on it (-1 in full shadow, +1 facing the light). */
  height: Float32Array;
  shade: Float32Array;
  hill: Float32Array;
  mtn: Float32Array;
  marsh: Float32Array;
  woods: Float32Array;
  town: Float32Array;
  beach: Float32Array;
  /** How far offshore: 1 in open sea. */
  open: Float32Array;
  /** Where the painting is (it fades out raggedly a little beyond the map's edge). */
  paint: Float32Array;
  /** Field space (patches.ts) at a map point. */
  fieldAt: (x: number, y: number) => Pt;
}

type Ctx = CanvasRenderingContext2D;

const SEPIA = '74,52,34';
const PRUSSIAN = '34,68,102';

function at(f: InkFields, a: Float32Array, x: number, y: number): number {
  const ix = Math.round(x - f.b.x);
  const iy = Math.round(y - f.b.y);
  if (ix < 0 || iy < 0 || ix >= f.W || iy >= f.H) return 0;
  return a[iy * f.W + ix];
}

// ------------------------------------------------------------------ contours

/** Marching squares: the level-`t` contour of a W x H field, as segments [x1, y1, x2, y2, ...] in field pixels. */
export function contours(F: Float32Array, W: number, H: number, t: number): number[] {
  const out: number[] = [];
  const lerp = (a: number, c: number) => (t - a) / (c - a);
  for (let y = 0; y < H - 1; y++) {
    const r = y * W;
    for (let x = 0; x < W - 1; x++) {
      const a = F[r + x];
      const b = F[r + x + 1];
      const c = F[r + W + x + 1];
      const d = F[r + W + x];
      const k = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (k === 0 || k === 15) continue;
      // Crossing points on the cell's four edges.
      const top = (): [number, number] => [x + lerp(a, b), y];
      const right = (): [number, number] => [x + 1, y + lerp(b, c)];
      const bottom = (): [number, number] => [x + lerp(d, c), y + 1];
      const left = (): [number, number] => [x, y + lerp(a, d)];
      const seg = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
      switch (k) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(left(), top()); break;
        case 5: case 10: {
          const mid = (a + b + c + d) / 4 > t;
          if ((k === 5) === mid) {
            seg(left(), top());
            seg(bottom(), right());
          } else {
            seg(left(), bottom());
            seg(top(), right());
          }
          break;
        }
      }
    }
  }
  return out;
}

/** Strokes contour segments as one path (so a translucent line does not darken where segments meet), each point
 * nudged by a gentle wobble so the line looks drawn by hand. `keep` decides, per segment, whether to draw it. */
function strokeContour(ctx: Ctx, f: InkFields, segs: number[], wob: NoiseTile, amount: number, keep?: (x: number, y: number) => boolean) {
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    const x1 = segs[i] + f.b.x;
    const y1 = segs[i + 1] + f.b.y;
    const x2 = segs[i + 2] + f.b.x;
    const y2 = segs[i + 3] + f.b.y;
    if (keep && !keep((x1 + x2) / 2, (y1 + y2) / 2)) continue;
    ctx.moveTo(x1 + (tileAt(wob, x1 * 0.7, y1 * 0.7) - 0.5) * amount, y1 + (tileAt(wob, y1 * 0.7 + 300, x1 * 0.7) - 0.5) * amount);
    ctx.lineTo(x2 + (tileAt(wob, x2 * 0.7, y2 * 0.7) - 0.5) * amount, y2 + (tileAt(wob, y2 * 0.7 + 300, x2 * 0.7) - 0.5) * amount);
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ water

function drawWater(ctx: Ctx, f: InkFields, wob: NoiseTile) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const painted = (x: number, y: number) => at(f, f.paint, x, y) > 0.5;
  // Waterlines: the old engraver's ripples, fainter as they go out.
  const levels: [number, number][] = [[0.33, 0.5], [0.19, 0.36], [0.1, 0.24], [0.045, 0.14]];
  ctx.lineWidth = 0.42;
  for (const [lv, a] of levels) {
    ctx.strokeStyle = `rgba(${PRUSSIAN},${a})`;
    strokeContour(ctx, f, contours(f.water, f.W, f.H, lv), wob, 1.2, painted);
  }
  // The coastline: a firm line with a soft bleed beside it.
  const coast = contours(f.coast, f.W, f.H, 0.5);
  ctx.strokeStyle = `rgba(${PRUSSIAN},0.16)`;
  ctx.lineWidth = 2.4;
  strokeContour(ctx, f, coast, wob, 0.6, painted);
  ctx.strokeStyle = 'rgba(44,58,66,0.88)';
  ctx.lineWidth = 0.8;
  strokeContour(ctx, f, coast, wob, 0.6, painted);
}

function drawWaves(ctx: Ctx, f: InkFields) {
  const r = rng('waves');
  ctx.strokeStyle = `rgba(${PRUSSIAN},0.32)`;
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const step = 34;
  for (let y = f.b.y + step / 2; y < f.b.y + f.b.h; y += step) {
    for (let x = f.b.x + step / 2; x < f.b.x + f.b.w; x += step) {
      const px = x + (r() - 0.5) * step;
      const py = y + (r() - 0.5) * step;
      const keep = r();
      if (at(f, f.open, px, py) < 0.85 || at(f, f.paint, px, py) < 0.6 || keep > 0.42) continue;
      // A little crest or two, like a pen's flick.
      const n = r() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const cx = px + k * 6.5;
        const cy = py + k * 1.4;
        const w = 3 + r() * 1.6;
        ctx.moveTo(cx - w, cy + 0.6);
        ctx.quadraticCurveTo(cx - w * 0.4, cy - 1.5, cx, cy);
        ctx.quadraticCurveTo(cx + w * 0.4, cy - 1.5, cx + w, cy + 0.6);
      }
    }
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ relief

/** Hachures, in Lehmann's manner: each stroke starts on a contour of the relief and runs down the fall of the
 * slope to the next contour below, so the strokes stand in rows that follow the ground; heavier on the slopes
 * turned from the north-west light, and on the mountains more than the hills. */
function drawHachures(ctx: Ctx, f: InkFields) {
  const r = rng('hachures');
  const { W, H, b } = f;
  // Strokes are grouped into a few widths and strengths so each group is one path.
  const groups = new Map<number, number[]>();
  const add = (w: number, a: number, pts: number[]) => {
    const k = w * 100 + a;
    const g = groups.get(k);
    if (g) g.push(...pts);
    else groups.set(k, pts);
  };
  const DH = 0.032; // the contour interval, in the relief's own units
  const step = 1.9;
  for (let gy = 2; gy < H - 2; gy += step) {
    for (let gx = 2; gx < W - 2; gx += step) {
      const x = gx + (r() - 0.5) * step * 0.8;
      const y = gy + (r() - 0.5) * step * 0.8;
      const gate = r();
      const i = Math.round(y) * W + Math.round(x);
      if (f.land[i] < 0.95 || f.paint[i] < 0.4 || f.town[i] > 0.12 || f.marsh[i] > 0.4) continue;
      const m = f.mtn[i];
      const hl = f.hill[i];
      const weight = Math.max(m < 0.3 ? 0 : (m - 0.3) / 0.7, hl * 0.3);
      const dark = Math.max(0, -f.shade[i]);
      if (weight < 0.12 || gate > weight * (0.35 + 1.0 * Math.min(1, dark * 1.6))) continue;
      const hx = (f.height[i + 1] - f.height[i - 1]) * 0.5;
      const hy = (f.height[i + W] - f.height[i - W]) * 0.5;
      const mag = Math.hypot(hx, hy);
      if (mag < 0.003) continue;
      const dx = -hx / mag;
      const dy = -hy / mag;
      // Step up the slope to the contour just above, then draw down to the one below it.
      const h0 = f.height[i];
      const up = (Math.ceil(h0 / DH) * DH - h0) / mag;
      if (up > 3) continue;
      const len = Math.min(3.6, Math.max(0.7, DH / mag)) * (0.85 + 0.25 * r());
      const sx = x - dx * up + b.x;
      const sy = y - dy * up + b.y;
      const ex = sx + dx * len;
      const ey = sy + dy * len;
      const bend = (r() - 0.5) * len * 0.18;
      const cx = (sx + ex) / 2 - dy * bend;
      const cy = (sy + ey) / 2 + dx * bend;
      const steep = Math.min(1, mag / 0.02);
      const w = Math.round((0.14 + 0.16 * steep + 0.26 * dark) * 20);
      const a = Math.round(Math.min(0.85, (0.24 + 0.36 * steep + 0.3 * dark) * (0.55 + 0.45 * weight)) * 10);
      if (a <= 0) continue;
      add(w, a, [sx, sy, cx, cy, ex, ey]);
    }
  }
  ctx.lineCap = 'round';
  for (const [k, pts] of groups) {
    ctx.strokeStyle = `rgba(${SEPIA},${(k % 100) / 10})`;
    ctx.lineWidth = Math.floor(k / 100) / 20;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 6) {
      ctx.moveTo(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
    }
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ vegetation

interface Tree {
  x: number;
  y: number;
  r: number;
  tone: number;
}

/** A broadleaf tree painted once into a little canvas at the map's resolution: its shadow on the ground (the light
 * is from the north-west), a crown of a few overlapping lobes in a dark and a mid green, leaf dabs, a lit top, and a
 * broken pen line round its shadowed side. The woods are stamped from a couple of dozen of these. */
interface Sprite {
  canvas: HTMLCanvasElement;
  /** Where the tree's middle is in the sprite, and the sprite's size, in map units. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const TREE_TONES: [string, string, string][] = [
  ['rgb(58,80,44)', 'rgb(104,128,70)', 'rgba(184,194,116,0.6)'],
  ['rgb(50,72,48)', 'rgb(90,118,72)', 'rgba(162,186,114,0.6)'],
  ['rgb(72,82,40)', 'rgb(124,132,66)', 'rgba(200,198,120,0.6)'],
];

function treeSprite(r: number, tone: number, variant: number, scale: number): Sprite {
  const w = 4.4 * r;
  const h = 3.8 * r;
  const ox = 1.6 * r;
  const oy = 1.7 * r;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const c = canvas.getContext('2d')!;
  c.scale(scale, scale);
  c.translate(ox, oy);
  const rr = rng(`tree${tone}${variant}${r}`);
  // Lobes of the crown: a varied cloud.
  const lobes: [number, number, number][] = [];
  const n = 4 + variant;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rr() * 0.6;
    const d = r * (0.38 + rr() * 0.12);
    lobes.push([Math.cos(a) * d, Math.sin(a) * d * 0.85 - 0.08 * r, r * (0.5 + rr() * 0.14)]);
  }
  lobes.push([0, -0.1 * r, r * 0.62]);
  const crown = (dx: number, dy: number, k: number) => {
    c.beginPath();
    for (const [x, y, q] of lobes) {
      c.moveTo(x * k + dx + q * k, y * k + dy);
      c.arc(x * k + dx, y * k + dy, q * k, 0, Math.PI * 2);
    }
  };
  const [dark, mid, light] = TREE_TONES[tone];
  c.fillStyle = 'rgba(58,48,30,0.24)';
  c.beginPath();
  c.ellipse(0.75 * r, 0.62 * r, r * 1.05, r * 0.62, 0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = dark;
  crown(0.14 * r, 0.16 * r, 1);
  c.fill();
  c.fillStyle = mid;
  crown(-0.06 * r, -0.06 * r, 0.86);
  c.fill();
  // Leaf dabs in the shade, and the lit crown top.
  c.fillStyle = dark;
  for (let k = 0; k < 5; k++) {
    const a = 0.2 + rr() * 1.6;
    const d = r * (0.25 + rr() * 0.35);
    c.beginPath();
    c.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.1 + rr() * 0.08), 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = light;
  c.beginPath();
  c.arc(-0.28 * r, -0.4 * r, 0.34 * r, 0, Math.PI * 2);
  c.fill();
  // The pen, round the shadowed side.
  c.strokeStyle = `rgba(${SEPIA},0.75)`;
  c.lineWidth = 0.22;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x, y, q] of lobes) {
    const a0 = Math.atan2(y, x);
    if (Math.cos(a0 - 0.8) < -0.1) continue; // only the south-east side
    c.moveTo(x + 0.1 * r + Math.cos(a0 - 1) * q, y + 0.1 * r + Math.sin(a0 - 1) * q);
    c.arc(x + 0.1 * r, y + 0.1 * r, q, a0 - 1, a0 + 1);
  }
  c.stroke();
  return { canvas, ox, oy, w, h };
}

const SIZES = [1.4, 1.7, 2.0, 2.3];

/** Stamps the trees, back to front. */
function paintTrees(ctx: Ctx, trees: Tree[]) {
  const scale = Math.abs(ctx.getTransform().a) || 2;
  const sprites = new Map<string, Sprite>();
  const get = (r: number, tone: number, variant: number) => {
    const k = `${r}|${tone}|${variant}`;
    let s = sprites.get(k);
    if (!s) sprites.set(k, (s = treeSprite(r, tone, variant, scale)));
    return s;
  };
  for (const t of trees) {
    const r = SIZES.reduce((a, q) => (Math.abs(q - t.r) < Math.abs(a - t.r) ? q : a));
    const s = get(r, t.tone, Math.floor((t.x * 7.13 + t.y * 3.7) % 2));
    ctx.drawImage(s.canvas, t.x - s.ox, t.y - s.oy, s.w, s.h);
  }
}

/** Italian cypresses: dark narrow flames with a long shadow. */
function paintCypresses(ctx: Ctx, pts: Tree[]) {
  ctx.fillStyle = 'rgba(58,48,30,0.22)';
  ctx.beginPath();
  for (const t of pts) {
    ctx.moveTo(t.x + 2.2 * t.r, t.y + 1.2 * t.r);
    ctx.ellipse(t.x + 1.6 * t.r, t.y + 1.0 * t.r, 1.6 * t.r, 0.4 * t.r, 0.45, 0, Math.PI * 2);
  }
  ctx.fill();
  const flame = (t: Tree, k: number) => {
    const w = 0.55 * t.r * k;
    const h = 2.6 * t.r;
    ctx.moveTo(t.x, t.y - h);
    ctx.quadraticCurveTo(t.x + w * 1.6, t.y - h * 0.2, t.x + w * 0.4, t.y + 0.5 * t.r);
    ctx.lineTo(t.x - w * 0.4, t.y + 0.5 * t.r);
    ctx.quadraticCurveTo(t.x - w * 1.6, t.y - h * 0.2, t.x, t.y - h);
  };
  ctx.fillStyle = 'rgba(40,62,40,0.95)';
  ctx.beginPath();
  for (const t of pts) flame(t, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(96,122,72,0.7)';
  ctx.beginPath();
  for (const t of pts) {
    ctx.moveTo(t.x - 0.1 * t.r, t.y - 2.3 * t.r);
    ctx.quadraticCurveTo(t.x - 0.75 * t.r, t.y - 0.6 * t.r, t.x - 0.15 * t.r, t.y + 0.3 * t.r);
    ctx.quadraticCurveTo(t.x - 0.3 * t.r, t.y - 0.8 * t.r, t.x - 0.1 * t.r, t.y - 2.3 * t.r);
  }
  ctx.fill();
  ctx.strokeStyle = `rgba(${SEPIA},0.75)`;
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  for (const t of pts) {
    ctx.moveTo(t.x + 0.05 * t.r, t.y - 2.5 * t.r);
    ctx.quadraticCurveTo(t.x + 0.9 * t.r, t.y - 0.5 * t.r, t.x + 0.25 * t.r, t.y + 0.5 * t.r);
  }
  ctx.stroke();
}

function drawVegetation(ctx: Ctx, f: InkFields) {
  const r = rng('trees');
  const trees: Tree[] = [];
  const cypress: Tree[] = [];
  const ok = (i: number) => f.land[i] > 0.97 && f.town[i] < 0.12 && f.marsh[i] < 0.3 && f.paint[i] > 0.45 && f.beach[i] < 0.3;
  // Woods: a crowd of crowns where the woods wash lies, a few strays in the open.
  const step = 2.9;
  for (let y = f.b.y + 2; y < f.b.y + f.b.h - 2; y += step) {
    for (let x = f.b.x + 2; x < f.b.x + f.b.w - 2; x += step) {
      const tx = x + (r() - 0.5) * step * 1.1;
      const ty = y + (r() - 0.5) * step * 1.1;
      const gate = r();
      const size = r();
      const tone = r();
      const i = Math.round(ty - f.b.y) * f.W + Math.round(tx - f.b.x);
      if (i < 0 || i >= f.land.length || !ok(i)) continue;
      const w = f.woods[i];
      const p = w > 0.12 ? 0.2 + 0.8 * w : 0.0012 + 0.0025 * f.hill[i];
      if (gate > p) continue;
      trees.push({ x: tx, y: ty, r: (1.35 + size * 0.85) * (f.mtn[i] > 0.5 ? 0.85 : 1), tone: tone < 0.45 ? 0 : tone < 0.8 ? 1 : 2 });
    }
  }
  // Cypresses round the villages and the odd one on a hillside.
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.town && !d.city) continue;
    const [cx, cy] = landSpot(h);
    const rr = rng(`cy${h}`);
    const n = d.city ? 10 : 5;
    for (let k = 0; k < n; k++) {
      const a = rr() * Math.PI * 2;
      const dist = (d.city ? 20 : 11) + rr() * 14;
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist;
      const i = Math.round(y - f.b.y) * f.W + Math.round(x - f.b.x);
      if (i < 0 || i >= f.land.length || !ok(i) || f.mtn[i] > 0.4) continue;
      // Often in a short avenue.
      const row = rr() < 0.4 ? 3 : 1;
      for (let j = 0; j < row; j++) cypress.push({ x: x + j * 2.6, y: y + j * 0.8, r: 0.9 + rr() * 0.3, tone: 0 });
    }
  }
  const rc = rng('cypress');
  for (let y = f.b.y; y < f.b.y + f.b.h; y += 23) {
    for (let x = f.b.x; x < f.b.x + f.b.w; x += 23) {
      const tx = x + (rc() - 0.5) * 20;
      const ty = y + (rc() - 0.5) * 20;
      const g = rc();
      const i = Math.round(ty - f.b.y) * f.W + Math.round(tx - f.b.x);
      if (i < 0 || i >= f.land.length || !ok(i) || f.mtn[i] > 0.3 || g > 0.08 + 0.1 * f.hill[i]) continue;
      cypress.push({ x: tx, y: ty, r: 0.85 + rc() * 0.3, tone: 0 });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  paintTrees(ctx, trees);
  paintCypresses(ctx, cypress);
}

/** Olive groves in rows of grey-green dots and vineyards in rows of dashes, in their own fields. */
function drawGroves(ctx: Ctx, f: InkFields) {
  const { b } = f;
  // Field space is the map plane bent by the warp; to put a point of field space on the map, undo the bend.
  const toMap = (qx: number, qy: number): Pt => {
    let x = qx;
    let y = qy;
    for (let k = 0; k < 3; k++) {
      const [fx, fy] = f.fieldAt(x, y);
      x += qx - fx;
      y += qy - fy;
    }
    return [x, y];
  };
  const fits = (x: number, y: number) => {
    const ix = Math.round(x - b.x);
    const iy = Math.round(y - b.y);
    if (ix < 1 || iy < 1 || ix >= f.W - 1 || iy >= f.H - 1) return false;
    const i = iy * f.W + ix;
    return f.land[i] > 0.98 && f.mtn[i] < 0.25 && f.marsh[i] < 0.2 && f.town[i] < 0.1 && f.beach[i] < 0.2 && f.woods[i] < 0.3 && f.paint[i] > 0.5;
  };
  const olives: Pt[] = [];
  forEachRowPoint(b.x - 40, b.y - 40, b.x + b.w + 40, b.y + b.h + 40, 3.3, 3.6, (qx, qy, p) => {
    if (p.kind !== 'olive' || p.edge < 1.6) return;
    const [x, y] = toMap(qx, qy);
    if (fits(x, y)) olives.push([x, y]);
  });
  ctx.fillStyle = 'rgba(58,48,30,0.2)';
  ctx.beginPath();
  for (const [x, y] of olives) {
    ctx.moveTo(x + 1.5, y + 0.6);
    ctx.ellipse(x + 0.6, y + 0.6, 0.9, 0.55, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(112,128,92,0.95)';
  ctx.beginPath();
  for (const [x, y] of olives) {
    ctx.moveTo(x + 0.85, y);
    ctx.arc(x, y, 0.85, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.strokeStyle = `rgba(${SEPIA},0.55)`;
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  for (const [x, y] of olives) {
    ctx.moveTo(x + 0.85, y + 0.15);
    ctx.arc(x, y, 0.85, 0.15, 2.4);
  }
  ctx.stroke();
  // Vineyards: short dashes along the rows.
  ctx.strokeStyle = 'rgba(82,92,52,0.7)';
  ctx.lineWidth = 0.32;
  ctx.lineCap = 'round';
  ctx.beginPath();
  forEachRowPoint(b.x - 40, b.y - 40, b.x + b.w + 40, b.y + b.h + 40, 1.5, 2.1, (qx, qy, p) => {
    if (p.kind !== 'vine' || p.edge < 1.2) return;
    const [x, y] = toMap(qx, qy);
    if (!fits(x, y)) return;
    const c = Math.cos(p.ang) * 0.5;
    const s = Math.sin(p.ang) * 0.5;
    ctx.moveTo(x - c, y - s);
    ctx.lineTo(x + c, y + s);
  });
  ctx.stroke();
}

/** Marsh: the map-maker's sign, a few short lines of water with a tuft of reeds. */
function drawMarsh(ctx: Ctx, f: InkFields) {
  const r = rng('marsh');
  const water: number[] = [];
  const reeds: number[] = [];
  const step = 6.5;
  for (let y = f.b.y; y < f.b.y + f.b.h; y += step * 0.8) {
    for (let x = f.b.x; x < f.b.x + f.b.w; x += step) {
      const px = x + (r() - 0.5) * step * 0.8 + ((y / step) % 2) * step * 0.5;
      const py = y + (r() - 0.5) * step * 0.5;
      const g = r();
      if (at(f, f.marsh, px, py) < 0.55 || at(f, f.land, px, py) < 0.95 || at(f, f.paint, px, py) < 0.5 || g > 0.85) continue;
      const w = 1.6 + r() * 1.2;
      water.push(px - w, py + 0.6, px + w, py + 0.6, px - w * 0.6 + 0.8, py + 1.5, px + w * 0.6 + 0.8, py + 1.5);
      if (r() < 0.75) {
        const n = 3 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 1.3;
          const len = 1.5 + r() * 1.1;
          reeds.push(px, py + 0.2, px + Math.cos(a) * len, py + 0.2 + Math.sin(a) * len);
        }
      }
    }
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${PRUSSIAN},0.62)`;
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  for (let i = 0; i < water.length; i += 4) {
    ctx.moveTo(water[i], water[i + 1]);
    ctx.lineTo(water[i + 2], water[i + 3]);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,82,44,0.75)';
  ctx.lineWidth = 0.24;
  ctx.beginPath();
  for (let i = 0; i < reeds.length; i += 4) {
    ctx.moveTo(reeds[i], reeds[i + 1]);
    ctx.lineTo(reeds[i + 2], reeds[i + 3]);
  }
  ctx.stroke();
}

/** Sand stippled with the pen along the beaches. */
function drawSand(ctx: Ctx, f: InkFields) {
  const r = rng('sand');
  ctx.fillStyle = `rgba(${SEPIA},0.32)`;
  ctx.beginPath();
  const step = 1.5;
  for (let y = f.b.y; y < f.b.y + f.b.h; y += step) {
    for (let x = f.b.x; x < f.b.x + f.b.w; x += step) {
      const i = Math.round(y - f.b.y) * f.W + Math.round(x - f.b.x);
      const s = f.beach[i];
      if (!(s > 0.25) || f.paint[i] < 0.5) continue;
      if (r() > s * 0.55) continue;
      const px = x + (r() - 0.5) * step;
      const py = y + (r() - 0.5) * step;
      ctx.moveTo(px + 0.2, py);
      ctx.arc(px, py, 0.2, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

// ------------------------------------------------------------------ settlements

const ROOFS = ['#b4583a', '#c26e48', '#a24c34', '#c98c5c', '#b0644a'];

/** Villages and cities: little blocks of houses along their streets, terracotta roofs, walls in pale stone, a pen
 * outline and a shadow; a city gets a church dome and a bell tower. Airfields get their runway. */
function drawSettlements(ctx: Ctx) {
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (d.airfield) {
      const [x, y] = landSpot(h);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35);
      ctx.fillStyle = 'rgba(58,48,30,0.22)';
      ctx.fillRect(-14.4, -1.6, 30, 4.4);
      ctx.fillStyle = '#cfc6ae';
      ctx.fillRect(-15, -2.2, 30, 4.4);
      ctx.strokeStyle = `rgba(${SEPIA},0.8)`;
      ctx.lineWidth = 0.3;
      ctx.strokeRect(-15, -2.2, 30, 4.4);
      ctx.setLineDash([1.6, 1.6]);
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (!d.city && !d.town) continue;
    const [cx, cy] = landSpot(h);
    const r = rng(h);
    const n = d.city ? 40 : 11;
    const radius = d.city ? 15 : 6.5;
    const angle = r() * Math.PI;
    const houses: { x: number; y: number; w: number; h: number; a: number; roof: string }[] = [];
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * radius;
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist * 0.85;
      const w = 2.2 + r() * 2.8;
      const hh = 1.8 + r() * 1.8;
      const rot = angle + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.2;
      const roof = ROOFS[Math.floor(r() * ROOFS.length)];
      if (d.coast && !landAt(h, x, y)) continue;
      houses.push({ x, y, w, h: hh, a: rot, roof });
    }
    houses.sort((p, q) => p.y - q.y);
    for (const o of houses) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.a);
      ctx.fillStyle = 'rgba(58,44,30,0.28)';
      ctx.fillRect(-o.w / 2 + 0.7, -o.h / 2 + 0.6, o.w, o.h);
      ctx.fillStyle = o.roof;
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      // The far slope of the roof in shadow, and the ridge.
      ctx.fillStyle = 'rgba(60,30,20,0.28)';
      ctx.fillRect(-o.w / 2, 0, o.w, o.h / 2);
      ctx.strokeStyle = `rgba(${SEPIA},0.85)`;
      ctx.lineWidth = 0.22;
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.beginPath();
      ctx.moveTo(-o.w / 2, 0);
      ctx.lineTo(o.w / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
    if (d.city) {
      // The cathedral: a pale dome with a lantern, and its campanile.
      const x = cx + (r() - 0.5) * 6;
      const y = cy + (r() - 0.5) * 6;
      ctx.fillStyle = 'rgba(58,44,30,0.3)';
      ctx.beginPath();
      ctx.arc(x + 0.9, y + 0.8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,96,70,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, -0.3, Math.PI * 0.9);
      ctx.fill();
      ctx.strokeStyle = `rgba(${SEPIA},0.9)`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.moveTo(x + 0.7, y);
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#d9c9a6';
      ctx.fillRect(x + 3.4, y - 3.2, 1.8, 1.8);
      ctx.strokeRect(x + 3.4, y - 3.2, 1.8, 1.8);
    }
  }
}

// ------------------------------------------------------------------ the sheet

/** A compass rose in the open sea, as on an old chart. */
function drawCompass(ctx: Ctx, f: InkFields) {
  // In the widest stretch of open water inside the painting, clear of the sea's printed names.
  const avoid = (MAP.meta?.seaLabels ?? []).map(([h]) => center(h));
  let best: Pt | null = null;
  let bestScore = -Infinity;
  const rings = [24, 48, 72, 96, 120];
  for (let y = f.b.y + 90; y < f.b.y + f.b.h - 90; y += 12) {
    for (let x = f.b.x + 90; x < f.b.x + f.b.w - 90; x += 12) {
      if (at(f, f.open, x, y) < 0.8) continue;
      let clear = 140;
      for (const d of rings) {
        let hit = false;
        for (let a = 0; a < 20 && !hit; a++) {
          const px = x + Math.cos((a / 20) * Math.PI * 2) * d;
          const py = y + Math.sin((a / 20) * Math.PI * 2) * d;
          hit = at(f, f.open, px, py) < 0.55 || at(f, f.paint, px, py) < 0.85;
        }
        if (hit) {
          clear = d;
          break;
        }
      }
      if (clear < 72) continue;
      const labelGap = Math.min(...avoid.map(([lx, ly]) => Math.hypot(lx - x, ly - y)), 999);
      if (labelGap < 150) continue;
      const score = clear * 2 + (y - f.b.y) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  }
  if (!best) return;
  const [x, y] = best;
  const R = 44;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(${SEPIA},0.7)`;
  ctx.lineWidth = 0.5;
  for (const rr of [R * 0.62, R * 0.66]) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Ticks round the ring.
  ctx.beginPath();
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const l = k % 8 === 0 ? 4 : k % 2 === 0 ? 2.4 : 1.4;
    ctx.moveTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66);
    ctx.lineTo(Math.cos(a) * (R * 0.66 + l), Math.sin(a) * (R * 0.66 + l));
  }
  ctx.stroke();
  const point = (a: number, len: number, wid: number, dark: boolean, side: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + side * Math.PI / 2) * wid, Math.sin(a + side * Math.PI / 2) * wid);
    ctx.closePath();
    ctx.fillStyle = dark ? 'rgba(74,52,34,0.78)' : 'rgba(244,236,214,0.85)';
    ctx.fill();
    ctx.stroke();
  };
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
    const main = k % 2 === 0;
    const len = main ? R : R * 0.55;
    const wid = main ? R * 0.13 : R * 0.09;
    point(a, len, wid, true, 1);
    point(a, len, wid, false, -1);
  }
  ctx.fillStyle = 'rgba(74,52,34,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'italic 11px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -R - 4);
  ctx.restore();
}

/** The sheet's ruled border: a heavy outer line and a fine inner one. */
function drawFrame(ctx: Ctx, f: InkFields) {
  const { b } = f;
  ctx.strokeStyle = `rgba(${SEPIA},0.85)`;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(b.x + 14, b.y + 14, b.w - 28, b.h - 28);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(b.x + 19, b.y + 19, b.w - 38, b.h - 38);
  // Degree-like ticks between the lines.
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let x = b.x + 60; x < b.x + b.w - 40; x += 60) {
    ctx.moveTo(x, b.y + 14);
    ctx.lineTo(x, b.y + 19);
    ctx.moveTo(x, b.y + b.h - 14);
    ctx.lineTo(x, b.y + b.h - 19);
  }
  for (let y = b.y + 60; y < b.y + b.h - 40; y += 60) {
    ctx.moveTo(b.x + 14, y);
    ctx.lineTo(b.x + 19, y);
    ctx.moveTo(b.x + b.w - 14, y);
    ctx.lineTo(b.x + b.w - 19, y);
  }
  ctx.stroke();
}

/** Laid paper: fine grain and the odd fibre, worked over everything (pigment and ink sit in the paper's tooth). */
export function paperTexture(ctx: Ctx, width: number, height: number) {
  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const t = tile.getContext('2d')!;
  const img = t.createImageData(size, size);
  const grain = noiseTile(9001, size, 4, 3);
  const r = rng('paper');
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (grain.data[i] - 0.5) * 34 + (r() - 0.5) * 22;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  t.lineCap = 'round';
  for (let k = 0; k < 60; k++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI * 2;
    const len = 4 + r() * 14;
    t.strokeStyle = r() < 0.5 ? 'rgba(150,150,150,0.25)' : 'rgba(100,100,100,0.2)';
    t.lineWidth = 0.6;
    t.beginPath();
    t.moveTo(x, y);
    t.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    t.stroke();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** All the pen work, in the order an illustrator would ink it. `ctx` draws in map units. */
export function drawInk(ctx: Ctx, f: InkFields, step: (label: string) => Promise<void>): Promise<void> {
  const wob = noiseTile(4242, 256, 32, 2);
  return (async () => {
    // The compass letter is lettered in the map's face: make sure it has loaded.
    try {
      await document.fonts?.load('italic 11px "IM Fell English"');
    } catch {
      /* the fallback face will do */
    }
    drawWater(ctx, f, wob);
    drawWaves(ctx, f);
    drawCompass(ctx, f);
    await step('Drawing the hills');
    drawHachures(ctx, f);
    drawMarsh(ctx, f);
    drawSand(ctx, f);
    await step('Planting the groves');
    drawGroves(ctx, f);
    drawVegetation(ctx, f);
    await step('Building the villages');
    drawSettlements(ctx);
    drawFrame(ctx, f);
  })();
}

