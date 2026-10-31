import { MAP, RULES } from './data';
import { hexId, isAdjacent, neighborSides, neighbors, parseHex, sideKey, type HexId } from './hex';
import type { GameState, HexsideData, MoveMode, UnitDef, UnitState, Side } from './types';
import { canStack, def, friendsAt, isLand, occupancy, other, sideOf, values } from './units';
import { bondsOf, zocOf } from './zoc';
import { memo } from './memo';

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
  if (u.garrison && u.frozenUntil && s.turn < u.frozenUntil) return `on garrison duty in ${u.garrison}`;
  if (u.frozenUntil && s.turn < u.frozenUntil) return u.frozenUntil >= 99 ? 'frozen until the enemy comes close' : `frozen until turn ${u.frozenUntil}`;
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
  if (s.turn === 1 && RULES.movement.turn1AlliedTacticalOnly && sideOf(u) === 'Allied') return ['tactical'];
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
  if (s.turn === 1 && RULES.movement.turn1AlliedTacticalOnly && sideOf(u) === 'Allied') return ['tactical'];
  if (u.status === 'disrupted') return ['tactical'];
  if (u.outOfSupply && d.mech) return ['tactical'];
  const modes: MoveMode[] = ['normal', 'extended', 'tactical'];
  if (truckOk(s, u)) modes.push('truck', 'truckExtended');
  return modes;
}

export function movementAllowance(s: GameState, u: UnitState, mode: MoveMode): number {
  let ma = isTruck(mode) ? 5 : values(u).move;
  if (s.turn === 1 && RULES.movement.turn1GermanHalfMa && sideOf(u) === 'German') ma = Math.ceil(ma / 2);
  if (isExtended(mode)) ma += def(u.id).mech ? RULES.movement.extendedBonus.mech : RULES.movement.extendedBonus.nonMech;
  return ma;
}

interface StepInfo {
  cost: number;
  /** Crossing allowed only as the first hex of a tactical move (earns ½ Eff). */
  firstHexOnly: boolean;
  mountainCrossing: boolean;
  /** Entering the hex ends the move (Italy '43: marsh off the road). */
  stop?: boolean;
}

/** Hexes within `radius` of a unit of the side other than `side` (for Operational Movement). */
function nearEnemy(s: GameState, side: Side, radius: number): Set<HexId> {
  return memo(s, `near:${side}:${radius}`, () => {
    const out = new Set<HexId>();
    for (const e of Object.values(s.units)) {
      if (e.where.kind !== 'map' || sideOf(e) === side) continue;
      const ring = [e.where.hex];
      out.add(e.where.hex);
      for (let r = 0; r < radius; r++) {
        for (const h of ring.splice(0)) for (const n of neighbors(h)) if (!out.has(n)) { out.add(n); ring.push(n); }
      }
    }
    return out;
  });
}

/** Hexes next to an enemy unit in Full Retreat, which have no ZOC but still bar Extended Movement (13.3.3). */
function nextToRouted(s: GameState, side: Side): Set<HexId> {
  return memo(s, `routed:${side}`, () => {
    const out = new Set<HexId>();
    for (const e of Object.values(s.units)) {
      if (e.where.kind === 'map' && sideOf(e) !== side && e.status === 'fullRetreat') for (const n of neighbors(e.where.hex)) out.add(n);
    }
    return out;
  });
}

/** Italy '43's 8th Army zone (5.8): no Allied unit may enter it, and German units only its sections not yet handed over. */
export function zoneClosed(s: GameState, side: Side, hex: HexId): boolean {
  const z = MAP.hexes[hex]?.zone8;
  if (!z) return false;
  if (side === 'Allied') return true;
  const turn = RULES.eighthArmyZone[z];
  return turn !== undefined && s.turn >= turn;
}

/** Cost for `u` to move from `from` into adjacent `to` (ignoring units and ZOCs), or null if prohibited. */
export function stepCost(s: GameState, u: UnitState, from: HexId, to: HexId, mode: MoveMode, near?: Set<HexId>): StepInfo | null {
  if (!isAdjacent(from, to)) return null;
  const d = def(u.id);
  return stepInto(s, sideOf(u), d, isTruck(mode) || d.mech, to, MAP.hexsides[sideKey(from, to)] ?? NO_SIDE, weatherBox(s).rain, near);
}

const NO_SIDE: HexsideData = {};

/** The step's cost from what the search already knows: the mover's side and counter, whether it moves at mechanized
 * rates (trucked infantry does, but is still infantry for rivers and mountains, 5.8), the hexside and the rain. */
function stepInto(s: GameState, side: Side, d: UnitDef, mech: boolean, to: HexId, hs: HexsideData, rain: boolean | undefined, near?: Set<HexId>): StepInfo | null {
  const dest = MAP.hexes[to];
  if (!dest || dest.terrain === 'sea') return null;
  if (zoneClosed(s, side, to)) return null;
  const key = mech ? 'mech' : 'inf';
  const m = RULES.movement;
  if (hs.allSea || hs.lake) return null; // an all-sea hexside (a lake hexside is one too)
  if (hs.road) {
    let cost = (hs.road === 'major' ? m.majorRoad : m.minorRoad)[key];
    if (mech && side === 'Allied' && dest.sector8) cost = m.alliedMechRoadIn8thSector;
    // Operational Movement: near the enemy the road rate is 1 MP a hex (5.2.2).
    if (mech && m.operationalRadius && (near ?? nearEnemy(s, side, m.operationalRadius)).has(to)) cost = Math.max(cost, 1);
    return { cost, firstHexOnly: false, mountainCrossing: false };
  }
  const terrain = dest.city ? 'city' : dest.terrain;
  let cost = m.terrain[terrain]?.[key] ?? 1;
  let firstHexOnly = false;
  let mountainCrossing = false;
  if (hs.mountain && !hs.pass) {
    if (d.vehicle) return null;
    // Mountain infantry cross as part of any move (19.3).
    if (!d.mountain) {
      firstHexOnly = true;
      mountainCrossing = true;
    }
  } else if (hs.pass) {
    cost += m.pass[key];
  }
  if (hs.river && m.minorRiver) {
    // Italy '43: vehicles may not cross an unbridged river in rain (5.9); a major river only as a first hex (5.5).
    if (d.vehicle && rain) return null;
    if (hs.majorRiver) firstHexOnly = true;
    else cost += m.minorRiver[key];
  } else if (hs.river) {
    if (d.vehicle) {
      if (rain) return null;
      firstHexOnly = true;
    } else cost += m.riverInf;
  }
  const stop = m.marshStops && dest.terrain === 'marsh';
  return { cost, firstHexOnly, mountainCrossing, stop };
}

// ------------------------------------------------------------------ the route search
// Hexes are numbered once per map so the search can keep its labels in flat arrays rather than in maps keyed by hex
// id: it is the engine's innermost loop (the AI runs it thousands of times a turn).

interface Grid {
  map: unknown;
  ids: HexId[];
  index: Map<HexId, number>;
  /** Six slots per hex: the neighbour's number (-1: off the map) and the hexside's key. */
  nbr: Int32Array;
  side: string[];
}
let GRID: Grid | null = null;

/** Forget the hex numbering and the step tables (the map's hexes or hexsides were changed). */
export function invalidateGrid(): void {
  GRID = null;
  TABLES.clear();
}

function grid(): Grid {
  if (GRID && GRID.map === MAP) return GRID;
  TABLES.clear();
  // Every hex of the map's bounding box and a hex beyond, so a hex added later (the map editor) is numbered too;
  // whether a hex is on the map is read from the map itself at each step.
  let c0 = 99, c1 = 0, r0 = 99, r1 = 0;
  for (const h of Object.keys(MAP.hexes)) {
    const { c, r } = parseHex(h);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
  }
  const ids: HexId[] = [];
  for (let c = Math.max(0, c0 - 1); c <= Math.min(99, c1 + 1); c++) for (let r = Math.max(0, r0 - 1); r <= Math.min(99, r1 + 1); r++) ids.push(hexId(c, r));
  const index = new Map(ids.map((h, i) => [h, i]));
  const nbr = new Int32Array(ids.length * 6).fill(-1);
  const side: string[] = new Array(ids.length * 6).fill('');
  ids.forEach((h, i) => {
    const ns = neighbors(h);
    const ks = neighborSides(h);
    for (let k = 0; k < ns.length; k++) {
      nbr[i * 6 + k] = index.get(ns[k]) ?? -1;
      side[i * 6 + k] = ks[k];
    }
  });
  GRID = { map: MAP, ids, index, nbr, side };
  return GRID;
}

/** What each step costs a kind of unit, per hexside (six slots per hex): the cost (-1: prohibited) and its flags
 * (1 first hex only, 2 a mountain crossing, 4 ends the move, 8 a mechanized road step Operational Movement may slow).
 * A step's cost depends only on the hexes, the hexside, the unit's kind, the turn (the 8th Army zone) and the rain. */
interface StepTable {
  cost: Float64Array;
  flag: Uint8Array;
}
const TABLES = new Map<string, StepTable>();
let TABLES_RULES: unknown = null;
const NO_HEXES = new Set<HexId>();

function stepTable(s: GameState, g: Grid, side: Side, d: UnitDef, mech: boolean, rain: boolean | undefined): StepTable {
  if (TABLES_RULES !== RULES) {
    TABLES.clear();
    TABLES_RULES = RULES;
  }
  const key = `${s.turn}|${side}|${mech ? 1 : 0}${d.vehicle ? 1 : 0}${d.mountain ? 1 : 0}${rain ? 1 : 0}`;
  const hit = TABLES.get(key);
  if (hit) return hit;
  if (TABLES.size > 64) TABLES.clear();
  const n6 = g.ids.length * 6;
  const cost = new Float64Array(n6).fill(-1);
  const flag = new Uint8Array(n6);
  const op = !!RULES.movement.operationalRadius;
  for (let e = 0; e < n6; e++) {
    const n = g.nbr[e];
    if (n < 0) continue;
    const hs = MAP.hexsides[g.side[e]] ?? NO_SIDE;
    const c = stepFlags(s, side, d, mech, g.ids[n], hs, rain, NO_HEXES);
    cost[e] = c;
    if (c >= 0) flag[e] = (STEP_FIRST ? 1 : 0) | (STEP_MTN ? 2 : 0) | (STEP_STOP ? 4 : 0) | (mech && hs.road && op ? 8 : 0);
  }
  const t = { cost, flag };
  TABLES.set(key, t);
  return t;
}

/** A set of hexes as a flag per hex number, worked out once per state while the AI thinks. */
function flags(s: GameState, key: string, g: Grid, hexes: () => Iterable<HexId>): Uint8Array {
  return memo(s, `flags:${key}`, () => {
    const f = new Uint8Array(g.ids.length);
    for (const h of hexes()) {
      const i = g.index.get(h);
      if (i !== undefined) f[i] = 1;
    }
    return f;
  });
}

// Scratch space for one search, reused: labels per hex number, valid where `seen` holds the search's number.
let SEEN = new Int32Array(0);
let COST = new Float64Array(0);
let HEXES = new Int32Array(0);
let HALF = new Uint8Array(0);
let STOP = new Uint8Array(0);
let PREV = new Int32Array(0);
let RUN = 0;
// The heap of labels to expand: cost, then hexes and the ½ Eff flag packed as hexes * 2 + flag, then hex number.
let HC = new Float64Array(256);
let HK = new Int32Array(256);
let HI = new Int32Array(256);

/** The step's flags, set by `stepFlags` alongside the cost it returns. */
let STEP_FIRST = false;
let STEP_MTN = false;
let STEP_STOP = false;

/** `stepInto` without the allocation: the cost, or -1 if the step is prohibited; its flags in STEP_*. Keep the two
 * in step. */
function stepFlags(s: GameState, side: Side, d: UnitDef, mech: boolean, to: HexId, hs: HexsideData, rain: boolean | undefined, near?: Set<HexId>): number {
  const dest = MAP.hexes[to];
  if (!dest || dest.terrain === 'sea') return -1;
  if (dest.zone8 && zoneClosed(s, side, to)) return -1;
  if (hs.allSea || hs.lake) return -1;
  const m = RULES.movement;
  STEP_FIRST = false;
  STEP_MTN = false;
  STEP_STOP = false;
  if (hs.road) {
    let cost = mech ? (hs.road === 'major' ? m.majorRoad : m.minorRoad).mech : (hs.road === 'major' ? m.majorRoad : m.minorRoad).inf;
    if (mech && side === 'Allied' && dest.sector8) cost = m.alliedMechRoadIn8thSector;
    if (mech && m.operationalRadius && (near ?? nearEnemy(s, side, m.operationalRadius)).has(to)) cost = Math.max(cost, 1);
    return cost;
  }
  const key = mech ? 'mech' : 'inf';
  const terrain = dest.city ? 'city' : dest.terrain;
  let cost = m.terrain[terrain]?.[key] ?? 1;
  if (hs.mountain && !hs.pass) {
    if (d.vehicle) return -1;
    if (!d.mountain) {
      STEP_FIRST = true;
      STEP_MTN = true;
    }
  } else if (hs.pass) {
    cost += m.pass[key];
  }
  if (hs.river && m.minorRiver) {
    if (d.vehicle && rain) return -1;
    if (hs.majorRiver) STEP_FIRST = true;
    else cost += m.minorRiver[key];
  } else if (hs.river) {
    if (d.vehicle) {
      if (rain) return -1;
      STEP_FIRST = true;
    } else cost += m.riverInf;
  }
  STEP_STOP = !!(m.marshStops && dest.terrain === 'marsh');
  return cost;
}

/** All hexes the unit can reach with this move, each by its cheapest route (then the shortest, then one without a
 * ½ Eff crossing where there is a choice). */
export function reachable(s: GameState, u: UnitState, start: HexId, mode: MoveMode, fromEntry = false): Map<HexId, Reach> {
  const out = new Map<HexId, Reach>();
  const visited = search(s, u, start, mode, fromEntry);
  if (!visited) {
    out.set(start, { cost: 0, hexes: 0, prev: null, stop: false, halfEff: false });
    return out;
  }
  const ids = grid().ids;
  for (const i of visited) {
    out.set(ids[i], { cost: COST[i], hexes: HEXES[i], prev: PREV[i] < 0 ? null : ids[PREV[i]], stop: STOP[i] === 1, halfEff: HALF[i] === 1 });
  }
  return out;
}

/** The hexes `reachable` would return, added to `into` (for callers that need only where, not how). */
export function reachableInto(s: GameState, u: UnitState, start: HexId, mode: MoveMode, into: Set<HexId>): void {
  const visited = search(s, u, start, mode, false);
  if (!visited) {
    into.add(start);
    return;
  }
  const ids = grid().ids;
  for (const i of visited) into.add(ids[i]);
}

/** The search itself: the hex numbers reached, their labels left in the scratch arrays (null: start not numbered). */
function search(s: GameState, u: UnitState, start: HexId, mode: MoveMode, fromEntry: boolean): number[] | null {
  const g = grid();
  const n0 = g.ids.length;
  if (SEEN.length !== n0) {
    SEEN = new Int32Array(n0);
    COST = new Float64Array(n0);
    HEXES = new Int32Array(n0);
    HALF = new Uint8Array(n0);
    STOP = new Uint8Array(n0);
    PREV = new Int32Array(n0);
    RUN = 0;
  }
  const run = ++RUN;
  const side = sideOf(u);
  const enemy = other(side);
  const occ = occupancy(s);
  const enemyAt = flags(s, `occ:${enemy}`, g, () => [...occ].filter(([, v]) => v === enemy).map(([h]) => h));
  const ezocSet = zocOf(s, enemy);
  const ezoc = flags(s, `zoc:${enemy}`, g, () => ezocSet);
  const bonds = bondsOf(s, enemy);
  const bondHex = flags(s, `bondHex:${enemy}`, g, () => bonds.hexes);
  const tactical = mode === 'tactical';
  const maxHexes = u.repl ? 1 : RULES.movement.tacticalHexes - (u.moveMode === 'tactical' ? u.tacHexes : 0);
  const ma = movementAllowance(s, u, mode);
  const fullRetreat = u.status === 'fullRetreat';
  const extended = isExtended(mode);
  const frAdjacent = extended ? flags(s, `routed:${side}`, g, () => nextToRouted(s, side)) : null;
  const fresh = u.mpSpent === null && u.tacHexes === 0 && !fromEntry;
  // Where Operational Movement slows the roads, worked out once for the whole search.
  const near = RULES.movement.operationalRadius ? nearEnemy(s, side, RULES.movement.operationalRadius) : undefined;
  const exitEzoc = RULES.movement.exitEzoc;
  const d = def(u.id);
  const mech = isTruck(mode) || d.mech;
  const rain = weatherBox(s).rain;
  const crossed = !!u.crossedMountain;
  const table = stepTable(s, g, side, d, mech, rain);
  const bondSides = bonds.sides.size > 0;
  const halfNow = !!u.halfEff;
  const repl = !!u.repl;
  const si = g.index.get(start);
  if (si === undefined) return null;
  const visited: number[] = [si];
  SEEN[si] = run;
  COST[si] = 0;
  HEXES[si] = 0;
  HALF[si] = 0;
  STOP[si] = 0;
  PREV[si] = -1;
  const startInZoc = !fromEntry && ezoc[si] === 1;
  let hn = 0;
  const push = (c: number, k: number, i: number) => {
    if (hn === HC.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T, make: (n: number) => T) => { const b = make(a.length * 2); b.set(a); return b; };
      HC = grow(HC, (n) => new Float64Array(n));
      HK = grow(HK, (n) => new Int32Array(n));
      HI = grow(HI, (n) => new Int32Array(n));
    }
    let j = hn++;
    while (j > 0) {
      const p = (j - 1) >> 1;
      if (!(c < HC[p] || (c === HC[p] && k < HK[p]))) break;
      HC[j] = HC[p];
      HK[j] = HK[p];
      HI[j] = HI[p];
      j = p;
    }
    HC[j] = c;
    HK[j] = k;
    HI[j] = i;
  };
  push(0, 0, si);
  while (hn) {
    // Pop the best label.
    const ec = HC[0];
    const ek = HK[0];
    const cur = HI[0];
    hn--;
    if (hn) {
      const c = HC[hn];
      const k = HK[hn];
      const i = HI[hn];
      let j = 0;
      for (;;) {
        const l = 2 * j + 1;
        if (l >= hn) break;
        const r = l + 1;
        let m = l;
        if (r < hn && (HC[r] < HC[l] || (HC[r] === HC[l] && HK[r] < HK[l]))) m = r;
        if (!(HC[m] < c || (HC[m] === c && HK[m] < k))) break;
        HC[j] = HC[m];
        HK[j] = HK[m];
        HI[j] = HI[m];
        j = m;
      }
      HC[j] = c;
      HK[j] = k;
      HI[j] = i;
    }
    // A label already bettered is stale.
    if (COST[cur] !== ec || HEXES[cur] * 2 + HALF[cur] !== ek) continue;
    if (STOP[cur]) continue;
    const isStart = cur === si;
    const curInZoc = isStart ? startInZoc : ezoc[cur] === 1;
    if (extended && curInZoc && !isStart) continue;
    const hereCost = COST[cur];
    const hereHexes = HEXES[cur];
    const hereHalf = HALF[cur] === 1;
    for (let k = 0; k < 6; k++) {
      const e = cur * 6 + k;
      const n = g.nbr[e];
      if (n < 0) continue;
      let stepCostHere = table.cost[e];
      if (stepCostHere < 0) continue;
      if (enemyAt[n]) continue;
      // An enemy ZOC Bond may be neither entered nor crossed.
      if (bondHex[n] || (bondSides && bonds.sides.has(g.side[e]))) continue;
      const nInZoc = ezoc[n] === 1;
      if (extended && (nInZoc || frAdjacent![n])) continue;
      const nh = g.ids[n];
      const fl = table.flag[e];
      // Operational Movement: near the enemy the road rate is 1 MP a hex (5.2.2).
      if (fl & 8 && near?.has(nh)) stepCostHere = Math.max(stepCostHere, 1);
      const first = (fl & 1) !== 0;
      if (first && !(tactical && isStart && fresh)) continue;
      if (fl & 2 && crossed) continue;
      // No voluntary move that would earn a second 1/2 Eff marker the same turn (5.7).
      if (first && halfNow) continue;
      if (fullRetreat && nInZoc && !friendsAt(s, nh, side).some((f) => f.status !== 'fullRetreat')) continue;
      // Units in Full Retreat may not enter enemy-controlled cities (13.3.2).
      if (fullRetreat && MAP.hexes[nh].city && (s.control[nh] ?? 'German') !== side) continue;
      let cost = hereCost;
      const hexes = hereHexes + 1;
      if (tactical) {
        if (hexes > maxHexes) continue;
      } else {
        cost += stepCostHere;
        if (curInZoc && !(fullRetreat && isStart)) cost += exitEzoc;
        if (cost > ma + 1e-9) continue;
        if (repl && hexes > 1) continue;
      }
      const half = hereHalf || first;
      // Only a better label replaces the one the hex has.
      if (SEEN[n] === run && !(cost < COST[n] || (cost === COST[n] && (hexes < HEXES[n] || (hexes === HEXES[n] && !half && HALF[n] === 1))))) continue;
      if (SEEN[n] !== run) {
        SEEN[n] = run;
        visited.push(n);
      }
      COST[n] = cost;
      HEXES[n] = hexes;
      HALF[n] = half ? 1 : 0;
      STOP[n] = nInZoc || fl & 4 ? 1 : 0;
      PREV[n] = cur;
      push(cost, hexes * 2 + (half ? 1 : 0), n);
    }
  }
  return visited;
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
