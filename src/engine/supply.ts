// Lines of Supply (LOS) and Lines of Communication (LOC).
import { MAP, RULES } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import type { GameState, Side } from './types';
import { def, isLand, occupancy, other, sideOf } from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';

export const SOUTH_EDGE_ALLIED_TURN = 11;
const MINED_PORTS = new Set(['1803', '2202']);

export function areaFriendly(s: GameState, area: string, side: Side): boolean {
  const ea = MAP.entryAreas[area];
  if (!ea) return false;
  if (ea.side === 'north') return side === 'German';
  const owner = s.control[area] ?? 'German';
  return owner === side;
}

export function beachheadHexes(s: GameState): HexId[] {
  const out: HexId[] = [];
  for (const u of Object.values(s.units)) if (u.where.kind === 'map' && def(u.id).cat === 'bh') out.push(u.where.hex);
  return out;
}

export function usablePorts(s: GameState): HexId[] {
  const gz = zocOf(s, 'German');
  const occ = occupancy(s);
  return Object.entries(MAP.hexes)
    .filter(([h, d]) => d.port && !MINED_PORTS.has(h) && s.control[h] === 'Allied' && occ.get(h) !== 'German' && (occ.get(h) === 'Allied' || !gz.has(h)))
    .map(([h]) => h);
}

export function supplySources(s: GameState, side: Side, opts: { ports?: boolean } = {}): HexId[] {
  const occ = occupancy(s);
  const out = new Set<HexId>();
  for (const [name, ea] of Object.entries(MAP.entryAreas)) {
    if (!areaFriendly(s, name, side)) continue;
    for (const h of ea.hexes) if (isLand(h) && occ.get(h) !== other(side)) out.add(h);
  }
  if (side === 'Allied') {
    for (const h of beachheadHexes(s)) out.add(h);
    if (opts.ports !== false) for (const h of usablePorts(s)) out.add(h);
    // Italy '43: any Allied-held hex of Naples (16.2.2).
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (d.city && RULES.supply.citySources.includes(d.city) && s.control[h] === 'Allied' && occ.get(h) !== 'German') out.add(h);
    }
  }
  return [...out];
}

interface TraceCtx {
  side: Side;
  occ: Map<HexId, Side>;
  ezoc: Set<HexId>;
  bonds: ReturnType<typeof bondsOf>;
  roadNet: Set<HexId>;
  sources: Set<HexId>;
  enemyControlled: (h: HexId) => boolean;
}

function makeCtx(s: GameState, side: Side, targets: HexId[]): TraceCtx {
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const bonds = bondsOf(s, other(side));
  const zocFree = (h: HexId) => !ezoc.has(h) || occ.get(h) === side;
  const enemyControlled = (h: HexId) => {
    const d = MAP.hexes[h];
    // A vacant completed fortification marks German control and blocks Allied lines (Italy '43, 18.2.1).
    if (side === 'Allied' && occ.get(h) !== side) {
      const f = s.forts?.[h];
      if (f && !f.building) return true;
    }
    return !!(d && (d.vp || d.city || d.port)) && occ.get(h) !== side && (s.control[h] ?? 'German') !== side;
  };
  // Road portion: any length along roads from the targets, never through enemy units or EZOCs.
  const roadNet = new Set<HexId>();
  const stack: HexId[] = [];
  for (const t of targets) {
    if (occ.get(t) === other(side) || !zocFree(t)) continue;
    roadNet.add(t);
    stack.push(t);
  }
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of neighbors(cur)) {
      if (roadNet.has(n) || !isLand(n)) continue;
      if (!MAP.hexsides[sideKey(cur, n)]?.road) continue;
      if (occ.get(n) === other(side) || !zocFree(n) || enemyControlled(n)) continue;
      if (blockedByBond(bonds, cur, n)) continue;
      roadNet.add(n);
      stack.push(n);
    }
  }
  return { side, occ, ezoc, bonds, roadNet, sources: new Set(targets), enemyControlled };
}

/**
 * Overland trace from `from` to the road net (or a target). `limit` is the
 * overland length (marsh off-road counts double); `firstMountainOk` lets the
 * first step cross a mountain hexside (Line of Communication).
 */
function overland(ctx: TraceCtx, from: HexId, limit: number, firstMountainOk: boolean): boolean {
  if (ctx.roadNet.has(from) || ctx.sources.has(from)) return true;
  type St = { h: HexId; prevZoc: boolean };
  const best = new Map<string, number>();
  const zocAt = (h: HexId) => ctx.ezoc.has(h) && ctx.occ.get(h) !== ctx.side;
  const q: { st: St; cost: number }[] = [{ st: { h: from, prevZoc: false }, cost: 0 }];
  best.set(`${from}|0`, 0);
  while (q.length) {
    q.sort((a, b) => a.cost - b.cost);
    const { st, cost } = q.shift()!;
    for (const n of neighbors(st.h)) {
      if (!isLand(n) || ctx.occ.get(n) === other(ctx.side)) continue;
      // Never through a vacant enemy-controlled port, city or VP hex (16.3.4).
      if (ctx.enemyControlled(n) && !ctx.sources.has(n)) continue;
      if (blockedByBond(ctx.bonds, st.h, n)) continue;
      const hs = MAP.hexsides[sideKey(st.h, n)] ?? {};
      if (hs.mountain && !hs.road && !hs.pass && !(firstMountainOk && st.h === from)) continue;
      const z = zocAt(n);
      if (z && st.prevZoc) continue;
      const c = cost + (MAP.hexes[n].terrain === 'marsh' && !hs.road ? 2 : 1);
      if (c > limit) continue;
      // A vacant source hex may be reached overland even inside an enemy ZOC.
      if (ctx.roadNet.has(n) || ctx.sources.has(n)) return true;
      const key = `${n}|${z ? 1 : 0}`;
      if ((best.get(key) ?? Infinity) <= c) continue;
      best.set(key, c);
      q.push({ st: { h: n, prevZoc: z }, cost: c });
    }
  }
  return false;
}

export interface SupplyChecker {
  inSupply(hex: HexId): boolean;
  hasLoc(hex: HexId): boolean;
}

export function supplyChecker(s: GameState, side: Side, opts: { ports?: boolean } = {}): SupplyChecker {
  const ctx = makeCtx(s, side, supplySources(s, side, opts));
  const cacheS = new Map<HexId, boolean>();
  const cacheL = new Map<HexId, boolean>();
  return {
    inSupply(hex) {
      if (!cacheS.has(hex)) cacheS.set(hex, overland(ctx, hex, RULES.supply.overlandHexes, false));
      return cacheS.get(hex)!;
    },
    hasLoc(hex) {
      if (!cacheL.has(hex)) cacheL.set(hex, overland(ctx, hex, 999, true));
      return cacheL.get(hex)!;
    },
  };
}

/** Can a Line of Supply be traced from `hex` to any of `targets`? */
export function losTo(s: GameState, side: Side, hex: HexId, targets: HexId[]): boolean {
  if (!targets.length) return false;
  return overland(makeCtx(s, side, targets), hex, RULES.supply.overlandHexes, false);
}

export function salernoPortOpen(s: GameState): boolean {
  if (s.control['2707'] !== 'Allied') return false;
  for (const u of Object.values(s.units)) {
    if (u.where.kind === 'map' && sideOf(u) === 'German' && distance(u.where.hex, '2707') <= (RULES.supply.salernoPortOpenRadius ?? 0)) return false;
  }
  return true;
}
