import { MAP, RULES, SCENARIOS, STARTING_SP, UNIT_DEFS, UNIT_SETUP, WITHDRAWAL, BATTLESHIPS_TURN } from './data';
import { distance, neighbors, sideKey, type HexId } from './hex';
import {
  applyAdvance, computeOdds, resolveAttack, resolveDefense, resolveDisengage, advanceDestinations,
} from './combat';
import { eliminate, loseStep, remnantFor, takeSteps, stepValue } from './losses';
import { allowedModes, cannotMove, entryDestinations, entryModes, isTruck, legalDestinations, pathTo, weatherBox } from './movement';
import { chooseRetreat, eliminateExposedFullRetreat, triggerFullRetreats } from './retreat';
import {
  breakthroughAttack, breakthroughDrop, breakthroughMove, endBreakthrough, finishBreakthroughCombat, groupUnits, startBreakthrough,
} from './breakthrough';
import { rollD6 } from './rng';
import { areaFriendly, beachheadHexes, losTo, salernoPortOpen, supplyChecker, usablePorts, SOUTH_EDGE_ALLIED_TURN } from './supply';
import type { Action, CombatReport, GameOptions, GameState, LogEntry, LogKind, MoveMode, Phase, ReplPool, ReplType, Side, UnitState } from './types';
import {
  canStack, def, goodOrder, isLand, occupancy, other, recordTrail, sideOf, stackPoints, stepsRemaining, unitsAt, values,
} from './units';
import { bondsOf, zocOf } from './zoc';
import {
  areaName, attackDetail, hexes, hexName, nameList, oddsText, phaseTitle, place, plural, resultHeadline, supportName, unitName, verb,
} from './words';

export const INPUT_PHASES: Phase[] = ['invasion', 'initial', 'movement', 'combat'];

export class IllegalAction extends Error {}
function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new IllegalAction(msg);
}

type LogExtra = Pick<LogEntry, 'actor' | 'hex' | 'detail' | 'important'>;

export function log(s: GameState, text: string, kind: LogKind = 'info', extra: LogExtra = {}): void {
  const e: LogEntry = { turn: s.turn, side: s.phase === 'weather' || s.phase === 'victory' ? null : s.activeSide, phase: s.phase, text, kind };
  if (extra.actor) e.actor = extra.actor;
  if (extra.hex) e.hex = extra.hex;
  if (extra.detail) e.detail = extra.detail;
  if (extra.important) e.important = true;
  s.log.push(e);
}

/** Notes are whole sentences. */
const say = (notes: string[]) => notes.join(' ');

export function benchmark(turn: number): number | null {
  return RULES.benchmarks[turn] ?? null;
}

export function replPool(unitId: string): ReplPool {
  const n = def(unitId).nation;
  return n === 'GE' ? 'German' : n === 'US' ? 'US' : 'BR';
}

/** The side that must act next (the defender answers a Determined Defense choice). */
export function actingSide(s: GameState): Side {
  if (s.retreatQueue?.length) return s.retreatQueue[0].side;
  return s.pendingDefense ? s.pendingDefense.defenderSide : s.activeSide;
}

export function currentWeather(s: GameState) {
  return weatherBox(s);
}

function emptyRepl(): Record<ReplType, number> {
  return { inf: 0, special: 0, armor: 0 };
}

// ------------------------------------------------------------------ setup

export function newGame(scenarioId: string, seed = Date.now() % 2147483647, options: GameOptions = {}): GameState {
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error(`Unknown scenario ${scenarioId}`);
  const units: Record<string, UnitState> = {};
  for (const id of Object.keys(UNIT_DEFS)) {
    const st = UNIT_SETUP[id];
    let where: UnitState['where'];
    if (st.start?.hex) where = { kind: 'map', hex: st.start.hex };
    else if (st.start?.beach) where = { kind: 'landing', beach: st.start.beach };
    else if (st.start?.followUp) where = { kind: 'followUp', corps: st.start.followUp };
    else if (st.start?.remnant) where = { kind: 'remnantPool' };
    else if (st.arrive) where = { kind: 'pending', turn: st.arrive.turn, at: st.arrive.at };
    else where = { kind: 'removed', reason: 'no set-up' };
    units[id] = {
      id, where, stepsLost: 0, status: 'good', halfEff: false, repl: false, truck: false, outOfSupply: false, isolated: false,
      fired: false, frozenUntil: st.frozenUntil, mpSpent: null, moveMode: null, tacHexes: 0, stopped: false, crossedMountain: false,
      hexesMoved: 0, attacked: false, retreatedThisPhase: false, autoDs: false,
    };
  }
  const control: Record<string, Side> = {};
  for (const [h, d] of Object.entries(MAP.hexes)) if (d.vp || d.port || d.city) control[h] = 'German';
  for (const [a, ea] of Object.entries(MAP.entryAreas)) if (ea.side !== 'north') control[a] = 'German';
  const s: GameState = {
    scenarioId, turn: 1, lastTurn: sc.lastTurn, phase: 'invasion', activeSide: 'Allied', weather: 0,
    supplyPoints: { Allied: STARTING_SP.Allied, German: STARTING_SP.German },
    support: { ready: ['US-air', 'US-naval', 'BR-air', 'BR-naval'], battleships: 0 },
    units, control, cityBattle: {},
    replacements: { German: emptyRepl(), BR: emptyRepl(), US: emptyRepl() },
    landingPoints: RULES.landingPoints.perTurn, portUse: {}, trucksUsed: 0,
    pendingDefense: null, pendingAdvance: null, breakthrough: null, autoDsQueue: [], combats: [], log: [], rng: seed >>> 0,
    winner: null, northVp: {}, abandoned8th: false, seq: 0, options: { ...options },
  };
  log(s, phaseTitle(1, 'Allied', 'invasion'), 'phase');
  log(s, `${sc.name} begins. ${RULES.turnNotes[1] ?? ''}`.trim());
  runInvasion(s);
  return s;
}

function claimHex(s: GameState, hex: HexId, side: Side): void {
  if (hex in s.control && s.control[hex] !== side) {
    s.control[hex] = side;
    const d = MAP.hexes[hex];
    if (d?.vp) log(s, `${side} troops take ${place(hex)}, worth ${plural(d.vp, 'victory point')}.`, 'victory', { actor: side, hex, important: true });
  }
}

// ------------------------------------------------------------------ turn 1 invasion

function runInvasion(s: GameState): void {
  for (const [name, beach] of Object.entries(MAP.beaches)) {
    const ids = Object.values(s.units).filter((u) => u.where.kind === 'landing' && u.where.beach === name).map((u) => u.id);
    if (!ids.length) continue;
    const col = name === 'Maiori' || name === 'Vietri' ? 'Rangers' : name === 'Uncle' ? 'Uncle' : 'Other';
    const roll = rollD6(s);
    const res = RULES.invasion[col][roll - 1];
    const lose = res.startsWith('-1');
    const adv = Number(res.split(',').pop());
    for (const id of ids) {
      const u = s.units[id];
      u.where = { kind: 'map', hex: beach.hex };
      u.moveMode = 'tactical';
      u.tacHexes = 1 + (2 - adv); // the beach hex is the first hex of the advance
      u.stopped = adv < 2 || def(id).cat === 'bh';
    }
    const notes: string[] = [];
    if (lose) takeSteps(s, ids.filter((id) => def(id).cat !== 'bh'), 1, 'owner', notes);
    claimHex(s, beach.hex, 'Allied');
    const how = adv >= 2 ? 'they get ashore cleanly and may push one hex inland' : 'they are pinned on the beach';
    log(s, `${nameList(ids)} ${verb(ids, 'lands', 'land')} on ${name} beach (${beach.hex}). Landing roll ${roll}: ${lose ? 'heavy casualties, and ' : ''}${how}.${notes.length ? ` ${say(notes)}` : ''}`,
      'landing', { hex: beach.hex, detail: `Invasion table, ${col === 'Other' ? 'standard' : col} column: roll ${roll} → ${res}.` });
  }
  log(s, 'Units that got ashore cleanly may now move one more hex inland, and the Commandos may attack Salerno.');
}

// ------------------------------------------------------------------ phase engine

function phaseOrder(): Phase[] {
  return ['initial', 'movement', 'combat', 'recovery', 'supply'];
}

export function advancePhase(s: GameState): void {
  const over = () => (s.phase as Phase) === 'gameOver';
  for (let guard = 0; guard < 40; guard++) {
    if (over()) return;
    stepPhase(s);
    if (over()) return;
    enterPhase(s);
    if (over() || INPUT_PHASES.includes(s.phase)) return;
  }
}

function stepPhase(s: GameState): void {
  if (s.phase === 'invasion' || s.phase === 'weather') {
    s.activeSide = 'German';
    s.phase = 'initial';
    return;
  }
  if (s.phase === 'victory') {
    if (s.turn >= s.lastTurn) {
      endGame(s);
      return;
    }
    s.turn += 1;
    s.phase = 'weather';
    return;
  }
  const order = phaseOrder();
  const i = order.indexOf(s.phase);
  if (i < order.length - 1) s.phase = order[i + 1];
  else if (s.activeSide === 'German') {
    s.activeSide = 'Allied';
    s.phase = 'initial';
  } else s.phase = 'victory';
}

function enterPhase(s: GameState): void {
  for (const u of Object.values(s.units)) u.retreatedThisPhase = false;
  log(s, phaseTitle(s.turn, s.activeSide, s.phase), 'phase');
  switch (s.phase) {
    case 'weather':
      return doWeather(s);
    case 'initial':
      return doInitial(s);
    case 'movement': {
      const notes: string[] = [];
      eliminateExposedFullRetreat(s, notes);
      if (notes.length) log(s, say(notes), 'loss', { important: true });
      for (const u of Object.values(s.units)) {
        if (sideOf(u) !== s.activeSide) continue;
        u.mpSpent = null;
        u.moveMode = null;
        u.tacHexes = 0;
        u.stopped = false;
        u.crossedMountain = false;
        u.hexesMoved = 0;
      }
      s.landingPoints = RULES.landingPoints.perTurn;
      s.portUse = {};
      s.portMode = {};
      s.navalLp = 0;
      s.trucksUsed = 0;
      s.portsAtStart = usablePorts(s);
      if (s.activeSide === 'Allied') {
        // A 2-turn transfer whose port was lost goes back to the Floating Reserve (18.4.4).
        for (const u of Object.values(s.units)) {
          if (u.where.kind === 'atSea' && !s.portsAtStart.includes(u.where.port)) {
            log(s, `${unitName(u.id)} cannot land at ${place(u.where.port)}: the port is no longer usable. It returns to the Floating Reserve.`, 'landing', { hex: u.where.port });
            u.where = { kind: 'reserve' };
            u.stopped = true;
          }
        }
      }
      return;
    }
    case 'combat': {
      const notes: string[] = [];
      eliminateExposedFullRetreat(s, notes);
      if (notes.length) log(s, say(notes), 'loss', { important: true });
      for (const u of Object.values(s.units)) {
        if (sideOf(u) === s.activeSide) u.attacked = false;
        u.reconSaved = false;
      }
      return;
    }
    case 'recovery':
      return doRecovery(s);
    case 'supply':
      return doSupply(s);
    case 'victory':
      return doVictoryCheck(s);
  }
}

function readySupport(s: GameState): void {
  const wb = weatherBox(s);
  const ready: string[] = [];
  for (const n of ['US', 'BR']) {
    if (wb.air.includes(n)) ready.push(`${n}-air`);
    if (wb.naval.includes(n)) ready.push(`${n}-naval`);
  }
  if (wb.air.includes('GE')) {
    const alliedField = s.control['2811'] === 'Allied' &&
      !Object.values(s.units).some((u) => u.where.kind === 'map' && sideOf(u) === 'German' && distance(u.where.hex, '2811') <= 3);
    if (!alliedField) ready.push('GE-air');
  }
  s.support.ready = ready;
}

function doWeather(s: GameState): void {
  const roll = rollD6(s);
  const adv = RULES.weather.advanceByRoll[String(roll)] ?? 0;
  const n = RULES.weather.track.length;
  s.weather = (s.weather + adv) % n;
  const wb = weatherBox(s);
  readySupport(s);
  const ready = s.support.ready;
  const air = ready.filter((k) => k.endsWith('-air')).map((k) => supportName(k).replace(' air support', ''));
  const naval = ready.some((k) => k.endsWith('-naval'));
  log(s, `Weather: ${wb.name} (box ${wb.box}). ${air.length ? `Air support: ${air.join(' and ')}` : 'No air support'}; ${naval ? 'Allied naval gunfire is available' : 'no naval gunfire'}.`,
  'weather', { detail: `Weather roll ${roll}: the marker moves ${adv} to box ${wb.box}. Ready: ${ready.map(supportName).join(', ') || 'none'}.` });
  if (s.turn === BATTLESHIPS_TURN) {
    s.support.battleships = 2;
    log(s, 'The battleships Valiant and Warspite arrive: twice in the game, they can add 1 to an Allied naval-supported attack roll.', 'info', { important: true });
  }
  let allied = wb.alliedSupply;
  if (wb.alliedPortBonus && salernoPortOpen(s)) allied += 1;
  s.supplyPoints.Allied = Math.min(RULES.supply.cap, s.supplyPoints.Allied + allied);
  s.supplyPoints.German = Math.min(RULES.supply.cap, s.supplyPoints.German + wb.germanSupply);
  log(s, `Supply: the Allies receive ${plural(allied, 'supply point')} (now ${s.supplyPoints.Allied}), the Germans ${wb.germanSupply} (now ${s.supplyPoints.German}).`, 'supply',
    { detail: 'Supply points let artillery fire again.' });
  if (RULES.turnNotes[s.turn]) log(s, RULES.turnNotes[s.turn]);
}

function doInitial(s: GameState): void {
  const side = s.activeSide;
  const notes: string[] = [];
  if (side === 'German' && s.turn === WITHDRAWAL.turn) withdraw16Pz(s);
  if (side === 'Allied' && s.turn === SOUTH_EDGE_ALLIED_TURN) {
    for (const a of ['S1', 'S2', 'S3']) {
      s.control[a] = 'Allied';
      for (const u of Object.values(s.units)) {
        if (u.where.kind === 'entry' && (u.where.area === a || u.where.area === 'S') && sideOf(u) === 'German') eliminate(s, u, notes);
      }
    }
    log(s, `The British 8th Army arrives from the south: the south map edge now belongs to the Allies.${notes.length ? ` ${say(notes)}` : ''}`, 'reinforcement', { important: true });
  }
  const arrivals = new Map<string, string[]>();
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side) continue;
    if (u.where.kind === 'pending' && u.where.turn <= s.turn) {
      const at = u.where.at;
      u.where = at === 'reserve' ? { kind: 'reserve' } : { kind: 'entry', area: at === 'hex:3303' ? 'airdrop509' : at };
      const key = at.startsWith('hex') || at === 'airdrop' ? 'airdrop' : at;
      arrivals.set(key, [...(arrivals.get(key) ?? []), u.id]);
    }
    if (u.frozenUntil && s.turn >= u.frozenUntil) {
      u.frozenUntil = undefined;
      log(s, `${unitName(u.id)} is released and may now move.`, 'info', { hex: u.where.kind === 'map' ? u.where.hex : undefined });
    }
    if (def(u.id).cat === 'nebelwerfer' && u.fired && u.where.kind === 'map' && goodOrder(u) && supplyChecker(s, side).inSupply(u.where.hex)) {
      u.fired = false;
      log(s, `${unitName(u.id)} has reloaded and can fire again.`, 'supply', { hex: u.where.hex });
    }
  }
  // One line per arrival point.
  for (const [at, ids] of arrivals) {
    const where = at === 'reserve' ? 'join the Floating Reserve offshore, ready to land' : at === 'airdrop' ? 'are ready to drop by parachute' : `arrive at ${areaName(at)}`;
    log(s, `Reinforcements: ${nameList(ids, 6)} ${ids.length === 1 ? where.replace(/^join /, 'joins ').replace(/^are /, 'is ').replace(/^arrive /, 'arrives ') : where}.`,
      'reinforcement', { detail: ids.length > 6 ? ids.map(unitName).join(', ') : undefined });
  }
  // Replacements: used this phase or lost.
  for (const p of ['German', 'BR', 'US'] as ReplPool[]) s.replacements[p] = emptyRepl();
  const sched = RULES.replacementSchedule[s.turn];
  if (sched) {
    const pools: ReplPool[] = side === 'German' ? ['German'] : ['BR', 'US'];
    for (const p of pools) {
      const add = sched[p];
      if (!add) continue;
      for (const k of ['inf', 'armor', 'special'] as ReplType[]) s.replacements[p][k] += add[k] ?? 0;
      const kinds: Record<string, string> = { inf: 'infantry', armor: 'armour', special: 'special' };
      log(s, `${p === 'BR' ? 'British and Commonwealth' : p} replacements arrive: ${Object.entries(add).map(([k, v]) => `${plural(v ?? 0, `${kinds[k] ?? k} step`)}`).join(', ')}. ` +
        'They must be used this phase or they are lost.', 'reinforcement');
    }
  }
}

function withdraw16Pz(s: GameState): void {
  const notes: string[] = [];
  const sc = supplyChecker(s, 'German');
  let total = 0;
  const asu = s.units['GE-16Art'];
  if (asu && asu.where.kind === 'map') {
    total += values(asu).defense;
    asu.where = { kind: 'removed', reason: '16th Panzer Division withdrawn' };
    notes.push(asu.id);
  }
  const pick = (pref: boolean) =>
    Object.values(s.units)
      .filter((u) => u.where.kind === 'map' && sideOf(u) === 'German' && !def(u.id).asu && sc.inSupply(u.where.hex) &&
        (def(u.id).formation === WITHDRAWAL.prefer) === pref)
      .sort((a, b) => values(b).defense - values(a).defense);
  for (const group of [pick(true), pick(false)]) {
    for (const u of group) {
      if (total >= WITHDRAWAL.defense) break;
      total += values(u).defense;
      u.where = { kind: 'removed', reason: '16th Panzer Division withdrawn' };
      notes.push(u.id);
    }
  }
  log(s, `The 16th Panzer Division is withdrawn from the battle: ${nameList(notes, 8)} ${verb(notes, 'leaves', 'leave')} the map.`, 'reinforcement',
    { actor: 'German', important: true, detail: `Units with ${total} defense strength in all are removed.` });
}

function doRecovery(s: GameState): void {
  const side = s.activeSide;
  const ezoc = zocOf(s, other(side));
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side) continue;
    u.repl = false;
    u.halfEff = false;
    u.truck = false;
    if (u.where.kind !== 'map' && u.where.kind !== 'entry') continue;
    if (u.status === 'good') continue;
    const inZoc = u.where.kind === 'map' && ezoc.has(u.where.hex);
    let recover = !inZoc;
    if (inZoc) {
      const d = def(u.id);
      const hex = (u.where as { hex: HexId }).hex;
      const drm = (MAP.hexes[hex].city || unitsAt(s, hex).some((x) => def(x.id).cat === 'bh') ? RULES.rally.bhOrCityDrm : 0) +
        (d.elite ? RULES.rally.eliteDrm : 0) + (d.lowQuality ? RULES.rally.lowQualityDrm : 0);
      const r = rollD6(s);
      recover = RULES.rally.success.includes(Math.max(1, Math.min(6, r + drm)));
      const how = !recover ? (u.status === 'fullRetreat' ? 'still in Full Retreat' : 'still disrupted')
        : u.status === 'fullRetreat' ? 'it steadies, but is still disrupted' : 'it rallies and is back in good order';
      log(s, `${unitName(u.id)} tries to rally next to the enemy: roll ${r}${drm ? ` +${drm}` : ''}, ${how}.`, 'dice', { hex });
    }
    if (recover) u.status = u.status === 'fullRetreat' ? 'disrupted' : 'good';
  }
  for (const h of Object.keys(s.cityBattle)) {
    const holders = unitsAt(s, h);
    const enemyNear = holders.length && neighbors(h).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== sideOf(holders[0])));
    if (!holders.length || !enemyNear) delete s.cityBattle[h];
  }
}

/** Optional rule 25.3: units that need a port for supply share its capacity (LP value x 10). */
function portSupplied(s: GameState, sc: ReturnType<typeof supplyChecker>): Set<string> {
  const ok = new Set<string>();
  const left = new Map(usablePorts(s).map((p) => [p, (MAP.hexes[p].port?.capacity ?? 0) * 10]));
  const needy = Object.values(s.units)
    .filter((u) => u.where.kind === 'map' && sideOf(u) === 'Allied' && !sc.inSupply(u.where.hex))
    .map((u) => ({ u, hex: (u.where as { hex: HexId }).hex }))
    .map((x) => ({ ...x, d: Math.min(99, ...[...left.keys()].map((p) => distance(p, x.hex))) }))
    .sort((a, b) => a.d - b.d);
  for (const { u, hex } of needy) {
    const cost = lpCost(u.id);
    const port = [...left.keys()].sort((a, b) => distance(a, hex) - distance(b, hex))
      .find((p) => left.get(p)! >= cost && losTo(s, 'Allied', hex, [p]));
    if (!port) continue;
    left.set(port, left.get(port)! - cost);
    ok.add(u.id);
  }
  return ok;
}

/** S2.3.7: the Germans give up the 8th Army sector; the 8th Army leaves the game. */
function abandon8thSector(s: GameState): void {
  const notes: string[] = [];
  s.abandoned8th = true;
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === 'German' && u.where.kind === 'map' && MAP.hexes[u.where.hex].sector8) eliminate(s, u, notes);
    if (sideOf(u) === 'German' && u.where.kind === 'entry' && u.where.area.startsWith('E')) eliminate(s, u, notes);
    if (def(u.id).army8 && u.where.kind !== 'eliminated') u.where = { kind: 'removed', reason: '8th Army sector abandoned' };
  }
  for (const a2 of ['E1', 'E2', 'E3', 'E4', 'E5']) s.control[a2] = 'Allied';
  for (const [h, d] of Object.entries(MAP.hexes)) if (d.vp && d.sector8) s.control[h] = 'Allied';
  log(s, `The Germans abandon the 8th Army sector: the 8th Army leaves the game and the east edge passes to the Allies.${notes.length ? ` ${say(notes)}` : ''}`,
    'info', { actor: 'German', important: true });
}

/** After abandonment, German units that end up in the 8th Army sector are lost. */
function purge8thSector(s: GameState): void {
  if (!s.abandoned8th) return;
  const notes: string[] = [];
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === 'German' && u.where.kind === 'map' && MAP.hexes[u.where.hex].sector8) eliminate(s, u, notes, false, 'is lost in the abandoned 8th Army sector');
  }
  if (notes.length) log(s, say(notes), 'loss', { actor: 'German', important: true });
}

function doSupply(s: GameState): void {
  const side = s.activeSide;
  if (side === 'German' && s.abandon8thDeclared && !s.abandoned8th) abandon8thSector(s);
  const limited = side === 'Allied' && !!s.options?.limitedPortSupply;
  const sc = supplyChecker(s, side, { ports: !limited });
  const fromPorts = limited ? portSupplied(s, sc) : new Set<string>();
  const wb = weatherBox(s);
  const cityTargets = Object.entries(MAP.hexes).filter(([h, d]) => d.city && (s.control[h] ?? 'German') === side).map(([h]) => h);
  const corpsHexes = Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side && def(u.id).cat === 'corpsAsu')
    .map((u) => (u.where as { hex: HexId }).hex);
  const nonAsuHexes = Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side && !def(u.id).asu)
    .map((u) => (u.where as { hex: HexId }).hex);
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side) continue;
    const hex = u.where.hex;
    if (u.droppedTurn === s.turn) continue; // airborne units are supplied on the turn they drop
    const ok = sc.inSupply(hex) || fromPorts.has(u.id);
    u.outOfSupply = !ok;
    const isolated = !ok && !sc.hasLoc(hex);
    if (isolated && !u.isolated) u.isolatedSince = s.turn;
    u.isolated = isolated;
    if (!isolated) continue;
    const notes: string[] = [];
    if (def(u.id).asu) {
      const covered = unitsAt(s, hex).some((x) => sideOf(x) === side && !def(x.id).asu) || losTo(s, side, hex, nonAsuHexes);
      if (!covered) {
        eliminate(s, u, notes, false, 'is cut off with no troops left to protect it, and is lost');
        log(s, say(notes), 'loss', { hex, important: true });
      }
      continue;
    }
    if (u.isolatedSince === s.turn) continue;
    if (!neighbors(hex).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== side))) continue;
    const drm = (losTo(s, side, hex, [...cityTargets, ...corpsHexes]) ? RULES.isolation.cityOrCorpsDrm : 0) +
      (side === 'Allied' && wb.clear ? RULES.isolation.alliedClearWeatherDrm : 0);
    const r = rollD6(s);
    const eff = Math.max(1, Math.min(6, r + drm));
    const head = `${unitName(u.id)} is cut off from supply at ${place(hex)}. Attrition roll ${r}${drm ? ` +${drm}` : ''}:`;
    if (RULES.isolation.lossOn.includes(eff)) {
      loseStep(s, u, notes, true);
      log(s, `${head} ${say(notes)}`, 'supply', { hex, important: u.where.kind !== 'map' });
    } else log(s, `${head} it holds out.`, 'supply', { hex });
  }
  // Spend supply points to ready fired ASUs (second chance this turn).
  const asus = Object.values(s.units)
    .filter((u) => u.where.kind === 'map' && sideOf(u) === side && def(u.id).asu && def(u.id).cat !== 'nebelwerfer' && u.fired && goodOrder(u) &&
      !u.outOfSupply)
    .sort((a, b) => (def(a.id).cat === 'corpsAsu' ? -1 : 0) - (def(b.id).cat === 'corpsAsu' ? -1 : 0));
  for (const u of asus) {
    if (s.supplyPoints[side] < 1) break;
    s.supplyPoints[side] -= 1;
    u.fired = false;
    log(s, `${unitName(u.id)} is resupplied and can fire again (1 supply point).`, 'supply', { hex: (u.where as { hex: HexId }).hex });
  }
}

export function vpBreakdown(s: GameState, final = false): { total: number; parts: string[] } {
  const parts: string[] = [];
  let vp = 0;
  const sc = supplyChecker(s, 'Allied');
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.vp) continue;
    const allied = s.control[h] === 'Allied';
    if (allied && sc.inSupply(h)) {
      vp += d.vp;
      parts.push(`${hexName(h) ?? h} +${d.vp}`);
    } else if (final && s.scenarioId === 'campaign' && !allied && !supplyChecker(s, 'German').hasLoc(h)) {
      vp += d.vp;
      parts.push(`${hexName(h) ?? h} (isolated) +${d.vp}`);
    }
  }
  for (const area of ['N1', 'N2']) {
    if (s.northVp[area]) {
      vp += MAP.entryAreas[area].vp ?? 0;
      parts.push(`${area} +${MAP.entryAreas[area].vp}`);
    }
  }
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'eliminated') continue;
    const d = def(u.id);
    if (d.side === 'Allied' && (d.cat === 'airborne' || d.cat === 'glider') && d.sp >= 2) {
      vp -= 1;
      parts.push(`${unitName(u.id)} lost -1`);
    }
    if (d.asu) {
      vp += d.side === 'German' ? 1 : -1;
      parts.push(`${unitName(u.id)} lost ${d.side === 'German' ? '+1' : '-1'}`);
    }
    if (d.cat === 'bh' && !(final && s.scenarioId === 'campaign')) {
      vp -= 1;
      parts.push(`${unitName(u.id)} lost -1`);
    }
  }
  return { total: vp, parts };
}

export function alliedVp(s: GameState): number {
  return vpBreakdown(s).total;
}

function doVictoryCheck(s: GameState): void {
  updateNorthVp(s);
  const vp = alliedVp(s);
  const b = benchmark(s.turn);
  log(s, `The Allies hold ${plural(vp, 'victory point')}${b !== null ? `; the benchmark for today is ${b}` : ''}.`, 'victory',
    { detail: `${vpBreakdown(s).parts.join(', ') || 'Nothing held'}.${b !== null ? ' Five or more above or below the benchmark ends the game.' : ''}` });
  if (b === null) return;
  if (vp >= b + RULES.automaticMargin || vp >= RULES.automaticAlliedVp) {
    s.winner = 'Allied';
    s.victoryNote = `Automatic Allied victory: the Allies hold ${vp} victory points against a benchmark of ${b}.`;
  } else if (vp <= b - RULES.automaticMargin) {
    s.winner = 'German';
    s.victoryNote = `Automatic German victory: the Allies hold only ${vp} victory points against a benchmark of ${b}.`;
  }
  if (s.winner) {
    s.phase = 'gameOver';
    log(s, s.victoryNote!, 'victory', { actor: s.winner as Side, important: true });
  }
}

function endGame(s: GameState): void {
  const { total } = vpBreakdown(s, true);
  const need = s.scenarioId === 'short' ? 8 : 20;
  s.winner = total >= need ? 'Allied' : 'German';
  s.victoryNote = `The Allies end the battle with ${plural(total, 'victory point')}; they needed ${need}.`;
  s.phase = 'gameOver';
  log(s, `${s.winner} victory. ${s.victoryNote}`, 'victory', { actor: s.winner as Side, important: true });
}

function updateNorthVp(s: GameState): void {
  const sc = supplyChecker(s, 'Allied');
  for (const area of ['N1', 'N2']) {
    if (s.northVp[area]) continue;
    const here = Object.values(s.units).filter((u) => u.where.kind === 'entry' && u.where.area === area && sideOf(u) === 'Allied' && !def(u.id).army8);
    const att = here.reduce((a, u) => a + values(u).attack, 0);
    if (here.length >= 2 && att >= 6 && MAP.entryAreas[area].hexes.some((h) => sc.inSupply(h))) {
      s.northVp[area] = true;
      log(s, `Allied troops break out to ${areaName(area)}: ${plural(MAP.entryAreas[area].vp ?? 0, 'victory point')}.`, 'victory', { actor: 'Allied', important: true });
    }
  }
}

// ------------------------------------------------------------------ actions

function ownUnit(s: GameState, id: string): UnitState {
  const u = s.units[id];
  need(u, `Unknown unit ${id}`);
  need(sideOf(u) === s.activeSide, `${def(id).name} is not the active player's unit.`);
  return u;
}

export function lpCost(id: string): number {
  return RULES.landingPoints.costBySp[Math.min(3, Math.max(0, def(id).sp))];
}

/** BH hexes (and Sugar beach on turn 1) usable for landings. */
function landingBeaches(s: GameState): HexId[] {
  const out = beachheadHexes(s);
  if (s.turn === 1 && !unitsAt(s, MAP.beaches.Sugar.hex).some((u) => sideOf(u) === 'German')) out.push(MAP.beaches.Sugar.hex);
  return out;
}

export function landingCapacity(s: GameState, hex: HexId): number {
  const d = MAP.hexes[hex];
  if (beachheadHexes(s).includes(hex) || (s.turn === 1 && hex === MAP.beaches.Sugar.hex)) return 3;
  if (d.port) {
    if (hex === '2707' && Object.values(s.units).some((u) => u.where.kind === 'map' && sideOf(u) === 'German' && distance(u.where.hex, '2707') <= 2)) return 1;
    return d.port.capacity;
  }
  return 0;
}

function fullMountainHex(hex: HexId): boolean {
  return neighbors(hex).every((n) => !isLand(n) || MAP.hexsides[sideKey(hex, n)]?.mountain);
}

/** Room left at a port or beachhead to receive `cost` LP this turn, or a 2-turn transfer. */
function receiveMode(s: GameState, hex: HexId, cost: number): 'normal' | 'twoTurn' | null {
  if ((s.portMode ?? {})[hex] === 'out') return null;
  const cap = landingCapacity(s, hex);
  const used = s.portUse[hex] ?? 0;
  if (used + cost <= cap) return 'normal';
  // A 2 or 3 LP unit may reach a capacity-1 port in two turns.
  if (MAP.hexes[hex].port && !beachheadHexes(s).includes(hex) && cap === 1 && used === 0 && cost > 1) return 'twoTurn';
  return null;
}

/** Hexes where an Allied unit waiting off-map may land or drop. */
export function landingHexes(s: GameState, unitId: string): HexId[] {
  const u = s.units[unitId];
  const occ = occupancy(s);
  if (s.phase !== 'movement' && !(s.phase === 'initial' && u.where.kind === 'entry')) return [];
  if (u.where.kind === 'atSea') {
    const port = u.where.port;
    if (s.phase !== 'movement' || u.where.since >= s.turn || !(s.portsAtStart ?? []).includes(port)) return [];
    if ((s.portMode ?? {})[port] === 'out' || (s.portUse[port] ?? 0) > 0 || occ.get(port) === 'German') return [];
    return [port];
  }
  if (u.where.kind === 'reserve' || u.where.kind === 'followUp') {
    if (s.phase !== 'movement' || u.stopped || u.repl) return []; // replacement units may not use naval transport (20.4)
    let hexes = [...landingBeaches(s), ...(s.turn === 1 ? [] : (s.portsAtStart ?? []))];
    if (u.where.kind === 'followUp') {
      const corps = u.where.corps;
      hexes = hexes.filter((h) => Object.values(MAP.beaches).some((b) => b.hex === h && b.corps === corps && !['Maiori', 'Vietri'].includes(b.formation)));
    }
    const cost = lpCost(unitId);
    if (cost > s.landingPoints) return [];
    return [...new Set(hexes)].filter((h) => occ.get(h) !== 'German' && receiveMode(s, h, cost) !== null);
  }
  if (u.where.kind === 'entry' && (u.where.area === 'airdrop' || u.where.area === 'airdrop509')) {
    const bonds = bondsOf(s, 'German');
    const bh = beachheadHexes(s);
    return Object.keys(MAP.hexes).filter((h) => {
      const d = MAP.hexes[h];
      if (d.terrain === 'sea' || d.city || occ.get(h) === 'German' || bonds.hexes.has(h)) return false;
      if (u.where.kind === 'entry' && u.where.area === 'airdrop') return bh.some((b) => distance(b, h) <= 3);
      return !d.sector8;
    });
  }
  return [];
}

/** A unit coming ashore at a beach or port: tactical movement, ½ Eff or disrupted (18.4.2). */
function arriveBySea(s: GameState, u: UnitState, hex: HexId, tacHexes: number): void {
  const beach = Object.values(MAP.beaches).find((b) => b.hex === hex);
  const otherNation = beach && ((beach.corps === 'X') !== (def(u.id).nation !== 'US')) && !['Maiori', 'Vietri'].includes(beach.formation);
  const exempt = def(u.id).cat === 'ranger' || def(u.id).formation === 'Commando Bde';
  u.where = { kind: 'map', hex };
  u.landedTurn = s.turn;
  u.moveMode = 'tactical';
  u.tacHexes = tacHexes;
  u.hexesMoved = 0;
  u.stopped = tacHexes >= 2 || zocOf(s, 'German').has(hex);
  u.mpSpent = 0;
  if (otherNation) u.status = 'disrupted';
  else if (!exempt) u.halfEff = true;
  claimHex(s, hex, 'Allied');
}

/** Port/beachhead hexes (or the Floating Reserve) a unit may reach by sea now (18.4.5). */
export function navalDestinations(s: GameState, unitId: string): { to: HexId | 'reserve'; twoTurn: boolean }[] {
  const u = s.units[unitId];
  if (s.phase !== 'movement' || s.activeSide !== 'Allied' || s.turn === 1 || sideOf(u) !== 'Allied' || u.where.kind !== 'map') return [];
  if (u.status !== 'good' || def(u.id).cat === 'bh' || u.frozenUntil || u.repl) return [];
  // Naval movement uses one of the unit's two tactical hexes.
  const fresh = u.mpSpent === null && u.moveMode === null;
  const oneTactical = u.moveMode === 'tactical' && u.tacHexes <= 1 && u.hexesMoved <= 1;
  if (!fresh && !oneTactical) return [];
  if (!allowedModes(s, u).includes('tactical')) return [];
  const from = u.where.hex;
  const ports = s.portsAtStart ?? [];
  const bh = beachheadHexes(s);
  const terminal = (h: HexId) => bh.includes(h) || ports.includes(h);
  if (!terminal(from)) return [];
  const cost = lpCost(unitId);
  if ((s.portMode ?? {})[from] === 'in' || (s.portUse[from] ?? 0) + cost > landingCapacity(s, from)) return [];
  const out: { to: HexId | 'reserve'; twoTurn: boolean }[] = [{ to: 'reserve', twoTurn: false }];
  if ((s.navalLp ?? 0) + cost > 3) return out;
  const occ = occupancy(s);
  for (const h of new Set([...bh, ...ports])) {
    if (h === from || occ.get(h) === 'German') continue;
    const mode = receiveMode(s, h, cost);
    if (mode) out.push({ to: h, twoTurn: mode === 'twoTurn' });
  }
  return out;
}

function moveAlong(s: GameState, u: UnitState, path: HexId[]): void {
  const from = u.where.kind === 'map' ? [u.where.hex] : [];
  recordTrail(s, u.id, [...from.filter((h) => h !== path[0]), ...path]);
  for (const h of path) claimHex(s, h, sideOf(u));
  u.where = { kind: 'map', hex: path[path.length - 1] };
}

function afterMoveChecks(s: GameState, u: UnitState): void {
  const hex = (u.where as { hex?: HexId }).hex;
  if (!hex) return;
  const notes: string[] = [];
  triggerFullRetreats(s, hex, sideOf(u), notes);
  if (notes.length) log(s, say(notes), 'retreat', { actor: other(sideOf(u)), hex });
  // The Torre Annunziata garrison is released when Allied units come within 3 hexes.
  if (sideOf(u) === 'Allied') {
    for (const g of Object.values(s.units)) {
      if (g.frozenUntil && g.where.kind === 'map' && distance(g.where.hex, hex) <= 3) {
        g.frozenUntil = undefined;
        log(s, `${unitName(g.id)} is released and may move: Allied troops have come within 3 hexes.`, 'info', { hex: g.where.hex });
      }
    }
  }
}

/** One attack in plain English, with the strengths and table lookups as the detail line. */
function logAttack(s: GameState, rep: CombatReport, prefix = ''): void {
  // Hidden garrison strengths are revealed before the roll; a hollow garrison is no longer among the defenders.
  const reveal = rep.notes.filter((n) => n.includes(' turns out to '));
  const rest = rep.notes.filter((n) => !reveal.includes(n));
  const att = `${rep.attackerSide} ${nameList(rep.attackers, 3)}`;
  const hollow = reveal.map((n) => n.slice(0, n.indexOf(' turns out to ')));
  const dfn = rep.defenders.length ? `${other(rep.attackerSide)} ${nameList(rep.defenders, 3)}`
    : hollow.length ? `${other(rep.attackerSide)} ${hollow.join(' and ')}` : 'an empty position';
  const odds = rep.roll ? ` at ${rep.defense > 0 ? `${oddsText(rep.finalColumn)} odds` : 'no defense'}` : '';
  const roll = rep.roll ? ` Roll ${rep.roll}${rep.drm ? ` +${rep.drm}` : ''}: ${resultHeadline(rep.result)}.` : '';
  log(s, `${prefix}${att} ${verb(rep.attackers, 'attacks', 'attack')} ${dfn} at ${place(rep.defenderHex)}${odds}. ${say(reveal)}${roll} ${say(rest)}`.replace(/ {2,}/g, ' ').trim(), 'combat',
    { hex: rep.defenderHex, important: true, detail: attackDetail(rep) });
}

/** Victory-point hexes that changed hands since `before` (advances and breakthroughs set control directly). */
function logCaptures(s: GameState, before: Record<string, Side>): void {
  for (const [h, side] of Object.entries(s.control)) {
    const d = MAP.hexes[h];
    if (!d?.vp || before[h] === side) continue;
    log(s, `${side} troops take ${place(h)}, worth ${plural(d.vp, 'victory point')}.`, 'victory', { actor: side, hex: h, important: true });
  }
}

const MODE_TEXT: Record<MoveMode, string> = {
  normal: '', extended: ' (extended move)', tactical: ' (tactical move)', truck: ' by truck', truckExtended: ' by truck (extended move)',
};

const AREA_LINKS: [string, string][] = [['N1', 'N2'], ['E5', 'E4'], ['E4', 'E3'], ['E3', 'E2'], ['E2', 'E1'], ['E1', 'S3'], ['S3', 'S2'], ['S2', 'S1']];

function areaOfEdge(area: string): string[] {
  if (area === 'N') return ['N1', 'N2'];
  if (area === 'S') return ['S1', 'S2', 'S3'];
  if (area === 'E') return ['E1', 'E2', 'E3', 'E4', 'E5'];
  return [area];
}

/** Destinations for a unit waiting in an entry area (or an edge code N/S/E). */
export function entryReach(s: GameState, unitId: string, mode: MoveMode) {
  const u = s.units[unitId];
  const side = sideOf(u);
  const res = new Map<HexId, ReturnType<typeof entryDestinations> extends Map<HexId, infer R> ? R : never>();
  if (u.where.kind !== 'entry') return res;
  for (const a of areaOfEdge(u.where.area)) {
    if (!MAP.entryAreas[a] || !areaFriendly(s, a, side) && !(side === 'Allied' && (a === 'N1' || a === 'N2'))) continue;
    for (const [h, r] of entryDestinations(s, unitId, a, mode)) if (!res.has(h) || res.get(h)!.cost > r.cost) res.set(h, r);
  }
  if (side === 'German' && s.abandoned8th) for (const h of [...res.keys()]) if (MAP.hexes[h].sector8) res.delete(h);
  return res;
}

export function applyAction(s: GameState, a: Action): void {
  need(s.phase !== 'gameOver', 'The game is over.');
  s.seq += 1;
  s.trails = {};
  // A City Battle marker goes as soon as the defender has vacated the city (11.6.3).
  for (const h of Object.keys(s.cityBattle)) if (!unitsAt(s, h).length) delete s.cityBattle[h];
  if (s.retreatQueue?.length && a.type !== 'retreatChoice') throw new IllegalAction(`The ${s.retreatQueue[0].side} player must first confirm where the retreating units go.`);
  if (s.pendingDefense && a.type !== 'defend') throw new IllegalAction('The defender must first choose: retreat or Determined Defense.');
  switch (a.type) {
    case 'endPhase':
      return endPhase(s);
    case 'defend': {
      need(s.pendingDefense, 'No defense decision is pending.');
      const pd = s.pendingDefense;
      const rep = s.combats.find((c) => c.id === pd.combatId) ?? s.combats[s.combats.length - 1];
      const before = rep.notes.length;
      resolveDefense(s, a);
      finishBreakthroughCombat(s);
      const choice = a.choice === 'dd' ? 'stand and fight (Determined Defense)' : 'fall back';
      log(s, `The ${pd.defenderSide} defenders at ${place(pd.hex)} ${choice}. ${say(rep.notes.slice(before))}`.trim(), 'combat', {
        actor: pd.defenderSide, hex: pd.hex, important: true,
        detail: rep.dd && a.choice === 'dd' ? `Determined Defense table, ${rep.dd.column} column: roll ${rep.dd.roll}${rep.dd.drm ? ` ${rep.dd.drm > 0 ? '+' : ''}${rep.dd.drm}` : ''} → ${rep.dd.result}.` : undefined,
      });
      return;
    }
    case 'move': {
      need(s.phase === 'movement' || s.phase === 'invasion', 'Units move in the movement phase.');
      need(!s.pendingAdvance, 'Finish the advance after combat first.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'map', 'Unit is not on the map.');
      const why = cannotMove(s, u);
      need(!why, `${def(u.id).name} ${why}.`);
      const mode = s.phase === 'invasion' || u.moveMode === 'tactical' ? 'tactical' : a.mode ?? 'normal';
      need(allowedModes(s, u).includes(mode), `${def(u.id).name} may not use ${mode} movement now.`);
      if (isTruck(mode)) {
        need(s.trucksUsed < 2, 'Both truck markers are in use.');
        // Supply for trucks is judged at that instant (5.8), not by the last Supply Phase's marker.
        need(supplyChecker(s, sideOf(u)).inSupply(u.where.hex), `${def(u.id).name} is out of supply and cannot use trucks.`);
      }
      const dests = legalDestinations(s, u.id, mode);
      const r = dests.get(a.to);
      need(r, `${def(u.id).name} cannot reach ${a.to}.`);
      if (sideOf(u) === 'German' && s.abandoned8th) need(!MAP.hexes[a.to].sector8, 'German units may not enter the 8th Army sector.');
      if (s.turn === 1 && sideOf(u) === 'German') need(!Object.values(MAP.beaches).some((b) => b.hex === a.to), 'German units may not enter the landing beaches on turn 1.');
      const from = u.where.hex;
      const path = pathTo(dests, a.to);
      moveAlong(s, u, path);
      u.hexesMoved += path.length - 1;
      u.mpSpent = (u.mpSpent ?? 0) + r.cost;
      u.tacHexes += mode === 'tactical' ? r.hexes : 0;
      u.moveMode = mode;
      u.stopped = true;
      if (r.halfEff) {
        u.halfEff = true;
        u.crossedMountain = true;
      }
      if (isTruck(mode)) {
        u.truck = true;
        s.trucksUsed += 1;
      }
      if (def(u.id).asu && u.hexesMoved > 1) u.status = u.status === 'good' ? 'disrupted' : u.status;
      log(s, `${unitName(u.id)} moves to ${place(a.to)}${MODE_TEXT[mode]}.`, 'move', { hex: a.to, detail: `From ${from}, ${hexes(path.length - 1)}.` });
      afterMoveChecks(s, u);
      return;
    }
    case 'enter': {
      need(s.phase === 'movement', 'Reinforcements enter in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'entry' && !u.where.area.startsWith('airdrop'), 'Unit is not waiting at an entry area.');
      need(u.status === 'good', 'Only units in Good Order may leave an entry area.');
      need(!u.stopped, 'Unit has already moved this phase.');
      need(!(sideOf(u) === 'Allied' && ['N1', 'N2'].includes(u.where.area)), 'Allied units never leave the north entry areas.');
      const mode = a.mode ?? 'normal';
      need(entryModes(s, u).includes(mode), `${def(u.id).name} may not enter using ${mode} movement.`);
      const dests = entryReach(s, u.id, mode);
      const r = dests.get(a.to);
      need(r, `${def(u.id).name} cannot reach ${a.to} this turn.`);
      const area = u.where.area;
      const path = pathTo(dests, a.to);
      moveAlong(s, u, path);
      u.stopped = true;
      u.moveMode = mode;
      u.mpSpent = r.cost;
      u.hexesMoved = path.length;
      if (isTruck(mode)) {
        u.truck = true;
        s.trucksUsed += 1;
      }
      // ASUs moving more than one hex are disrupted (17.3).
      if (def(u.id).asu && u.hexesMoved > 1) u.status = 'disrupted';
      log(s, `${unitName(u.id)} enters the map from ${areaName(area)} and moves to ${place(a.to)}${MODE_TEXT[mode]}.`, 'move', { hex: a.to });
      afterMoveChecks(s, u);
      return;
    }
    case 'changeArea': {
      need(s.phase === 'movement', 'Only in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(!u.stopped && u.status === 'good', 'Unit must be in Good Order and not yet moved.');
      need(!u.repl, 'A unit that received a replacement may not move between Entry Areas (20.4).');
      const side = sideOf(u);
      const target = MAP.entryAreas[a.area];
      need(target, 'Unknown entry area.');
      if (side === 'Allied') {
        need(a.area === 'N1' || a.area === 'N2' ? !def(u.id).army8 : areaFriendly(s, a.area, 'Allied') || (target.side === 'east' && !!def(u.id).army8),
          'Allied units may not enter that entry area.');
        if (target.side === 'east') need(def(u.id).army8, 'Only 8th Army units may use the east entry areas.');
      } else need(areaFriendly(s, a.area, 'German'), 'That entry area is in Allied hands.');
      if (u.where.kind === 'map') {
        need(target.hexes.includes(u.where.hex), 'Unit must be on an edge hex of that entry area.');
      } else {
        need(u.where.kind === 'entry', 'Unit must be on the map or in an entry area.');
        const from = u.where.area;
        const linked = AREA_LINKS.some(([x, y]) => areaOfEdge(from).some((f) => (f === x && y === a.area) || (f === y && x === a.area)));
        need(linked, `${a.area} is not next to ${from}.`);
        if (from.startsWith('N') && a.area.startsWith('N')) need(side === 'German', 'Only German units move between N1 and N2.');
      }
      u.where = { kind: 'entry', area: a.area };
      u.stopped = true;
      log(s, `${unitName(u.id)} moves off the map into ${areaName(a.area)}.`, 'move');
      if (side === 'Allied' && target.side === 'east' && s.control[a.area] !== 'Allied') {
        s.control[a.area] = 'Allied';
        const notes: string[] = [];
        for (const g of Object.values(s.units)) if (g.where.kind === 'entry' && g.where.area === a.area && sideOf(g) === 'German') eliminate(s, g, notes);
        log(s, `The 8th Army takes ${areaName(a.area)}.${notes.length ? ` ${say(notes)}` : ''}`, 'victory', { important: true });
      }
      return;
    }
    case 'land': {
      const u = ownUnit(s, a.unitId);
      need(s.activeSide === 'Allied', 'Only the Allies land from the sea or the air.');
      need(landingHexes(s, a.unitId).includes(a.to), `${def(a.unitId).name} cannot land at ${a.to}.`);
      const notes: string[] = [];
      if (u.where.kind === 'entry') {
        // Airdrop.
        const zoc = zocOf(s, 'German');
        const d = MAP.hexes[a.to];
        const drm = (d.terrain === 'marsh' || fullMountainHex(a.to) ? -2 : 0) + (zoc.has(a.to) ? -2 : 0);
        const roll = rollD6(s);
        const eff = roll + drm;
        const res = RULES.airdrop.table.find((t) => eff <= t.max)!.result;
        u.where = { kind: 'map', hex: a.to };
        u.droppedTurn = s.turn;
        u.outOfSupply = false;
        if (res === 'eliminated') eliminate(s, u, notes);
        else if (res === 'stepDisrupted') {
          loseStep(s, u, notes);
          u.status = 'disrupted';
        } else if (res === 'disrupted') u.status = 'disrupted';
        else if (res === 'halfEff') u.halfEff = true;
        if (u.where.kind === 'map') claimHex(s, a.to, 'Allied');
        const how: Record<string, string> = {
          eliminated: 'the drop is a disaster.', stepDisrupted: 'a bad drop, scattered and disrupted.', disrupted: 'scattered on landing and disrupted.',
          halfEff: 'a fair drop, at half effectiveness for now.', ok: 'a clean drop.',
        };
        log(s, `${unitName(u.id)} parachutes in at ${place(a.to)}. Drop roll ${roll}${drm ? ` ${drm}` : ''}: ${how[res] ?? res}${notes.length ? ` ${say(notes)}` : ''}`,
          'airdrop', { hex: a.to, important: true, detail: drm ? `${drm} for ${[d.terrain === 'marsh' || fullMountainHex(a.to) ? 'marsh or mountain' : '', zoc.has(a.to) ? 'enemy nearby' : ''].filter(Boolean).join(' and ')}.` : undefined });
        return;
      }
      need(s.phase === 'movement', 'Naval landings happen in the movement phase.');
      const fromSea = u.where.kind === 'atSea';
      const cost = lpCost(u.id);
      const mode = fromSea ? 'normal' : receiveMode(s, a.to, cost);
      need(mode, `${a.to} has no capacity left.`);
      s.portMode = { ...(s.portMode ?? {}), [a.to]: 'in' };
      if (!fromSea) s.landingPoints -= cost;
      if (mode === 'twoTurn') {
        s.portUse[a.to] = landingCapacity(s, a.to);
        u.where = { kind: 'atSea', port: a.to, since: s.turn };
        log(s, `${unitName(u.id)} sails for ${place(a.to)}: the small port can only take it over two turns, so it lands next turn.`, 'landing', { hex: a.to, detail: `${plural(cost, 'landing point')}.` });
        return;
      }
      s.portUse[a.to] = fromSea ? landingCapacity(s, a.to) : (s.portUse[a.to] ?? 0) + cost;
      arriveBySea(s, u, a.to, 1);
      log(s, `${unitName(u.id)} lands at ${place(a.to)}${u.status === 'disrupted' ? ", another nation's beach, and is disrupted in the confusion" : ''}.`, 'landing',
        { hex: a.to, detail: fromSea ? 'End of a two-turn transfer.' : `${plural(cost, 'landing point')}.` });
      afterMoveChecks(s, u);
      return;
    }
    case 'naval': {
      need(s.phase === 'movement' && s.activeSide === 'Allied', 'Naval movement happens in the Allied movement phase.');
      const u = ownUnit(s, a.unitId);
      const dests = navalDestinations(s, u.id);
      const choice = dests.find((d) => d.to === a.to);
      need(choice, `${def(u.id).name} cannot go by sea to ${a.to === 'reserve' ? 'the Floating Reserve' : a.to}.`);
      const from = (u.where as { hex: HexId }).hex;
      const cost = lpCost(u.id);
      s.portMode = { ...(s.portMode ?? {}), [from]: 'out' };
      s.portUse[from] = (s.portUse[from] ?? 0) + cost;
      if (a.to === 'reserve') {
        u.where = { kind: 'reserve' };
        u.stopped = true;
        log(s, `${unitName(u.id)} re-embarks at ${place(from)} and joins the Floating Reserve offshore.`, 'landing', { hex: from });
        return;
      }
      s.navalLp = (s.navalLp ?? 0) + cost;
      s.portMode[a.to] = 'in';
      if (choice.twoTurn) {
        s.portUse[a.to] = landingCapacity(s, a.to);
        u.where = { kind: 'atSea', port: a.to, since: s.turn };
        log(s, `${unitName(u.id)} embarks at ${place(from)} for ${place(a.to)}; it lands there next turn.`, 'landing', { hex: a.to });
        return;
      }
      s.portUse[a.to] = (s.portUse[a.to] ?? 0) + cost;
      arriveBySea(s, u, a.to, u.tacHexes + 1);
      log(s, `${unitName(u.id)} moves by sea from ${place(from)} to ${place(a.to)}.`, 'landing', { hex: a.to });
      afterMoveChecks(s, u);
      return;
    }
    case 'fullRetreat': {
      need(s.phase === 'movement', 'Only in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'map' && u.mpSpent === null && !u.stopped, 'Unit must be on the map and not yet moved.');
      u.status = 'fullRetreat';
      log(s, `${unitName(u.id)} is ordered into Full Retreat to break away from the enemy.`, 'retreat', { hex: u.where.hex });
      return;
    }
    case 'autoDs': {
      need(s.phase === 'movement', 'Auto DS is declared in the movement phase.');
      for (const id of a.attackers) ownUnit(s, id);
      const odds = computeOdds(s, { target: a.target, attackers: a.attackers }, { autoDs: true });
      need(odds.ok && odds.autoDs, odds.reason ?? 'Auto DS needs 10-1 odds or better.');
      const rep = resolveAttack(s, { target: a.target, attackers: a.attackers }, true);
      for (const id of a.attackers) if (s.units[id]) s.units[id].stopped = true;
      if (s.pendingAdvance) {
        s.autoDsQueue.push(s.pendingAdvance);
        s.pendingAdvance = null;
      }
      logAttack(s, rep, 'Overrun: ');
      return;
    }
    case 'attack': {
      need(s.phase === 'combat' || s.phase === 'invasion', 'Attacks happen in the combat phase.');
      need(!s.pendingAdvance && !s.breakthrough, 'Resolve the pending advance first.');
      for (const id of a.attackers) ownUnit(s, id);
      if (s.phase === 'invasion') {
        need(a.attackers.every((id) => def(id).formation === 'Commando Bde' && s.units[id].tacHexes === 1 && !s.units[id].stopped),
          'On the invasion turn only Commandos with an advance left may attack (Salerno).');
        need(a.target === '2707', 'The invasion breakthrough may only target Salerno.');
        need(!a.air && !a.naval && !a.asus?.length, 'No support in the invasion breakthrough.');
      }
      const rep = resolveAttack(s, a);
      if (s.phase === 'invasion') for (const id of a.attackers) s.units[id].stopped = true;
      logAttack(s, rep);
      return;
    }
    case 'advance': {
      const pa = s.pendingAdvance;
      need(pa, 'No advance is pending.');
      if (!a.unitIds.length || !a.to) {
        s.pendingAdvance = null;
        return;
      }
      const notes: string[] = [];
      const ctl = { ...s.control };
      applyAdvance(s, a.unitIds, a.to, notes);
      pa.started = true;
      log(s, `${nameList(a.unitIds)} ${verb(a.unitIds, 'advances', 'advance')} ${a.to === pa.vacated ? 'into' : 'to'} ${place(a.to)}. ${say(notes)}`.trim(), 'move', { hex: a.to });
      logCaptures(s, ctl);
      if (!Object.keys(pa.maxByUnit).some((id) => s.units[id].where.kind === 'map')) s.pendingAdvance = null;
      return;
    }
    case 'retreatChoice': {
      const notes: string[] = [];
      chooseRetreat(s, a.index, notes);
      if (notes.length) log(s, say(notes), 'retreat');
      return;
    }
    case 'btStart': {
      const notes: string[] = [];
      const ctl = { ...s.control };
      startBreakthrough(s, a.unitIds, a.form, notes);
      log(s, say(notes), 'move', { hex: s.breakthrough?.hex, important: true });
      logCaptures(s, ctl);
      return;
    }
    case 'btMove': {
      const notes: string[] = [];
      const ids = s.breakthrough ? groupUnits(s, s.breakthrough) : [];
      const ctl = { ...s.control };
      breakthroughMove(s, a.to, notes);
      log(s, `The Breakthrough Group (${nameList(ids)}) drives on to ${place(a.to)}. ${say(notes)}`.trim(), 'move', { hex: a.to });
      logCaptures(s, ctl);
      return;
    }
    case 'btAttack': {
      const rep = breakthroughAttack(s, a.target);
      logAttack(s, rep, 'Breakthrough attack: ');
      return;
    }
    case 'btDrop': {
      need(s.breakthrough, 'No Breakthrough Group is active.');
      breakthroughDrop(s, a.unitIds);
      log(s, `${nameList(a.unitIds)} ${verb(a.unitIds, 'leaves', 'leave')} the Breakthrough Group and ${verb(a.unitIds, 'stops', 'stop')}.`, 'move');
      return;
    }
    case 'btEnd': {
      need(s.breakthrough && s.breakthrough.pendingCombat === null, 'No Breakthrough Group to stop.');
      endBreakthrough(s);
      log(s, 'The Breakthrough Group halts.', 'move');
      return;
    }
    case 'disengage': {
      need(s.phase === 'combat', 'Disengagement happens in the combat phase.');
      need(!s.pendingAdvance && !s.breakthrough, 'Resolve the pending advance first.');
      const notes: string[] = [];
      resolveDisengage(s, a.hex, notes);
      log(s, say(notes), 'retreat', { hex: a.hex });
      return;
    }
    case 'replace': {
      need(s.phase === 'initial', 'Replacements are used in the initial phase.');
      const u = ownUnit(s, a.unitId);
      return applyReplacement(s, u, a.to);
    }
    case 'readyAsu': {
      need(s.phase === 'initial', 'Artillery is resupplied in the initial phase.');
      const u = ownUnit(s, a.unitId);
      need(def(u.id).asu && u.fired, 'Unit is not a fired artillery support unit.');
      need(def(u.id).cat !== 'nebelwerfer', 'The Nebelwerfer readies for free when in supply.');
      need(goodOrder(u) && u.where.kind === 'map' && supplyChecker(s, s.activeSide).inSupply(u.where.hex), 'Only ASUs in Good Order and in supply can be readied.');
      need(s.supplyPoints[s.activeSide] > 0, 'No supply points left.');
      s.supplyPoints[s.activeSide] -= 1;
      u.fired = false;
      log(s, `${unitName(u.id)} is resupplied and can fire again (1 supply point).`, 'supply', { hex: u.where.hex });
      return;
    }
    case 'abandon8th': {
      need(s.activeSide === 'German' && s.turn >= 16 && !s.abandoned8th && !s.abandon8thDeclared, 'Only the German player may do this, from turn 16.');
      need(INPUT_PHASES.includes(s.phase) && !s.pendingAdvance && !s.breakthrough, 'Not now.');
      s.abandon8thDeclared = true;
      log(s, 'The Germans decide to abandon the 8th Army sector; they pull out in their supply phase.', 'info', { important: true });
      return;
    }
  }
}

function applyReplacement(s: GameState, u: UnitState, to?: HexId): void {
  const side = sideOf(u);
  const d = def(u.id);
  need(d.repl, `${d.name} cannot be replaced.`);
  need(!u.repl, `${d.name} already received a replacement this turn.`);
  const pool = s.replacements[replPool(u.id)];
  const spend = () => {
    if (pool[d.repl!] > 0) pool[d.repl!] -= 1;
    else if (d.repl === 'inf' && pool.special > 0) pool.special -= 1;
    else throw new IllegalAction(`No ${d.repl} replacement available.`);
  };
  const sc = supplyChecker(s, side);
  if (u.where.kind === 'map') {
    need(goodOrder(u) && sc.inSupply(u.where.hex), 'The unit must be in Good Order and in supply.');
    if (u.represents) {
      const orig = s.units[u.represents];
      spend();
      orig.where = { ...u.where };
      orig.stepsLost = 1;
      orig.repl = true;
      orig.status = 'good';
      u.where = { kind: 'remnantPool' };
      u.represents = undefined;
      log(s, `${unitName(orig.id)} is rebuilt from its remnant with a replacement step.`, 'reinforcement', { hex: orig.where.kind === 'map' ? orig.where.hex : undefined });
      return;
    }
    need(u.stepsLost > 0, 'Unit is at full strength.');
    spend();
    u.stepsLost -= 1;
    u.repl = true;
    log(s, `${unitName(u.id)} is brought back up to strength with a replacement step.`, 'reinforcement', { hex: u.where.hex });
    return;
  }
  need(u.where.kind === 'eliminated' && !u.where.permanent, 'Only reduced or eliminated units can be replaced.');
  need(d.cat !== 'bh' && !d.isRemnant, 'Beachhead units and remnants cannot return.');
  const fifthArmy = side === 'Allied' && !d.army8;
  let dest: UnitState['where'];
  if (!to) {
    dest = fifthArmy ? { kind: 'reserve' } : { kind: 'entry', area: side === 'German' ? 'N' : 'S' };
  } else if (MAP.entryAreas[to]) {
    need(!fifthArmy, '5th Army units return to the Floating Reserve or to an ASU hex.');
    need(areaFriendly(s, to, side) && (side === 'German' || MAP.entryAreas[to].side !== 'north'), `${to} is not a friendly Entry Area.`);
    dest = { kind: 'entry', area: to };
  } else {
    const ok = unitsAt(s, to).some((x) => sideOf(x) === side && (def(x.id).cat === 'corpsAsu' || (def(x.id).cat === 'divAsu' && def(x.id).division === d.division)));
    need(ok && sc.inSupply(to), 'Returning units go to a hex with a friendly corps ASU or their division ASU, in supply.');
    need(!neighbors(to).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== side)), 'Not next to the enemy.');
    dest = { kind: 'map', hex: to };
  }
  spend();
  u.stepsLost = d.steps.length - 1;
  u.status = 'good';
  u.repl = true;
  u.fired = !!d.asu;
  u.where = dest;
  const destText = dest.kind === 'map' ? `at ${place(dest.hex)}` : dest.kind === 'entry' ? `at ${areaName(dest.area)}` : 'in the Floating Reserve';
  // A 3-step unit comes back as its Remnant; the unit itself waits in the Remnant Display (20.3.4).
  const rem = d.steps.length === 3 ? remnantFor(s, u.id) : null;
  if (rem) {
    u.stepsLost = 2;
    u.where = { kind: 'remnantHeld' };
    rem.where = dest;
    rem.represents = u.id;
    rem.status = 'good';
    rem.repl = true;
    rem.stepsLost = 0;
    log(s, `${unitName(u.id)} is rebuilt and returns to play as ${unitName(rem.id)} ${destText}.`,
      'reinforcement', { hex: dest.kind === 'map' ? dest.hex : undefined });
    return;
  }
  log(s, `${unitName(u.id)} is rebuilt and returns to play ${destText}.`,
    'reinforcement', { hex: dest.kind === 'map' ? dest.hex : undefined });
}

function endPhase(s: GameState): void {
  purge8thSector(s);
  if (s.breakthrough) {
    endBreakthrough(s);
    return;
  }
  if (s.pendingAdvance) {
    s.pendingAdvance = null;
    return;
  }
  if (s.phase === 'combat' && s.autoDsQueue.length) {
    s.pendingAdvance = s.autoDsQueue.shift()!;
    log(s, 'The units that overran the enemy earlier may now advance.', 'move');
    return;
  }
  if (s.phase === 'initial' && s.activeSide === 'Allied') {
    for (const u of Object.values(s.units)) {
      if (u.where.kind === 'entry' && u.where.area.startsWith('airdrop')) {
        const hexes = landingHexes(s, u.id);
        need(!hexes.length, `${def(u.id).name} must drop this turn.`);
      }
    }
  }
  if (s.phase === 'movement') endOfMovement(s);
  if (s.phase === 'combat') {
    const notes: string[] = [];
    enforceStacking(s, s.activeSide, notes);
    if (notes.length) log(s, say(notes), 'loss', { important: true });
    for (const u of Object.values(s.units)) if (sideOf(u) === s.activeSide) u.autoDs = false; // Auto DS markers come off (8.7.2)
  }
  if (s.phase === 'invasion') for (const u of Object.values(s.units)) if (sideOf(u) === 'Allied') {
    u.moveMode = null;
    u.tacHexes = 0;
    u.stopped = false;
  }
  advancePhase(s);
}

/** Stacking is enforced at the end of movement and combat: excess units are lost (4.0). */
function enforceStacking(s: GameState, side: Side, notes: string[]): void {
  const hexes = new Set(Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side).map((u) => (u.where as { hex: HexId }).hex));
  for (const h of hexes) {
    let here = unitsAt(s, h).filter((u) => sideOf(u) === side);
    while (stackPoints(here.map((u) => u.id), s) > RULES.stackingLimit) {
      // Only units that count for stacking can be removed to fix it.
      const counted = here.filter((u) => stackPoints(here.filter((x) => x.id !== u.id).map((x) => x.id), s) < stackPoints(here.map((x) => x.id), s));
      if (!counted.length) break;
      counted.sort((a, b) => stepValue(a) - stepValue(b));
      eliminate(s, counted[0], notes, false, `is lost: ${place(h)} is over the stacking limit`);
      here = here.filter((u) => u.id !== counted[0].id);
    }
  }
}

function endOfMovement(s: GameState): void {
  const side = s.activeSide;
  const notes: string[] = [];
  enforceStacking(s, side, notes);
  if (side === 'Allied') {
    for (const u of Object.values(s.units)) {
      if (u.where.kind === 'followUp') {
        u.where = { kind: 'reserve' };
        notes.push(`${unitName(u.id)} (follow-up wave) joins the Floating Reserve offshore.`);
      }
    }
  }
  // 8th Army: at most one unit across the army boundary.
  if (side === 'Allied') {
    const across = Object.values(s.units).filter((u) => u.where.kind === 'map' && def(u.id).army8 && !MAP.hexes[u.where.hex].sector8);
    for (const u of across.slice(1)) eliminate(s, u, notes, false, 'is removed: only one 8th Army unit may cross the army boundary');
  }
  // ½ Eff markers only matter next to the enemy.
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side || !u.halfEff) continue;
    if (!neighbors(u.where.hex).some((n) => unitsAt(s, n).some((x) => sideOf(x) !== side))) u.halfEff = false;
  }
  if (notes.length) log(s, say(notes), 'info', { important: notes.some((n) => n.includes(' is ')) });
}

/** Clone-and-apply convenience used by the UI and AI. */
export function withAction(s: GameState, a: Action): GameState {
  const next = structuredClone(s);
  applyAction(next, a);
  return next;
}

export { other, advanceDestinations, stepsRemaining, canStack, legalDestinations };
