// The printed coastline through each coastal hex, traced from photos of the map (tools/map-art/coast_masks.py).
// A coastal hex that is part land and part sea carries a mask in map.json: 17 rows of 19 cells, a sixteenth of the
// hex's height apart, centred on the hex's middle; each row is five hex digits with bit j set where cell j is land.
import { MAP } from '../../engine/data';
import type { HexId } from '../../engine/hex';
import { R, center, type Pt } from './geom';

export const COAST_ROWS = 17;
export const COAST_COLS = 19;
/** Map units between neighbouring cells. */
export const COAST_STEP = (R * Math.sqrt(3)) / 16;

/** Is lattice cell (c, r), counted from the hex's middle, inside the hex outline? */
export function insideHex(c: number, r: number): boolean {
  const u = c / 16;
  const v = r / 16;
  return Math.abs(v) <= 0.5 && (Math.abs(u) * Math.sqrt(3)) / 2 + Math.abs(v) / 2 <= 0.5;
}

const decoded = new Map<string, Uint8Array>();

/** A mask as 1 (land) or 0 (sea) per cell, row by row. Cells just past the hex outline (the lattice's corners)
 * take the value of the nearest cell inside it, so a mask drawn clipped to its hex leaves no gap at the edge. */
export function decodeCoast(code: string): Uint8Array {
  const hit = decoded.get(code);
  if (hit) return hit;
  const out = new Uint8Array(COAST_ROWS * COAST_COLS);
  for (let i = 0; i < COAST_ROWS; i++) {
    const bits = parseInt(code.slice(i * 5, i * 5 + 5), 16);
    for (let j = 0; j < COAST_COLS; j++) out[i * COAST_COLS + j] = (bits >> j) & 1;
  }
  for (let i = 0; i < COAST_ROWS; i++) {
    for (let j = 0; j < COAST_COLS; j++) {
      if (insideHex(j - 9, i - 8)) continue;
      let best = 0;
      let bd = Infinity;
      for (let a = 0; a < COAST_ROWS; a++) {
        for (let k = 0; k < COAST_COLS; k++) {
          if (!insideHex(k - 9, a - 8)) continue;
          const d = (a - i) ** 2 + (k - j) ** 2;
          if (d < bd) {
            bd = d;
            best = out[a * COAST_COLS + k];
          }
        }
      }
      out[i * COAST_COLS + j] = best;
    }
  }
  decoded.set(code, out);
  return out;
}

/** The share of a mask's cells inside the hex that are land. */
export function landShare(code: string): number {
  const m = decodeCoast(code);
  let land = 0;
  let all = 0;
  for (let i = 0; i < COAST_ROWS; i++) {
    for (let j = 0; j < COAST_COLS; j++) {
      if (!insideHex(j - 9, i - 8)) continue;
      all++;
      land += m[i * COAST_COLS + j];
    }
  }
  return land / all;
}

/** Is the map point (x, y) in hex h land on the printed map? Hexes without a mask are all their own terrain. */
export function landAt(h: HexId, x: number, y: number): boolean {
  const d = MAP.hexes[h];
  if (!d) return false;
  if (!d.coast) return d.terrain !== 'sea';
  const [cx, cy] = center(h);
  const j = Math.round((x - cx) / COAST_STEP) + 9;
  const i = Math.round((y - cy) / COAST_STEP) + 8;
  if (i < 0 || j < 0 || i >= COAST_ROWS || j >= COAST_COLS) return d.terrain !== 'sea';
  return decodeCoast(d.coast)[i * COAST_COLS + j] === 1;
}

/** Where to put something that stands on a hex's land (a town, an airfield): its middle, or on a coastal hex that
 * is water there, the land cell nearest the middle, preferring one with land all round it. */
export function landSpot(h: HexId): Pt {
  const [cx, cy] = center(h);
  const code = MAP.hexes[h]?.coast;
  if (!code) return [cx, cy];
  const m = decodeCoast(code);
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < COAST_ROWS && j < COAST_COLS && m[i * COAST_COLS + j] === 1;
  if (at(8, 9) && at(7, 9) && at(9, 9) && at(8, 8) && at(8, 10)) return [cx, cy];
  let best: Pt = [cx, cy];
  let bd = Infinity;
  for (let i = 0; i < COAST_ROWS; i++) {
    for (let j = 0; j < COAST_COLS; j++) {
      if (!insideHex(j - 9, i - 8) || !at(i, j)) continue;
      const interior = at(i - 1, j) && at(i + 1, j) && at(i, j - 1) && at(i, j + 1);
      const d = (i - 8) ** 2 + (j - 9) ** 2 + (interior ? 0 : 40);
      if (d < bd) {
        bd = d;
        best = [cx + (j - 9) * COAST_STEP, cy + (i - 8) * COAST_STEP];
      }
    }
  }
  return best;
}
