import { MAP, RULES } from './data';
import { isAdjacent, neighbors, sideKey, type HexId } from './hex';
import type { GameState, MoveMode, UnitState } from './types';
import { canStack, def, occupancy, other, sideOf, values, zocOf } from './units';

export const STOPPED = 1e9;

export function isLand(hex: HexId): boolean {
  const h = MAP.hexes[hex];
  return !!h && h.terrain !== 'sea';
}

export function weatherBox(s: GameState) {
  return RULES.weather.track[s.weather];
}

/** Movement allowance for this phase, before anything is spent. */
export function movementAllowance(s: GameState, u: UnitState, mode: MoveMode): number {
  let ma = values(u).move;
  const side = sideOf(u);
  if (s.turn === 1 && side === 'German') ma = Math.floor(ma * RULES.movement.turn1GermanMaFactor);
  if (u.disrupted) ma = Math.floor(ma / 2);
  if (mode === 'strategic') ma *= RULES.movement.strategicMultiplier;
  return ma;
}

/**
 * Cost for `u` to cross from `from` into adjacent `to`, or null if the move is
 * prohibited. Ignores zones of control and occupancy (handled by the search).
 */
export function stepCost(s: GameState, u: UnitState, from: HexId, to: HexId, mode: MoveMode): number | null {
  const dest = MAP.hexes[to];
  if (!dest || dest.terrain === 'sea' || !isAdjacent(from, to)) return null;
  const d = def(u.id);
  const side = d.side;
  const hs = MAP.hexsides[sideKey(from, to)] ?? {};
  const rain = !!weatherBox(s).rain;
  const m = RULES.movement;
  if (hs.road) {
    if (hs.road === 'major') {
      if (side === 'Allied' && dest.sector8 && MAP.hexes[from]?.sector8) return m.eighthArmyRoadCost;
      return m.majorRoadCost;
    }
    return m.minorRoadCost;
  }
  if (mode === 'strategic') return null;
  const table = d.vehicle ? m.vehicleTerrainCost : m.terrainCost;
  let cost = dest.city ? table.clear : table[dest.terrain] ?? 1;
  if (hs.river) cost += d.vehicle ? m.vehicleRiverCost : m.riverCost;
  if (hs.mountain) {
    if (hs.pass) cost += m.passCost;
    else if (d.vehicle && m.vehicleMountainProhibited) return null;
    else cost += m.mountainCost;
  }
  if (rain && d.vehicle) cost += m.rainVehicleExtra;
  return cost;
}

export interface Reach {
  cost: number;
  prev: HexId | null;
  /** True if the unit must stop here (entered an enemy zone of control). */
  stop: boolean;
}

/**
 * All hexes the unit can reach this phase from `start` with `spent` MP already
 * used. Uses Dijkstra over movement costs with zone-of-control stops.
 */
export function reachable(
  s: GameState,
  u: UnitState,
  start: HexId,
  spent: number,
  mode: MoveMode,
): Map<HexId, Reach> {
  const side = sideOf(u);
  const ma = movementAllowance(s, u, mode);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const out = new Map<HexId, Reach>();
  out.set(start, { cost: spent, prev: null, stop: false });
  const startInZoc = ezoc.has(start);
  if (mode === 'strategic' && startInZoc) return out;
  const fresh = u.mpSpent === null;
  const frontier: HexId[] = [start];
  while (frontier.length) {
    frontier.sort((a, b) => out.get(a)!.cost - out.get(b)!.cost);
    const cur = frontier.shift()!;
    const here = out.get(cur)!;
    if (here.stop) continue;
    const curInZoc = ezoc.has(cur);
    for (const n of neighbors(cur)) {
      if (occ.get(n) === other(side)) continue;
      let c = stepCost(s, u, cur, n, mode);
      if (c === null) continue;
      const nInZoc = ezoc.has(n);
      if (mode === 'strategic' && nInZoc) continue;
      if (curInZoc && nInZoc) continue; // no zone-to-zone moves
      if (curInZoc && cur === start) c += RULES.movement.exitZocCost;
      const total = here.cost + c;
      // Minimum move: a fresh unit may always move a single hex.
      const minMove = fresh && cur === start && spent === 0;
      if (total > ma && !minMove) continue;
      const prev = out.get(n);
      if (prev && prev.cost <= total) continue;
      out.set(n, { cost: minMove && total > ma ? ma : total, prev: cur, stop: nInZoc });
      frontier.push(n);
    }
  }
  return out;
}

/** Legal destinations for a move, filtered for stacking at the end hex. */
export function legalDestinations(s: GameState, unitId: string, mode: MoveMode): Map<HexId, Reach> {
  const u = s.units[unitId];
  const res = new Map<HexId, Reach>();
  if (!u || u.where.kind !== 'map') return res;
  if (u.mpSpent !== null && u.mpSpent >= STOPPED) return res;
  if (u.mpSpent !== null && u.strategic !== (mode === 'strategic')) return res;
  const r = reachable(s, u, u.where.hex, u.mpSpent ?? 0, mode);
  for (const [h, v] of r) {
    if (h === u.where.hex) continue;
    if (!canStack(s, h, unitId)) continue;
    res.set(h, v);
  }
  return res;
}

/** Destinations for a unit entering from an off-map entry area. */
export function entryDestinations(s: GameState, unitId: string, area: string, mode: MoveMode): Map<HexId, Reach> {
  const u = s.units[unitId];
  const res = new Map<HexId, Reach>();
  const ea = MAP.entryAreas[area];
  if (!ea) return res;
  const occ = occupancy(s);
  const side = sideOf(u);
  const ezoc = zocOf(s, other(side));
  for (const h of ea.hexes) {
    if (!isLand(h) || occ.get(h) === other(side)) continue;
    if (mode === 'strategic' && ezoc.has(h)) continue;
    const entryCost = 1;
    if (!res.has(h) || res.get(h)!.cost > entryCost) res.set(h, { cost: entryCost, prev: null, stop: ezoc.has(h) });
    if (ezoc.has(h)) continue;
    const r = reachable(s, { ...u, mpSpent: entryCost }, h, entryCost, mode);
    for (const [k, v] of r) {
      if (!res.has(k) || res.get(k)!.cost > v.cost) res.set(k, v);
    }
  }
  for (const k of [...res.keys()]) if (!canStack(s, k, unitId)) res.delete(k);
  return res;
}

export function pathTo(r: Map<HexId, Reach>, to: HexId): HexId[] {
  const path: HexId[] = [];
  let cur: HexId | null = to;
  while (cur) {
    path.unshift(cur);
    cur = r.get(cur)?.prev ?? null;
  }
  return path;
}
