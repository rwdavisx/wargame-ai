import { MAP, RULES } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { isLand } from './movement';
import type { GameState, Side } from './types';
import { occupancy, other, sideOf, zocOf } from './units';

/** Turn from which the south edge counts as friendly to the Allies. */
export const SOUTH_EDGE_ALLIED_TURN = 11;

export function supplySources(s: GameState, side: Side): HexId[] {
  const occ = occupancy(s);
  const out: HexId[] = [];
  const add = (h: HexId) => {
    if (isLand(h) && occ.get(h) !== other(side)) out.push(h);
  };
  const southAllied = s.turn >= SOUTH_EDGE_ALLIED_TURN;
  for (const [name, ea] of Object.entries(MAP.entryAreas)) {
    const south = ea.side === 'south';
    if (side === 'German' && (!south || !southAllied)) ea.hexes.forEach(add);
    if (side === 'Allied' && south && southAllied) ea.hexes.forEach(add);
    void name;
  }
  if (side === 'Allied') {
    for (const b of Object.values(MAP.beaches)) add(b.hex);
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (d.port && !d.port.restricted && s.control[h] === 'Allied') add(h);
    }
  }
  return out;
}

/** Set of hexes in supply for `side`. */
export function suppliedHexes(s: GameState, side: Side): Set<HexId> {
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const passable = (h: HexId) =>
    isLand(h) && occ.get(h) !== other(side) && (!ezoc.has(h) || occ.get(h) === side);
  const sources = supplySources(s, side);
  // 1) Road net from the sources, unlimited length.
  const road = new Set<HexId>(sources);
  const stack = [...sources];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of neighbors(cur)) {
      if (road.has(n) || !passable(n)) continue;
      if (!MAP.hexsides[sideKey(cur, n)]?.road) continue;
      road.add(n);
      stack.push(n);
    }
  }
  // 2) Overland trace of limited length from the road net.
  const dist = new Map<HexId, number>();
  const queue: HexId[] = [];
  for (const h of road) {
    dist.set(h, 0);
    queue.push(h);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= RULES.supply.overlandHexes) continue;
    for (const n of neighbors(cur)) {
      if (dist.has(n) || !passable(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }
  return new Set(dist.keys());
}

export function salernoPortOpen(s: GameState): boolean {
  for (const u of Object.values(s.units)) {
    if (u.where.kind === 'map' && sideOf(u) === 'German' && distance(u.where.hex, '2707') <= RULES.supply.salernoPortOpenRadius) {
      return false;
    }
  }
  return true;
}
