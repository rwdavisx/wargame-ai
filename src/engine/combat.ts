// Combat: odds, column shifts, CRT, Determined Defense, advance after combat.
import { BATTLESHIPS_TURN, MAP, RULES } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { eliminate, loseStep, takeSteps } from './losses';
import { weatherBox } from './movement';
import { retreatStack, planRetreat, triggerFullRetreats } from './retreat';
import { rollD6 } from './rng';
import type { CombatReport, GameState, PendingAdvance, Side, UnitState } from './types';
import {
  canStack, def, goodOrder, isLand, nationGroup, occupancy, other, sideOf, stepsRemaining, supportNation, unitsAt, values,
} from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';

export interface AttackPlan {
  target: HexId;
  attackers: string[];
  maf?: string;
  air?: boolean;
  naval?: boolean;
  battleships?: boolean;
  asus?: string[];
}

export interface OddsInfo {
  ok: boolean;
  reason?: string;
  maf: string;
  mafUnits: string[];
  attack: number;
  defense: number;
  /** Defense range when variable-strength units are present (rolled at resolution). */
  defenseNote?: string;
  baseIndex: number;
  shifts: { reason: string; shift: number }[];
  finalIndex: number;
  autoDs: boolean;
  drm: number;
  defenderAir: boolean;
  attackerAsus: string[];
  bhSupporters: string[];
}

export const columnLabel = (i: number) => RULES.combat.columns[Math.max(0, Math.min(8, i))];

// ------------------------------------------------------------------ helpers

function gunfireSea(hex: HexId): boolean {
  const h = MAP.hexes[hex];
  return !!h && h.terrain === 'sea' && parseInt(hex.slice(2), 10) >= 6;
}

let navalCache: Map<HexId, boolean> | null = null;
/** Target within 2 hexes of the sea south of Campanella Point. */
export function inNavalRange(hex: HexId): boolean {
  if (!navalCache) {
    navalCache = new Map();
    const seas = Object.keys(MAP.hexes).filter(gunfireSea);
    for (const h of Object.keys(MAP.hexes)) navalCache.set(h, seas.some((sea) => distance(sea, h) <= RULES.combat.navalRange));
  }
  return navalCache.get(hex) ?? false;
}

export function attackedHexesThisPhase(s: GameState): Set<HexId> {
  return new Set(s.combats.filter((c) => c.turn === s.turn && c.attackerSide === s.activeSide).map((c) => c.defenderHex));
}

const halve = (n: number) => Math.ceil(n / 2);

function defenderHexTerrain(hex: HexId): 'Clear' | 'Other' | 'City' {
  const d = MAP.hexes[hex];
  if (d.city) return 'City';
  if (d.terrain === 'clear' && !d.town) return 'Clear';
  return 'Other';
}

function tankTerrainOk(hex: HexId): boolean {
  const d = MAP.hexes[hex];
  return !d.city && d.terrain === 'clear';
}

export function readyAsusFor(s: GameState, side: Side, target: HexId, involved: string[]): UnitState[] {
  const groups = new Set(involved.map(nationGroup));
  const divisions = new Set(involved.map((id) => def(id).division).filter(Boolean));
  return Object.values(s.units).filter((u) => {
    if (u.where.kind !== 'map' || sideOf(u) !== side) return false;
    const d = def(u.id);
    if (!d.asu || u.fired || !goodOrder(u) || u.halfEff) return false;
    if (u.hexesMoved > 1) return false;
    if (distance(u.where.hex, target) > (d.asuRange ?? 0)) return false;
    if (!groups.has(nationGroup(u.id))) return false;
    if (d.asu === 'division' && !divisions.has(d.division)) return false;
    return true;
  });
}

function markerFor(id: string, kind: 'air' | 'naval'): string {
  return `${supportNation(id)}-${kind}`;
}

/** Possible Main Assault Force choices for a set of attackers. */
export function mafOptions(attackers: string[]): string[] {
  const opts = new Set<string>();
  for (const id of attackers) opts.add(def(id).division ?? id);
  return [...opts];
}

function mafMembers(s: GameState, attackers: string[], maf: string): string[] {
  const core = attackers.filter((id) => (def(id).division ?? id) === maf);
  const coreHexes = new Set(core.map((id) => (s.units[id].where as { hex: HexId }).hex));
  const side = def(attackers[0]).side;
  // One attachment stacked with a MAF unit.
  const candidates = attackers.filter((id) => !core.includes(id) && coreHexes.has((s.units[id].where as { hex: HexId }).hex))
    .filter((id) => side === 'German' || def(id).silhouette || def(id).sp <= 1)
    .sort((a, b) => values(s.units[b]).attack - values(s.units[a]).attack);
  return candidates.length ? [...core, candidates[0]] : core;
}

// ------------------------------------------------------------------ odds

export function validateAttackers(s: GameState, target: HexId, attackers: string[]): string | null {
  const side = s.activeSide;
  if (!unitsAt(s, target).some((u) => sideOf(u) !== side)) return 'No enemy units in the target hex.';
  if (attackedHexesThisPhase(s).has(target)) return 'That hex has already been attacked this phase.';
  if (!attackers.length) return 'Select at least one attacking unit.';
  const groups = new Set<string>();
  const armies = new Set<boolean>();
  for (const id of attackers) {
    const u = s.units[id];
    if (!u || u.where.kind !== 'map') return `${def(id).name} is not on the map.`;
    const d = def(id);
    if (sideOf(u) !== side) return `${d.name} is not yours.`;
    if (d.asu || d.cat === 'bh' || d.variable) return `${d.name} cannot attack.`;
    if (u.attacked) return `${d.name} has already attacked.`;
    if (u.autoDs) return `${d.name} made an Auto DS this turn.`;
    if (!goodOrder(u)) return `${d.name} is ${u.status === 'disrupted' ? 'disrupted' : 'in Full Retreat'}.`;
    if (u.truck) return `${d.name} moved by truck (attack 0).`;
    if (unitsAt(s, u.where.hex).some((x) => x.repl)) return `A unit in ${u.where.hex} received a replacement: no combat from that hex.`;
    if (!neighbors(u.where.hex).includes(target)) return `${d.name} is not adjacent to the target.`;
    const hs = MAP.hexsides[sideKey(u.where.hex, target)] ?? {};
    if (hs.mountain && !hs.road && !hs.pass && d.vehicle) return `${d.name} cannot attack across a mountain hexside.`;
    if (hs.mountain && !hs.road && !hs.pass && u.halfEff) return `${d.name} is ½ Eff and cannot attack across a mountain hexside.`;
    if (hs.river && d.vehicle && (u.halfEff || (weatherBox(s).rain && !hs.road))) return `${d.name} cannot attack across that river now.`;
    if (values(u).attack <= 0) return `${d.name} has no attack strength.`;
    groups.add(nationGroup(id));
    armies.add(!!d.army8);
  }
  if (groups.has('US') && groups.has('CW')) return 'US and Commonwealth units may not attack together.';
  if (armies.size > 1) return '5th and 8th Army units may not attack together.';
  return null;
}

interface DefenseCalc {
  defense: number;
  low: number;
  high: number;
  contributors: string[];
  bhSupporters: string[];
}

function defenseOf(s: GameState, target: HexId, attackerIds: string[], variableValue?: Record<string, number>): DefenseCalc {
  const side = sideOf(s.units[attackerIds[0]] ?? Object.values(s.units)[0]);
  const enemy = other(side);
  const hex = MAP.hexes[target];
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) === enemy && !u.retreatedThisPhase);
  const allAcrossRiver = attackerIds.length > 0 && attackerIds.every((id) => {
    const h = (s.units[id].where as { hex: HexId }).hex;
    return !!MAP.hexsides[sideKey(h, target)]?.river || MAP.hexes[h].terrain === 'marsh';
  });
  const terrainDoubles = hex.city || hex.terrain === 'hill' || hex.terrain === 'marsh';
  let total = 0;
  let low = 0;
  let high = 0;
  const contributors: string[] = [];
  const regular = defenders.filter((u) => !def(u.id).parenthesized);
  for (const u of regular) {
    const d = def(u.id);
    if (u.status === 'fullRetreat') continue;
    let base = values(u).defense;
    let lo = base;
    let hi = base;
    if (d.variable) {
      if (variableValue && u.id in variableValue) base = lo = hi = variableValue[u.id];
      else {
        lo = Math.min(...RULES.variableStrength);
        hi = Math.max(...RULES.variableStrength);
        base = 1;
      }
    }
    const doubled = !d.variable && ((terrainDoubles && (d.infantryType || d.cat === 'recon')) || allAcrossRiver);
    const halved = u.status === 'disrupted';
    const f = (v: number) => (doubled && !halved ? v * 2 : halved && !doubled ? halve(v) : v);
    total += f(base);
    low += f(lo);
    high += f(hi);
    contributors.push(u.id);
  }
  if (!regular.length) {
    const asu = defenders.find((u) => def(u.id).parenthesized && u.status !== 'fullRetreat');
    if (asu) {
      total = low = high = values(asu).defense;
      contributors.push(asu.id);
    }
  }
  // Beachhead hexes draw half the strength of adjacent good-order units that also face the attackers.
  const bhSupporters: string[] = [];
  if (defenders.some((u) => def(u.id).cat === 'bh')) {
    const attackerHexes = new Set(attackerIds.map((id) => (s.units[id].where as { hex: HexId }).hex));
    let extra = 0;
    for (const n of neighbors(target)) {
      if (!neighbors(n).some((x) => attackerHexes.has(x))) continue;
      for (const u of unitsAt(s, n)) {
        if (sideOf(u) !== enemy || !goodOrder(u) || def(u.id).cat === 'bh' || def(u.id).parenthesized) continue;
        extra += values(u).defense;
        bhSupporters.push(u.id);
      }
    }
    const add = Math.floor(extra / 2);
    total += add;
    low += add;
    high += add;
  }
  const cap = RULES.combat.strengthCap;
  return { defense: Math.min(cap, total), low: Math.min(cap, low), high: Math.min(cap, high), contributors, bhSupporters };
}

function baseIndexFor(attack: number, defense: number): number {
  if (defense <= 0) return 99;
  const ratio = attack / defense;
  if (ratio < 1) {
    if (ratio + 1e-9 >= 0.5) return 1;
    if (ratio + 1e-9 >= 1 / 3) return 0;
    return -1;
  }
  return 1 + Math.floor(ratio + 1e-9); // 1-1 = 2, 2-1 = 3, ... beyond 7-1 keeps counting
}

export function computeOdds(s: GameState, plan: AttackPlan, opts: { autoDs?: boolean; variableValue?: Record<string, number> } = {}): OddsInfo {
  const fail = (reason: string): OddsInfo => ({
    ok: false, reason, maf: '', mafUnits: [], attack: 0, defense: 0, baseIndex: 0, shifts: [], finalIndex: 0, autoDs: false, drm: 0,
    defenderAir: false, attackerAsus: [], bhSupporters: [],
  });
  const bad = validateAttackers(s, plan.target, plan.attackers);
  if (bad) return fail(bad);
  const side = s.activeSide;
  const enemy = other(side);
  const target = plan.target;
  const options = mafOptions(plan.attackers);
  const evalMaf = (maf: string) => {
    const members = mafMembers(s, plan.attackers, maf);
    let attack = 0;
    for (const id of plan.attackers) {
      const u = s.units[id];
      const d = def(id);
      const hs = MAP.hexsides[sideKey((u.where as { hex: HexId }).hex, target)] ?? {};
      let a = values(u).attack;
      const halved = (hs.river && d.vehicle) || (hs.mountain && !hs.road) || hs.pass || u.halfEff || u.outOfSupply || !members.includes(id);
      if (halved) a = halve(a);
      attack += a;
    }
    return { members, attack: Math.min(RULES.combat.strengthCap, attack) };
  };
  let maf = plan.maf && options.includes(plan.maf) ? plan.maf : options[0];
  if (!plan.maf) {
    let best = -1;
    for (const o of options) {
      const e = evalMaf(o);
      const bonus = e.members.some((id) => def(id).elite) ? 1.5 : 0;
      const tank = e.members.some((id) => def(id).tankRating) ? 1.2 : 0;
      const score = e.attack + bonus + tank;
      if (score > best) {
        best = score;
        maf = o;
      }
    }
  }
  const { members, attack } = evalMaf(maf);
  const dc = defenseOf(s, target, plan.attackers, opts.variableValue);
  const defense = opts.autoDs ? dc.high : dc.defense;
  const baseIndex = baseIndexFor(attack, defense);
  if (baseIndex < 0) return fail('Odds below 1-3 are not allowed.');
  const shifts: { reason: string; shift: number }[] = [];
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) === enemy && u.status !== 'fullRetreat' && !u.retreatedThisPhase);
  // Tank shifts.
  if (tankTerrainOk(target)) {
    const rating = (id: string) => (def(id).tankRating ?? 0) - (def(id).tankDestroyer ? 1 : 0);
    const mafTanks = members.filter((id) => def(id).tankRating);
    const gainers = mafTanks.filter((id) => {
      const hs = MAP.hexsides[sideKey((s.units[id].where as { hex: HexId }).hex, target)] ?? {};
      return !hs.river && !hs.mountain;
    });
    const attBest = Math.max(0, ...gainers.map(rating));
    const attAny = Math.max(0, ...mafTanks.map(rating));
    const defBest = Math.max(0, ...defenders.filter((u) => def(u.id).tankRating).map((u) => def(u.id).tankRating!));
    if (attBest > 0 && defBest < attBest) shifts.push({ reason: 'Tank shift', shift: 1 });
    else if (defBest > 0 && attAny < defBest) shifts.push({ reason: 'Defender tank shift', shift: -1 });
  }
  if (members.some((id) => def(id).elite) && !defenders.some((u) => def(u.id).elite)) shifts.push({ reason: 'Elite', shift: 1 });
  if (weatherBox(s).rain) shifts.push({ reason: 'Rain', shift: -1 });
  let drm = 0;
  const attackerAsus: string[] = [];
  let defenderAir = false;
  if (!opts.autoDs) {
    if (plan.air) {
      const m = plan.attackers.map((id) => markerFor(id, 'air')).find((k) => s.support.ready.includes(k));
      if (!m) return fail('No air support available for these units.');
      shifts.push({ reason: 'Air support', shift: 1 });
    }
    const asuCands = readyAsusFor(s, side, target, members.length ? plan.attackers : []);
    let usedCorps = false;
    let usedDiv = false;
    for (const id of plan.asus ?? []) {
      const u = asuCands.find((x) => x.id === id);
      if (!u) return fail(`${def(id).name} cannot support this attack.`);
      const kind = def(id).asu!;
      if (kind === 'division' && !usedDiv) {
        usedDiv = true;
        attackerAsus.push(id);
        shifts.push({ reason: `Division artillery (${def(id).name})`, shift: 1 });
      } else if (kind === 'corps' && !usedCorps && !plan.naval) {
        usedCorps = true;
        attackerAsus.push(id);
        shifts.push({ reason: `Corps artillery (${def(id).name})`, shift: 1 });
      }
    }
    if (plan.naval) {
      if (side !== 'Allied') return fail('Only the Allies have naval support.');
      if (usedCorps) return fail('Naval support counts as corps support: not with a corps ASU.');
      if (!inNavalRange(target)) return fail('Target is out of naval gunfire range.');
      const m = plan.attackers.map((id) => markerFor(id, 'naval')).find((k) => s.support.ready.includes(k));
      if (!m) return fail('No naval support available for these units.');
      shifts.push({ reason: 'Naval support', shift: 1 });
      if (plan.battleships && s.support.battleships > 0 && s.turn >= BATTLESHIPS_TURN) drm += 1;
    }
    // Defensive air support, committed automatically for threatened hexes.
    const pre = baseIndex + shifts.reduce((a, b) => a + b.shift, 0);
    const defAir = defenders.map((u) => markerFor(u.id, 'air')).find((k) => s.support.ready.includes(k));
    if (defAir && (pre >= 4 || (MAP.hexes[target].vp ?? 0) > 0)) {
      defenderAir = true;
      shifts.push({ reason: 'Defensive air support', shift: -1 });
    }
  }
  const net = baseIndex + shifts.reduce((a, b) => a + b.shift, 0);
  const autoDs = defense <= 0 || net >= 11;
  const finalIndex = Math.max(0, Math.min(8, net));
  if (opts.autoDs && !autoDs) return { ...fail('Auto DS needs 10-1 odds or better.'), attack, defense, baseIndex, shifts, finalIndex, maf, mafUnits: members };
  return {
    ok: true, maf, mafUnits: members, attack, defense,
    defenseNote: dc.low !== dc.high ? `${dc.low}-${dc.high}` : undefined,
    baseIndex, shifts, finalIndex, autoDs, drm, defenderAir, attackerAsus, bhSupporters: dc.bhSupporters,
  };
}

// ------------------------------------------------------------------ results

interface Cell {
  result: string;
  adv: number;
  color: '' | 'y' | 'r';
}

export function parseCell(raw: string): Cell {
  let s = raw;
  let color: Cell['color'] = '';
  if (s.endsWith('y') || s.endsWith('r')) {
    color = s.slice(-1) as Cell['color'];
    s = s.slice(0, -1);
  }
  const m = /^(.*)\/(\d)$/.exec(s);
  return m ? { result: m[1], adv: Number(m[2]), color } : { result: s, adv: 0, color };
}

function advanceAllowance(s: GameState, id: string, adv: number): number {
  const u = s.units[id];
  const d = def(id);
  let n = adv;
  if (!d.mech) n = Math.min(n, RULES.combat.nonMechAdvanceCap);
  n = Math.min(n, d.maxAdv || n);
  if (u.outOfSupply) n = Math.min(n, RULES.combat.oosAdvanceCap);
  if (u.halfEff) n = Math.min(n, RULES.combat.halfEffAdvanceCap);
  return n;
}

function makeAdvance(s: GameState, rep: CombatReport, adv: number, limited: boolean): PendingAdvance | null {
  const survivors = rep.attackers.filter((id) => s.units[id].where.kind === 'map' && !def(id).asu && !s.units[id].repl);
  if (!survivors.length || adv <= 0) return null;
  if (unitsAt(s, rep.defenderHex).some((u) => sideOf(u) !== rep.attackerSide)) return null;
  const maxByUnit: Record<string, number> = {};
  const from: Record<string, HexId> = {};
  for (const id of survivors) {
    maxByUnit[id] = limited ? 1 : advanceAllowance(s, id, adv);
    from[id] = (s.units[id].where as { hex: HexId }).hex;
  }
  return { combatId: rep.id, vacated: rep.defenderHex, from, maxByUnit, limited };
}

function defenderIds(s: GameState, hex: HexId, side: Side): string[] {
  return unitsAt(s, hex).filter((u) => sideOf(u) === side).map((u) => u.id);
}

function canLead(u: UnitState): boolean {
  return u.where.kind === 'map' && goodOrder(u) && !def(u.id).asu;
}

/** Defensive support options for a Determined Defense in `hex`. */
export function defensiveSupportOptions(s: GameState, hex: HexId, defSide: Side): string[] {
  const here = unitsAt(s, hex).filter((u) => sideOf(u) === defSide);
  const lead = here.filter(canLead);
  if (!lead.length) return [];
  const opts: string[] = [];
  const nations = new Set(lead.map((u) => supportNation(u.id)));
  for (const n of nations) {
    if (s.support.ready.includes(`${n}-air`)) opts.push(`${n}-air`);
    if (n !== 'GE' && s.support.ready.includes(`${n}-naval`) && inNavalRange(hex)) opts.push(`${n}-naval`);
  }
  for (const a of readyAsusFor(s, defSide, hex, here.map((u) => u.id))) opts.push(a.id);
  return opts;
}

/** Resolves an attack (or Auto DS). May leave a pending defense decision or advance. */
export function resolveAttack(s: GameState, plan: AttackPlan, autoDsMode = false): CombatReport {
  const side = s.activeSide;
  const enemy = other(side);
  const notes: string[] = [];
  // Variable strength units reveal their strength when attacked.
  const variableValue: Record<string, number> = {};
  for (const u of unitsAt(s, plan.target)) {
    if (sideOf(u) === enemy && def(u.id).variable) {
      if (autoDsMode) variableValue[u.id] = 2;
      else {
        const r = rollD6(s);
        variableValue[u.id] = RULES.variableStrength[r - 1];
        notes.push(`${def(u.id).name} rolls ${r}: defense ${variableValue[u.id]}`);
      }
    }
  }
  const odds = computeOdds(s, plan, { autoDs: autoDsMode, variableValue });
  if (!odds.ok) throw new Error(odds.reason);
  const hadOnly = unitsAt(s, plan.target).filter((u) => sideOf(u) === enemy);
  for (const [id, v] of Object.entries(variableValue)) {
    if (v === 0 && s.units[id].where.kind === 'map') eliminate(s, s.units[id], notes);
  }
  const vacatedByZero = hadOnly.length > 0 && !unitsAt(s, plan.target).some((u) => sideOf(u) === enemy);

  // Spend support.
  for (const id of plan.attackers) {
    s.units[id].attacked = true;
    if (autoDsMode) s.units[id].autoDs = true;
  }
  for (const id of odds.attackerAsus) s.units[id].fired = true;
  const use = (k: string) => {
    const i = s.support.ready.indexOf(k);
    if (i >= 0) s.support.ready.splice(i, 1);
  };
  if (plan.air) use(plan.attackers.map((id) => markerFor(id, 'air')).find((k) => s.support.ready.includes(k))!);
  if (plan.naval) {
    use(plan.attackers.map((id) => markerFor(id, 'naval')).find((k) => s.support.ready.includes(k))!);
    if (odds.drm > 0) s.support.battleships -= 1;
  }
  if (odds.defenderAir) {
    const k = unitsAt(s, plan.target).filter((u) => sideOf(u) === enemy).map((u) => markerFor(u.id, 'air')).find((x) => s.support.ready.includes(x));
    if (k) use(k);
  }

  let roll = 0;
  let cell: Cell;
  if (vacatedByZero || odds.autoDs) {
    cell = { result: 'DS', adv: 4, color: 'r' };
    notes.push(vacatedByZero ? 'Defender gone: treated as DS' : 'Odds of 10-1 or more: automatic DS');
  } else {
    roll = rollD6(s);
    const eff = Math.min(6, roll + odds.drm);
    cell = parseCell(RULES.combat.crt[String(eff)][odds.finalIndex]);
  }
  const report: CombatReport = {
    id: s.combats.length + 1, turn: s.turn, attackerSide: side, defenderHex: plan.target, attackers: [...plan.attackers],
    maf: odds.maf, defenders: defenderIds(s, plan.target, enemy), attack: odds.attack, defense: odds.defense,
    baseColumn: odds.defense <= 0 ? 'no defense' : odds.baseIndex >= 9 ? `${odds.baseIndex - 1}-1` : columnLabel(odds.baseIndex), shifts: odds.shifts,
    finalColumn: columnLabel(odds.finalIndex), roll, drm: odds.drm, result: cell.result + (cell.adv ? ` Adv ${cell.adv}` : ''), notes,
  };
  s.combats.push(report);
  const mafAlive = () => odds.mafUnits.filter((id) => s.units[id].where.kind === 'map');
  const defs = () => defenderIds(s, plan.target, enemy).filter((id) => !s.units[id].retreatedThisPhase);
  const contributors = () => defs().filter((id) => !def(id).parenthesized);
  const parenthesized = () => defs().filter((id) => def(id).parenthesized);
  const defSteps = defs().reduce((a, id) => a + stepsRemaining(s.units[id]), 0);
  const attackerHexes = plan.attackers.map((id) => (s.units[id].where as { hex: HexId }).hex);
  const r = cell.result;

  const finishRetreat = (dist: number, status: 'disrupted' | 'fullRetreat', adv: number) => {
    const ids = defs();
    if (ids.length) retreatStack(s, ids, dist, plan.target, status, notes);
    s.pendingAdvance = makeAdvance(s, report, adv, false);
  };

  if (r === 'A1') {
    takeSteps(s, mafAlive(), 1, 'owner', notes, plan.attackers);
  } else if (r === 'EX') {
    takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
    takeSteps(s, mafAlive(), 1, 'opponent', notes, plan.attackers);
    if (defSteps === 1 && !defs().length) s.pendingAdvance = makeAdvance(s, report, 1, true);
  } else if (r === 'Dis') {
    const ids = defs();
    if (ids.some((id) => s.units[id].status !== 'good' && def(id).cat !== 'bh')) {
      for (const id of ids) if (def(id).cat !== 'bh') s.units[id].status = 'fullRetreat';
      retreatStack(s, ids.filter((id) => def(id).cat !== 'bh'), 2, plan.target, 'fullRetreat', notes);
      notes.push('Already disrupted: Full Retreat');
    } else {
      for (const id of ids) if (def(id).cat !== 'bh') s.units[id].status = 'disrupted';
      notes.push('Defenders disrupted');
    }
  } else if (r === 'DR4') {
    finishRetreat(4, 'fullRetreat', cell.adv);
  } else if (r === 'DS') {
    takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
    finishRetreat(4, 'fullRetreat', cell.adv || 4);
  } else {
    // DR2, A1/DR2, DRX, A1/D1, D1: losses, then retreat or Determined Defense.
    const dist = r === 'D1' ? 3 : 2;
    if (r === 'A1/DR2' || r === 'A1/D1') takeSteps(s, mafAlive(), 1, 'owner', notes, plan.attackers);
    if (r === 'A1/D1' || r === 'D1') takeSteps(s, contributors(), 1, 'owner', notes, parenthesized());
    if (r === 'DRX') {
      takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
      takeSteps(s, mafAlive(), 1, 'opponent', notes, plan.attackers);
    }
    const ids = defs();
    if (!ids.length) {
      s.pendingAdvance = makeAdvance(s, report, cell.adv, false);
    } else {
      const canDd = cell.color !== 'r' && ids.some((id) => canLead(s.units[id]));
      if (canDd) {
        const plan2 = planRetreat(s, ids, dist, plan.target);
        const desperate = plan2.lost.length > 0;
        s.pendingDefense = {
          combatId: report.id, hex: plan.target, defenderSide: enemy, attackerHexes, attackers: plan.attackers,
          retreat: dist, advance: cell.adv, yellow: cell.color === 'y', desperate,
          supportOptions: defensiveSupportOptions(s, plan.target, enemy),
        };
        notes.push('Defender may retreat or make a Determined Defense');
      } else finishRetreat(dist, 'disrupted', cell.adv);
    }
  }
  return report;
}

// ------------------------------------------------------------------ Determined Defense

function pickLead(s: GameState, hex: HexId, side: Side): UnitState | null {
  const cands = unitsAt(s, hex).filter((u) => sideOf(u) === side && canLead(u) && !u.retreatedThisPhase);
  if (!cands.length) return null;
  cands.sort((a, b) => Number(!!def(b.id).elite) - Number(!!def(a.id).elite) || Number(!!def(a.id).lowQuality) - Number(!!def(b.id).lowQuality) ||
    stepsRemaining(b) - stepsRemaining(a));
  return cands[0];
}

export interface DefenseChoice {
  choice: 'retreat' | 'dd';
  support?: string | null;
  battleships?: boolean;
  prefer?: 'hold' | 'delay';
}

/** Resolves the defender's pending choice. */
export function resolveDefense(s: GameState, c: DefenseChoice): void {
  const pd = s.pendingDefense!;
  s.pendingDefense = null;
  const rep = s.combats.find((x) => x.id === pd.combatId)!;
  const notes = rep.notes;
  const side = pd.defenderSide;
  const attackSide = other(side);
  const defs = () => unitsAt(s, pd.hex).filter((u) => sideOf(u) === side && !u.retreatedThisPhase).map((u) => u.id);
  const mafAlive = () => rep.attackers.filter((id) => s.units[id].where.kind === 'map');
  const advanceAfter = (limited: boolean) => {
    const before = s.activeSide;
    s.activeSide = attackSide;
    s.pendingAdvance = makeAdvance(s, rep, limited ? 1 : pd.advance, limited);
    s.activeSide = before;
  };
  if (c.choice === 'retreat') {
    retreatStack(s, defs(), pd.retreat, pd.hex, 'disrupted', notes);
    advanceAfter(false);
    return;
  }
  // Defensive support (declared once, applies to every roll of a Desperate Defense).
  let supportDrm = 0;
  if (c.support && pd.supportOptions.includes(c.support)) {
    supportDrm = 1;
    if (s.units[c.support]) s.units[c.support].fired = true;
    else {
      const i = s.support.ready.indexOf(c.support);
      if (i >= 0) s.support.ready.splice(i, 1);
    }
    notes.push(`Defensive support: ${s.units[c.support] ? def(c.support).name : c.support}`);
  }
  let shipDrm = 0;
  if (c.battleships && c.support?.endsWith('-naval') && s.support.battleships > 0 && s.turn >= BATTLESHIPS_TURN) {
    shipDrm = 1;
    s.support.battleships -= 1;
  }
  const column = defenderHexTerrain(pd.hex);
  let delays = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const lead = pickLead(s, pd.hex, side);
    if (!lead) break;
    const ld = def(lead.id);
    let drm = supportDrm + shipDrm + (ld.elite ? 1 : 0) - (ld.lowQuality ? 1 : 0) - (pd.yellow ? 1 : 0);
    drm = Math.min(drm, shipDrm ? 3 : 2);
    const roll = rollD6(s);
    const eff = Math.max(1, Math.min(7, roll + drm));
    const entry = RULES.dd.table[column][eff - 1];
    const opts = entry.split('|');
    let pick = opts[0];
    if (opts.length > 1) pick = opts.find((o) => (c.prefer === 'delay' ? !o.includes('H') : o.includes('H'))) ?? opts[0];
    rep.dd = { roll, drm, column, result: pick };
    notes.push(`Determined Defense (${column}, lead ${ld.name}): roll ${roll}${drm ? (drm > 0 ? `+${drm}` : drm) : ''} → ${pick}`);
    const [losses, letter] = pick.split(' ');
    const [att, dfn] = losses.split('/');
    const steps = defs().reduce((a, id) => a + stepsRemaining(s.units[id]), 0);
    if (att.startsWith('1')) takeSteps(s, mafAlive(), 1, att.includes('*') ? 'opponent' : 'owner', notes, rep.attackers);
    if (dfn === '1') loseStep(s, lead, notes);
    if (dfn === 'dis' && lead.where.kind === 'map') lead.status = 'disrupted';
    let outcome = letter ?? 'fail';
    if (outcome === 'P') {
      if (s.cityBattle[pd.hex]) outcome = 'D';
      else {
        s.cityBattle[pd.hex] = 1;
        notes.push('City Battle marker placed');
        outcome = 'H';
      }
    }
    if (outcome === 'D' && pd.desperate) {
      delays += 1;
      if (delays >= 2) {
        loseStep(s, lead, notes);
        outcome = 'H';
      } else outcome = 'fail';
    }
    if (outcome === 'H') {
      if (!defs().length && steps === 1) advanceAfter(true);
      notes.push(defs().length ? 'Defender holds' : 'Defender destroyed holding the hex');
      return;
    }
    if (outcome === 'D') {
      retreatStack(s, defs(), 1, pd.hex, 'disrupted', notes);
      advanceAfter(true);
      return;
    }
    // Failed stand.
    if (pd.desperate && defs().length) {
      const l = pickLead(s, pd.hex, side);
      if (!l) break;
      loseStep(s, l, notes);
      if (!defs().length) break;
      notes.push('Desperate Defense: rolling again');
      continue;
    }
    break;
  }
  if (defs().length) retreatStack(s, defs(), pd.retreat, pd.hex, 'disrupted', notes);
  advanceAfter(false);
}

// ------------------------------------------------------------------ advance after combat

/** Hexes `unitId` may advance to (with the path) for the pending advance. */
export function advanceDestinations(s: GameState, pa: PendingAdvance, unitId: string): Map<HexId, HexId[]> {
  const u = s.units[unitId];
  const out = new Map<HexId, HexId[]>();
  if (!u || u.where.kind !== 'map' || !(unitId in pa.maxByUnit)) return out;
  const side = sideOf(u);
  const d = def(unitId);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const bonds = bondsOf(s, other(side));
  const max = pa.maxByUnit[unitId];
  const start = u.where.hex;
  const stepOk = (from: HexId, to: HexId, first: boolean): { ok: boolean; stop: boolean; halfEff: boolean } => {
    const no = { ok: false, stop: true, halfEff: false };
    if (!isLand(to) || occ.get(to) === other(side)) return no;
    const hs = MAP.hexsides[sideKey(from, to)] ?? {};
    if (blockedByBond(bonds, from, to) && to !== pa.vacated) return no;
    let halfEff = false;
    if (hs.mountain && !hs.road && !hs.pass) {
      if (d.vehicle || !first || to !== pa.vacated || u.halfEff) return no;
      halfEff = true;
    }
    if (hs.river && !hs.road && (!first || to !== pa.vacated)) return no;
    const dest = MAP.hexes[to];
    let stop = false;
    if (dest.terrain === 'marsh') stop = true;
    if (dest.terrain === 'hill' && !dest.city && !hs.road) stop = true;
    if (to !== pa.vacated && ezoc.has(to)) stop = true;
    return { ok: true, stop, halfEff };
  };
  type Node = { hex: HexId; path: HexId[]; stopped: boolean; hillRoad: number };
  const q: Node[] = [{ hex: start, path: [], stopped: false, hillRoad: 0 }];
  const seen = new Map<HexId, number>();
  while (q.length) {
    const cur = q.shift()!;
    if (cur.stopped || cur.path.length >= max) continue;
    for (const n of neighbors(cur.hex)) {
      if (pa.limited && n !== pa.vacated) continue;
      const first = cur.path.length === 0;
      const st = stepOk(cur.hex, n, first);
      if (!st.ok) continue;
      // No EZOC-to-EZOC unless entering or leaving the vacated hex.
      if (!first && cur.hex !== pa.vacated && n !== pa.vacated && ezoc.has(cur.hex) && ezoc.has(n)) continue;
      const path = [...cur.path, n];
      const dest = MAP.hexes[n];
      const hs = MAP.hexsides[sideKey(cur.hex, n)] ?? {};
      let hillRoad = 0;
      let stop = st.stop;
      if (dest.terrain === 'hill' && !dest.city && hs.road) hillRoad = 1;
      if (cur.hillRoad && !hs.road) stop = true;
      if (!out.has(n)) out.set(n, path);
      const k = path.length;
      if ((seen.get(n) ?? 99) <= k) continue;
      seen.set(n, k);
      q.push({ hex: n, path, stopped: stop, hillRoad });
    }
  }
  for (const [h] of out) if (!canStack(s, h, [unitId])) out.delete(h);
  return out;
}

export function applyAdvance(s: GameState, unitIds: string[], to: HexId, notes: string[]): void {
  const pa = s.pendingAdvance!;
  for (const id of unitIds) {
    const dests = advanceDestinations(s, pa, id);
    const path = dests.get(to);
    if (!path) throw new Error(`${def(id).name} cannot advance to ${to}.`);
    const u = s.units[id];
    let prev = (u.where as { hex: HexId }).hex;
    for (const h of path) {
      const hs = MAP.hexsides[sideKey(prev, h)] ?? {};
      if (hs.mountain && !hs.road && !hs.pass) u.halfEff = true;
      if (h in s.control || MAP.hexes[h].vp || MAP.hexes[h].city) s.control[h] = sideOf(u);
      prev = h;
    }
    u.where = { kind: 'map', hex: to };
    delete pa.maxByUnit[id];
  }
  if (!canStack(s, to, [])) notes.push(`${to} is overstacked`);
  triggerFullRetreats(s, to, s.activeSide, notes);
}

// ------------------------------------------------------------------ disengagement

export function resolveDisengage(s: GameState, hex: HexId, notes: string[]): void {
  const side = s.activeSide;
  const ids = unitsAt(s, hex).filter((u) => sideOf(u) === side && !u.attacked && !u.repl && !def(u.id).asu && def(u.id).cat !== 'bh').map((u) => u.id);
  if (!ids.length) throw new Error('No units in that hex can disengage.');
  const allMech = ids.every((id) => def(id).mech);
  const roll = rollD6(s);
  const eff = Math.max(1, Math.min(6, roll + (allMech ? RULES.disengagement.mechDrm : 0)));
  const res = RULES.disengagement.table[String(eff)];
  for (const id of ids) s.units[id].attacked = true;
  notes.push(`Disengagement from ${hex}: roll ${roll}${allMech ? '+1' : ''} → ${res === 'no' ? 'fails' : res === 'yesStep' ? 'succeeds, one step lost' : 'succeeds'}`);
  if (res === 'no') return;
  if (res === 'yesStep') takeSteps(s, ids, 1, 'owner', notes);
  const alive = ids.filter((id) => s.units[id].where.kind === 'map');
  if (!alive.length) return;
  const enemyHexes = neighbors(hex).filter((n) => unitsAt(s, n).some((u) => sideOf(u) !== side));
  const origin = enemyHexes[0] ?? hex;
  retreatStack(s, alive, 2, origin, 'disrupted', notes);
  for (const id of alive) s.units[id].retreatedThisPhase = false;
}
