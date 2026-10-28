// Breakthrough Combat (rule 15): after an attack that earns an advance of two
// or more hexes, one stack (the Breakthrough Group) may spend its advance on
// moving and on further attacks. Each hex moved costs 1, each attack costs 1,
// and turning away from the defender's vacated hex at the start costs 1. A
// successful breakthrough attack lets the group enter the hex it attacked for
// free; only a DR4 or DS result lets it carry on after that.
import { MAP } from './data';
import { applyAdvance, advanceDestinations, resolveAttack } from './combat';
import { neighbors, sideKey, type HexId } from './hex';
import { triggerFullRetreats } from './retreat';
import type { Breakthrough, CombatReport, GameState, Side } from './types';
import { canStack, def, isLand, occupancy, other, recordTrail, sideOf, unitsAt } from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';

function fail(msg: string): never {
  throw new Error(msg);
}

function group(s: GameState): Breakthrough {
  return s.breakthrough ?? fail('No Breakthrough Group is active.');
}

export function groupSide(s: GameState, b: Breakthrough): Side {
  return sideOf(s.units[b.units[0]]);
}

/** Group units still with the group. */
export function groupUnits(s: GameState, b: Breakthrough): string[] {
  return b.units.filter((id) => {
    const w = s.units[id].where;
    return w.kind === 'map' && w.hex === b.hex;
  });
}

/** Extra cost for not heading into the defender's vacated hex first. */
function turnCost(b: Breakthrough, intoVacated: boolean): number {
  return !b.committed && !intoVacated ? 1 : 0;
}

interface StepCheck {
  ok: boolean;
  reason?: string;
  stop: boolean;
  hillRoad: boolean;
  mountain: boolean;
}

/** Whether the group may advance from its hex into `to` (rule 14.4-14.5). */
function stepCheck(s: GameState, b: Breakthrough, to: HexId): StepCheck {
  const no = (reason: string): StepCheck => ({ ok: false, reason, stop: true, hillRoad: false, mountain: false });
  const ids = groupUnits(s, b);
  const side = groupSide(s, b);
  if (!neighbors(b.hex).includes(to) || !isLand(to)) return no('Not an adjacent land hex.');
  if (occupancy(s).get(to) === other(side)) return no('The hex is occupied by the enemy.');
  const hs = MAP.hexsides[sideKey(b.hex, to)] ?? {};
  const intoAttacked = !b.committed && to === b.vacated;
  if (blockedByBond(bondsOf(s, other(side)), b.hex, to) && to !== b.vacated) return no('An enemy ZOC bond blocks the way.');
  const mountain = !!hs.mountain && !hs.road && !hs.pass;
  if (mountain) {
    if (ids.some((id) => def(id).vehicle)) return no('Vehicles cannot cross that mountain hexside.');
    if (!intoAttacked || ids.some((id) => s.units[id].halfEff)) return no('Mountain hexsides may only be crossed into the attacked hex.');
  }
  if (hs.river && !hs.road && !intoAttacked) return no('Rivers may only be crossed into the attacked hex.');
  const ezoc = zocOf(s, other(side));
  if (ezoc.has(b.hex) && ezoc.has(to) && b.hex !== b.vacated && to !== b.vacated) return no('Cannot advance from one enemy ZOC into another.');
  const d = MAP.hexes[to];
  const hill = d.terrain === 'hill' && !d.city;
  const stop = d.terrain === 'marsh' || (hill && !hs.road) || (b.hillRoad && !hs.road) || (to !== b.vacated && ezoc.has(to));
  if (!canStack(s, to, ids)) return no('Stacking limit.');
  return { ok: true, stop, hillRoad: hill && !!hs.road, mountain };
}

function claim(s: GameState, hex: HexId, side: Side) {
  if (hex in s.control || MAP.hexes[hex].vp || MAP.hexes[hex].city) s.control[hex] = side;
}

function moveGroup(s: GameState, b: Breakthrough, to: HexId, notes: string[], mountain = false) {
  const side = groupSide(s, b);
  for (const id of groupUnits(s, b)) {
    recordTrail(s, id, [b.hex, to]);
    s.units[id].where = { kind: 'map', hex: to };
    if (mountain) s.units[id].halfEff = true;
  }
  claim(s, to, side);
  b.hex = to;
  triggerFullRetreats(s, to, side, notes);
}

/** Ends the group; the other attackers may then advance normally. */
export function endBreakthrough(s: GameState): void {
  const b = s.breakthrough;
  if (!b) return;
  s.breakthrough = null;
  const rest = b.rest;
  if (rest && Object.keys(rest.maxByUnit).some((id) => s.units[id]?.where.kind === 'map')) {
    s.pendingAdvance = { ...rest, btAllowed: false, started: true };
  } else s.pendingAdvance = null;
}

function maybeEnd(s: GameState, b: Breakthrough) {
  if (!groupUnits(s, b).length || (b.left <= 0 && !b.freeHex && b.pendingCombat === null)) endBreakthrough(s);
}

/** Declares the Breakthrough Group, either as one attacking stack or formed in the vacated hex. */
export function startBreakthrough(s: GameState, unitIds: string[], form: 'stack' | 'vacated', notes: string[]): void {
  const pa = s.pendingAdvance ?? fail('No advance is pending.');
  if (!pa.btAllowed || pa.limited) fail('This attack did not earn a Breakthrough (an advance of 2 or more is needed).');
  if (pa.started) fail('Units have already advanced: the Breakthrough Group must go first.');
  if (s.breakthrough) fail('A Breakthrough Group is already active.');
  const ids = [...new Set(unitIds)].filter((id) => id in pa.maxByUnit && s.units[id]?.where.kind === 'map');
  if (!ids.length) fail('Choose units that took part in the attack.');
  let left = Math.min(...ids.map((id) => pa.maxByUnit[id]));
  if (left < 1) fail('These units cannot advance.');
  let hex: HexId;
  let committed = false;
  if (form === 'stack') {
    const hexes = new Set(ids.map((id) => (s.units[id].where as { hex: HexId }).hex));
    if (hexes.size > 1) fail('A Breakthrough Group is one stack: pick units in the same hex, or form the group in the vacated hex.');
    hex = [...hexes][0];
    for (const id of ids) delete pa.maxByUnit[id];
  } else {
    for (const id of ids) if (!advanceDestinations(s, pa, id).has(pa.vacated)) fail(`${def(id).name} cannot advance into ${pa.vacated}.`);
    if (!canStack(s, pa.vacated, ids)) fail('Too many units for the vacated hex.');
    const from = new Set(ids.map((id) => pa.from[id]));
    applyAdvance(s, ids, pa.vacated, notes);
    hex = pa.vacated;
    committed = true;
    left -= 1;
    const d = MAP.hexes[hex];
    const byRoad = [...from].every((f) => MAP.hexsides[sideKey(f, hex)]?.road);
    if (d.terrain === 'marsh' || (d.terrain === 'hill' && !d.city && !byRoad)) left = 0;
  }
  s.breakthrough = {
    combatId: pa.combatId, vacated: pa.vacated, units: ids, hex, left, committed, hillRoad: false,
    pendingCombat: null, freeHex: null, mayContinue: false, rest: { ...pa, started: true },
  };
  s.pendingAdvance = null;
  notes.push(`Breakthrough Group: ${ids.map((id) => def(id).name).join(', ')} at ${hex}, ${left} hex${left === 1 ? '' : 'es'} of advance left`);
  maybeEnd(s, s.breakthrough);
}

/** Hexes the group may move into next (with the hex cost). */
export function breakthroughMoves(s: GameState): Map<HexId, number> {
  const out = new Map<HexId, number>();
  const b = s.breakthrough;
  if (!b || b.pendingCombat !== null) return out;
  if (b.freeHex) {
    if (canStack(s, b.freeHex, groupUnits(s, b))) out.set(b.freeHex, 0);
    if (!b.mayContinue) return out;
  }
  for (const n of neighbors(b.hex)) {
    if (out.has(n)) continue;
    const cost = 1 + turnCost(b, n === b.vacated);
    if (cost > b.left) continue;
    if (stepCheck(s, b, n).ok) out.set(n, cost);
  }
  return out;
}

export function breakthroughMove(s: GameState, to: HexId, notes: string[]): void {
  const b = group(s);
  if (b.pendingCombat !== null) fail('Resolve the breakthrough combat first.');
  if (b.freeHex && to === b.freeHex) {
    if (!canStack(s, to, groupUnits(s, b))) fail('Stacking limit.');
    b.freeHex = null;
    b.committed = true;
    moveGroup(s, b, to, notes);
    if (!b.mayContinue) b.left = 0;
    b.mayContinue = false;
    maybeEnd(s, b);
    return;
  }
  if (b.freeHex && !b.mayContinue) fail('After this breakthrough combat the group may only enter the hex it attacked, or stop.');
  const st = stepCheck(s, b, to);
  if (!st.ok) fail(st.reason ?? 'Cannot advance there.');
  const cost = 1 + turnCost(b, to === b.vacated);
  if (cost > b.left) fail('Not enough advance left.');
  b.freeHex = null;
  b.mayContinue = false;
  b.left -= cost;
  b.committed = true;
  b.hillRoad = st.hillRoad;
  moveGroup(s, b, to, notes, st.mountain);
  if (st.stop) b.left = 0;
  maybeEnd(s, b);
}

/** Enemy hexes the group may attack now. */
export function breakthroughTargets(s: GameState): HexId[] {
  const b = s.breakthrough;
  if (!b || b.pendingCombat !== null) return [];
  if (b.freeHex && !b.mayContinue) return [];
  if (1 + turnCost(b, false) > b.left) return [];
  const side = groupSide(s, b);
  return neighbors(b.hex).filter((n) => unitsAt(s, n).some((u) => sideOf(u) !== side) && targetCheck(b, n) === null);
}

function targetCheck(b: Breakthrough, target: HexId): string | null {
  const hs = MAP.hexsides[sideKey(b.hex, target)] ?? {};
  if ((hs.mountain || hs.river) && !hs.road) return 'Breakthrough Combat may cross mountain and river hexsides only along roads.';
  const d = MAP.hexes[target];
  if (!d || d.terrain === 'sea') return 'Not a land hex.';
  return null;
}

/** The plan a breakthrough attack on `target` would use (for odds previews). */
export function breakthroughPlan(s: GameState, target: HexId) {
  const b = group(s);
  return { target, attackers: groupUnits(s, b), breakthrough: true };
}

export function breakthroughAttack(s: GameState, target: HexId): CombatReport {
  const b = group(s);
  if (b.pendingCombat !== null) fail('Resolve the breakthrough combat first.');
  if (b.freeHex && !b.mayContinue) fail('The group must stop after this breakthrough combat.');
  if (!neighbors(b.hex).includes(target)) fail('The target must be adjacent to the group.');
  const why = targetCheck(b, target);
  if (why) fail(why);
  const cost = 1 + turnCost(b, false);
  if (cost > b.left) fail('Not enough advance left for a breakthrough combat.');
  const ids = groupUnits(s, b);
  b.freeHex = null;
  b.mayContinue = false;
  const rep = resolveAttack(s, { target, attackers: ids, breakthrough: true });
  b.left -= cost;
  b.committed = true;
  b.pendingCombat = rep.id;
  if (!s.pendingDefense) finishBreakthroughCombat(s);
  return rep;
}

/** Called once a breakthrough combat (including any Determined Defense) is resolved. */
export function finishBreakthroughCombat(s: GameState): void {
  const b = s.breakthrough;
  if (!b || b.pendingCombat === null) return;
  const rep = s.combats.find((c) => c.id === b.pendingCombat)!;
  b.pendingCombat = null;
  const side = groupSide(s, b);
  const cleared = !unitsAt(s, rep.defenderHex).some((u) => sideOf(u) !== side);
  if (cleared) {
    b.freeHex = rep.defenderHex;
    b.mayContinue = /^(DR4|DS)\b/.test(rep.result);
    if (!b.mayContinue) b.left = 0;
  } else {
    b.left = 0;
  }
  maybeEnd(s, b);
}

/** Drops units off the group: they stop where they are. */
export function breakthroughDrop(s: GameState, unitIds: string[]): void {
  const b = group(s);
  if (b.pendingCombat !== null) fail('Resolve the breakthrough combat first.');
  b.units = b.units.filter((id) => !unitIds.includes(id));
  maybeEnd(s, b);
}
