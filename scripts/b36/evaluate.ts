// Shared evaluation helpers for the AI players.
import { BATTLESHIPS_TURN, MAP, RULES } from '../../src/engine/data';
import { adjacentForCombat, computeOdds, inNavalRange, parseCell, readyAsusFor, type AttackPlan, type OddsInfo } from '../../src/engine/combat';
import { distance, neighbors, type HexId } from '../../src/engine/hex';
import type { GameState, Side, UnitState } from '../../src/engine/types';
import { def, goodOrder, isLand, nationGroup, occupancy, other, sideOf, stepsRemaining, unitsAt, values } from '../../src/engine/units';

/** Expected outcome of one CRT column in steps and retreat chance. */
export function expectedOutcome(finalIndex: number, drm: number, defenderSteps: number) {
  let defLoss = 0;
  let attLoss = 0;
  let retreat = 0;
  let disrupt = 0;
  for (let roll = 1; roll <= 6; roll++) {
    const cell = parseCell(RULES.combat.crt[String(Math.min(6, roll + drm))][finalIndex]);
    const r = cell.result;
    if (r.startsWith('A1')) attLoss += 1;
    if (r === 'EX' || r === 'DRX') {
      attLoss += 1;
      defLoss += 1;
    }
    if (r.includes('D1') || r === 'DS') defLoss += 1;
    if (r === 'Dis') disrupt += 1;
    // Retreat results the defender may try to cancel by Determined Defense (roughly half the time).
    if (/DR2|DRX|D1/.test(r)) retreat += cell.color === 'r' ? 1 : 0.55;
    if (r === 'DR4' || r === 'DS') retreat += 1.3;
  }
  defLoss = Math.min(defLoss, defenderSteps * 6);
  return { defLoss: defLoss / 6, attLoss: attLoss / 6, retreat: retreat / 6, disrupt: disrupt / 6 };
}

export interface AttackOption {
  plan: AttackPlan;
  odds: OddsInfo;
  score: number;
}

/** Best attack (attacker group and support) against `target`, or null. */
export function bestAttackOn(s: GameState, target: HexId, aggression: number,
  opts: { noSupport?: boolean; vpWeight?: number; killValue?: number; trim?: boolean } = {}): AttackOption | null {
  const side = s.activeSide;
  const eligible = Object.values(s.units)
    .filter((u) => (u.where.kind === 'map' || u.where.kind === 'entry') && sideOf(u) === side && adjacentForCombat(s, u, target))
    .filter((u) => !def(u.id).asu && def(u.id).cat !== 'bh' && !def(u.id).variable && !u.attacked && !u.autoDs && !u.repl &&
      goodOrder(u) && !u.truck && values(u).attack > 0 && !(u.where.kind === 'map' && unitsAt(s, u.where.hex).some((x) => x.repl)) &&
      !(u.where.kind === 'entry' && u.stopped));
  if (!eligible.length) return null;
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) !== side);
  if (!defenders.length) return null;
  const defSteps = defenders.reduce((a, u) => a + stepsRemaining(u), 0);
  // US and Commonwealth (and 5th/8th Army) units attack separately.
  const groups = new Map<string, UnitState[]>();
  for (const u of eligible) {
    const k = `${nationGroup(u.id)}|${def(u.id).army8 ? 8 : 5}`;
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  const vpHere = MAP.hexes[target].vp ?? 0;
  // Artillery and beach groups are worth a victory point each: a stack that holds them is worth breaking.
  const vpUnits = defenders.filter((u) => def(u.id).asu || def(u.id).cat === 'bh').length;
  const killWeight = (opts.killValue ?? 0) * vpUnits;
  const pKill = (o: OddsInfo, retreat: number) => {
    if (!killWeight) return 0;
    if (o.autoDs) return 1;
    let ds = 0;
    for (let roll = 1; roll <= 6; roll++) if (RULES.combat.crt[String(Math.min(6, roll + o.drm))][o.finalIndex].startsWith('DS')) ds++;
    return ds / 6 + retreat * 0.35;
  };
  let best: AttackOption | null = null;
  for (const members of groups.values()) {
    const ids = members.map((u) => u.id);
    const base = computeOdds(s, { target, attackers: ids });
    if (!base.ok) continue;
    const asus = opts.noSupport ? [] : readyAsusFor(s, side, target, base.mafUnits.length ? ids : []);
    const div = asus.find((u) => def(u.id).asu === 'division');
    const corps = asus.find((u) => def(u.id).asu === 'corps');
    const airKey = ids.map((id) => `${nationGroup(id) === 'CW' ? 'BR' : nationGroup(id)}-air`).find((k) => s.support.ready.includes(k));
    const navalKey = side === 'Allied' && inNavalRange(target)
      ? ids.map((id) => `${nationGroup(id) === 'CW' ? 'BR' : 'US'}-naval`).find((k) => s.support.ready.includes(k))
      : undefined;
    const combos: AttackPlan[] = [];
    for (const air of airKey && !opts.noSupport ? [false, true] : [false])
      for (const useDiv of div ? [false, true] : [false])
        for (const extra of ['none', ...(corps ? ['corps'] : []), ...(navalKey && !opts.noSupport ? ['naval'] : [])]) {
          const asuIds = [...(useDiv ? [div!.id] : []), ...(extra === 'corps' ? [corps!.id] : [])];
          combos.push({
            target, attackers: ids, air, naval: extra === 'naval', asus: asuIds,
            battleships: extra === 'naval' && s.support.battleships > 0 && s.turn >= BATTLESHIPS_TURN,
          });
        }
    for (const plan of combos) {
      const odds = computeOdds(s, plan);
      if (!odds.ok) continue;
      const e = odds.autoDs ? { defLoss: 1, attLoss: 0, retreat: 1.3, disrupt: 0 } : expectedOutcome(odds.finalIndex, odds.drm, defSteps);
      const supportCost = (plan.air ? 0.3 : 0) + (plan.naval ? 0.3 : 0) + (plan.asus?.length ?? 0) * 0.25 + (plan.battleships ? 0.4 : 0);
      const score = e.defLoss * 1.1 + e.retreat * (0.45 + vpHere * (opts.vpWeight ?? 0.35)) + e.disrupt * 0.3 -
        e.attLoss * (1.2 - aggression * 0.45) - supportCost + killWeight * pKill(odds, e.retreat);
      if (!best || score > best.score) best = { plan, odds, score };
    }
  }
  // Leave out attackers the odds do not need, so they stay free for another attack this phase.
  if (best && opts.trim && best.plan.attackers.length > 1 && !best.odds.autoDs) {
    let ids = [...best.plan.attackers].sort((a, b) => values(s.units[a]).attack - values(s.units[b]).attack);
    for (const id of [...ids]) {
      if (ids.length <= 1) break;
      const trial: AttackPlan = { ...best.plan, attackers: ids.filter((x) => x !== id) };
      const o = computeOdds(s, trial);
      if (o.ok && o.finalIndex >= best.odds.finalIndex && o.drm >= best.odds.drm) {
        ids = trial.attackers;
        best = { ...best, plan: trial, odds: o };
      }
    }
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

/** Enemy attack strength that could reach `hex` next turn. */
export function threatAt(s: GameState, hex: HexId, side: Side): number {
  let t = 0;
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side || def(u.id).asu || !goodOrder(u)) continue;
    const dd = distance(u.where.hex, hex);
    const a = values(u).attack;
    if (dd === 1) t += a;
    else if (dd === 2) t += a * 0.6;
    else if (dd <= 4 && def(u.id).mech) t += a * 0.3;
  }
  return t;
}

export function defenseAt(s: GameState, hex: HexId, side: Side, extra?: UnitState): number {
  let d = 0;
  const h = MAP.hexes[hex];
  const doubles = h.city || h.terrain === 'hill' || h.terrain === 'marsh';
  const add = (u: UnitState) => {
    const dd = def(u.id);
    if (dd.asu) return;
    const v = values(u).defense;
    d += doubles && !dd.silhouette && !dd.variable ? v * 2 : v;
  };
  for (const u of unitsAt(s, hex)) if (sideOf(u) === side && u.id !== extra?.id) add(u);
  if (extra) add(extra);
  return Math.min(20, d);
}

export function enemyAdjacentHexes(s: GameState, hex: HexId, side: Side): HexId[] {
  const occ = occupancy(s);
  return neighbors(hex).filter((n) => occ.get(n) === other(side));
}

export function nearestEnemyDistance(s: GameState, hex: HexId, side: Side): number {
  let best = 99;
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side || def(u.id).asu) continue;
    best = Math.min(best, distance(u.where.hex, hex));
  }
  return best;
}
