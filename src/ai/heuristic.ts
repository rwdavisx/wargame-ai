// A rule-of-thumb AI that can play either side. It scores destination hexes
// for each unit, plans coordinated assaults, and takes attacks by expected
// step-loss exchange. It also answers the defender's Determined Defense choice.
import { MAP, RULES } from '../engine/data';
import { advanceDestinations, computeOdds } from '../engine/combat';
import { breakthroughMoves, breakthroughPlan, breakthroughTargets } from '../engine/breakthrough';
import { alliedVp, applyAction, benchmark, entryReach, landingHexes } from '../engine/game';
import { distance, neighbors, sideKey, type HexId } from '../engine/hex';
import { allowedModes, cannotMove, entryModes, legalDestinations, type Reach } from '../engine/movement';
import { supplyChecker, beachheadHexes } from '../engine/supply';
import type { Action, GameState, MoveMode, Side, UnitState } from '../engine/types';
import { canStack, def, goodOrder, nationGroup, sideOf, stackPoints, stepsRemaining, unitsAt, values } from '../engine/units';
import { zocOf } from '../engine/zoc';
import { bestAttackOn, defenseAt, distanceField, enemyAdjacentHexes, expectedOutcome, nearestEnemyDistance, threatAt } from './evaluate';

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

let vpMemo = { key: '', behind: 0 };

/** How many VP the Allies are short of the next benchmark (cached per phase). */
function alliedShortfall(s: GameState): number {
  const key = `${s.scenarioId}|${s.turn}|${s.activeSide}|${s.phase}`;
  if (vpMemo.key !== key) {
    const target = benchmark(Math.max(4, s.turn + 1)) ?? benchmark(s.lastTurn) ?? 0;
    vpMemo = { key, behind: Math.max(0, target - alliedVp(s)) };
  }
  return vpMemo.behind;
}

/** Aggression in [0,1]: Germans counterattack hard on turns 1-8, Allies push later and whenever they fall behind on VP. */
export function aggressionFor(s: GameState, side: Side): number {
  if (side === 'German') return s.turn <= 3 ? 0.65 : s.turn <= 8 ? 0.8 : s.turn <= 11 ? 0.4 : 0.2;
  const base = s.turn <= 4 ? 0.3 : s.turn <= 9 ? 0.5 : 0.75;
  return Math.min(0.9, base + 0.08 * Math.min(4, alliedShortfall(s)));
}

interface Ctx {
  side: Side;
  aggression: number;
  supply: ReturnType<typeof supplyChecker>;
  objective: Map<HexId, number>;
  threat: Map<HexId, number>;
  beaches: Set<HexId>;
  bhHexes: Set<HexId>;
}

function objectives(s: GameState, side: Side, aggression: number): HexId[] {
  const out: HexId[] = [];
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.vp) continue;
    if ((s.control[h] ?? 'German') !== side) out.push(h);
    else if (aggression < 0.5) out.push(h);
  }
  if (side === 'German' && aggression >= 0.5) out.push(...beachheadHexes(s));
  if (side === 'Allied' && s.turn >= 12) out.push(...MAP.entryAreas.N1.hexes, ...MAP.entryAreas.N2.hexes);
  return out;
}

function makeCtx(s: GameState): Ctx {
  const side = s.activeSide;
  const aggression = aggressionFor(s, side);
  return {
    side, aggression,
    supply: supplyChecker(s, side),
    objective: distanceField(objectives(s, side, aggression)),
    threat: new Map(),
    beaches: new Set(Object.values(MAP.beaches).map((b) => b.hex)),
    bhHexes: new Set(beachheadHexes(s)),
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
  if (!ctx.supply.inSupply(h)) score -= 4;
  if (d.asu) {
    const ne = nearestEnemyDistance(s, h, ctx.side);
    score -= Math.abs(ne - 2) * 1.2;
    if (ne <= 1) score -= 4;
    return score;
  }
  const dist = ctx.objective.get(h) ?? 30;
  score -= dist * (0.3 + ctx.aggression * 0.35);
  if (hd.city) score += 0.6;
  else if (hd.terrain === 'hill' && (d.infantryType || d.cat === 'recon')) score += 0.4;
  if (hd.vp && (s.control[h] ?? 'German') === ctx.side) score += 0.5 + 0.3 * hd.vp;
  if (ctx.side === 'Allied') {
    // Beachheads are supply sources and cost a VP each if lost: garrison them in proportion to the threat.
    for (const bh of ctx.bhHexes) {
      const dd = distance(bh, h);
      if (dd > 1) continue;
      const tB = threat(ctx, s, bh);
      if (tB <= 0) {
        if (dd === 0) score += 0.6;
        continue;
      }
      const held = 2 + unitsAt(s, bh).filter((x) => sideOf(x) === 'Allied' && x.id !== u.id && !def(x.id).asu && def(x.id).cat !== 'bh')
        .reduce((a, x) => a + values(x).defense, 0);
      const need = Math.min(3, tB / held);
      score += dd === 0 ? 0.8 + need * 1.3 : need * 0.4;
    }
  }
  const t = threat(ctx, s, h);
  const defense = defenseAt(s, h, ctx.side, u) + 0.5;
  score -= Math.max(0, t / defense - (1.3 + ctx.aggression)) * (1.5 - ctx.aggression);
  const adj = enemyAdjacentHexes(s, h, ctx.side);
  if (adj.length) {
    let weak = 0;
    for (const e of adj) {
      const ed = unitsAt(s, e).reduce((a, x) => a + values(x).defense, 0);
      if (ed <= values(u).attack * 1.5) weak++;
    }
    score += ctx.aggression * 0.5 * Math.min(2, weak);
  }
  score += 0.15 * unitsAt(s, h).filter((x) => sideOf(x) === ctx.side && !def(x.id).asu && x.id !== u.id).length;
  return score;
}

function bestOf(s: GameState, ctx: Ctx, u: UnitState, hexes: Iterable<HexId>, current?: HexId): HexId | null {
  let best: HexId | null = null;
  let bestScore = current ? scoreHex(s, ctx, u, current) + 0.25 : -Infinity;
  for (const h of hexes) {
    const sc = scoreHex(s, ctx, u, h);
    if (sc > bestScore) {
      bestScore = sc;
      best = h;
    }
  }
  return best;
}

function ratioIndex(ratio: number): number {
  if (ratio < 1 / 3) return -1;
  if (ratio < 0.5) return 0;
  if (ratio < 1) return 1;
  return 1 + Math.floor(ratio + 1e-9);
}

function forbidden(s: GameState, side: Side, h: HexId): boolean {
  if (side === 'German' && s.turn === 1 && Object.values(MAP.beaches).some((b) => b.hex === h)) return true;
  if (side === 'German' && s.abandoned8th && MAP.hexes[h].sector8) return true;
  return false;
}

/** Plans moves that bring enough strength next to good targets. */
export function planAssaults(s: GameState, aggression: number): Action[] {
  const side = s.activeSide;
  const minIndex = aggression >= 0.7 ? 3 : aggression >= 0.45 ? 4 : 5;
  type Cand = { u: UnitState; here: HexId | null; dests: Map<HexId, Reach>; mode: MoveMode; entry: boolean };
  const cands: Cand[] = [];
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side || def(u.id).asu || def(u.id).cat === 'bh' || def(u.id).variable || values(u).attack <= 0 || !goodOrder(u)) continue;
    if (u.where.kind === 'map' && !cannotMove(s, u)) {
      const mode: MoveMode = allowedModes(s, u).includes('normal') ? 'normal' : 'tactical';
      cands.push({ u, here: u.where.hex, dests: legalDestinations(s, u.id, mode), mode, entry: false });
    } else if (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop') && !u.stopped && !(side === 'Allied' && u.where.area.startsWith('N'))) {
      const mode: MoveMode = entryModes(s, u).includes('normal') ? 'normal' : 'tactical';
      cands.push({ u, here: null, dests: entryReach(s, u.id, mode), mode, entry: true });
    }
  }
  const enemyHexes = new Map<HexId, UnitState[]>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) === side) continue;
    enemyHexes.set(u.where.hex, [...(enemyHexes.get(u.where.hex) ?? []), u]);
  }
  const bh = new Set(beachheadHexes(s));
  const valueOf = (h: HexId, us: UnitState[]) =>
    (MAP.hexes[h].vp ?? 0) * 2 + (side === 'German' && bh.has(h) ? 2 : 0) - us.reduce((a, u) => a + values(u).defense, 0) * 0.1;
  const targets = [...enemyHexes.entries()].sort((a, b) => valueOf(b[0], b[1]) - valueOf(a[0], a[1]));
  const used = new Set<string>();
  const planned = new Map<HexId, string[]>();
  const actions: Action[] = [];
  for (const [E, defenders] of targets) {
    const hd = MAP.hexes[E];
    const doubles = hd.city || hd.terrain === 'hill' || hd.terrain === 'marsh';
    const D = Math.max(1, defenders.reduce((a, u) => {
      const dd = def(u.id);
      if (dd.asu || u.status === 'fullRetreat') return a;
      const v = dd.variable ? 1 : values(u).defense;
      return a + (doubles && (dd.infantryType || dd.cat === 'recon') ? v * 2 : v) * (u.status === 'disrupted' ? 0.5 : 1);
    }, 0));
    const defTank = defenders.some((u) => def(u.id).tankRating);
    for (const group of side === 'Allied' ? ['US|5', 'CW|5', 'CW|8'] : ['GE|5']) {
      const opts: { c: Cand; hex: HexId; att: number; move: boolean }[] = [];
      for (const c of cands) {
        if (used.has(c.u.id)) continue;
        if (`${nationGroup(c.u.id)}|${def(c.u.id).army8 ? 8 : 5}` !== group) continue;
        let att = values(c.u).attack * (c.u.outOfSupply ? 0.5 : 1);
        if (c.here && neighbors(c.here).includes(E)) {
          const hs = MAP.hexsides[sideKey(c.here, E)] ?? {};
          if (hs.mountain && !hs.road && !hs.pass && def(c.u.id).vehicle) continue;
          if ((hs.mountain && !hs.road) || hs.pass || (hs.river && def(c.u.id).vehicle)) att /= 2;
          opts.push({ c, hex: c.here, att, move: false });
          continue;
        }
        let best: HexId | null = null;
        let bestCost = Infinity;
        for (const n of neighbors(E)) {
          const r = c.dests.get(n);
          if (!r || forbidden(s, side, n)) continue;
          const hs = MAP.hexsides[sideKey(n, E)] ?? {};
          if (hs.mountain && !hs.road && !hs.pass && def(c.u.id).vehicle) continue;
          const room = stackPoints([...unitsAt(s, n).map((x) => x.id), ...(planned.get(n) ?? []), c.u.id]) <= RULES.stackingLimit;
          if (room && r.cost < bestCost) {
            best = n;
            bestCost = r.cost;
          }
        }
        if (best) {
          const hs = MAP.hexsides[sideKey(best, E)] ?? {};
          if ((hs.mountain && !hs.road) || hs.pass || (hs.river && def(c.u.id).vehicle)) att /= 2;
          opts.push({ c, hex: best, att, move: true });
        }
      }
      if (!opts.length) continue;
      opts.sort((a, b) => b.att - a.att);
      const chosen: typeof opts = [];
      let A = 0;
      let est = -1;
      for (const o of opts) {
        if (o.move && stackPoints([...unitsAt(s, o.hex).map((x) => x.id), ...(planned.get(o.hex) ?? []), ...chosen.filter((x) => x.hex === o.hex && x.move).map((x) => x.c.u.id), o.c.u.id]) > RULES.stackingLimit) continue;
        chosen.push(o);
        A += o.att * (chosen.length > 2 ? 0.75 : 1); // units outside the Main Assault Force attack at half
        let shift = 0;
        if (!doubles && !defTank && chosen.some((x) => def(x.c.u.id).tankRating)) shift += 1;
        if (chosen.some((x) => def(x.c.u.id).elite) && !defenders.some((u) => def(u.id).elite)) shift += 1;
        est = ratioIndex(Math.min(20, A) / Math.min(20, D)) + shift;
        if (est >= minIndex + 1) break;
      }
      if (est < minIndex) continue;
      for (const o of chosen) {
        used.add(o.c.u.id);
        if (!o.move) continue;
        planned.set(o.hex, [...(planned.get(o.hex) ?? []), o.c.u.id]);
        actions.push(o.c.entry ? { type: 'enter', unitId: o.c.u.id, to: o.hex, mode: o.c.mode } : { type: 'move', unitId: o.c.u.id, to: o.hex, mode: o.c.mode });
      }
      break;
    }
  }
  return actions;
}

// ------------------------------------------------------------------ decisions

export function chooseDefense(s: GameState): Action {
  const pd = s.pendingDefense!;
  const hex = pd.hex;
  const d = MAP.hexes[hex];
  const column = d.city ? 'City' : d.terrain === 'clear' && !d.town ? 'Clear' : 'Other';
  const defenders = unitsAt(s, hex).filter((u) => sideOf(u) === pd.defenderSide);
  const lead = defenders.find((u) => goodOrder(u) && !def(u.id).asu && def(u.id).elite) ?? defenders.find((u) => goodOrder(u) && !def(u.id).asu);
  const support = pd.supportOptions[0] ?? null;
  const drm = Math.min(2, (support ? 1 : 0) + (lead && def(lead.id).elite ? 1 : 0)) - (pd.yellow ? 1 : 0);
  const steps = defenders.reduce((a, u) => a + stepsRemaining(u), 0);
  const value = 1 + (d.vp ?? 0) * 0.8 + (d.city ? 0.5 : 0) + (Object.values(MAP.beaches).some((b) => b.hex === hex) && pd.defenderSide === 'Allied' ? 1.5 : 0);
  const prefer: 'hold' | 'delay' = steps >= 2 || value > 1.5 ? 'hold' : 'delay';
  let dd = 0;
  for (let r = 1; r <= 6; r++) {
    const entry = RULES.dd.table[column][Math.max(1, Math.min(7, r + drm)) - 1];
    const opts = entry.split('|');
    const pick = opts.length > 1 ? opts.find((o) => (prefer === 'hold' ? o.includes('H') : !o.includes('H'))) ?? opts[0] : opts[0];
    const [losses, letter] = pick.split(' ');
    const [att, dfn] = losses.split('/');
    let v = (att.startsWith('1') ? 0.9 : 0) - (dfn === '1' ? 0.9 : 0) - (dfn === 'dis' ? 0.2 : 0);
    if (letter === 'H' || (letter === 'P' && !s.cityBattle[hex])) v += value;
    else if (letter === 'D' || letter === 'P') v += 0.2;
    else v -= pd.desperate ? 1 : 0.15;
    dd += v / 6;
  }
  const retreat = pd.desperate ? -steps * 1.2 : -0.35 * value;
  if (dd > retreat) return { type: 'defend', choice: 'dd', support, prefer, battleships: support?.endsWith('-naval') && s.support.battleships > 0 };
  return { type: 'defend', choice: 'retreat' };
}

/** Expected value of a breakthrough attack on `target` by the group in state `s`. */
function breakthroughScore(s: GameState, target: HexId, aggression: number): number {
  const odds = computeOdds(s, breakthroughPlan(s, target));
  if (!odds.ok) return -Infinity;
  const defSteps = unitsAt(s, target).filter((u) => sideOf(u) !== s.activeSide).reduce((a, u) => a + stepsRemaining(u), 0);
  const e = odds.autoDs ? { defLoss: 1, attLoss: 0, retreat: 1.3, disrupt: 0 } : expectedOutcome(odds.finalIndex, odds.drm, defSteps);
  const vp = MAP.hexes[target].vp ?? 0;
  return e.defLoss * 1.1 + e.retreat * (0.5 + vp * 0.35) + e.disrupt * 0.3 - e.attLoss * (1.25 - aggression * 0.45);
}

/** Declares a Breakthrough Group in the vacated hex when a good follow-up attack exists. */
function planBreakthrough(s: GameState, aggression: number): Action | null {
  const pa = s.pendingAdvance!;
  const ids = Object.keys(pa.maxByUnit)
    .filter((id) => s.units[id]?.where.kind === 'map' && pa.maxByUnit[id] >= 2 && advanceDestinations(s, pa, id).has(pa.vacated))
    .sort((a, b) => values(s.units[b]).attack - values(s.units[a]).attack);
  const group: string[] = [];
  for (const id of ids) if (canStack(s, pa.vacated, [...group, id])) group.push(id);
  if (!group.length) return null;
  const a: Action = { type: 'btStart', unitIds: group, form: 'vacated' };
  let trial: GameState;
  try {
    trial = structuredClone({ ...s, log: [] });
    applyAction(trial, a);
  } catch {
    return null;
  }
  if (!trial.breakthrough) return null;
  const best = Math.max(-Infinity, ...breakthroughTargets(trial).map((t) => breakthroughScore(trial, t, aggression)));
  return best > 0.35 ? a : null;
}

function chooseBreakthrough(s: GameState): Action {
  const b = s.breakthrough!;
  const aggression = aggressionFor(s, s.activeSide);
  let best: { t: HexId; score: number } | null = null;
  for (const t of breakthroughTargets(s)) {
    const sc = breakthroughScore(s, t, aggression);
    if (!best || sc > best.score) best = { t, score: sc };
  }
  if (best && best.score > 0.35) return { type: 'btAttack', target: best.t };
  if (b.freeHex && breakthroughMoves(s).has(b.freeHex)) {
    const risk = threatAt(s, b.freeHex, s.activeSide) / (defenseAt(s, b.freeHex, s.activeSide) + 0.5);
    if (risk < 3 || MAP.hexes[b.freeHex].vp) return { type: 'btMove', to: b.freeHex };
  }
  return { type: 'btEnd' };
}

function chooseAdvance(s: GameState): Action {
  const pa = s.pendingAdvance!;
  const side = s.activeSide;
  const aggression = aggressionFor(s, side);
  if (pa.btAllowed && !pa.started) {
    const bt = planBreakthrough(s, aggression);
    if (bt) return bt;
  }
  const hd = MAP.hexes[pa.vacated];
  const ids = Object.keys(pa.maxByUnit).filter((id) => s.units[id]?.where.kind === 'map');
  const cands = ids.filter((id) => advanceDestinations(s, pa, id).has(pa.vacated))
    .sort((a, b) => values(s.units[b]).defense - values(s.units[a]).defense);
  const want = hd.vp || hd.city ? 3 : aggression > 0.45 ? 2 : 1;
  const chosen: string[] = [];
  for (const id of cands) {
    if (chosen.length >= want) break;
    if (stackPoints([...unitsAt(s, pa.vacated).map((u) => u.id), ...chosen, id]) > RULES.stackingLimit) continue;
    const t = threatAt(s, pa.vacated, side);
    const dd = defenseAt(s, pa.vacated, side, s.units[id]) + chosen.reduce((a, x) => a + values(s.units[x]).defense, 0);
    if (t / (dd + 0.5) < 2.5 || hd.vp) chosen.push(id);
  }
  return chosen.length ? { type: 'advance', unitIds: chosen, to: pa.vacated } : { type: 'advance', unitIds: [] };
}

// ------------------------------------------------------------------ the player

export function createHeuristicAi(): AiPlayer {
  const considered = new Set<string>();
  let memoKey = '';
  let assaultQueue: Action[] | null = null;
  const reset = (s: GameState) => {
    const k = `${s.turn}|${s.activeSide}|${s.phase}`;
    if (k !== memoKey) {
      memoKey = k;
      considered.clear();
      assaultQueue = null;
    }
  };

  function invasionAction(s: GameState): Action | null {
    const cdos = ['BR-2Cdo', 'BR-41Cdo'].filter((id) => s.units[id].where.kind === 'map' && s.units[id].tacHexes === 1 && !s.units[id].stopped &&
      neighbors((s.units[id].where as { hex: HexId }).hex).includes('2707'));
    if (cdos.length && !considered.has('cdo') && unitsAt(s, '2707').some((u) => sideOf(u) === 'German')) {
      considered.add('cdo');
      const a: Action = { type: 'attack', target: '2707', attackers: cdos };
      if (isLegal(s, a)) return a;
    }
    return moveUnits(s, makeCtx(s));
  }

  function initialAction(s: GameState): Action | null {
    const side = s.activeSide;
    const ctx = makeCtx(s);
    for (const u of Object.values(s.units)) {
      if (sideOf(u) !== side || u.where.kind !== 'entry' || !u.where.area.startsWith('airdrop') || considered.has(u.id)) continue;
      considered.add(u.id);
      const zoc = zocOf(s, 'German');
      const hexes = landingHexes(s, u.id).filter((h) => !zoc.has(h) && MAP.hexes[h].terrain !== 'marsh');
      const best = bestOf(s, ctx, u, hexes.length ? hexes : landingHexes(s, u.id));
      if (best) return { type: 'land', unitId: u.id, to: best };
    }
    const own = Object.values(s.units).filter((u) => sideOf(u) === side);
    const replCands = own
      .filter((u) => !considered.has('r' + u.id) && def(u.id).repl &&
        ((u.where.kind === 'map' && (u.stepsLost > 0 || !!u.represents)) || (u.where.kind === 'eliminated' && !u.where.permanent && def(u.id).cat !== 'bh')))
      .sort((a, b) => def(b.id).steps[0].attack + def(b.id).steps[0].defense - (def(a.id).steps[0].attack + def(a.id).steps[0].defense));
    for (const u of replCands) {
      considered.add('r' + u.id);
      const a: Action = { type: 'replace', unitId: u.id };
      if (isLegal(s, a)) return a;
    }
    for (const u of own) {
      if (def(u.id).asu && u.fired && s.supplyPoints[side] > 0 && u.where.kind === 'map' && !considered.has('a' + u.id)) {
        considered.add('a' + u.id);
        const a: Action = { type: 'readyAsu', unitId: u.id };
        if (isLegal(s, a)) return a;
      }
    }
    return null;
  }

  function moveUnits(s: GameState, ctx: Ctx): Action | null {
    const side = s.activeSide;
    const movers = Object.values(s.units)
      .filter((u) => u.where.kind === 'map' && sideOf(u) === side && !considered.has(u.id) && !cannotMove(s, u))
      .map((u) => ({ u, d: nearestEnemyDistance(s, (u.where as { hex: HexId }).hex, side) }))
      .sort((a, b) => b.d - a.d);
    for (const { u, d } of movers) {
      considered.add(u.id);
      const here = (u.where as { hex: HexId }).hex;
      if (enemyAdjacentHexes(s, here, side).length && !def(u.id).asu) {
        const risk = threat(ctx, s, here) / (defenseAt(s, here, side) + 0.5);
        if (risk < 2.5 || ctx.aggression > 0.6) continue;
      }
      const modes = allowedModes(s, u);
      let best: { h: HexId; mode: MoveMode; score: number } | null = null;
      const tryMode = (mode: MoveMode) => {
        const dests = legalDestinations(s, u.id, mode);
        for (const h of dests.keys()) {
          if (forbidden(s, side, h)) continue;
          if (def(u.id).asu && (dests.get(h)!.hexes > 1) && d <= 4) continue; // keep artillery able to fire
          const sc = scoreHex(s, ctx, u, h);
          if (!best || sc > best.score) best = { h, mode, score: sc };
        }
      };
      if (modes.includes('normal')) tryMode('normal');
      if (modes.includes('extended') && d >= 4) tryMode('extended');
      if (!modes.includes('normal')) tryMode('tactical');
      const b = best as { h: HexId; mode: MoveMode; score: number } | null;
      if (b && b.score > scoreHex(s, ctx, u, here) + 0.25) return { type: 'move', unitId: u.id, to: b.h, mode: b.mode };
    }
    return null;
  }

  function movementAction(s: GameState): Action | null {
    const side = s.activeSide;
    const ctx = makeCtx(s);
    if (side === 'Allied') {
      const waiting = Object.values(s.units)
        .filter((u) => sideOf(u) === side && (u.where.kind === 'reserve' || u.where.kind === 'followUp' || u.where.kind === 'atSea') && !considered.has(u.id))
        .sort((a, b) => def(b.id).sp - def(a.id).sp);
      for (const u of waiting) {
        considered.add(u.id);
        let hexes = landingHexes(s, u.id).filter((h) => canStack(s, h, [u.id]));
        if (def(u.id).asu) hexes = hexes.filter((h) => !enemyAdjacentHexes(s, h, side).length);
        const best = bestOf(s, ctx, u, hexes);
        if (best) return { type: 'land', unitId: u.id, to: best };
      }
    }
    if (assaultQueue === null) assaultQueue = planAssaults(s, ctx.aggression);
    while (assaultQueue.length) {
      const a = assaultQueue.shift()!;
      if (a.type === 'move' || a.type === 'enter') considered.add(a.unitId);
      if (isLegal(s, a)) return a;
    }
    for (const u of Object.values(s.units)) {
      if (sideOf(u) !== side || considered.has(u.id) || u.where.kind !== 'entry' || u.where.area.startsWith('airdrop') || u.stopped) continue;
      if (side === 'Allied' && u.where.area.startsWith('N')) continue;
      considered.add(u.id);
      if (u.status !== 'good') continue;
      const mode: MoveMode = entryModes(s, u).includes('normal') ? 'normal' : 'tactical';
      const dests = [...entryReach(s, u.id, mode).keys()].filter((h) => !forbidden(s, side, h));
      const best = bestOf(s, ctx, u, dests);
      if (best) return { type: 'enter', unitId: u.id, to: best, mode };
    }
    return moveUnits(s, ctx);
  }

  function combatAction(s: GameState): Action | null {
    const side = s.activeSide;
    const aggression = aggressionFor(s, side);
    const targets = new Set<HexId>();
    for (const u of Object.values(s.units)) {
      if (u.where.kind !== 'map' || sideOf(u) !== side || u.attacked || !goodOrder(u)) continue;
      for (const n of neighbors(u.where.hex)) if (unitsAt(s, n).some((x) => sideOf(x) !== side)) targets.add(n);
    }
    let best: ReturnType<typeof bestAttackOn> = null;
    for (const t of targets) {
      if (considered.has('t' + t)) continue;
      const opt = bestAttackOn(s, t, aggression, { vpWeight: side === 'Allied' ? 0.35 + 0.15 * Math.min(4, alliedShortfall(s)) : 0.35 });
      if (opt && (!best || opt.score > best.score)) best = opt;
    }
    const threshold = 0.2 - aggression * 0.3;
    if (best && best.score > threshold) {
      considered.add('t' + best.plan.target);
      return { type: 'attack', ...best.plan };
    }
    return null;
  }

  return {
    name: 'Heuristic AI',
    nextAction(s: GameState): Action {
      if (s.retreatQueue?.length) return { type: 'retreatChoice', index: s.retreatQueue[0].current };
      if (s.pendingDefense) return chooseDefense(s);
      reset(s);
      if (s.breakthrough) return chooseBreakthrough(s);
      if (s.pendingAdvance) return chooseAdvance(s);
      let a: Action | null = null;
      if (s.phase === 'invasion') a = invasionAction(s);
      else if (s.phase === 'initial') a = initialAction(s);
      else if (s.phase === 'movement') a = movementAction(s);
      else if (s.phase === 'combat') a = combatAction(s);
      return a ?? { type: 'endPhase' };
    },
  };
}

