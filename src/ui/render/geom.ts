// Map geometry shared by the terrain renderer and the map view.
import { MAP } from '../../engine/data';
import { axialShift, hexCorners, hexId, hexToPixel, sharedEdge, type HexId } from '../../engine/hex';

/** Hex circumradius in map units. */
export const R = 30;
const SQ3 = Math.sqrt(3);

export type Pt = [number, number];

export function center(h: HexId): Pt {
  const p = hexToPixel(h, R);
  return [p.x, p.y];
}

export function corners(h: HexId, r = R): Pt[] {
  const [x, y] = center(h);
  return hexCorners(x, y, r) as Pt[];
}

export function polyPoints(h: HexId, r = R): string {
  return corners(h, r).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

export function edge(a: HexId, b: HexId): [Pt, Pt] | null {
  return sharedEdge(a, b, R) as [Pt, Pt] | null;
}

export function pixelToHex(x: number, y: number): HexId {
  const q = ((2 / 3) * x) / R;
  const r = ((-1 / 3) * x + (SQ3 / 3) * y) / R;
  let cx = Math.round(q);
  let cz = Math.round(r);
  const cy = Math.round(-q - r);
  const dx = Math.abs(cx - q);
  const dy = Math.abs(cy - (-q - r));
  const dz = Math.abs(cz - r);
  if (dx > dy && dx > dz) cx = -cy - cz;
  else if (dy <= dz) cz = -cx - cy;
  const col = cx;
  const row = cz + axialShift(cx);
  if (col < 0 || row < 0) return '0000';
  return hexId(col, row);
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area covered by the map's hexes, plus a margin. */
export function mapBounds(margin = 70): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const h of Object.keys(MAP.hexes)) {
    const [x, y] = center(h);
    x0 = Math.min(x0, x - R);
    y0 = Math.min(y0, y - R);
    x1 = Math.max(x1, x + R);
    y1 = Math.max(y1, y + R);
  }
  return { x: Math.floor(x0 - margin), y: Math.floor(y0 - margin), w: Math.ceil(x1 - x0 + 2 * margin), h: Math.ceil(y1 - y0 + 2 * margin) };
}

/** Joins line segments that share end points into polylines. */
export function chainSegments(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const adj = new Map<string, number[]>();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) adj.set(key(p), [...(adj.get(key(p)) ?? []), i]);
  });
  const used = new Set<number>();
  const lines: Pt[][] = [];
  const walk = (start: Pt, line: Pt[]) => {
    let cur = start;
    for (;;) {
      const next = (adj.get(key(cur)) ?? []).find((i) => !used.has(i));
      if (next === undefined) break;
      used.add(next);
      const [a, b] = segs[next];
      cur = key(a) === key(cur) ? b : a;
      line.push(cur);
    }
  };
  // Start from end points (degree 1) first so chains come out whole.
  const order = segs.map((_, i) => i).sort((i, j) => {
    const di = Math.min(adj.get(key(segs[i][0]))!.length, adj.get(key(segs[i][1]))!.length);
    const dj = Math.min(adj.get(key(segs[j][0]))!.length, adj.get(key(segs[j][1]))!.length);
    return di - dj;
  });
  for (const i of order) {
    if (used.has(i)) continue;
    used.add(i);
    const [a, b] = segs[i];
    const startDeg = adj.get(key(a))!.length;
    const [s, e] = startDeg === 1 || adj.get(key(b))!.length !== 1 ? [a, b] : [b, a];
    const line: Pt[] = [s, e];
    walk(e, line);
    const back: Pt[] = [];
    walk(s, back);
    lines.push([...back.reverse(), ...line]);
  }
  return lines;
}

/** Smooth SVG path (Catmull-Rom) through points. */
export function smoothPath(pts: Pt[], tension = 0.5): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = tension / 3;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Deterministic pseudo-random numbers from a string or number seed. */
export function rng(seed: string | number): () => number {
  let h = typeof seed === 'number' ? seed >>> 0 : 2166136261;
  if (typeof seed === 'string') for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds gentle wiggles to a polyline so rivers and roads look hand-drawn rather than ruled. */
export function wiggle(pts: Pt[], amount: number, seed: string): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const o = (r() - 0.5) * 2 * amount;
    out.push([(ax + bx) / 2 + nx * o, (ay + by) / 2 + ny * o]);
    out.push(pts[i]);
  }
  return out;
}
