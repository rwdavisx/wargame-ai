// A rule-of-thumb AI that can play either side, at four levels of skill.
// It reads where the enemy can strike next turn (following real movement, not just distance),
// weighs every move by the risk it adds or removes across the whole position as well as the
// ground it gains, guards what is worth victory points (artillery, beach groups, towns), plans
// coordinated assaults, and takes attacks by their expected exchange of steps and points.
import { MAP, RULES } from '../../src/engine/data';
import { advanceDestinations, computeOdds } from '../../src/engine/combat';
import { breakthroughMoves, breakthroughPlan, breakthroughTargets } from '../../src/engine/breakthrough';
import { alliedVp, applyAction, benchmark, entryReach, landingHexes } from '../../src/engine/game';
import { distance, neighbors, sideKey, type HexId } from '../../src/engine/hex';
import { allowedModes, cannotMove, entryModes, legalDestinations, type Reach } from '../../src/engine/movement';
import { nextRandom } from '../../src/engine/rng';
import { supplyChecker, beachheadHexes } from '../../src/engine/supply';
import type { Action, GameState, MoveMode, Side, UnitState } from '../../src/engine/types';
import { canStack, def, goodOrder, nationGroup, sideOf, stackPoints, stepsRemaining, unitsAt, values } from '../../src/engine/units';
import { zocOf } from '../../src/engine/zoc';
import { bestAttackOn, defenseAt, distanceField, enemyAdjacentHexes, expectedOutcome, nearestEnemyDistance, threatAt } from './evaluate';
import { ownAt, stackRisk, threatMap, type ThreatMap } from './reach';

export interface AiPlayer {
  name: string;
  nextAction(s: GameState): Action | Promise<Action>;
}

/** How well the computer plays: from a careless Recruit to an Elite commander. */
export type Difficulty = 'recruit' | 'regular' | 'veteran' | 'elite';

export const DIFFICULTIES: { key: Difficulty; label: string; note: string }[] = [
  { key: 'recruit', label: 'Recruit', note: 'Makes mistakes and leaves openings. For learning the game.' },
  { key: 'regular', label: 'Regular', note: 'Plays sensibly but misses things.' },
  { key: 'veteran', label: 'Veteran', note: 'Reads your threats, guards what matters and strikes weak spots.' },
  { key: 'elite', label: 'Elite', note: 'Plays its best: no slips, every attack tuned.' },
];

interface Skill {
  /** Random error added to every score (in score units). */
  noise: number;
  /** Chance to overlook an attack or a move entirely. */
  blunder: number;
  /** Read the enemy's real movement for threats (otherwise just distance). */
  reach: boolean;
  /** How much the risk to the whole position weighs against gaining ground. */
  care: number;
  /** Leave out attackers an attack does not need. */
  trim: boolean;
  /** Value of breaking stacks that hold artillery and beach groups. */
  killValue: number;
  /** Shift on the score an attack needs before it is made (positive: more cautious). */
  attackBar: number;
}

const SKILLS: Record<Difficulty, Skill> = {
  recruit: { noise: 1.5, blunder: 0.3, reach: false, care: 0.25, trim: false, killValue: 0, attackBar: 0.25 },
  regular: { noise: 0.7, blunder: 0.1, reach: true, care: 0.6, trim: false, killValue: 1.2, attackBar: 0.1 },
  veteran: { noise: 0.25, blunder: 0.02, reach: true, care: 0.9, trim: true, killValue: 2.4, attackBar: 0 },
  elite: { noise: 0, blunder: 0, reach: true, care: 1, trim: true, killValue: 3, attackBar: -0.05 },
};

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
  if (side === 'German') {
    const base = s.turn <= 3 ? 0.65 : s.turn <= 8 ? 0.8 : s.turn <= 11 ? 0.4 : 0.2;
    // With the Allies short of the benchmark, keep pressing: the next push may end it.
    return Math.min(0.9, base + (s.turn >= 3 && alliedShortfall(s) >= 3 ? 0.1 : 0));
  }
  const base = s.turn <= 4 ? 0.3 : s.turn <= 9 ? 0.5 : 0.75;
  return Math.min(0.9, base + 0.08 * Math.min(4, alliedShortfall(s)));
}

interface Ctx {
  side: Side;
  aggression: number;
  skill: Skill;
  supply: ReturnType<typeof supplyChecker>;
  objective: Map<HexId, number>;
  threat: Map<HexId, number>;
  tm: ThreatMap | null;
  /** The threat if our screens were not there. */
  open: ThreatMap | null;
  noise: (key: string) => number;
  /** Hexes held by the enemy, and our hexes in contact with it. */
  enemyHexes: HexId[];
  front: HexId[];
  /** Columns the enemy's support is likely to add to an attack. */
  shift: number;
}

function objectives(s: GameState, side: Side, aggression: number): HexId[] {
  const out: HexId[] = [];
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.vp) continue;
    if ((s.control[h] ?? 'German') !== side) out.push(h);
    else if (aggression < 0.5) out.push(h);
  }
  if (side === 'German' && aggression >= 0.5) out.push(...beachheadHexes(s));
  // Enemy artillery is worth a point each: go for it.
  for (const u of Object.values(s.units)) {
    if (u.where.kind === 'map' && sideOf(u) !== side && def(u.id).asu) out.push(u.where.hex);
  }
  if (side === 'Allied' && s.turn >= 12) out.push(...MAP.entryAreas.N1.hexes, ...MAP.entryAreas.N2.hexes);
  return out;
}

/** A pseudo-random number in [-1, 1], fixed for a given game moment and key (games replay identically). */
function noiseFn(s: GameState, amount: number): (key: string) => number {
  if (!amount) return () => 0;
  return (key: string) => {
    let h = (s.seq * 2654435761 + s.turn * 97) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    const a = nextRandom(h).value;
    const b = nextRandom(h ^ 0x9e3779b9).value;
    return (a + b - 1) * amount;
  };
}

function frontOf(s: GameState, side: Side): { enemyHexes: HexId[]; front: HexId[] } {
  const enemy = new Set<HexId>();
  const own = new Set<HexId>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map') continue;
    if (sideOf(u) === side) {
      if (!def(u.id).asu) own.add(u.where.hex);
    } else enemy.add(u.where.hex);
  }
  return { enemyHexes: [...enemy], front: [...own].filter((h) => neighbors(h).some((n) => enemy.has(n))) };
}

function threat(ctx: Ctx, s: GameState, h: HexId): number {
  if (ctx.tm) return ctx.tm.strength.get(h) ?? 0;
  if (!ctx.threat.has(h)) ctx.threat.set(h, threatAt(s, h, ctx.side));
  return ctx.threat.get(h)!;
}

/** What the hex offers the unit (ground, terrain, supply, chances to strike), before risk. */
function positional(s: GameState, ctx: Ctx, u: UnitState, h: HexId): number {
  const d = def(u.id);
  const hd = MAP.hexes[h];
  let score = 0;
  if (!ctx.supply.inSupply(h)) score -= 4;
  if (d.asu) {
    const ne = nearestEnemyDistance(s, h, ctx.side);
    if (!ctx.tm) {
      // Artillery wants to be two or three hexes behind the front, in range of where the fighting is.
      score -= Math.abs(ne - 2.5) * 0.9;
      if (ne <= 1) score -= 3;
      return score;
    }
    // Artillery wants enemy stacks our units touch (to support attacks) and our front line (to support stands) in range.
    const range = d.asuRange ?? 3;
    const touched = new Set(ctx.front.flatMap((f) => neighbors(f)));
    let off = 0;
    for (const e of ctx.enemyHexes) if (touched.has(e) && distance(e, h) <= range) off++;
    let dfn = 0;
    for (const f of ctx.front) if (distance(f, h) <= range) dfn++;
    score += 0.7 * Math.min(3, off) + 0.45 * Math.min(4, dfn);
    if (!off && !dfn) score -= Math.min(6, ne) * 0.5; // drift toward the front
    if (ne <= 1) score -= 3;
    return score;
  }
  const dist = ctx.objective.get(h) ?? 30;
  score -= dist * (0.3 + ctx.aggression * 0.35);
  if (hd.city) score += 0.6;
  else if (hd.terrain === 'hill' && (d.infantryType || d.cat === 'recon')) score += 0.4;
  if (hd.vp && (s.control[h] ?? 'German') === ctx.side) score += 0.5 + 0.3 * hd.vp;
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

/** Threat to a stack: where points are at stake (artillery, beach groups), do not count on screens holding. */
function stackThreat(s: GameState, ctx: Ctx, h: HexId, ids: string[]): number {
  const t = threat(ctx, s, h);
  if (!ctx.open) return t;
  const o = ctx.open.strength.get(h) ?? 0;
  // The Allies hold a perimeter around their beaches: they guard all of it; the attacking Germans only their guns.
  const allied = ctx.side === 'Allied';
  const k = ids.some((id) => def(id).cat === 'bh') ? 0.75 : ids.some((id) => def(id).asu) ? (allied ? 0.75 : 0.45) : allied ? 0.35 : 0;
  return Math.max(t, o * k);
}

/** Change in the position's expected losses if `u` moves from `from` (null: from off the map) to `to`. */
function riskDelta(s: GameState, ctx: Ctx, u: UnitState, from: HexId | null, to: HexId): number {
  const side = ctx.side;
  const there = ownAt(s, to, side).filter((id) => id !== u.id);
  const tTo = stackThreat(s, ctx, to, [...there, u.id]);
  let delta = stackRisk(s, to, [...there, u.id], tTo, ctx.shift) - stackRisk(s, to, there, tTo, ctx.shift);
  if (from && from !== to) {
    const left = ownAt(s, from, side).filter((id) => id !== u.id);
    const tFrom = stackThreat(s, ctx, from, [...left, u.id]);
    delta += stackRisk(s, from, left, tFrom, ctx.shift) - stackRisk(s, from, [...left, u.id], tFrom, ctx.shift);
  }
  return delta;
}

/** Change in the victory points we stand to lose by leaving or holding towns the enemy can walk into. */
function pointsDelta(s: GameState, ctx: Ctx, u: UnitState, from: HexId | null, to: HexId): number {
  // The attacking Germans leave towns behind them; they garrison once they go over to the defensive.
  if (def(u.id).asu || !ctx.tm || (ctx.side === 'German' && ctx.aggression >= 0.5)) return 0;
  let delta = 0;
  if (from && from !== to && !ownAt(s, from, ctx.side).some((id) => id !== u.id && !def(id).asu)) delta += openPoints(s, ctx, from);
  if (!ownAt(s, to, ctx.side).some((id) => id !== u.id && !def(id).asu)) delta -= openPoints(s, ctx, to);
  return delta;
}

/** Points lost if this VP hex we hold were left empty: the enemy can simply march in. */
function openPoints(s: GameState, ctx: Ctx, h: HexId): number {
  const vp = MAP.hexes[h].vp;
  if (!vp || !ctx.tm || (s.control[h] ?? 'German') !== ctx.side || !ctx.tm.reach.has(h)) return 0;
  return vp * 2.6;
}

/** How good it is for `u` to end up in `to` (coming from `from`). */
function scoreMove(s: GameState, ctx: Ctx, u: UnitState, from: HexId | null, to: HexId): number {
  // Aggressive sides accept more risk to gain ground; careful ones guard what they hold.
  const weight = ctx.skill.care * (1.25 - ctx.aggression * 0.6);
  // Points are points whatever the mood: they are weighed in full.
  return positional(s, ctx, u, to) - weight * riskDelta(s, ctx, u, from, to) - ctx.skill.care * pointsDelta(s, ctx, u, from, to) +
    ctx.noise(`${u.id}>${to}`);
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

/** A unit landing on the other nation's beach is disrupted (Rangers and Commandos excepted). */
function wrongBeach(unitId: string, hex: HexId): boolean {
  const beach = Object.values(MAP.beaches).find((b) => b.hex === hex);
  if (!beach || ['Maiori', 'Vietri'].includes(beach.formation)) return false;
  const d = def(unitId);
  if (d.cat === 'ranger' || d.formation === 'Commando Bde') return false;
  return (beach.corps === 'X') !== (d.nation !== 'US');
}

/** Plans moves that bring enough strength next to good targets. */
export function planAssaults(s: GameState, aggression: number, skill: Skill = SKILLS.veteran, objective?: Map<HexId, number>): Action[] {
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
  const kill = skill.killValue;
  // Fights near the objectives count; chasing a stray unit into the hills does not win the battle.
  const far = (h: HexId) => (objective && skill.reach ? Math.min(8, objective.get(h) ?? 8) * 0.25 : 0);
  const valueOf = (h: HexId, us: UnitState[]) =>
    (MAP.hexes[h].vp ?? 0) * (skill.reach ? 3 : 2) + (side === 'German' && bh.has(h) ? 2 : 0) - far(h) +
    kill * us.filter((u) => def(u.id).asu || def(u.id).cat === 'bh').length -
    us.reduce((a, u) => a + values(u).defense, 0) * 0.1;
  const targets = [...enemyHexes.entries()].sort((a, b) => valueOf(b[0], b[1]) - valueOf(a[0], a[1]));
  const used = new Set<string>();
  const planned = new Map<HexId, string[]>();
  const actions: Action[] = [];
  for (const [E, defenders] of targets) {
    const hd = MAP.hexes[E];
    const doubles = hd.city || hd.terrain === 'hill' || hd.terrain === 'marsh';
    // Artillery alone defends at its own small value; next to combat units it adds nothing.
    const regular = defenders.filter((u) => !def(u.id).parenthesized && !def(u.id).asu);
    const D = Math.max(1, regular.length ? regular.reduce((a, u) => {
      const dd = def(u.id);
      if (u.status === 'fullRetreat') return a;
      const v = dd.variable ? 1 : values(u).defense;
      return a + (doubles && (dd.infantryType || dd.cat === 'recon') ? v * 2 : v) * (u.status === 'disrupted' ? 0.5 : 1);
    }, 0) : Math.max(0, ...defenders.map((u) => values(u).defense)));
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
          const room = stackPoints([...unitsAt(s, n).map((x) => x.id), ...(planned.get(n) ?? []), c.u.id], s) <= RULES.stackingLimit;
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
        if (o.move && stackPoints([...unitsAt(s, o.hex).map((x) => x.id), ...(planned.get(o.hex) ?? []), ...chosen.filter((x) => x.hex === o.hex && x.move).map((x) => x.c.u.id), o.c.u.id], s) > RULES.stackingLimit) continue;
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
  // Artillery and beach groups caught in the hex are points lost if the stand fails; holding saves them.
  const vpUnits = defenders.filter((u) => def(u.id).asu || def(u.id).cat === 'bh').length;
  const value = 1 + (d.vp ?? 0) * 0.8 + (d.city ? 0.5 : 0) + (Object.values(MAP.beaches).some((b) => b.hex === hex) && pd.defenderSide === 'Allied' ? 1.5 : 0) + vpUnits * 0.8;
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
  const retreat = pd.desperate ? -steps * 1.2 - vpUnits * 2 : -0.35 * value;
  if (dd > retreat) return { type: 'defend', choice: 'dd', support, prefer, battleships: support?.endsWith('-naval') && s.support.battleships > 0 };
  return { type: 'defend', choice: 'retreat' };
}

/** Expected value of a breakthrough attack on `target` by the group in state `s`. */
function breakthroughScore(s: GameState, target: HexId, aggression: number): number {
  const odds = computeOdds(s, breakthroughPlan(s, target));
  if (!odds.ok) return -Infinity;
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) !== s.activeSide);
  const defSteps = defenders.reduce((a, u) => a + stepsRemaining(u), 0);
  const e = odds.autoDs ? { defLoss: 1, attLoss: 0, retreat: 1.3, disrupt: 0 } : expectedOutcome(odds.finalIndex, odds.drm, defSteps);
  const vp = MAP.hexes[target].vp ?? 0;
  const vpUnits = defenders.filter((u) => def(u.id).asu || def(u.id).cat === 'bh').length;
  return e.defLoss * 1.1 + e.retreat * (0.5 + vp * 0.35 + vpUnits * 0.6) + e.disrupt * 0.3 - e.attLoss * (1.25 - aggression * 0.45);
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
    if (stackPoints([...unitsAt(s, pa.vacated).map((u) => u.id), ...chosen, id], s) > RULES.stackingLimit) continue;
    const t = threatAt(s, pa.vacated, side);
    const dd = defenseAt(s, pa.vacated, side, s.units[id]) + chosen.reduce((a, x) => a + values(s.units[x]).defense, 0);
    if (t / (dd + 0.5) < 2.5 || hd.vp) chosen.push(id);
  }
  return chosen.length ? { type: 'advance', unitIds: chosen, to: pa.vacated } : { type: 'advance', unitIds: [] };
}

// ------------------------------------------------------------------ the player

export function createHeuristicAi(level: Difficulty = 'veteran'): AiPlayer {
  const skill = SKILLS[level] ?? SKILLS.veteran;
  const considered = new Set<string>();
  let memoKey = '';
  let assaultQueue: Action[] | null = null;
  let tm: ThreatMap | null = null;
  let tmSeq = -1;
  let openTm: ThreatMap | null = null;
  const reset = (s: GameState) => {
    const k = `${s.turn}|${s.activeSide}|${s.phase}`;
    if (k !== memoKey) {
      memoKey = k;
      considered.clear();
      assaultQueue = null;
      tm = null;
      openTm = null;
    }
  };

  function makeCtx(s: GameState): Ctx {
    const side = s.activeSide;
    const aggression = aggressionFor(s, side);
    // Our own moves open and close the enemy's routes (zones of control): read the threat again after each one.
    if (skill.reach && (!tm || tmSeq !== s.seq)) {
      tm = threatMap(s, side);
      tmSeq = s.seq;
    }
    if (skill.reach && !openTm) openTm = threatMap(s, side, true);
    return {
      side, aggression, skill,
      supply: supplyChecker(s, side),
      objective: distanceField(objectives(s, side, aggression)),
      threat: new Map(),
      tm: skill.reach ? tm : null,
      open: skill.reach ? openTm : null,
      noise: noiseFn(s, skill.noise),
      ...frontOf(s, side),
      shift: skill.reach ? 1 : 0,
    };
  }

  /** A slip: the less skilled the commander, the more often a good move goes unseen. */
  const slips = (s: GameState, key: string) => {
    if (!skill.blunder) return false;
    let h = (s.seq * 40503 + s.turn) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    return nextRandom(h).value < skill.blunder;
  };

  function bestOf(s: GameState, ctx: Ctx, u: UnitState, hexes: Iterable<HexId>, landing = false): HexId | null {
    let best: HexId | null = null;
    let bestScore = -Infinity;
    for (const h of hexes) {
      let sc = scoreMove(s, ctx, u, null, h);
      if (landing && wrongBeach(u.id, h) && skill.reach) sc -= 3; // disrupted on the other nation's beach
      if (sc > bestScore) {
        bestScore = sc;
        best = h;
      }
    }
    return best;
  }

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
      if (!isLegal(s, a)) continue;
      // A step back may push its hex over the stacking limit: only if a unit there can still move out.
      if (u.where.kind === 'map' && skill.reach) {
        const c = structuredClone({ ...s, log: [] });
        applyAction(c, a);
        const h = u.where.hex;
        const ids = unitsAt(c, h).filter((x) => sideOf(x) === side).map((x) => x.id);
        if (stackPoints(ids, c) > RULES.stackingLimit && !ids.some((id) => !cannotMove(c, c.units[id]))) continue;
      }
      return a;
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
    // Units in danger (and the artillery) first, then the ones furthest from the fighting.
    const movers = Object.values(s.units)
      .filter((u) => u.where.kind === 'map' && sideOf(u) === side && !considered.has(u.id) && !cannotMove(s, u))
      .map((u) => {
        const h = (u.where as { hex: HexId }).hex;
        const own = ownAt(s, h, side);
        const danger = ctx.tm ? stackRisk(s, h, own, stackThreat(s, ctx, h, own), ctx.shift) : 0;
        return { u, d: nearestEnemyDistance(s, h, side), danger: danger + (def(u.id).asu ? 0.5 : 0) };
      })
      .sort((a, b) => (b.danger > 0.6 || a.danger > 0.6 ? b.danger - a.danger : b.d - a.d));
    for (const { u, d } of movers) {
      considered.add(u.id);
      if (slips(s, `m${u.id}`)) continue;
      const here = (u.where as { hex: HexId }).hex;
      if (enemyAdjacentHexes(s, here, side).length && !def(u.id).asu) {
        // Units in contact hold the line unless they are about to be overrun.
        const risk = threat(ctx, s, here) / (defenseAt(s, here, side) + 0.5);
        if (ctx.tm ? risk < 4 && ctx.aggression > 0.35 : risk < 2.5 || ctx.aggression > 0.6) continue;
      }
      const modes = allowedModes(s, u);
      let best: { h: HexId; mode: MoveMode; score: number } | null = null;
      const tryMode = (mode: MoveMode) => {
        const dests = legalDestinations(s, u.id, mode);
        for (const h of dests.keys()) {
          if (forbidden(s, side, h)) continue;
          if (def(u.id).asu && (dests.get(h)!.hexes > 1) && d <= 4 && !ctx.tm) continue; // keep artillery able to fire
          const sc = scoreMove(s, ctx, u, here, h);
          if (!best || sc > best.score) best = { h, mode, score: sc };
        }
      };
      if (modes.includes('normal')) tryMode('normal');
      if (modes.includes('extended') && d >= 4) tryMode('extended');
      if (!modes.includes('normal')) tryMode('tactical');
      const b = best as { h: HexId; mode: MoveMode; score: number } | null;
      if (b && b.score > positional(s, ctx, u, here) + 0.25) return { type: 'move', unitId: u.id, to: b.h, mode: b.mode };
    }
    return null;
  }

  /** Moves a unit out of any hex over the stacking limit (the excess would be lost when the phase ends). */
  function fixStacking(s: GameState, ctx: Ctx): Action | null {
    const side = ctx.side;
    const hexes = new Set(Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side).map((u) => (u.where as { hex: HexId }).hex));
    for (const h of hexes) {
      const here = ownAt(s, h, side);
      if (stackPoints(here, s) <= RULES.stackingLimit) continue;
      let best: { a: Action; score: number } | null = null;
      for (const id of here) {
        const u = s.units[id];
        if (cannotMove(s, u)) continue;
        for (const mode of allowedModes(s, u)) {
          if (mode !== 'normal' && mode !== 'tactical') continue;
          for (const to of legalDestinations(s, id, mode).keys()) {
            if (forbidden(s, side, to)) continue;
            const sc = scoreMove(s, ctx, u, h, to);
            if (!best || sc > best.score) best = { a: { type: 'move', unitId: id, to, mode }, score: sc };
          }
        }
      }
      if (best) return best.a;
    }
    return null;
  }

  function movementAction(s: GameState): Action | null {
    const side = s.activeSide;
    const ctx = makeCtx(s);
    if (skill.reach) {
      const fix = fixStacking(s, ctx);
      if (fix) {
        if (fix.type === 'move') considered.add(fix.unitId);
        return fix;
      }
    }
    if (side === 'Allied') {
      const waiting = Object.values(s.units)
        .filter((u) => sideOf(u) === side && (u.where.kind === 'reserve' || u.where.kind === 'followUp' || u.where.kind === 'atSea') && !considered.has(u.id))
        .sort((a, b) => def(b.id).sp - def(a.id).sp);
      for (const u of waiting) {
        considered.add(u.id);
        let hexes = landingHexes(s, u.id).filter((h) => canStack(s, h, [u.id]));
        if (def(u.id).asu) hexes = hexes.filter((h) => !enemyAdjacentHexes(s, h, side).length);
        // Veterans keep units afloat rather than land them where they would be disrupted.
        if (skill.reach && u.where.kind !== 'atSea') {
          const right = hexes.filter((h) => !wrongBeach(u.id, h));
          // From the Floating Reserve, wait a turn for a place on the right beach rather than land in confusion.
          if (right.length) hexes = right;
        }
        const best = bestOf(s, ctx, u, hexes, true);
        // Guns landed where they would be overrun are points thrown away: keep them offshore a turn.
        if (best && skill.reach && def(u.id).asu && u.where.kind === 'reserve' && riskDelta(s, ctx, u, null, best) > 1.6) continue;
        if (best) return { type: 'land', unitId: u.id, to: best };
      }
    }
    if (assaultQueue === null) assaultQueue = planAssaults(s, ctx.aggression, skill, ctx.objective);
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
    let bestScore = -Infinity;
    for (const t of targets) {
      if (considered.has('t' + t)) continue;
      if (slips(s, `t${t}`)) {
        considered.add('t' + t);
        continue;
      }
      const opt = bestAttackOn(s, t, aggression, {
        vpWeight: side === 'Allied' ? 0.35 + 0.15 * Math.min(4, alliedShortfall(s)) : skill.reach ? 0.7 : 0.35,
        killValue: skill.killValue, trim: skill.trim,
      });
      if (!opt) continue;
      const sc = opt.score + (skill.noise ? (nextRandom((s.seq * 31 + t.charCodeAt(0) * 7 + t.charCodeAt(3)) >>> 0).value - 0.5) * skill.noise * 0.6 : 0);
      if (sc > bestScore) {
        best = opt;
        bestScore = sc;
      }
    }
    const threshold = 0.2 - aggression * 0.3 + skill.attackBar;
    if (best && bestScore > threshold) {
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
