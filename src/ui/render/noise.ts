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
