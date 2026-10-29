// Retreats, Full Retreat side effects and disengagement.
import { MAP } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { eliminate } from './losses';
import { areaFriendly, supplyChecker } from './supply';
import type { GameState, Side, Status, UnitState } from './types';
import { def, isLand, occupancy, other, recordTrail, sideOf, unitsAt, values } from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';
import { areaName, hexes, nameList, place, verb } from './words';

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
  return retreatChoices(s, ids, dist, origin, extraZoc)[0];
}

/**
 * The retreats the owner may choose from, best first, following the Retreat
 * Direction Guidelines in priority order (12.1.3): fewest units lost, every hex
 * farther from the combat hex, ending in supply, no mountain crossings.
 */
export function retreatChoices(s: GameState, ids: string[], dist: number, origin: HexId, extraZoc?: { ignore?: boolean }): RetreatPlan[] {
  const all = allRetreats(s, ids, dist, origin, extraZoc);
  if (!all.length) return [{ path: [], lost: ids, halfEff: [], score: -1e9 }];
  const units = ids.map((id) => s.units[id]).filter((u) => u.where.kind === 'map');
  const side = sideOf(units[0]);
  const start = (units[0].where as { hex: HexId }).hex;
  const minLost = Math.min(...all.map((p) => p.lost.length));
  let opts = all.filter((p) => p.lost.length === minLost);
  const away = (p: RetreatPlan) => p.path.every((h, i) => distance(h, origin) > distance(i ? p.path[i - 1] : start, origin));
  if (opts.some(away)) opts = opts.filter(away);
  const sc = supplyChecker(s, side);
  const supplied = (p: RetreatPlan) => !!p.intoArea || (p.path.length > 0 && sc.inSupply(p.path[p.path.length - 1]));
  if (opts.some(supplied)) opts = opts.filter(supplied);
  if (opts.some((p) => !p.halfEff.length)) opts = opts.filter((p) => !p.halfEff.length);
  // One option per destination, best scoring first.
  const byEnd = new Map<string, RetreatPlan>();
  for (const p of opts.sort((a, b) => b.score - a.score)) {
    const key = p.intoArea ?? p.path[p.path.length - 1] ?? start;
    if (!byEnd.has(key)) byEnd.set(key, p);
  }
  return [...byEnd.values()];
}

function allRetreats(s: GameState, ids: string[], dist: number, origin: HexId, extraZoc?: { ignore?: boolean }): RetreatPlan[] {
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
  const all: RetreatPlan[] = [];

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
    // Moving back toward the attacked hex is a last resort (12.1.3).
    for (let i = 1; i < path.length; i++) if (distance(path[i], origin) < distance(path[i - 1], origin)) score -= 30;
    score += neighbors(end).filter((n) => unitsAt(s, n).some((u) => sideOf(u) === side)).length;
    score -= halfEff.size;
    if (intoArea) score += 6;
    return { path, lost: [...lost], halfEff: [...halfEff], intoArea, score };
  };

  const consider = (p: RetreatPlan) => {
    all.push(p);
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
      if (n === origin) continue;
      visited.add(n);
      dfs([...path, n], n, visited);
      visited.delete(n);
    }
  };
  if (startArea) consider(evaluate([], startArea));
  dfs([], start, new Set([start]));
  return all;
}

/** Retreats a stack, applying the new status, and returns notes. */
export function retreatStack(s: GameState, ids: string[], dist: number, origin: HexId, status: Status | null, notes: string[],
  opts: { again?: boolean } = {}): void {
  const alive = ids.filter((id) => s.units[id].where.kind === 'map');
  if (!alive.length) return;
  // Units already retreated this phase are eliminated if forced to retreat again (not after Breakthrough Combat, 15.3).
  for (const id of alive) {
    const u = s.units[id];
    if (u.retreatedThisPhase && !opts.again) eliminate(s, u, notes, false, 'was already driven back once this phase and is destroyed');
  }
  const rest = alive.filter((id) => s.units[id].where.kind === 'map');
  if (!rest.length) return;
  const side = sideOf(s.units[rest[0]]);
  const choices = retreatChoices(s, rest, dist, origin);
  const plan = choices[0];
  const prevHalfEff = Object.fromEntries(rest.map((id) => [id, s.units[id].halfEff]));
  const prevControl: Record<HexId, Side | null> = {};
  for (const p of choices) for (const h of p.path) if (!(h in prevControl)) prevControl[h] = s.control[h] ?? null;
  for (const id of plan.lost) {
    const u = s.units[id];
    if (u.where.kind === 'map') {
      eliminate(s, u, notes, false, 'has no safe line of retreat and is destroyed');
    }
  }
  for (const id of rest) {
    const u = s.units[id];
    if (u.where.kind !== 'map') continue;
    if (def(id).cat === 'bh') {
      eliminate(s, u, notes, false, 'cannot retreat and is overrun');
      continue;
    }
    if (plan.path.length) recordTrail(s, id, [(u.where as { hex: HexId }).hex, ...plan.path]);
    if (plan.intoArea) u.where = { kind: 'entry', area: plan.intoArea };
    else if (plan.path.length) u.where = { kind: 'map', hex: plan.path[plan.path.length - 1] };
    // The last side to occupy or pass through a port, city or VP hex controls it (16.3.4).
    for (const h of plan.path) if (MAP.hexes[h].vp || MAP.hexes[h].city || MAP.hexes[h].port) s.control[h] = sideOf(u);
    if (plan.halfEff.includes(id)) u.halfEff = true;
    if (status) u.status = status === 'disrupted' && u.status !== 'good' ? 'fullRetreat' : status;
    u.retreatedThisPhase = true;
  }
  const end = plan.intoArea ?? plan.path[plan.path.length - 1];
  const moved = rest.filter((id) => s.units[id].where.kind === 'map' || s.units[id].where.kind === 'entry');
  if (end && moved.length) {
    const how = moved.every((id) => s.units[id].status === 'fullRetreat') ? ', in Full Retreat'
      : moved.some((id) => s.units[id].status !== 'good') ? ', disrupted' : '';
    const where = plan.intoArea ? `off the map into ${areaName(plan.intoArea)}` : `${hexes(plan.path.length)} to ${place(end)}`;
    notes.push(`${nameList(moved)} ${verb(moved, 'falls', 'fall')} back ${where}${how}.`);
  }
  // A human owner may pick another destination with the same losses (12.1.2-12.1.3).
  const sameLosses = choices.filter((p) => p.lost.length === plan.lost.length && p.lost.every((id) => plan.lost.includes(id)));
  if (moved.length && sameLosses.length > 1 && s.options?.chooseRetreats?.includes(side)) {
    s.retreatQueue = [...(s.retreatQueue ?? []), {
      side, units: moved, from: origin, distance: dist, current: 0, prevHalfEff, prevControl,
      options: sameLosses.map((p) => ({ end: p.intoArea ?? p.path[p.path.length - 1], path: p.path, intoArea: p.intoArea, halfEff: p.halfEff })),
    }];
  }
}

/** The owner picks retreat destination `index` for the first queued retreat (or keeps the default). */
export function chooseRetreat(s: GameState, index: number, notes: string[]): void {
  const item = s.retreatQueue?.[0];
  if (!item) throw new Error('No retreat is waiting for a decision.');
  const opt = item.options[index];
  if (!opt) throw new Error('Unknown retreat option.');
  s.retreatQueue!.shift();
  if (index === item.current) return;
  for (const [h, c] of Object.entries(item.prevControl)) {
    if (c) s.control[h] = c;
    else delete s.control[h];
  }
  for (const id of item.units) {
    const u = s.units[id];
    if (u.where.kind !== 'map' && u.where.kind !== 'entry') continue;
    if (u.where.kind === 'map') recordTrail(s, id, [u.where.hex, opt.end]);
    u.where = opt.intoArea ? { kind: 'entry', area: opt.intoArea } : { kind: 'map', hex: opt.end };
    u.halfEff = item.prevHalfEff[id] || opt.halfEff.includes(id);
    for (const h of opt.path) if (MAP.hexes[h].vp || MAP.hexes[h].city || MAP.hexes[h].port) s.control[h] = sideOf(u);
  }
  notes.push(`${nameList(item.units)} ${verb(item.units, 'retreats', 'retreat')} to ${opt.intoArea ? areaName(opt.intoArea) : place(opt.end)} instead.`);
}

/** Enemy units in Full Retreat next to `hex` (and not stacked with good-order friends) fall back 2 hexes. */
export function triggerFullRetreats(s: GameState, hex: HexId, moverSide: Side, notes: string[]): void {
  for (const n of neighbors(hex)) {
    const here = unitsAt(s, n).filter((u) => sideOf(u) === other(moverSide));
    if (!here.length) continue;
    const fr = here.filter((u) => u.status === 'fullRetreat');
    if (!fr.length || here.some((u) => u.status !== 'fullRetreat')) continue;
    const before = notes.length;
    // No extra penalty for a further retreat while in Full Retreat (13.3.2).
    retreatStack(s, fr.map((u) => u.id), 2, hex, 'fullRetreat', notes, { again: true });
    for (const u of fr) u.retreatedThisPhase = false;
    const ids = fr.map((u) => u.id);
    if (notes.length > before) notes.splice(before, 0, `${nameList(ids)}, in Full Retreat, ${verb(ids, 'falls', 'fall')} back as the enemy comes close.`);
  }
}

/** Units in Full Retreat that start a phase next to the enemy without good-order friends are lost. */
export function eliminateExposedFullRetreat(s: GameState, notes: string[]): void {
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || u.status !== 'fullRetreat') continue;
    const hex = u.where.hex;
    const side = sideOf(u);
    if (unitsAt(s, hex).some((x) => sideOf(x) === side && x.status !== 'fullRetreat')) continue;
    if (neighbors(hex).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== side))) {
      eliminate(s, u, notes, false, `is caught in Full Retreat next to the enemy at ${place(hex)} and destroyed`);
    }
  }
}

export function unitsOf(s: GameState, ids: string[]): UnitState[] {
  return ids.map((id) => s.units[id]).filter(Boolean);
}
