// Combat: odds, column shifts, CRT, Determined Defense, advance after combat.
import { BATTLESHIPS_TURN, MAP, RULES } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import { eliminate, loseStep, takeSteps } from './losses';
import { weatherBox } from './movement';
import { retreatStack, planRetreat, triggerFullRetreats } from './retreat';
import { rollD6 } from './rng';
import { areaFriendly, supplyChecker } from './supply';
import type { CombatReport, GameState, PendingAdvance, Side, UnitState } from './types';
import {
  canStack, def, goodOrder, isLand, nationGroup, occupancy, other, recordTrail, sideOf, stackPoints, stepsRemaining, supportNation, unitsAt, values,
} from './units';
import { blockedByBond, bondsOf, zocOf } from './zoc';
import { nameList, place, supportName, unitName, verb } from './words';

export interface AttackPlan {
  target: HexId;
  attackers: string[];
  maf?: string;
  air?: boolean;
  naval?: boolean;
  battleships?: boolean;
  asus?: string[];
  /** Breakthrough Combat during an advance (15.0): no ASU, air or naval support. */
  breakthrough?: boolean;
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

/** Rows north of the Sorrento peninsula (Campanella Point) get no naval support (9.6). */
const NAVAL_MIN_ROW = 4;

function gunfireSea(hex: HexId): boolean {
  const h = MAP.hexes[hex];
  return !!h && h.terrain === 'sea' && parseInt(hex.slice(2), 10) > NAVAL_MIN_ROW;
}

let navalCache: Map<HexId, boolean> | null = null;
/** Target within 2 hexes of the sea south of Campanella Point. */
export function inNavalRange(hex: HexId): boolean {
  if (!navalCache) {
    navalCache = new Map();
    const seas = Object.keys(MAP.hexes).filter(gunfireSea);
    for (const h of Object.keys(MAP.hexes)) {
      navalCache.set(h, parseInt(h.slice(2), 10) >= NAVAL_MIN_ROW && seas.some((sea) => distance(sea, h) <= RULES.combat.navalRange));
    }
  }
  return navalCache.get(hex) ?? false;
}

export function attackedHexesThisPhase(s: GameState): Set<HexId> {
  return new Set(s.combats.filter((c) => c.turn === s.turn && c.attackerSide === s.activeSide && c.phase === s.phase).map((c) => c.defenderHex));
}

const halve = (n: number) => Math.ceil(n / 2);

/** Entry areas an off-map unit stands in (an edge code such as 'N' covers several). */
export function entryAreasOf(area: string): string[] {
  if (area === 'N') return ['N1', 'N2'];
  if (area === 'S') return ['S1', 'S2', 'S3'];
  if (area === 'E') return ['E1', 'E2', 'E3', 'E4', 'E5'];
  return [area];
}

/** The hex a unit attacks or supports from, or null when it is in an Entry Area. */
function originHex(u: UnitState): HexId | null {
  return u.where.kind === 'map' ? u.where.hex : null;
}

/** Is `target` next to the unit: adjacent on the map, or an edge hex of its Entry Area (21.3.4)? */
export function adjacentForCombat(s: GameState, u: UnitState, target: HexId): boolean {
  if (u.where.kind === 'map') return neighbors(u.where.hex).includes(target);
  if (u.where.kind !== 'entry' || u.where.area.startsWith('airdrop')) return false;
  const side = sideOf(u);
  return entryAreasOf(u.where.area).some((a) => MAP.entryAreas[a]?.hexes.includes(target) && areaFriendly(s, a, side));
}

function hexsideToward(u: UnitState, target: HexId) {
  const h = originHex(u);
  return h ? MAP.hexsides[sideKey(h, target)] ?? {} : {};
}

/** A key grouping attackers by stack (hex or Entry Area). */
function stackKey(u: UnitState): string {
  return u.where.kind === 'map' ? u.where.hex : `entry:${(u.where as { area: string }).area}`;
}

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
    if ((u.where.kind !== 'map' && u.where.kind !== 'entry') || sideOf(u) !== side) return false;
    const d = def(u.id);
    if (!d.asu || u.fired || !goodOrder(u) || u.halfEff) return false;
    // An ASU that landed this turn supports only if it has not moved since (18.4.2).
    if (u.landedTurn === s.turn && u.hexesMoved > 0) return false;
    if (u.where.kind === 'entry') {
      // From an Entry Area only adjacent hexes, and not after moving into or between areas (21.3.4, 21.5).
      if (u.stopped || !adjacentForCombat(s, u, target)) return false;
    } else if (distance(u.where.hex, target) > (d.asuRange ?? 0)) return false;
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
  const coreHexes = new Set(core.map((id) => stackKey(s.units[id])));
  const side = def(attackers[0]).side;
  // One attachment stacked with a MAF unit.
  const candidates = attackers.filter((id) => !core.includes(id) && coreHexes.has(stackKey(s.units[id])))
    .filter((id) => side === 'German' || def(id).silhouette || def(id).sp <= 1)
    .sort((a, b) => values(s.units[b]).attack - values(s.units[a]).attack);
  return candidates.length ? [...core, candidates[0]] : core;
}

// ------------------------------------------------------------------ odds

export function validateAttackers(s: GameState, target: HexId, attackers: string[], breakthrough = false): string | null {
  const side = s.activeSide;
  if (!unitsAt(s, target).some((u) => sideOf(u) !== side)) return 'No enemy units in the target hex.';
  if (!breakthrough && attackedHexesThisPhase(s).has(target)) return 'That hex has already been attacked this phase.';
  if (!attackers.length) return 'Select at least one attacking unit.';
  const groups = new Set<string>();
  const armies = new Set<boolean>();
  for (const id of attackers) {
    const u = s.units[id];
    if (!u || (u.where.kind !== 'map' && u.where.kind !== 'entry')) return `${def(id).name} is not on the map.`;
    const d = def(id);
    if (sideOf(u) !== side) return `${d.name} is not yours.`;
    if (d.asu || d.cat === 'bh' || d.variable) return `${d.name} cannot attack.`;
    if (u.attacked && !breakthrough) return `${d.name} has already attacked.`;
    if (u.autoDs && !breakthrough) return `${d.name} made an Auto DS this turn.`;
    if (!goodOrder(u)) return `${d.name} is ${u.status === 'disrupted' ? 'disrupted' : 'in Full Retreat'}.`;
    if (u.truck) return `${d.name} moved by truck (attack 0).`;
    if (u.where.kind === 'map' && unitsAt(s, u.where.hex).some((x) => x.repl)) return `A unit in ${u.where.hex} received a replacement: no combat from that hex.`;
    if (u.where.kind === 'entry') {
      if (u.repl) return `${d.name} received a replacement this turn.`;
      if (u.stopped) return `${d.name} moved this turn and cannot attack out of the Entry Area.`;
    }
    if (!adjacentForCombat(s, u, target)) return `${d.name} is not adjacent to the target.`;
    const hs = hexsideToward(u, target);
    if (breakthrough && (hs.mountain || hs.river) && !hs.road) return 'Breakthrough Combat may cross mountain and river hexsides only along roads.';
    if (hs.mountain && !hs.road && !hs.pass && d.vehicle) return `${d.name} cannot attack across a mountain hexside without a road or pass.`;
    if ((hs.mountain || hs.pass) && u.halfEff) return `${d.name} is ½ Eff and cannot attack across a mountain hexside.`;
    if (hs.river && d.vehicle && (u.halfEff || (weatherBox(s).rain && !hs.road))) return `${d.name} cannot attack across that river now.`;
    if (values(u).attack <= 0) return `${d.name} has no attack strength.`;
    groups.add(nationGroup(id));
    armies.add(!!d.army8);
  }
  if (groups.has('US') && groups.has('CW')) return 'US and Commonwealth units may not attack together.';
  const fromEntry = attackers.filter((id) => s.units[id].where.kind === 'entry');
  if (stackPoints(fromEntry, s) > RULES.stackingLimit) return 'Units attacking out of an Entry Area must respect the stacking limit.';
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

function defenseOf(s: GameState, target: HexId, attackerIds: string[], variableValue?: Record<string, number>, breakthrough = false): DefenseCalc {
  const side = sideOf(s.units[attackerIds[0]] ?? Object.values(s.units)[0]);
  const enemy = other(side);
  const hex = MAP.hexes[target];
  // Units that already retreated this phase count only against Breakthrough Combat, at half strength (15.3).
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) === enemy && (breakthrough || !u.retreatedThisPhase));
  // The defender doubles when every attacker is across a river or attacking out of a marsh (TEC).
  const allAcrossRiver = attackerIds.length > 0 && attackerIds.every((id) => {
    const h = originHex(s.units[id]);
    return !!h && (!!MAP.hexsides[sideKey(h, target)]?.river || MAP.hexes[h].terrain === 'marsh');
  });
  const terrainDoubles = hex.city || hex.terrain === 'hill' || hex.terrain === 'marsh';
  let total = 0;
  let low = 0;
  let high = 0;
  const contributors: string[] = [];
  let regular = defenders.filter((u) => !def(u.id).parenthesized);
  // Against Breakthrough Combat, units beyond the stacking limit (the defender keeps his strongest) add nothing (15.3).
  if (breakthrough && stackPoints(regular.map((u) => u.id), s) > RULES.stackingLimit) {
    const strength = (u: UnitState) => (u.status === 'fullRetreat' ? -1 : values(u).defense);
    const kept: UnitState[] = [];
    for (const u of [...regular].sort((a, b) => strength(b) - strength(a))) {
      if (stackPoints([...kept, u].map((x) => x.id), s) <= RULES.stackingLimit) kept.push(u);
    }
    regular = kept;
  }
  for (const u of regular) {
    const d = def(u.id);
    if (u.status === 'fullRetreat') continue; // Full Retreat: defense 0 (13.3.2)
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
    // Hills, marsh and cities double everyone except silhouetted tanks, ASUs and variable-strength units (9.8).
    const doubled = !d.variable && ((terrainDoubles && !d.silhouette && !d.asu) || allAcrossRiver);
    const halved = u.status !== 'good';
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
    const attackerHexes = new Set(attackerIds.map((id) => originHex(s.units[id])).filter((h): h is HexId => !!h));
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
  const bt = !!plan.breakthrough;
  const bad = validateAttackers(s, plan.target, plan.attackers, bt);
  if (bad) return fail(bad);
  if (bt && (plan.air || plan.naval || plan.asus?.length)) return fail('No artillery, air or naval support in Breakthrough Combat.');
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
      const hs = hexsideToward(u, target);
      let a = values(u).attack;
      // Halved: vehicles across rivers, anyone across a mountain hexside (even by road or pass), ½ Eff, out of supply, outside the MAF.
      const halved = (hs.river && d.vehicle) || hs.mountain || hs.pass || u.halfEff || u.outOfSupply || !members.includes(id);
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
  const dc = defenseOf(s, target, plan.attackers, opts.variableValue, bt);
  const defense = opts.autoDs ? dc.high : dc.defense;
  const baseIndex = baseIndexFor(attack, defense);
  if (baseIndex < 0) return fail('Odds below 1-3 are not allowed.');
  const shifts: { reason: string; shift: number }[] = [];
  const defenders = unitsAt(s, target).filter((u) => sideOf(u) === enemy && u.status !== 'fullRetreat' && (bt || !u.retreatedThisPhase));
  // Tank shifts.
  if (tankTerrainOk(target)) {
    const rating = (id: string) => (def(id).tankRating ?? 0) - (def(id).tankDestroyer ? 1 : 0);
    const mafTanks = members.filter((id) => def(id).tankRating);
    // Tanks attacking across a river or mountain hexside, or out of a marsh, cannot earn the shift (9.3.3, TEC).
    const gainers = mafTanks.filter((id) => {
      const u = s.units[id];
      const hs = hexsideToward(u, target);
      const h = originHex(u);
      return !hs.river && !hs.mountain && !hs.pass && !(h && MAP.hexes[h].terrain === 'marsh');
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
    // The defender's standing order for air support (default: at 3-1 or worse for him, or to hold a VP hex).
    const policy = s.options?.defensiveAir?.[enemy] ?? 'auto';
    const commit = policy === 'always' || (policy === 'auto' && (pre >= 4 || (MAP.hexes[target].vp ?? 0) > 0));
    if (defAir && commit) {
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
  // A breakthrough combat earns no advance of its own (15.2.5); the group continues instead.
  if (rep.breakthrough) return null;
  // The Commandos' Turn 1 breakthrough on Salerno may only enter the city (24.2.4).
  if (rep.phase === 'invasion') {
    limited = true;
    adv = 1;
  }
  const survivors = rep.attackers.filter((id) => s.units[id].where.kind === 'map' && !def(id).asu && !s.units[id].repl);
  if (!survivors.length || adv <= 0) return null;
  if (unitsAt(s, rep.defenderHex).some((u) => sideOf(u) !== rep.attackerSide)) return null;
  const maxByUnit: Record<string, number> = {};
  const from: Record<string, HexId> = {};
  for (const id of survivors) {
    maxByUnit[id] = limited ? 1 : advanceAllowance(s, id, adv);
    from[id] = originHex(s.units[id]) ?? rep.defenderHex;
  }
  return { combatId: rep.id, vacated: rep.defenderHex, from, maxByUnit, limited, btAllowed: !limited && adv >= 2 };
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
        notes.push(variableValue[u.id]
          ? `${unitName(u.id)} turns out to have a defense strength of ${variableValue[u.id]} (roll ${r}).`
          : `${unitName(u.id)} turns out to be a hollow position (roll ${r}).`);
      }
    }
  }
  const odds = computeOdds(s, plan, { autoDs: autoDsMode, variableValue });
  if (!odds.ok) throw new Error(odds.reason);
  const hadOnly = unitsAt(s, plan.target).filter((u) => sideOf(u) === enemy);
  for (const [id, v] of Object.entries(variableValue)) {
    if (v === 0 && s.units[id].where.kind === 'map') eliminate(s, s.units[id], notes, false, 'melts away');
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
    notes.push(vacatedByZero ? 'With nobody left to defend it, the hex falls as if the defenders had been shattered.'
      : 'The odds are overwhelming (10 to 1 or more): the defenders are shattered without a roll.');
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
    phase: s.phase,
    ...(plan.breakthrough ? { breakthrough: true } : {}),
  };
  s.combats.push(report);
  const mafAlive = () => odds.mafUnits.filter((id) => s.units[id].where.kind === 'map');
  const bt = !!plan.breakthrough;
  const defs = () => defenderIds(s, plan.target, enemy).filter((id) => bt || !s.units[id].retreatedThisPhase);
  const contributors = () => defs().filter((id) => !def(id).parenthesized);
  const parenthesized = () => defs().filter((id) => def(id).parenthesized);
  const defSteps = defs().reduce((a, id) => a + stepsRemaining(s.units[id]), 0);
  const attackerHexes = plan.attackers.map((id) => originHex(s.units[id])).filter((h): h is HexId => !!h);
  const r = cell.result;
  // Optional rule 25.2: a recon unit alone in its hex ignores the step loss of a D1 or DS.
  const reconAlone = () => {
    const ids = defs();
    if (!s.options?.recon || ids.length !== 1 || def(ids[0]).cat !== 'recon') return false;
    s.units[ids[0]].reconSaved = true;
    return true;
  };

  // Units that already retreated into the hex retreat with it and are eliminated (12.5); not against Breakthrough Combat.
  const everyone = () => defenderIds(s, plan.target, enemy);
  const finishRetreat = (dist: number, status: 'disrupted' | 'fullRetreat', adv: number) => {
    const ids = everyone();
    if (ids.length) retreatStack(s, ids, dist, plan.target, status, notes, { again: bt });
    s.pendingAdvance = makeAdvance(s, report, adv, false);
  };

  if (r === 'A1') {
    takeSteps(s, mafAlive(), 1, 'owner', notes, plan.attackers);
  } else if (r === 'EX') {
    takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
    takeSteps(s, mafAlive(), 1, 'opponent', notes, plan.attackers);
    if (defSteps === 1 && !defs().length) s.pendingAdvance = makeAdvance(s, report, 1, true);
  } else if (r === 'Dis') {
    // Good Order defenders become Disrupted; those already Disrupted go into Full Retreat and retreat 2 (10.1, 13.1.3).
    const ids = defs().filter((id) => def(id).cat !== 'bh');
    const again = ids.filter((id) => s.units[id].status !== 'good');
    const fresh = ids.filter((id) => s.units[id].status === 'good');
    for (const id of ids) if (s.units[id].status === 'good') s.units[id].status = 'disrupted';
    if (fresh.length) notes.push(`${nameList(fresh)} ${verb(fresh, 'is', 'are')} disrupted.`);
    if (again.length) {
      for (const id of again) s.units[id].status = 'fullRetreat';
      notes.push(`${nameList(again)}, already disrupted, ${verb(again, 'breaks', 'break')} into Full Retreat.`);
      retreatStack(s, again, 2, plan.target, 'fullRetreat', notes, { again: bt });
    }
  } else if (r === 'DR4') {
    finishRetreat(4, 'fullRetreat', cell.adv);
  } else if (r === 'DS') {
    if (reconAlone()) notes.push('The recon unit slips away without losing a step.');
    else takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
    finishRetreat(4, 'fullRetreat', cell.adv || 4);
  } else {
    // DR2, A1/DR2, DRX, A1/D1, D1: losses, then retreat or Determined Defense.
    const dist = r === 'D1' ? 3 : 2;
    if (r === 'A1/DR2' || r === 'A1/D1') takeSteps(s, mafAlive(), 1, 'owner', notes, plan.attackers);
    const reconSave = r === 'D1' && reconAlone();
    if (reconSave) notes.push('The recon unit slips away without losing a step, but cannot make a Determined Defense.');
    else if (r === 'A1/D1' || r === 'D1') takeSteps(s, contributors(), 1, 'owner', notes, parenthesized());
    if (r === 'DRX') {
      takeSteps(s, contributors(), 1, 'opponent', notes, parenthesized());
      takeSteps(s, mafAlive(), 1, 'opponent', notes, plan.attackers);
    }
    const ids = defs();
    if (!ids.length) {
      s.pendingAdvance = makeAdvance(s, report, cell.adv, false);
    } else {
      const canDd = cell.color !== 'r' && !reconSave && ids.some((id) => canLead(s.units[id]) && !s.units[id].reconSaved);
      if (canDd) {
        const plan2 = planRetreat(s, ids, dist, plan.target);
        const desperate = plan2.lost.length > 0 || retreatCutsSupply(s, ids, plan2, plan.target, enemy);
        s.pendingDefense = {
          combatId: report.id, hex: plan.target, defenderSide: enemy, attackerHexes, attackers: plan.attackers,
          retreat: dist, advance: cell.adv, yellow: cell.color === 'y', desperate,
          supportOptions: defensiveSupportOptions(s, plan.target, enemy),
        };
        notes.push(`The defenders must choose: fall back ${dist} hexes, or make a Determined Defense, rolling a die to try to hold the hex${desperate ? ' (with no safe way back, a failed roll costs a step and they roll again)' : ''}.`);
      } else finishRetreat(dist, 'disrupted', cell.adv);
    }
  }
  return report;
}

// ------------------------------------------------------------------ Determined Defense

function pickLead(s: GameState, hex: HexId, side: Side, breakthrough = false): UnitState | null {
  const cands = unitsAt(s, hex).filter((u) => sideOf(u) === side && canLead(u) && (breakthrough || !u.retreatedThisPhase));
  if (!cands.length) return null;
  cands.sort((a, b) => Number(!!def(b.id).elite) - Number(!!def(a.id).elite) || Number(!!def(a.id).lowQuality) - Number(!!def(b.id).lowQuality) ||
    stepsRemaining(b) - stepsRemaining(a));
  return cands[0];
}

export interface DefenseChoice {
  choice: 'retreat' | 'dd';
  /** Hexes to fall back on a Delay result (1-3, 11.6.1). */
  delay?: number;
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
  const bt = !!rep.breakthrough;
  const defs = () => unitsAt(s, pd.hex).filter((u) => sideOf(u) === side && (bt || !u.retreatedThisPhase)).map((u) => u.id);
  // Units that already retreated into the hex go with the stack and are eliminated (12.5).
  const everyone = () => unitsAt(s, pd.hex).filter((u) => sideOf(u) === side).map((u) => u.id);
  const mafAlive = () => rep.attackers.filter((id) => s.units[id].where.kind === 'map');
  const advanceAfter = (limited: boolean) => {
    const before = s.activeSide;
    s.activeSide = attackSide;
    s.pendingAdvance = makeAdvance(s, rep, limited ? 1 : pd.advance, limited);
    s.activeSide = before;
  };
  if (c.choice === 'retreat') {
    retreatStack(s, everyone(), pd.retreat, pd.hex, 'disrupted', notes, { again: bt });
    advanceAfter(false);
    return;
  }
  if (pd.desperate) {
    // Units that can retreat must do so; only the others fight a Desperate Defense (11.5.4).
    const stuck = new Set(planRetreat(s, defs(), pd.retreat, pd.hex).lost);
    const movers = defs().filter((id) => !stuck.has(id));
    if (stuck.size && movers.length) {
      notes.push('Units that can retreat fall back; the rest, with nowhere to go, make a Desperate Defense.');
      retreatStack(s, movers, pd.retreat, pd.hex, 'disrupted', notes, { again: bt });
    }
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
    notes.push(`${supportName(c.support)} ${s.units[c.support] ? 'fires in support of' : 'supports'} the defenders.`);
  }
  let shipDrm = 0;
  if (c.battleships && c.support?.endsWith('-naval') && s.support.battleships > 0 && s.turn >= BATTLESHIPS_TURN) {
    shipDrm = 1;
    s.support.battleships -= 1;
  }
  const column = defenderHexTerrain(pd.hex);
  const delayHexes = Math.max(1, Math.min(3, c.delay ?? 1));
  let delays = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const lead = pickLead(s, pd.hex, side, bt);
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
    const [losses, letter] = pick.split(' ');
    const [att, dfn] = losses.split('/');
    const steps = defs().reduce((a, id) => a + stepsRemaining(s.units[id]), 0);
    let outcome = letter ?? 'fail';
    if (outcome === 'P' && s.cityBattle[pd.hex]) outcome = 'D'; // a second Partial counts as a Delay
    const how = outcome === 'H' ? 'they hold' : outcome === 'P' ? 'they cling on in the streets'
      : outcome === 'D' && pd.desperate ? (delays ? 'a second delay, so they hold at the cost of a step' : 'a delay, which counts as a failure with nowhere to go')
      : outcome === 'D' ? (letter === 'P' ? 'a second partial result here, so they must fall back' : 'they fight a delaying action and give ground slowly')
      : 'the stand fails';
    notes.push(`${unitName(lead.id)} ${attempt ? 'rolls again' : 'leads a Determined Defense'}: roll ${roll}${drm ? (drm > 0 ? ` +${drm}` : ` ${drm}`) : ''}, ${how}.`);
    if (outcome === 'D' && pd.desperate) {
      // In a Desperate Defense a Delay counts as a failure; a second Delay becomes -/1 H (11.6.1).
      delays += 1;
      if (delays >= 2) {
        loseStep(s, lead, notes);
        outcome = 'H';
      } else outcome = 'fail';
    }
    if (pd.desperate && outcome === 'fail') {
      // Ignore the result: the Lead Unit loses a step and the defender rolls again (11.5.3).
      loseStep(s, lead, notes);
      if (!defs().length) break;
      notes.push('With nowhere to go, they fight on (Desperate Defense).');
      continue;
    }
    if (att.startsWith('1')) takeSteps(s, mafAlive(), 1, att.includes('*') ? 'opponent' : 'owner', notes, rep.attackers);
    if (dfn === '1') loseStep(s, lead, notes);
    if (dfn === 'dis' && lead.where.kind === 'map') lead.status = 'disrupted';
    if (outcome === 'P') {
      s.cityBattle[pd.hex] = 1;
      notes.push('A City Battle marker is placed: a second such result here will force them out.');
      outcome = 'H';
    }
    if (outcome === 'H') {
      if (!defs().length && steps === 1) advanceAfter(true);
      notes.push(defs().length ? `The defenders hold ${place(pd.hex)}.` : 'The defenders die holding their ground.');
      return;
    }
    if (outcome === 'D') {
      retreatStack(s, everyone(), delayHexes, pd.hex, 'disrupted', notes, { again: bt });
      advanceAfter(true);
      return;
    }
    break; // the stand fails
  }
  if (everyone().length) retreatStack(s, everyone(), pd.retreat, pd.hex, 'disrupted', notes, { again: bt });
  advanceAfter(false);
}

/** A port or beachhead stack may make a Desperate Defense if losing the hex would leave it out of supply (11.5.2). */
function retreatCutsSupply(s: GameState, ids: string[], plan: ReturnType<typeof planRetreat>, hex: HexId, side: Side): boolean {
  const isBh = unitsAt(s, hex).some((u) => def(u.id).cat === 'bh');
  if ((!MAP.hexes[hex].port && !isBh) || plan.intoArea || !plan.path.length) return false;
  const end = plan.path[plan.path.length - 1];
  const c = structuredClone({ ...s, log: [], combats: [] });
  for (const u of unitsAt(c, hex)) if (sideOf(u) === side) u.where = { kind: 'removed', reason: 'what-if' };
  for (const id of ids) c.units[id].where = { kind: 'map', hex: end };
  c.control[hex] = other(side);
  return !supplyChecker(c, side).inSupply(end);
}

// ------------------------------------------------------------------ advance after combat

/** Hexes `unitId` may advance to (with the path) for the pending advance. */
export function advanceDestinations(s: GameState, pa: PendingAdvance, unitId: string): Map<HexId, HexId[]> {
  const u = s.units[unitId];
  const out = new Map<HexId, HexId[]>();
  if (!u || (u.where.kind !== 'map' && u.where.kind !== 'entry') || !(unitId in pa.maxByUnit)) return out;
  const side = sideOf(u);
  const d = def(unitId);
  const occ = occupancy(s);
  const ezoc = zocOf(s, other(side));
  const bonds = bondsOf(s, other(side));
  const max = pa.maxByUnit[unitId];
  // Units that attacked out of an Entry Area come onto the map through the vacated hex.
  const fromEntry = u.where.kind === 'entry';
  const start = u.where.kind === 'map' ? u.where.hex : pa.vacated;
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
    if (dest.terrain === 'marsh' && !hs.road) stop = true;
    if (dest.terrain === 'hill' && !dest.city && !hs.road) stop = true;
    if (to !== pa.vacated && ezoc.has(to)) stop = true;
    return { ok: true, stop, halfEff };
  };
  // Enemy units whose ZOC covers both hexes: no advance from one such EZOC straight into another (14.4.1).
  const enemyHexes = [...occ.entries()].filter(([, sd]) => sd === other(side)).map(([h]) => h);
  const sameEnemyZoc = (a: HexId, b: HexId) =>
    ezoc.has(a) && ezoc.has(b) && enemyHexes.some((e) => neighbors(e).includes(a) && neighbors(e).includes(b));
  type Node = { hex: HexId; path: HexId[]; stopped: boolean; hillRoad: number };
  const q: Node[] = [];
  if (fromEntry) {
    if (occ.get(pa.vacated) === other(side)) return out;
    const vd = MAP.hexes[pa.vacated];
    out.set(pa.vacated, [pa.vacated]);
    q.push({ hex: pa.vacated, path: [pa.vacated], stopped: vd.terrain === 'marsh' || (vd.terrain === 'hill' && !vd.city), hillRoad: 0 });
  } else q.push({ hex: start, path: [], stopped: false, hillRoad: 0 });
  const seen = new Map<HexId, number>();
  while (q.length) {
    const cur = q.shift()!;
    if (cur.stopped || cur.path.length >= max) continue;
    for (const n of neighbors(cur.hex)) {
      if (pa.limited && n !== pa.vacated) continue;
      const first = cur.path.length === 0;
      const st = stepOk(cur.hex, n, first);
      if (!st.ok) continue;
      if (cur.hex !== pa.vacated && n !== pa.vacated && sameEnemyZoc(cur.hex, n)) continue;
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
    let prev = originHex(u) ?? path[0];
    for (const h of path) {
      const hs = MAP.hexsides[sideKey(prev, h)] ?? {};
      if (hs.mountain && !hs.road && !hs.pass) u.halfEff = true;
      if (h in s.control || MAP.hexes[h].vp || MAP.hexes[h].city) s.control[h] = sideOf(u);
      prev = h;
    }
    recordTrail(s, id, [originHex(u) ?? path[0], ...path].filter((h, i, a) => i === 0 || h !== a[i - 1]));
    u.where = { kind: 'map', hex: to };
    delete pa.maxByUnit[id];
  }
  if (!canStack(s, to, [])) notes.push(`${place(to)} is over the stacking limit: the excess will be lost at the end of the phase.`);
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
  const how = res === 'no' ? 'they cannot break contact and stay put' : res === 'yesStep' ? 'they get away, but lose a step doing it' : 'they get away';
  notes.push(`${nameList(ids)} at ${place(hex)} ${verb(ids, 'tries', 'try')} to disengage from the enemy: roll ${roll}${allMech ? ' +1' : ''}, ${how}.`);
  if (res === 'no') return;
  if (res === 'yesStep') takeSteps(s, ids, 1, 'owner', notes);
  const alive = ids.filter((id) => s.units[id].where.kind === 'map');
  if (!alive.length) return;
  const enemyHexes = neighbors(hex).filter((n) => unitsAt(s, n).some((u) => sideOf(u) !== side));
  const origin = enemyHexes[0] ?? hex;
  retreatStack(s, alive, 2, origin, 'disrupted', notes);
  for (const id of alive) s.units[id].retreatedThisPhase = false;
}
