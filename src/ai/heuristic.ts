// A rule-of-thumb AI that can play either side. It is deliberately simple:
// it scores destination hexes for each unit and greedily takes the best
// attacks by expected step-loss exchange.
import { MAP } from '../engine/data';
import { applyAction, landingHexes } from '../engine/game';
import { neighbors, sideKey, type HexId } from '../engine/hex';
import { entryDestinations, legalDestinations, type Reach } from '../engine/movement';
import { RULES } from '../engine/data';
import { suppliedHexes } from '../engine/supply';
import type { Action, GameState, MoveMode, Side, UnitState } from '../engine/types';
import { adjacentEnemy, def, isCombatUnit, sideOf, stackCount, unitsAt, values } from '../engine/units';
import {
  bestAttackOn, defenseAt, distanceField, enemyAdjacentHexes, nearestEnemyDistance, threatAt,
} from './evaluate';

export interface AiPlayer {
  name: string;
  nextAction(s: GameState): Action | Promise<Action>;
}

function isLegal(s: GameState, a: Action): boolean {
  try {
    const c = structuredClone({ ...s, log: [] });
    applyAction(c, a);
    return true;
  } catch {
    return false;
  }
}

/** Aggression in [0,1] by side and turn: Germans counterattack early, Allies push later. */
export function aggressionFor(s: GameState, side: Side): number {
  if (side === 'German') return s.turn <= 7 ? 0.75 : s.turn <= 10 ? 0.4 : 0.2;
  return s.turn <= 3 ? 0.35 : s.turn <= 8 ? 0.45 : 0.7;
}

interface Ctx {
  side: Side;
  aggression: number;
  supplied: Set<HexId>;
  objective: Map<HexId, number>;
  threat: Map<HexId, number>;
}

function objectives(s: GameState, side: Side, aggression: number): HexId[] {
  const out: HexId[] = [];
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.vp) continue;
    if (s.control[h] !== side) out.push(h);
    else if (aggression < 0.5) out.push(h); // hold what we have
  }
  if (side === 'German' && aggression >= 0.5) {
    for (const b of Object.values(MAP.beaches)) out.push(b.hex);
  }
  if (side === 'Allied' && s.turn >= 12) {
    out.push(...MAP.entryAreas.N1.hexes);
  }
  return out;
}

function makeCtx(s: GameState): Ctx {
  const side = s.activeSide;
  const aggression = aggressionFor(s, side);
  return {
    side,
    aggression,
    supplied: suppliedHexes(s, side),
    objective: distanceField(objectives(s, side, aggression)),
    threat: new Map(),
  };
}

function threat(ctx: Ctx, s: GameState, h: HexId): number {
  if (!ctx.threat.has(h)) ctx.threat.set(h, threatAt(s, h, ctx.side));
  return ctx.threat.get(h)!;
}

function scoreHex(s: GameState, ctx: Ctx, u: UnitState, h: HexId): number {
  const d = def(u.id);
  const hd = MAP.hexes[h];
  let score = 0;
  if (!ctx.supplied.has(h)) score -= 5;
  if (d.type === 'asu') {
    const ne = nearestEnemyDistance(s, h, ctx.side);
    score -= Math.abs(ne - 2) * 1.2;
    if (ne <= 1) score -= 4;
    return score;
  }
  const dist = ctx.objective.get(h) ?? 30;
  score -= dist * (0.35 + ctx.aggression * 0.35);
  if (hd.city) score += 0.6;
  else if (hd.terrain === 'hill') score += 0.35;
  if (hd.vp && s.control[h] === ctx.side) score += 0.5 + 0.3 * hd.vp;
  const t = threat(ctx, s, h);
  const defense = defenseAt(s, h, ctx.side, u) + 0.01;
  const risk = t / defense;
  score -= Math.max(0, risk - (1.2 + ctx.aggression)) * (1.6 - ctx.aggression);
  const adjEnemies = enemyAdjacentHexes(s, h, ctx.side);
  if (adjEnemies.length) {
    let weak = 0;
    for (const e of adjEnemies) {
      const ed = unitsAt(s, e).reduce((a, x) => a + values(x).defense, 0);
      if (ed <= values(u).attack * 1.5) weak++;
    }
    score += ctx.aggression * 0.5 * Math.min(2, weak);
  }
  const friends = unitsAt(s, h).filter((x) => sideOf(x) === ctx.side && isCombatUnit(x) && x.id !== u.id).length;
  score += 0.15 * friends;
  return score;
}

function bestDestination(s: GameState, ctx: Ctx, u: UnitState, dests: Map<HexId, unknown>, current?: HexId) {
  let best: HexId | null = null;
  let bestScore = current ? scoreHex(s, ctx, u, current) + 0.25 : -Infinity;
  for (const h of dests.keys()) {
    const sc = scoreHex(s, ctx, u, h);
    if (sc > bestScore) {
      bestScore = sc;
      best = h;
    }
  }
  return best;
}

function ratioIndex(ratio: number): number {
  let idx = 0;
  RULES.combat.ratios.forEach((r, i) => {
    if (ratio + 1e-9 >= r) idx = i;
  });
  return idx;
}

/**
 * Plans coordinated attacks for this movement phase: picks enemy hexes where
 * units that can get adjacent this turn would reach good odds, and returns
 * the moves that put them there.
 */
export function planAssaults(s: GameState, aggression: number): Action[] {
  const side = s.activeSide;
  const minIndex = aggression >= 0.6 ? 4 : aggression >= 0.4 ? 5 : 6;
  type Cand = { u: UnitState; here: HexId | null; dests: Map<HexId, Reach>; area?: string };
  const cands: Cand[] = [];
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side || !isCombatUnit(u) || values(u).attack <= 0 || u.disrupted) continue;
    if (u.frozenUntil && s.turn < u.frozenUntil) continue;
    if (u.where.kind === 'map' && u.mpSpent === null) {
      cands.push({ u, here: u.where.hex, dests: legalDestinations(s, u.id, 'tactical') });
    } else if (u.where.kind === 'entry' && u.where.area !== 'airdrop' && !u.where.area.startsWith('hex:')) {
      cands.push({ u, here: null, dests: entryDestinations(s, u.id, u.where.area, 'tactical'), area: u.where.area });
    }
  }
  const enemyHexes = new Map<HexId, UnitState[]>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side) continue;
    const list = enemyHexes.get(u.where.hex) ?? [];
    list.push(u);
    enemyHexes.set(u.where.hex, list);
  }
  const beachHexes = new Set(Object.values(MAP.beaches).map((b) => b.hex));
  const valueOf = (h: HexId, us: UnitState[]) =>
    (MAP.hexes[h].vp ?? 0) * 2 + (side === 'German' && beachHexes.has(h) ? 1.5 : 0) -
    us.reduce((a, u) => a + values(u).defense, 0) * 0.1;
  const targets = [...enemyHexes.entries()].sort((a, b) => valueOf(b[0], b[1]) - valueOf(a[0], a[1]));
  const used = new Set<string>();
  const planned = new Map<HexId, number>();
  const actions: Action[] = [];
  const airBonus = s.support[side].air.length ? 1 : 0;
  for (const [E, defenders] of targets) {
    if (defenders.every((u) => !isCombatUnit(u))) continue;
    const D = Math.max(1, defenders.reduce((a, u) => a + values(u).defense * (u.disrupted ? 0.5 : 1), 0));
    const hd = MAP.hexes[E];
    const terrainShift = hd.city ? RULES.combat.terrainShift.city : RULES.combat.terrainShift[hd.terrain] ?? 0;
    const defArmor = defenders.some((u) => def(u.id).tankRating);
    const opts: { c: Cand; hex: HexId; att: number; moveNeeded: boolean }[] = [];
    for (const c of cands) {
      if (used.has(c.u.id)) continue;
      const att = values(c.u).attack * (c.u.outOfSupply ? 0.5 : 1);
      if (c.here && neighbors(c.here).includes(E)) {
        opts.push({ c, hex: c.here, att, moveNeeded: false });
        continue;
      }
      let best: HexId | null = null;
      let bestCost = Infinity;
      for (const n of neighbors(E)) {
        const r = c.dests.get(n);
        if (!r) continue;
        const room = def(c.u.id).freeStack || stackCount(s, n) + (planned.get(n) ?? 0) < RULES.stackingLimit;
        if (room && r.cost < bestCost) {
          best = n;
          bestCost = r.cost;
        }
      }
      if (best) opts.push({ c, hex: best, att, moveNeeded: true });
    }
    if (!opts.length) continue;
    opts.sort((a, b) => b.att - a.att);
    const chosen: typeof opts = [];
    let A = 0;
    let est = -1;
    for (const o of opts) {
      // Respect stacking among this plan's own picks.
      const extra = chosen.filter((x) => x.hex === o.hex && x.moveNeeded).length;
      if (o.moveNeeded && !def(o.c.u.id).freeStack && stackCount(s, o.hex) + (planned.get(o.hex) ?? 0) + extra >= RULES.stackingLimit) continue;
      chosen.push(o);
      A += o.att;
      const sides = chosen.map((x) => MAP.hexsides[sideKey(x.hex, E)] ?? {});
      let shift = terrainShift + airBonus;
      if (sides.every((h) => h.river)) shift += RULES.combat.allAcrossRiverShift;
      if (sides.every((h) => h.mountain)) shift += sides.some((h) => !h.pass) ? RULES.combat.allAcrossMountainShift : RULES.combat.allAcrossPassShift;
      if (!defArmor && hd.terrain === 'clear' && !hd.city && chosen.some((x) => def(x.c.u.id).tankRating)) shift += RULES.combat.armorShift;
      est = ratioIndex(A / D) + shift;
      if (est >= minIndex + 1) break;
    }
    if (est < minIndex) continue;
    for (const o of chosen) {
      used.add(o.c.u.id);
      if (!o.moveNeeded) continue;
      planned.set(o.hex, (planned.get(o.hex) ?? 0) + (def(o.c.u.id).freeStack ? 0 : 1));
      actions.push(o.c.area ? { type: 'enter', unitId: o.c.u.id, to: o.hex } : { type: 'move', unitId: o.c.u.id, to: o.hex });
    }
  }
  return actions;
}

export function createHeuristicAi(): AiPlayer {
  const considered = new Set<string>();
  let memoKey = '';
  let assaultQueue: Action[] | null = null;
  const resetIfNewPhase = (s: GameState) => {
    const k = `${s.turn}|${s.activeSide}|${s.phase}`;
    if (k !== memoKey) {
      memoKey = k;
      considered.clear();
      assaultQueue = null;
    }
  };

  function initialAction(s: GameState): Action | null {
    const side = s.activeSide;
    const own = Object.values(s.units).filter((u) => sideOf(u) === side);
    const reduced = own
      .filter((u) => u.stepsLost > 0 && (u.where.kind === 'map' || u.where.kind === 'reserve') && !considered.has('r' + u.id))
      .sort((a, b) => def(b.id).steps[0].attack - def(a.id).steps[0].attack);
    for (const u of reduced) {
      considered.add('r' + u.id);
      const a: Action = { type: 'replace', unitId: u.id };
      if (isLegal(s, a)) return a;
    }
    for (const u of own) {
      if (def(u.id).type === 'asu' && u.fired && s.supplyPoints[side] > 0 && u.where.kind === 'map') {
        return { type: 'readyAsu', unitId: u.id };
      }
    }
    return null;
  }

  function movementAction(s: GameState): Action | null {
    const side = s.activeSide;
    const ctx = makeCtx(s);
    const mode: MoveMode = 'tactical';
    // 1) Landings and airdrops.
    if (side === 'Allied') {
      for (const u of Object.values(s.units)) {
        if (sideOf(u) !== side || considered.has(u.id)) continue;
        const off = u.where.kind === 'reserve' || (u.where.kind === 'entry' && (u.where.area === 'airdrop' || u.where.area.startsWith('hex:')));
        if (!off) continue;
        considered.add(u.id);
        const hexes = landingHexes(s, u.id);
        if (!hexes.length) continue;
        const best = bestDestination(s, ctx, u, new Map(hexes.map((h) => [h, null])));
        if (best) return { type: 'land', unitId: u.id, to: best };
      }
    }
    // 2) Coordinated assaults: move units adjacent to good targets.
    if (assaultQueue === null) assaultQueue = planAssaults(s, ctx.aggression);
    while (assaultQueue.length) {
      const a = assaultQueue.shift()!;
      if (a.type === 'move' || a.type === 'enter') considered.add(a.unitId);
      if (isLegal(s, a)) return a;
    }
    // 3) Reinforcements waiting at entry areas.
    for (const u of Object.values(s.units)) {
      if (sideOf(u) !== side || considered.has(u.id) || u.where.kind !== 'entry') continue;
      if (u.where.area === 'airdrop' || u.where.area.startsWith('hex:')) continue;
      considered.add(u.id);
      const dests = entryDestinations(s, u.id, u.where.area, mode);
      const best = bestDestination(s, ctx, u, dests);
      if (best) return { type: 'enter', unitId: u.id, to: best, mode };
    }
    // 4) Units on the map, rear units first.
    const movers = Object.values(s.units)
      .filter((u) => u.where.kind === 'map' && sideOf(u) === side && !considered.has(u.id) && u.mpSpent === null &&
        (!u.frozenUntil || s.turn >= u.frozenUntil))
      .map((u) => ({ u, d: nearestEnemyDistance(s, (u.where as { hex: HexId }).hex, side) }))
      .sort((a, b) => b.d - a.d);
    for (const { u } of movers) {
      considered.add(u.id);
      const here = (u.where as { hex: HexId }).hex;
      // Units already engaged hold unless clearly outclassed.
      if (adjacentEnemy(s, here, side) && def(u.id).type !== 'asu') {
        const risk = threat(ctx, s, here) / (defenseAt(s, here, side) + 0.01);
        if (risk < 2.5 || ctx.aggression > 0.6) continue;
      }
      const dests = legalDestinations(s, u.id, mode);
      if (!dests.size) continue;
      const best = bestDestination(s, ctx, u, dests, here);
      if (best && best !== here) return { type: 'move', unitId: u.id, to: best, mode };
    }
    return null;
  }

  function combatAction(s: GameState): Action | null {
    const side = s.activeSide;
    const aggression = aggressionFor(s, side);
    const targets = new Set<HexId>();
    for (const u of Object.values(s.units)) {
      if (u.where.kind !== 'map' || sideOf(u) !== side || !isCombatUnit(u) || u.attacked || u.disrupted) continue;
      for (const n of neighbors(u.where.hex)) {
        if (unitsAt(s, n).some((x) => sideOf(x) !== side)) targets.add(n);
      }
    }
    let best: ReturnType<typeof bestAttackOn> = null;
    for (const t of targets) {
      if (considered.has('t' + t)) continue;
      const opt = bestAttackOn(s, t, aggression);
      if (opt && (!best || opt.score > best.score)) best = opt;
    }
    const threshold = 0.15 - aggression * 0.25;
    if (best && best.score > threshold) {
      considered.add('t' + best.plan.target);
      return { type: 'attack', ...best.plan };
    }
    return null;
  }

  function advanceAction(s: GameState): Action {
    const p = s.pendingAdvance!;
    const side = s.activeSide;
    const aggression = aggressionFor(s, side);
    const hd = MAP.hexes[p.hex];
    const cands = p.unitIds
      .map((id) => s.units[id])
      .filter((u) => u.where.kind === 'map')
      .sort((a, b) => values(b).defense - values(a).defense);
    const want = hd.vp || hd.city ? 2 : aggression > 0.5 ? 1 : 0;
    const chosen: string[] = [];
    for (const u of cands) {
      if (chosen.length >= Math.min(want, p.max)) break;
      const t = threatAt(s, p.hex, side);
      const d = defenseAt(s, p.hex, side, u) + chosen.reduce((a, id) => a + values(s.units[id]).defense, 0);
      if (t / (d + 0.01) < 2.5 || hd.vp) chosen.push(u.id);
    }
    return { type: 'advance', unitIds: chosen };
  }

  return {
    name: 'Heuristic AI',
    nextAction(s: GameState): Action {
      resetIfNewPhase(s);
      if (s.pendingAdvance) return advanceAction(s);
      let a: Action | null = null;
      if (s.phase === 'initial') a = initialAction(s);
      else if (s.phase === 'movement') a = movementAction(s);
      else if (s.phase === 'combat') a = combatAction(s);
      return a ?? { type: 'endPhase' };
    },
  };
}
