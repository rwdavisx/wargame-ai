// Shared evaluation helpers for the AI players.
import { RULES, MAP } from '../engine/data';
import { computeOdds, inNavalRange, supportAvailable, type AttackPlan, type OddsInfo } from '../engine/combat';
import { distance, neighbors, type HexId } from '../engine/hex';
import { isLand } from '../engine/movement';
import type { GameState, Side, UnitState } from '../engine/types';
import { def, isCombatUnit, occupancy, other, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';

/** Expected outcome of a CRT column (with DRM) in steps. */
export function expectedOutcome(finalIndex: number, drm: number, defenderSteps: number) {
  let defLoss = 0;
  let attLoss = 0;
  let retreat = 0;
  for (let roll = 1; roll <= 6; roll++) {
    const r = RULES.combat.crt[String(Math.max(1, Math.min(6, roll + drm)))][finalIndex];
    if (r === 'A1') attLoss += 1;
    else if (r === 'A2') attLoss += 2;
    else if (r === 'EX') {
      defLoss += 1;
      attLoss += 1;
    } else if (r === 'DR') retreat += 1;
    else if (r === 'D1R') {
      defLoss += 1;
      retreat += 1;
    } else if (r === 'D2R') {
      defLoss += 2;
      retreat += 1;
    } else if (r === 'DE') {
      defLoss += defenderSteps;
      retreat += 1;
    }
  }
  return { defLoss: defLoss / 6, attLoss: attLoss / 6, retreat: retreat / 6 };
}

export interface AttackOption {
  plan: AttackPlan;
  odds: OddsInfo;
  score: number;
}

/** Best attack (with support choices) against `target`, or null if nothing legal. */
export function bestAttackOn(s: GameState, target: HexId, aggression: number): AttackOption | null {
  const side = s.activeSide;
  const attackers = neighbors(target)
    .flatMap((h) => unitsAt(s, h))
    .filter((u) => sideOf(u) === side && isCombatUnit(u) && !u.attacked && !u.disrupted && !u.strategic && values(u).attack > 0);
  if (!attackers.length) return null;
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) !== side);
  if (!defenders.length) return null;
  const defSteps = defenders.reduce((a, u) => a + stepsRemaining(u), 0);
  const asuIds = Object.values(s.units)
    .filter((u) => u.where.kind === 'map' && sideOf(u) === side && def(u.id).type === 'asu' && !u.fired &&
      distance(u.where.hex, target) <= (def(u.id).asuRange ?? 0))
    .map((u) => u.id)
    .slice(0, RULES.combat.asuMaxPerSide);
  const ids = attackers.map((u) => u.id);
  const hasAir = supportAvailable(s, side, 'air');
  const hasNaval = side === 'Allied' && supportAvailable(s, side, 'naval') && inNavalRange(target);
  const vpHere = MAP.hexes[target].vp ?? 0;
  let best: AttackOption | null = null;
  const combos: { air: boolean; naval: boolean; asus: string[] }[] = [];
  for (const air of hasAir ? [false, true] : [false])
    for (const naval of hasNaval ? [false, true] : [false])
      for (const n of asuIds.length ? [0, asuIds.length] : [0]) combos.push({ air, naval, asus: asuIds.slice(0, n) });
  for (const c of combos) {
    const plan: AttackPlan = { target, attackers: ids, air: c.air, naval: c.naval, asus: c.asus };
    const odds = computeOdds(s, plan);
    if (!odds.ok) continue;
    const e = expectedOutcome(odds.finalIndex, odds.drm, defSteps);
    const supportCost = (c.air ? 0.25 : 0) + (c.naval ? 0.25 : 0) + c.asus.length * 0.2;
    const score = e.defLoss * 1.0 + e.retreat * (0.5 + vpHere * 0.4) - e.attLoss * (1.15 - aggression * 0.4) - supportCost;
    if (!best || score > best.score) best = { plan, odds, score };
  }
  return best;
}

/** Hex-distance field over land from a set of target hexes. */
export function distanceField(targets: HexId[], limit = 40): Map<HexId, number> {
  const d = new Map<HexId, number>();
  const q: HexId[] = [];
  for (const t of targets) {
    if (!isLand(t)) continue;
    d.set(t, 0);
    q.push(t);
  }
  while (q.length) {
    const cur = q.shift()!;
    const k = d.get(cur)!;
    if (k >= limit) continue;
    for (const n of neighbors(cur)) {
      if (d.has(n) || !isLand(n)) continue;
      d.set(n, k + 1);
      q.push(n);
    }
  }
  return d;
}

/** Enemy attack strength that could reach `hex` next turn (units within 2 hexes). */
export function threatAt(s: GameState, hex: HexId, side: Side): number {
  let t = 0;
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side || !isCombatUnit(u)) continue;
    const dd = distance(u.where.hex, hex);
    if (dd === 1) t += values(u).attack;
    else if (dd === 2) t += values(u).attack * 0.6;
    else if (dd === 3 && def(u.id).vehicle) t += values(u).attack * 0.3;
  }
  return t;
}

export function defenseAt(s: GameState, hex: HexId, side: Side, extra?: UnitState): number {
  let d = 0;
  for (const u of unitsAt(s, hex)) if (sideOf(u) === side && u.id !== extra?.id) d += values(u).defense;
  if (extra) d += values(extra).defense;
  const h = MAP.hexes[hex];
  const mult = h.city ? 1.6 : h.terrain === 'hill' ? 1.4 : h.terrain === 'marsh' ? 1.3 : 1;
  return d * mult;
}

export function enemyAdjacentHexes(s: GameState, hex: HexId, side: Side): HexId[] {
  const occ = occupancy(s);
  return neighbors(hex).filter((n) => occ.get(n) === other(side));
}

export function nearestEnemyDistance(s: GameState, hex: HexId, side: Side): number {
  let best = 99;
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side || !isCombatUnit(u)) continue;
    best = Math.min(best, distance(u.where.hex, hex));
  }
  return best;
}
