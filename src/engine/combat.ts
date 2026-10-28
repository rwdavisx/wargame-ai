import { MAP, RULES } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { isLand, weatherBox } from './movement';
import { rollD6 } from './rng';
import type { CombatReport, GameState, Side, UnitState } from './types';
import { def, isCombatUnit, occupancy, other, sideOf, stackCount, stepsRemaining, unitsAt, values, zocOf } from './units';

export interface AttackPlan {
  target: HexId;
  attackers: string[];
  air?: boolean;
  naval?: boolean;
  asus?: string[];
}

export interface OddsInfo {
  ok: boolean;
  reason?: string;
  attack: number;
  defense: number;
  baseIndex: number;
  shifts: { reason: string; shift: number }[];
  finalIndex: number;
  drm: number;
  defenderSupport: { air: boolean; naval: boolean; asus: string[] };
  attackerAsus: string[];
}

/** Sea hexes from which naval gunfire can be delivered (Gulf of Salerno only). */
function isGunfireSea(hex: HexId): boolean {
  const h = MAP.hexes[hex];
  return !!h && h.terrain === 'sea' && parseInt(hex.slice(2), 10) >= 6;
}

let navalCoverCache: Map<HexId, boolean> | null = null;
export function inNavalRange(hex: HexId): boolean {
  if (!navalCoverCache) {
    navalCoverCache = new Map();
    const seas = Object.keys(MAP.hexes).filter(isGunfireSea);
    for (const h of Object.keys(MAP.hexes)) {
      navalCoverCache.set(h, seas.some((s) => distance(s, h) <= RULES.combat.navalRange));
    }
  }
  return navalCoverCache.get(hex) ?? false;
}

export function supportAvailable(s: GameState, side: Side, kind: 'air' | 'naval'): boolean {
  return s.support[side][kind].length > 0;
}

export function attackedHexesThisPhase(s: GameState): Set<HexId> {
  return new Set(s.combats.filter((c) => c.turn === s.turn && c.attackerSide === s.activeSide).map((c) => c.defenderHex));
}

function readyAsusInRange(s: GameState, side: Side, target: HexId): UnitState[] {
  return Object.values(s.units).filter(
    (u) =>
      u.where.kind === 'map' &&
      sideOf(u) === side &&
      def(u.id).type === 'asu' &&
      !u.fired &&
      !u.disrupted &&
      distance(u.where.hex, target) <= (def(u.id).asuRange ?? 0),
  );
}

export function columnLabel(i: number): string {
  return RULES.combat.columns[i];
}

function baseColumn(attack: number, defense: number): number {
  const ratios = RULES.combat.ratios;
  const ratio = defense <= 0 ? 99 : attack / defense;
  let idx = 0;
  for (let i = 0; i < ratios.length; i++) if (ratio + 1e-9 >= ratios[i]) idx = i;
  return idx;
}

/** Validates an attack and computes odds, shifts and the defender's automatic support. */
export function computeOdds(s: GameState, plan: AttackPlan): OddsInfo {
  const fail = (reason: string): OddsInfo => ({
    ok: false, reason, attack: 0, defense: 0, baseIndex: 0, shifts: [], finalIndex: 0, drm: 0,
    defenderSupport: { air: false, naval: false, asus: [] }, attackerAsus: [],
  });
  const side = s.activeSide;
  const enemy = other(side);
  const defenders = unitsAt(s, plan.target).filter((u) => sideOf(u) === enemy);
  if (!defenders.length) return fail('No enemy units in the target hex.');
  if (attackedHexesThisPhase(s).has(plan.target)) return fail('That hex has already been attacked this phase.');
  if (!plan.attackers.length) return fail('Select at least one attacking unit.');
  const attackers: UnitState[] = [];
  for (const id of plan.attackers) {
    const u = s.units[id];
    if (!u || u.where.kind !== 'map') return fail(`${id} is not on the map.`);
    if (sideOf(u) !== side) return fail(`${def(id).name} is not yours.`);
    if (!isCombatUnit(u)) return fail(`${def(id).name} is a support unit and cannot attack.`);
    if (u.attacked) return fail(`${def(id).name} has already attacked.`);
    if (u.disrupted) return fail(`${def(id).name} is disrupted.`);
    if (u.strategic) return fail(`${def(id).name} used strategic movement.`);
    if (!neighbors(u.where.hex).includes(plan.target)) return fail(`${def(id).name} is not adjacent to the target.`);
    if (values(u).attack <= 0) return fail(`${def(id).name} has no attack strength.`);
    attackers.push(u);
  }
  const c = RULES.combat;
  let attack = 0;
  for (const u of attackers) {
    const a = values(u).attack;
    attack += u.outOfSupply ? a * c.outOfSupplyAttackFactor : a;
  }
  attack = Math.floor(attack);
  let defense = 0;
  for (const u of defenders) {
    const d = values(u).defense;
    defense += u.disrupted ? d * c.disruptedDefenseFactor : d;
  }
  defense = Math.max(1, Math.ceil(defense));
  const baseIndex = baseColumn(attack, defense);
  const shifts: { reason: string; shift: number }[] = [];
  const hex = MAP.hexes[plan.target];
  if (hex.city) shifts.push({ reason: 'City', shift: c.terrainShift.city });
  else if (c.terrainShift[hex.terrain]) shifts.push({ reason: `Defender in ${hex.terrain}`, shift: c.terrainShift[hex.terrain] });
  const sides = attackers.map((u) => MAP.hexsides[sideKey((u.where as { hex: HexId }).hex, plan.target)] ?? {});
  if (sides.every((h) => h.river)) shifts.push({ reason: 'All attackers across a river', shift: c.allAcrossRiverShift });
  if (sides.every((h) => h.mountain)) {
    if (sides.some((h) => !h.pass)) shifts.push({ reason: 'All attackers across mountain hexsides', shift: c.allAcrossMountainShift });
    else shifts.push({ reason: 'All attackers across a mountain pass', shift: c.allAcrossPassShift });
  }
  const attArmor = attackers.some((u) => def(u.id).tankRating);
  const defArmor = defenders.some((u) => def(u.id).tankRating);
  if (attArmor && !defArmor && hex.terrain === 'clear' && !hex.city) shifts.push({ reason: 'Armour vs. no armour in clear', shift: c.armorShift });
  let drm = 0;
  const wb = weatherBox(s);
  if (plan.air) {
    if (!supportAvailable(s, side, 'air')) return fail('No air support available.');
    shifts.push({ reason: 'Air support', shift: c.airShift });
    if (side === 'German' && wb.germanAirDrm) drm += wb.germanAirDrm;
  }
  if (plan.naval) {
    if (side !== 'Allied' || !supportAvailable(s, side, 'naval')) return fail('No naval support available.');
    if (!inNavalRange(plan.target)) return fail('Target is out of naval gunfire range.');
    shifts.push({ reason: 'Naval gunfire', shift: c.navalShift });
  }
  const attackerAsus: string[] = [];
  const asuCandidates = new Set(readyAsusInRange(s, side, plan.target).map((u) => u.id));
  for (const id of plan.asus ?? []) {
    if (!asuCandidates.has(id)) return fail(`${def(id).name} cannot support this attack.`);
    if (attackerAsus.length < c.asuMaxPerSide) attackerAsus.push(id);
  }
  if (attackerAsus.length) shifts.push({ reason: `Artillery support x${attackerAsus.length}`, shift: c.asuShiftEach * attackerAsus.length });
  if (wb.rain) shifts.push({ reason: 'Rain', shift: c.rainShift });

  // Defender support is committed automatically when the attack is dangerous.
  const preIndex = clampIndex(baseIndex + shifts.reduce((a, b) => a + b.shift, 0));
  const defenderSupport = { air: false, naval: false, asus: [] as string[] };
  if (preIndex >= 3) {
    for (const u of readyAsusInRange(s, enemy, plan.target)) {
      if (defenderSupport.asus.length >= c.asuMaxPerSide) break;
      defenderSupport.asus.push(u.id);
    }
    if (defenderSupport.asus.length)
      shifts.push({ reason: `Defensive artillery x${defenderSupport.asus.length}`, shift: -c.asuShiftEach * defenderSupport.asus.length });
    if (supportAvailable(s, enemy, 'air')) {
      defenderSupport.air = true;
      shifts.push({ reason: 'Defensive air support', shift: -c.airShift });
      if (enemy === 'German' && wb.germanAirDrm) drm -= wb.germanAirDrm;
    }
    if (enemy === 'Allied' && supportAvailable(s, enemy, 'naval') && inNavalRange(plan.target)) {
      defenderSupport.naval = true;
      shifts.push({ reason: 'Defensive naval gunfire', shift: -c.navalShift });
    }
  }
  const finalIndex = clampIndex(baseIndex + shifts.reduce((a, b) => a + b.shift, 0));
  return { ok: true, attack, defense, baseIndex, shifts, finalIndex, drm, defenderSupport, attackerAsus };
}

function clampIndex(i: number): number {
  return Math.max(0, Math.min(RULES.combat.columns.length - 1, i));
}

// ------------------------------------------------------------ resolution

/** Removes `n` steps from the given units, strongest-first, returning notes. */
export function takeSteps(s: GameState, ids: string[], n: number, notes: string[]): void {
  for (let i = 0; i < n; i++) {
    const alive = ids.map((id) => s.units[id]).filter((u) => u.where.kind === 'map');
    if (!alive.length) return;
    alive.sort((a, b) => stepsRemaining(b) - stepsRemaining(a) || values(a).attack - values(b).attack);
    const u = alive[0];
    u.stepsLost += 1;
    if (stepsRemaining(u) <= 0) {
      u.where = { kind: 'eliminated' };
      notes.push(`${def(u.id).name} eliminated`);
    } else notes.push(`${def(u.id).name} reduced`);
  }
}

function retreatScore(s: GameState, hex: HexId, side: Side, from: HexId[], ezoc: Set<HexId>): number {
  let score = 0;
  for (const f of from) score += distance(hex, f) * 4;
  if (ezoc.has(hex) && !unitsAt(s, hex).some((u) => sideOf(u) === side)) score -= 20;
  const friends = neighbors(hex).filter((n) => unitsAt(s, n).some((u) => sideOf(u) === side)).length;
  score += friends;
  return score;
}

/** Retreats the defending stack `dist` hexes. Units that cannot retreat lose a step and stay. */
export function retreatStack(s: GameState, ids: string[], dist: number, attackerHexes: HexId[], notes: string[]): void {
  const alive = ids.map((id) => s.units[id]).filter((u) => u.where.kind === 'map');
  if (!alive.length) return;
  const side = sideOf(alive[0]);
  let cur = (alive[0].where as { hex: HexId }).hex;
  const visited = new Set<HexId>([cur]);
  const ezoc = zocOf(s, other(side));
  let zocHit = false;
  for (let step = 0; step < dist; step++) {
    const occ = occupancy(s);
    const options = neighbors(cur).filter((n) => isLand(n) && !visited.has(n) && occ.get(n) !== other(side));
    if (!options.length) {
      if (step === 0) {
        notes.push('No retreat route: defenders lose a step instead');
        for (const u of alive) {
          if (u.where.kind !== 'map') continue;
          takeSteps(s, [u.id], 1, notes);
        }
        return;
      }
      break;
    }
    options.sort((a, b) => retreatScore(s, b, side, attackerHexes, ezoc) - retreatScore(s, a, side, attackerHexes, ezoc));
    cur = options[0];
    visited.add(cur);
    if (ezoc.has(cur) && !unitsAt(s, cur).some((u) => sideOf(u) === side)) zocHit = true;
  }
  // Overstacking at the end hex: keep going one more hex if possible, else lose a step.
  const moving = alive.filter((u) => u.where.kind === 'map');
  if (stackCount(s, cur, moving.map((u) => u.id)) > RULES.stackingLimit) {
    notes.push('Retreat ends overstacked: one step lost');
    takeSteps(s, moving.map((u) => u.id), 1, notes);
  }
  for (const u of moving) {
    if (u.where.kind !== 'map') continue;
    u.where = { kind: 'map', hex: cur };
    u.disrupted = true;
  }
  notes.push(`Defenders retreat to ${cur}`);
  if (zocHit && RULES.combat.retreatIntoZocLosesStep) {
    notes.push('Retreat through enemy zone of control: one step lost');
    takeSteps(s, moving.map((u) => u.id), 1, notes);
  }
}

/** Resolves an attack, mutating the state. Returns the combat report. */
export function resolveAttack(s: GameState, plan: AttackPlan): CombatReport {
  const odds = computeOdds(s, plan);
  if (!odds.ok) throw new Error(odds.reason);
  const side = s.activeSide;
  const enemy = other(side);
  const defenders = unitsAt(s, plan.target).filter((u) => sideOf(u) === enemy).map((u) => u.id);
  const roll = rollD6(s);
  const effRoll = Math.max(1, Math.min(6, roll + odds.drm));
  const result = RULES.combat.crt[String(effRoll)][odds.finalIndex];
  const notes: string[] = [];
  const attackerHexes = plan.attackers.map((id) => (s.units[id].where as { hex: HexId }).hex);

  // Spend support.
  for (const id of plan.attackers) s.units[id].attacked = true;
  for (const id of odds.attackerAsus) s.units[id].fired = true;
  for (const id of odds.defenderSupport.asus) s.units[id].fired = true;
  if (plan.air) s.support[side].air.shift();
  if (plan.naval) s.support[side].naval.shift();
  if (odds.defenderSupport.air) s.support[enemy].air.shift();
  if (odds.defenderSupport.naval) s.support[enemy].naval.shift();

  const m = /^D(\d)R$/.exec(result);
  if (result === 'A1' || result === 'A2') {
    takeSteps(s, plan.attackers, Number(result[1]), notes);
  } else if (result === 'EX') {
    takeSteps(s, defenders, 1, notes);
    takeSteps(s, plan.attackers, 1, notes);
  } else if (result === 'DR') {
    retreatStack(s, defenders, 1, attackerHexes, notes);
  } else if (m) {
    const n = Number(m[1]);
    takeSteps(s, defenders, n, notes);
    retreatStack(s, defenders, n, attackerHexes, notes);
  } else if (result === 'DE') {
    for (const id of defenders) {
      if (s.units[id].where.kind === 'map') {
        s.units[id].where = { kind: 'eliminated' };
        notes.push(`${def(id).name} eliminated`);
      }
    }
  }

  // Advance after combat into a vacated hex.
  const stillThere = unitsAt(s, plan.target).some((u) => sideOf(u) === enemy);
  const survivors = plan.attackers.filter((id) => s.units[id].where.kind === 'map');
  if (!stillThere && survivors.length) {
    s.pendingAdvance = { hex: plan.target, unitIds: survivors, max: Math.min(RULES.combat.advanceMax, RULES.stackingLimit) };
  }

  const report: CombatReport = {
    id: s.combats.length + 1,
    turn: s.turn,
    attackerSide: side,
    defenderHex: plan.target,
    attackers: plan.attackers,
    defenders,
    attack: odds.attack,
    defense: odds.defense,
    baseColumn: columnLabel(odds.baseIndex),
    shifts: odds.shifts,
    finalColumn: columnLabel(odds.finalIndex),
    roll,
    drm: odds.drm,
    result,
    notes,
  };
  s.combats.push(report);
  return report;
}
