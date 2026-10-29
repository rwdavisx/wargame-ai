// Synthetic terrain for rule tests (sections 1-12). The real map is so cut up by rivers, ridges and
// roads that clean set-ups are rare, so a test can turn a patch of the map into plain clear ground,
// then lay down exactly the terrain it needs. Every change is undone by restoreMap().
import { MAP, UNIT_DEFS } from '../../src/engine/data';
import { distance, neighbors, sideKey, type HexId } from '../../src/engine/hex';
import type { GameState, HexData, HexsideData } from '../../src/engine/types';

/** Centre of the sandbox: inland, far from every map edge and Entry Area. */
export const C = '3412';
/** Direction indexes into neighbors(): clockwise from north. */
export const N = 0, NE = 1, SE = 2, S = 3, SW = 4, NW = 5;

const savedHexes = new Map<HexId, HexData | undefined>();
const savedSides = new Map<string, HexsideData | undefined>();

/** The hex `n` steps from `h` in direction `dir`. */
export function go(h: HexId, dir: number, n = 1): HexId {
  let cur = h;
  for (let i = 0; i < n; i++) cur = neighbors(cur)[dir];
  return cur;
}

function saveHex(h: HexId) {
  if (!savedHexes.has(h)) savedHexes.set(h, MAP.hexes[h] ? { ...MAP.hexes[h] } : undefined);
}
function saveSide(k: string) {
  if (!savedSides.has(k)) savedSides.set(k, MAP.hexsides[k] ? { ...MAP.hexsides[k] } : undefined);
}

/** Turns every hex within `radius` of `center` into featureless clear land with no hexside features. */
export function sandbox(center: HexId = C, radius = 6): HexId[] {
  const area = Object.keys(MAP.hexes).filter((h) => distance(h, center) <= radius);
  for (const h of area) {
    saveHex(h);
    MAP.hexes[h] = { terrain: 'clear' };
    for (const n of neighbors(h)) {
      const k = sideKey(h, n);
      saveSide(k);
      delete MAP.hexsides[k];
    }
  }
  return area;
}

/** Sets a hex's terrain data (replacing it). */
export function setHex(h: HexId, data: HexData): void {
  saveHex(h);
  MAP.hexes[h] = data;
}

/** Sets the features of the hexside between two adjacent hexes (replacing them). */
export function setSide(a: HexId, b: HexId, data: HexsideData): void {
  const k = sideKey(a, b);
  saveSide(k);
  MAP.hexsides[k] = data;
}

/** Puts back every hex and hexside changed since the last restore. */
export function restoreMap(): void {
  for (const [h, d] of savedHexes) {
    if (d) MAP.hexes[h] = d;
    else delete MAP.hexes[h];
  }
  for (const [k, d] of savedSides) {
    if (d) MAP.hexsides[k] = d;
    else delete MAP.hexsides[k];
  }
  savedHexes.clear();
  savedSides.clear();
}

/** Sends the Remnant counters back to the Remnant Display (scenario() sets every unit aside). */
export function remnantsToPool(s: GameState): void {
  for (const u of Object.values(s.units)) if (UNIT_DEFS[u.id].isRemnant) u.where = { kind: 'remnantPool' };
}
