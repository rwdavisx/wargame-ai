// Retreats, Full Retreat side effects and disengagement.
import { MAP } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { eliminate } from './losses';
import { areaFriendly } from './supply';
import type { GameState, Side, Status, UnitState } from './types';
import { def, isLand, occupancy, other, sideOf, unitsAt, values } from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';

interface RetreatPlan {
  path: HexId[];
  /** Units that would be eliminated following this path. */
  lost: string[];
  halfEff: string[];
  intoArea?: string;
  score: number;
}

function friendlyCityOrBh(s: GameState, hex: HexId, side: Side): boolean {
  const d = MAP.hexes[hex];
  if (d?.city && (s.control[hex] ?? 'German') === side) return true;
  if (side === 'Allied' && unitsAt(s, hex).some((u) => def(u.id).cat === 'bh')) return true;
  return false;
}

/** Plans the best retreat of `ids` (one stack) for `dist` hexes away from `origin`. */
export function planRetreat(s: GameState, ids: string[], dist: number, origin: HexId, extraZoc?: { ignore?: boolean }): RetreatPlan {
  const units = ids.map((id) => s.units[id]).filter((u) => u.where.kind === 'map');
  const side = sideOf(units[0]);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const bonds = bondsOf(s, other(side));
  const moving = new Set(ids);
  const friendlyStay = (h: HexId) => unitsAt(s, h).some((u) => sideOf(u) === side && !moving.has(u.id) && !u.retreatedThisPhase);
  const vacantZoc = (h: HexId) => ezoc.has(h) && !friendlyStay(h) && !extraZoc?.ignore;
  const start = (units[0].where as { hex: HexId }).hex;
  const startArea = Object.entries(MAP.entryAreas).find(([n, ea]) => ea.hexes.includes(start) && areaFriendly(s, n, side))?.[0];
  let best: RetreatPlan | null = null;

  const evaluate = (path: HexId[], intoArea?: string): RetreatPlan => {
    const lost = new Set<string>();
    const halfEff = new Set<string>();
    const mountainCount: Record<string, number> = {};
    for (const u of units) if (values(u).move <= 0) lost.add(u.id);
    let prev = start;
    let prevZoc = false;
    for (let i = 0; i < path.length; i++) {
      const h = path[i];
      const hs = MAP.hexsides[sideKey(prev, h)] ?? {};
      if (blockedByBond(bonds, prev, h)) units.forEach((u) => lost.add(u.id));
      for (const u of units) {
        const d = def(u.id);
        if (hs.river && !hs.road && d.vehicle) lost.add(u.id);
        if (hs.mountain && !hs.road && !hs.pass) {
          if (d.vehicle) lost.add(u.id);
          else {
            mountainCount[u.id] = (mountainCount[u.id] ?? 0) + 1;
            if (mountainCount[u.id] >= 2) lost.add(u.id);
            else halfEff.add(u.id);
          }
        }
      }
      const z = vacantZoc(h);
      if (z && prevZoc) units.forEach((u) => lost.add(u.id));
      prevZoc = z;
      prev = h;
    }
    const end = path[path.length - 1] ?? start;
    if (!intoArea && path.length && vacantZoc(end)) units.forEach((u) => lost.add(u.id));
    let score = -lost.size * 100;
    score += path.length ? distance(end, origin) * 4 : 0;
    score += neighbors(end).filter((n) => unitsAt(s, n).some((u) => sideOf(u) === side)).length;
    score -= halfEff.size;
    if (intoArea) score += 6;
    return { path, lost: [...lost], halfEff: [...halfEff], intoArea, score };
  };

  const consider = (p: RetreatPlan) => {
    if (!best || p.score > best.score) best = p;
  };

  const dfs = (path: HexId[], cur: HexId, visited: Set<HexId>) => {
    if (path.length >= dist) {
      consider(evaluate(path));
      // One extra hex may save the stack from ending in an EZOC.
      if (vacantZoc(cur)) {
        for (const n of neighbors(cur)) {
          if (!isLand(n) || visited.has(n) || occ.get(n) === other(side)) continue;
          consider({ ...evaluate([...path, n]), score: evaluate([...path, n]).score - 1 });
        }
      }
      return;
    }
    if (path.length > 0 && friendlyCityOrBh(s, cur, side)) consider(evaluate(path)); // may stop early
    const area = Object.entries(MAP.entryAreas).find(([n, ea]) => ea.hexes.includes(cur) && areaFriendly(s, n, side))?.[0];
    if (area && path.length > 0) consider(evaluate(path, area));
    for (const n of neighbors(cur)) {
      if (!isLand(n) || visited.has(n) || occ.get(n) === other(side)) continue;
      if (path.length > 0 && distance(n, origin) < distance(cur, origin)) continue;
      visited.add(n);
      dfs([...path, n], n, visited);
      visited.delete(n);
    }
  };
  if (startArea) consider(evaluate([], startArea));
  dfs([], start, new Set([start]));
  return best ?? { path: [], lost: ids, halfEff: [], score: -1e9 };
}

/** Retreats a stack, applying the new status, and returns notes. */
export function retreatStack(s: GameState, ids: string[], dist: number, origin: HexId, status: Status | null, notes: string[]): void {
  const alive = ids.filter((id) => s.units[id].where.kind === 'map');
  if (!alive.length) return;
  // Units already retreated this phase are eliminated if forced to retreat again.
  for (const id of alive) {
    const u = s.units[id];
    if (u.retreatedThisPhase) eliminate(s, u, notes);
  }
  const rest = alive.filter((id) => s.units[id].where.kind === 'map');
  if (!rest.length) return;
  const plan = planRetreat(s, rest, dist, origin);
  for (const id of plan.lost) {
    const u = s.units[id];
    if (u.where.kind === 'map') {
      notes.push(`${def(id).name} cannot retreat safely`);
      eliminate(s, u, notes);
    }
  }
  for (const id of rest) {
    const u = s.units[id];
    if (u.where.kind !== 'map') continue;
    if (def(id).cat === 'bh') {
      eliminate(s, u, notes);
      continue;
    }
    if (plan.intoArea) u.where = { kind: 'entry', area: plan.intoArea };
    else if (plan.path.length) u.where = { kind: 'map', hex: plan.path[plan.path.length - 1] };
    if (plan.halfEff.includes(id)) u.halfEff = true;
    if (status) u.status = status === 'disrupted' && u.status !== 'good' ? 'fullRetreat' : status;
    u.retreatedThisPhase = true;
  }
  const end = plan.intoArea ?? plan.path[plan.path.length - 1];
  if (end && rest.some((id) => s.units[id].where.kind !== 'eliminated')) notes.push(`retreat to ${end}`);
}

/** Enemy units in Full Retreat next to `hex` (and not stacked with good-order friends) fall back 2 hexes. */
export function triggerFullRetreats(s: GameState, hex: HexId, moverSide: Side, notes: string[]): void {
  for (const n of neighbors(hex)) {
    const here = unitsAt(s, n).filter((u) => sideOf(u) === other(moverSide));
    if (!here.length) continue;
    const fr = here.filter((u) => u.status === 'fullRetreat');
    if (!fr.length || here.some((u) => u.status !== 'fullRetreat')) continue;
    const before = notes.length;
    retreatStack(s, fr.map((u) => u.id), 2, hex, 'fullRetreat', notes);
    for (const u of fr) u.retreatedThisPhase = false;
    if (notes.length > before) notes.splice(before, 0, `${fr.map((u) => def(u.id).name).join(', ')} (Full Retreat) fall back`);
  }
}

/** Units in Full Retreat that start a phase next to the enemy without good-order friends are lost. */
export function eliminateExposedFullRetreat(s: GameState, notes: string[]): void {
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || u.status !== 'fullRetreat') continue;
    const hex = u.where.hex;
    const side = sideOf(u);
    if (unitsAt(s, hex).some((x) => sideOf(x) === side && x.status !== 'fullRetreat')) continue;
    if (neighbors(hex).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== side))) eliminate(s, u, notes);
  }
}

export function unitsOf(s: GameState, ids: string[]): UnitState[] {
  return ids.map((id) => s.units[id]).filter(Boolean);
}
