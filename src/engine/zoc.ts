// Zones of control and ZOC Bonds.
import { MAP } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import type { GameState, Side } from './types';
import { def, goodOrder, isLand, occupancy, seaBetween, sideOf, unitsAt } from './units';

function crossesMountainWithoutRoad(a: HexId, b: HexId): boolean {
  const hs = MAP.hexsides[sideKey(a, b)];
  return !!hs?.mountain && !hs.road && !hs.pass;
}

function mountainWithoutRoad(a: HexId, b: HexId): boolean {
  const hs = MAP.hexsides[sideKey(a, b)];
  return !!hs?.mountain && !hs.road;
}

/** Hexes in the zone of control of `side`'s units. */
export function zocOf(s: GameState, side: Side): Set<HexId> {
  const z = new Set<HexId>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side || u.status === 'fullRetreat') continue;
    const vehicle = def(u.id).vehicle;
    for (const n of neighbors(u.where.hex)) {
      if (!isLand(n) || seaBetween(u.where.hex, n)) continue; // no ZOC across an all-sea hexside (6.1)
      if (vehicle && crossesMountainWithoutRoad(u.where.hex, n)) continue;
      z.add(n);
    }
  }
  return z;
}

export interface Bonds {
  hexes: Set<HexId>;
  sides: Set<string>;
}

/** ZOC Bonds formed by `side`. Enemy units may not enter `hexes` or cross `sides`. */
export function bondsOf(s: GameState, side: Side): Bonds {
  const occ = occupancy(s);
  const anchors = new Map<HexId, { vehicleOnly: boolean }>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side || !goodOrder(u)) continue;
    const d = def(u.id);
    if (d.silhouette || d.sp === 0) continue; // free-stacking units cannot form bonds
    const h = u.where.hex;
    const prev = anchors.get(h);
    anchors.set(h, { vehicleOnly: (prev ? prev.vehicleOnly : true) && d.vehicle });
  }
  const enemy = (h: HexId) => occ.get(h) !== undefined && occ.get(h) !== side;
  const legOk = (anchor: HexId, mid: HexId) =>
    !seaBetween(anchor, mid) && !(anchors.get(anchor)!.vehicleOnly && mountainWithoutRoad(anchor, mid));
  const routeOk = (a: HexId, c: HexId, b: HexId) =>
    isLand(c) && !enemy(c) && legOk(a, c) && legOk(b, c) &&
    // Two non-road mountain hexsides block a bond; a road-less pass does not help (7.6.1).
    !(mountainWithoutRoad(a, c) && mountainWithoutRoad(c, b));
  const out: Bonds = { hexes: new Set(), sides: new Set() };
  const list = [...anchors.keys()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (distance(a, b) !== 2) continue;
      const na = neighbors(a);
      const common = neighbors(b).filter((x) => na.includes(x));
      if (common.length === 1) {
        const c = common[0];
        if (occ.has(c)) continue; // needs a vacant intervening hex
        if (routeOk(a, c, b)) out.hexes.add(c);
      } else if (common.length === 2) {
        const [c1, c2] = common;
        if (enemy(c1) && enemy(c2)) continue; // broken
        if (routeOk(a, c1, b) || routeOk(a, c2, b)) out.sides.add(sideKey(c1, c2));
      }
    }
  }
  // A unit may anchor a Hexside Bond (not a Hex Bond) on a friendly Entry Area (7.5): the bond runs
  // between the two edge hexes of the area that both touch the unit's hex.
  for (const [name, ea] of Object.entries(MAP.entryAreas)) {
    if ((s.control[name] ?? 'German') !== side) continue;
    const edge = new Set(ea.hexes.filter(isLand));
    for (const a of list) {
      if (edge.has(a)) continue;
      const touching = neighbors(a).filter((n) => edge.has(n));
      for (let i = 0; i < touching.length; i++) {
        for (let j = i + 1; j < touching.length; j++) {
          const [c1, c2] = [touching[i], touching[j]];
          if (!neighbors(c1).includes(c2) || (enemy(c1) && enemy(c2))) continue;
          if (legOk(a, c1) || legOk(a, c2)) out.sides.add(sideKey(c1, c2));
        }
      }
    }
  }
  return out;
}

/** True if moving from `from` into `to` enters or crosses an enemy bond. */
export function blockedByBond(bonds: Bonds, from: HexId, to: HexId): boolean {
  return bonds.hexes.has(to) || bonds.sides.has(sideKey(from, to));
}

export function enemyAdjacent(s: GameState, hex: HexId, side: Side): boolean {
  return neighbors(hex).some((n) => unitsAt(s, n).some((u) => sideOf(u) !== side));
}
