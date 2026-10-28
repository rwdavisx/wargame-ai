import { MAP, RULES } from './data';
import { isAdjacent, neighbors, sideKey, type HexId } from './hex';
import type { GameState, MoveMode, UnitState } from './types';
import { canStack, def, friendsAt, isLand, occupancy, other, sideOf, values } from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';

export { isLand };

export function weatherBox(s: GameState) {
  return RULES.weather.track[s.weather];
}

export interface Reach {
  cost: number;
  hexes: number;
  prev: HexId | null;
  stop: boolean;
  halfEff: boolean;
}

/** Why a unit cannot move at all this phase, or null if it can. */
export function cannotMove(s: GameState, u: UnitState): string | null {
  const d = def(u.id);
  if (u.frozenUntil && s.turn < u.frozenUntil) return `frozen until turn ${u.frozenUntil}`;
  if (u.stopped) return 'has finished moving';
  if (u.autoDs) return 'is committed to an Auto DS';
  if (d.cat === 'bh') return 'beachhead units never move';
  if (values(u).move <= 0) return 'has no movement allowance';
  return null;
}

export const isTruck = (mode: MoveMode) => mode === 'truck' || mode === 'truckExtended';
export const isExtended = (mode: MoveMode) => mode === 'extended' || mode === 'truckExtended';

/** Up to two German non-mechanized units in supply and in Good Order may ride trucks each turn (5.8). */
function truckOk(s: GameState, u: UnitState): boolean {
  return sideOf(u) === 'German' && !def(u.id).mech && !def(u.id).vehicle && !u.outOfSupply && s.trucksUsed < 2 && u.status === 'good';
}

/** Modes for a unit entering from an Entry Area. */
export function entryModes(s: GameState, u: UnitState): MoveMode[] {
  if (s.turn === 1 && sideOf(u) === 'Allied') return ['tactical'];
  if (u.repl) return ['tactical']; // one hex at most (20.4)
  const modes: MoveMode[] = ['normal', 'extended', 'tactical'];
  if (truckOk(s, u)) modes.push('truck', 'truckExtended');
  return modes;
}

/** Movement modes this unit may use right now. */
export function allowedModes(s: GameState, u: UnitState): MoveMode[] {
  const d = def(u.id);
  if (u.moveMode === 'tactical') return ['tactical']; // continuing a landing
  if (u.repl) return ['tactical'];
  if (s.turn === 1 && sideOf(u) === 'Allied') return ['tactical'];
  if (u.status === 'disrupted') return ['tactical'];
  if (u.outOfSupply && d.mech) return ['tactical'];
  const modes: MoveMode[] = ['normal', 'extended', 'tactical'];
  if (truckOk(s, u)) modes.push('truck', 'truckExtended');
  return modes;
}

export function movementAllowance(s: GameState, u: UnitState, mode: MoveMode): number {
  let ma = isTruck(mode) ? 5 : values(u).move;
  if (s.turn === 1 && sideOf(u) === 'German') ma = Math.ceil(ma / 2);
  if (isExtended(mode)) ma += RULES.movement.extendedBonus;
  return ma;
}

interface StepInfo {
  cost: number;
  /** Crossing allowed only as the first hex of a tactical move (earns ½ Eff). */
  firstHexOnly: boolean;
  mountainCrossing: boolean;
}

/** Cost for `u` to move from `from` into adjacent `to` (ignoring units and ZOCs), or null if prohibited. */
export function stepCost(s: GameState, u: UnitState, from: HexId, to: HexId, mode: MoveMode): StepInfo | null {
  const dest = MAP.hexes[to];
  if (!dest || dest.terrain === 'sea' || !isAdjacent(from, to)) return null;
  const d = def(u.id);
  // Trucked infantry moves at mechanized rates but is still infantry for rivers and mountains (5.8).
  const mech = isTruck(mode) || d.mech;
  const key = mech ? 'mech' : 'inf';
  const hs = MAP.hexsides[sideKey(from, to)] ?? {};
  const m = RULES.movement;
  if (hs.road) {
    let cost = (hs.road === 'major' ? m.majorRoad : m.minorRoad)[key];
    if (mech && sideOf(u) === 'Allied' && dest.sector8) cost = m.alliedMechRoadIn8thSector;
    return { cost, firstHexOnly: false, mountainCrossing: false };
  }
  const terrain = dest.city ? 'city' : dest.terrain;
  let cost = m.terrain[terrain]?.[key] ?? 1;
  let firstHexOnly = false;
  let mountainCrossing = false;
  if (hs.mountain && !hs.pass) {
    if (d.vehicle) return null;
    firstHexOnly = true;
    mountainCrossing = true;
  } else if (hs.pass) {
    cost += m.pass[key];
  }
  if (hs.river) {
    if (d.vehicle) {
      if (weatherBox(s).rain) return null;
      firstHexOnly = true;
    } else cost += m.riverInf;
  }
  return { cost, firstHexOnly, mountainCrossing };
}

/** All hexes the unit can reach with this move. */
export function reachable(s: GameState, u: UnitState, start: HexId, mode: MoveMode, fromEntry = false): Map<HexId, Reach> {
  const side = sideOf(u);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const bonds = bondsOf(s, other(side));
  const tactical = mode === 'tactical';
  const maxHexes = u.repl ? 1 : RULES.movement.tacticalHexes - (u.moveMode === 'tactical' ? u.tacHexes : 0);
  const ma = movementAllowance(s, u, mode);
  const fullRetreat = u.status === 'fullRetreat';
  const extended = isExtended(mode);
  // Enemy units in Full Retreat have no ZOC but still bar Extended Movement next to them (13.3.3).
  const frAdjacent = new Set<HexId>();
  if (extended) {
    for (const e of Object.values(s.units)) {
      if (e.where.kind === 'map' && sideOf(e) !== side && e.status === 'fullRetreat') for (const n of neighbors(e.where.hex)) frAdjacent.add(n);
    }
  }
  const fresh = u.mpSpent === null && u.tacHexes === 0 && !fromEntry;
  const out = new Map<HexId, Reach>();
  out.set(start, { cost: 0, hexes: 0, prev: null, stop: false, halfEff: false });
  const startInZoc = !fromEntry && ezoc.has(start);
  const frontier: HexId[] = [start];
  while (frontier.length) {
    frontier.sort((a, b) => out.get(a)!.cost - out.get(b)!.cost || out.get(a)!.hexes - out.get(b)!.hexes);
    const cur = frontier.shift()!;
    const here = out.get(cur)!;
    if (here.stop) continue;
    const curInZoc = cur === start ? startInZoc : ezoc.has(cur);
    for (const n of neighbors(cur)) {
      if (occ.get(n) === other(side)) continue;
      if (blockedByBond(bonds, cur, n)) continue;
      const step = stepCost(s, u, cur, n, mode);
      if (!step) continue;
      if (step.firstHexOnly && !(tactical && cur === start && fresh)) continue;
      if (step.mountainCrossing && u.crossedMountain) continue;
      const nInZoc = ezoc.has(n);
      if (fullRetreat && nInZoc && !friendsAt(s, n, side).some((f) => f.status !== 'fullRetreat')) continue;
      if (extended && (nInZoc || frAdjacent.has(n))) continue;
      if (extended && curInZoc && cur !== start) continue;
      // Units in Full Retreat may not enter enemy-controlled cities (13.3.2).
      if (fullRetreat && MAP.hexes[n].city && (s.control[n] ?? 'German') !== side) continue;
      let cost = here.cost;
      let hexes = here.hexes + 1;
      if (tactical) {
        if (hexes > maxHexes) continue;
      } else {
        cost += step.cost;
        if (curInZoc && !(fullRetreat && cur === start)) cost += RULES.movement.exitEzoc;
        if (cost > ma + 1e-9) continue;
        if (u.repl && hexes > 1) continue;
      }
      const prev = out.get(n);
      if (prev && (prev.cost < cost || (prev.cost === cost && prev.hexes <= hexes))) continue;
      out.set(n, { cost, hexes, prev: cur, stop: nInZoc, halfEff: here.halfEff || step.firstHexOnly });
      frontier.push(n);
    }
  }
  return out;
}

/** Legal destinations for a unit on the map (stacking checked at the end hex). */
export function legalDestinations(s: GameState, unitId: string, mode: MoveMode): Map<HexId, Reach> {
  const u = s.units[unitId];
  const res = new Map<HexId, Reach>();
  if (!u || u.where.kind !== 'map' || cannotMove(s, u) || !allowedModes(s, u).includes(mode)) return res;
  const r = reachable(s, u, u.where.hex, mode);
  for (const [h, v] of r) {
    if (h === u.where.hex) continue;
    if (!canStack(s, h, [unitId])) continue;
    res.set(h, v);
  }
  return res;
}

/** Destinations for a unit entering from an off-map entry area: it pays the first hex's terrain cost. */
export function entryDestinations(s: GameState, unitId: string, area: string, mode: MoveMode): Map<HexId, Reach> {
  const u = s.units[unitId];
  const res = new Map<HexId, Reach>();
  const ea = MAP.entryAreas[area];
  if (!ea || u.status === 'disrupted' || u.status === 'fullRetreat') return res;
  if (u.frozenUntil && s.turn < u.frozenUntil) return res;
  const side = sideOf(u);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const ma = movementAllowance(s, u, mode);
  const bonds = bondsOf(s, other(side));
  // While Allied units are in N1/N2, Germans may only come out into hexes free of Allied ZOC (23.1.4).
  const alliedInArea = side === 'German' && (area === 'N1' || area === 'N2') &&
    Object.values(s.units).some((x) => x.where.kind === 'entry' && x.where.area === area && sideOf(x) === 'Allied');
  for (const h of ea.hexes) {
    if (!isLand(h) || occ.get(h) === other(side)) continue;
    if (bonds.hexes.has(h)) continue; // may not enter an enemy ZOC Bond as they enter (21.3.3)
    if (alliedInArea && ezoc.has(h)) continue;
    if (isExtended(mode) && ezoc.has(h)) continue;
    // Entering costs the first hex's terrain (road rate if the road runs off the map edge).
    const edgeRoad = Object.keys(MAP.hexsides).some((k) => k.includes(h) && MAP.hexsides[k].road);
    const mech = isTruck(mode) || def(unitId).mech;
    const terrain = MAP.hexes[h].city ? 'city' : MAP.hexes[h].terrain;
    const firstCost = mode === 'tactical' ? 0 : edgeRoad ? (mech ? RULES.movement.majorRoad.mech : 1) : RULES.movement.terrain[terrain]?.[mech ? 'mech' : 'inf'] ?? 1;
    if (mode !== 'tactical' && firstCost > ma) continue;
    const here: Reach = { cost: firstCost, hexes: 1, prev: null, stop: ezoc.has(h), halfEff: false };
    if (!res.has(h) || res.get(h)!.cost > here.cost) res.set(h, here);
    if (here.stop || u.repl) continue;
    const ghost: UnitState = { ...u, mpSpent: firstCost, tacHexes: 1, moveMode: mode, where: { kind: 'map', hex: h } };
    const r = reachable(s, ghost, h, mode, true);
    for (const [k, v] of r) {
      if (k === h) continue;
      const total: Reach = { ...v, cost: v.cost + firstCost, hexes: v.hexes + 1, prev: v.prev ?? h };
      if (mode !== 'tactical' && total.cost > ma + 1e-9) continue;
      if (mode === 'tactical' && total.hexes > RULES.movement.tacticalHexes) continue;
      if (!res.has(k) || res.get(k)!.cost > total.cost) res.set(k, total);
    }
  }
  for (const k of [...res.keys()]) if (!canStack(s, k, [unitId])) res.delete(k);
  return res;
}

export function pathTo(r: Map<HexId, Reach>, to: HexId): HexId[] {
  const path: HexId[] = [];
  let cur: HexId | null = to;
  const seen = new Set<HexId>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.unshift(cur);
    cur = r.get(cur)?.prev ?? null;
  }
  return path;
}
