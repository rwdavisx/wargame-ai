// Smooth noise shared by the terrain painter and the map's line work, and the "organic warp": one gentle,
// deterministic displacement of the map plane that bends terrain edges, mountains, rivers and roads off the
// hex lines so the map looks drawn rather than stamped, while every hex keeps its own terrain at its middle.

export function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, y, seed + o * 17) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** How far features move, in map units (a hex is 60 across): broad sweeps plus a little finer wander. */
const BROAD = 10;
const FINE = 3.5;

/** Where the drawing puts the feature that belongs at (x, y). Terrain and line work both use it, so a river
 * still runs along the edge of its mountain and a road still crosses its bridge. */
export function warp(x: number, y: number, amount = 1): [number, number] {
  const dx = (fbm(x / 95, y / 95, 101, 3) - 0.5) * 2 * BROAD + (fbm(x / 28, y / 28, 103, 2) - 0.5) * 2 * FINE;
  const dy = (fbm(x / 95, y / 95, 107, 3) - 0.5) * 2 * BROAD + (fbm(x / 28, y / 28, 109, 2) - 0.5) * 2 * FINE;
  return [x + dx * amount, y + dy * amount];
}

/** A square tile of smooth noise that wraps at its edges, worked out once so a per-pixel loop can read it with a
 * couple of array lookups instead of computing noise at every pixel. */
export interface NoiseTile {
  size: number;
  data: Float32Array;
}

/** Fractal value noise on a `size` square that tiles: the first octave's lattice is `cell` pixels apart. */
export function noiseTile(seed: number, size: number, cell: number, octaves: number): NoiseTile {
  const data = new Float32Array(size * size);
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const c = Math.max(1, cell >> o);
    const period = Math.max(1, Math.round(size / c));
    for (let y = 0; y < size; y++) {
      const fy = y / c;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const v = ty * ty * (3 - 2 * ty);
      const y0 = iy % period;
      const y1 = (iy + 1) % period;
      for (let x = 0; x < size; x++) {
        const fx = x / c;
        const ix = Math.floor(fx);
        const tx = fx - ix;
        const u = tx * tx * (3 - 2 * tx);
        const x0 = ix % period;
        const x1 = (ix + 1) % period;
        const s = seed + o * 31;
        const a = hash(x0, y0, s);
        const bb = hash(x1, y0, s);
        const cc = hash(x0, y1, s);
        const d = hash(x1, y1, s);
        data[y * size + x] += (a + (bb - a) * u + (cc - a) * v + (a - bb - cc + d) * u * v) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < data.length; i++) data[i] /= norm;
  return { size, data };
}

/** The tile's value at (x, y) in its own pixels, wrapping, interpolated. */
export function tileAt(t: NoiseTile, x: number, y: number): number {
  const n = t.size;
  const fx = x - Math.floor(x / n) * n;
  const fy = y - Math.floor(y / n) * n;
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const x1 = ix + 1 === n ? 0 : ix + 1;
  const y1 = iy + 1 === n ? 0 : iy + 1;
  const d = t.data;
  const r0 = iy * n;
  const r1 = y1 * n;
  const a = d[r0 + ix] + (d[r0 + x1] - d[r0 + ix]) * tx;
  const c = d[r1 + ix] + (d[r1 + x1] - d[r1 + ix]) * tx;
  return a + (c - a) * ty;
}
