import { MAP, RULES, SCENARIOS, UNIT_DEFS, UNIT_SETUP } from './data';
import { neighbors, type HexId } from './hex';
import { resolveAttack } from './combat';
import { entryDestinations, legalDestinations, pathTo, STOPPED } from './movement';
import { rollD6 } from './rng';
import { salernoPortOpen, suppliedHexes } from './supply';
import type { Action, GameState, LogEntry, Phase, ReplPool, Side, UnitState } from './types';
import { adjacentEnemy, canStack, def, other, sideOf, stepsRemaining, unitsAt } from './units';

export const INPUT_PHASES: Phase[] = ['initial', 'movement', 'combat'];

export function log(s: GameState, text: string, kind: LogEntry['kind'] = 'info'): void {
  s.log.push({ turn: s.turn, side: s.phase === 'weather' ? null : s.activeSide, phase: s.phase, text, kind });
}

export function benchmark(turn: number): number | null {
  return RULES.benchmarks[turn] ?? null;
}

export function replPool(unitId: string): ReplPool {
  const n = def(unitId).nation;
  return n === 'GE' ? 'German' : n === 'US' ? 'US' : 'BR';
}

// ------------------------------------------------------------------ setup

export function newGame(scenarioId: string, seed = Date.now() % 2147483647): GameState {
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error(`Unknown scenario ${scenarioId}`);
  const units: Record<string, UnitState> = {};
  for (const id of Object.keys(UNIT_DEFS)) {
    const st = UNIT_SETUP[id];
    let where: UnitState['where'];
    if (st.start?.hex) where = { kind: 'map', hex: st.start.hex };
    else if (st.start?.beach) where = { kind: 'map', hex: MAP.beaches[st.start.beach].hex };
    else if (st.start?.reserve) where = { kind: 'reserve' };
    else if (st.arrive) where = { kind: 'pending', turn: st.arrive.turn, at: st.arrive.at };
    else where = { kind: 'removed', reason: 'no set-up' };
    units[id] = {
      id, where, stepsLost: 0, disrupted: false, mpSpent: null, strategic: false,
      attacked: false, outOfSupply: false, fired: false, frozenUntil: st.frozenUntil,
    };
  }
  const control: Record<string, Side> = {};
  for (const [h, d] of Object.entries(MAP.hexes)) if (d.vp || d.port) control[h] = 'German';
  const s: GameState = {
    scenarioId,
    turn: 1,
    lastTurn: sc.lastTurn,
    phase: 'weather',
    activeSide: RULES.turnOrder[0],
    weather: 0,
    supplyPoints: { Allied: 0, German: 0 },
    support: { Allied: { air: [], naval: [] }, German: { air: [], naval: [] } },
    units,
    control,
    replacements: { German: { inf: 0, armor: 0, any: 0 }, BR: { inf: 0, armor: 0, any: 0 }, US: { inf: 0, armor: 0, any: 0 } },
    pendingAdvance: null,
    combats: [],
    log: [],
    rng: seed >>> 0,
    winner: null,
    exitVp: 0,
    landings: {},
    seq: 0,
  };
  for (const u of Object.values(units)) if (u.where.kind === 'map') claimHex(s, u.where.hex, sideOf(u));
  log(s, `${sc.name} begins. ${RULES.turnNotes[1] ?? ''}`.trim());
  enterPhase(s);
  advancePhase(s);
  return s;
}

function claimHex(s: GameState, hex: HexId, side: Side): void {
  if (hex in s.control && s.control[hex] !== side) {
    s.control[hex] = side;
    const d = MAP.hexes[hex];
    if (d.vp) log(s, `${side} takes ${d.city ?? d.town ?? hex} (${d.vp} VP).`, 'victory');
  }
}

// ------------------------------------------------------------------ phase engine

function phaseOrder(side: Side): Phase[] {
  const p: Phase[] = ['initial', 'movement', 'combat', 'recovery', 'supply'];
  if (side === 'Allied') p.push('victory');
  return p;
}

/** Moves to the next phase (and turn), running automatic phases, until input is needed. */
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
  if (s.phase === 'weather') {
    s.phase = 'initial';
    s.activeSide = RULES.turnOrder[0];
    return;
  }
  const order = phaseOrder(s.activeSide);
  const i = order.indexOf(s.phase);
  if (i < order.length - 1) s.phase = order[i + 1];
  else if (s.activeSide === RULES.turnOrder[0]) {
    s.activeSide = RULES.turnOrder[1];
    s.phase = 'initial';
  } else if (s.turn >= s.lastTurn) {
    endGame(s);
  } else {
    s.turn += 1;
    s.phase = 'weather';
  }
}

function enterPhase(s: GameState): void {
  switch (s.phase) {
    case 'weather':
      return doWeather(s);
    case 'initial':
      return doInitial(s);
    case 'movement':
      for (const u of Object.values(s.units)) {
        u.mpSpent = null;
        u.strategic = false;
      }
      s.landings = {};
      return;
    case 'combat':
      for (const u of Object.values(s.units)) u.attacked = false;
      return;
    case 'recovery':
      return doRecovery(s);
    case 'supply':
      return doSupply(s);
    case 'victory':
      return doVictoryCheck(s);
  }
}

function doWeather(s: GameState): void {
  if (s.turn > 1) {
    const roll = rollD6(s);
    const adv = RULES.weather.advanceByRoll[String(roll)] ?? 0;
    const n = RULES.weather.track.length;
    s.weather = RULES.weather.wraps ? (s.weather + adv) % n : Math.min(n - 1, s.weather + adv);
    log(s, `Turn ${s.turn}. Weather roll ${roll}: marker moves ${adv}, now box ${RULES.weather.track[s.weather].box} (${RULES.weather.track[s.weather].name}).`, 'dice');
  } else {
    log(s, 'Turn 1: no weather roll; weather is box A (Clear).');
  }
  const wb = RULES.weather.track[s.weather];
  s.support.Allied.air = wb.air.filter((n) => n !== 'GE');
  s.support.Allied.naval = [...wb.naval];
  s.support.German.air = wb.air.filter((n) => n === 'GE');
  s.support.German.naval = [];
  let allied = wb.alliedSupply;
  if (wb.alliedPortBonus && salernoPortOpen(s)) allied += 1;
  const cap = RULES.supply.supplyPointCap;
  s.supplyPoints.Allied = Math.min(cap, s.supplyPoints.Allied + allied);
  s.supplyPoints.German = Math.min(cap, s.supplyPoints.German + wb.germanSupply);
  log(s, `Supply points: Allied +${allied} (${s.supplyPoints.Allied}), German +${wb.germanSupply} (${s.supplyPoints.German}).`);
  const note = RULES.turnNotes[s.turn];
  if (note && s.turn > 1) log(s, note);
}

function doInitial(s: GameState): void {
  const side = s.activeSide;
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side) continue;
    const st = UNIT_SETUP[u.id];
    if (u.where.kind === 'pending' && u.where.turn <= s.turn) {
      const at = u.where.at;
      if (at === 'reserve') u.where = { kind: 'reserve' };
      else u.where = { kind: 'entry', area: at };
      log(s, `Reinforcement: ${def(u.id).name} available (${at === 'reserve' ? 'floating reserve' : at}).`);
    }
    if (u.where.kind === 'transit' && u.where.arrive <= s.turn) {
      u.where = { kind: 'entry', area: u.where.to };
    }
    if (st.removeOnTurn && st.removeOnTurn <= s.turn && u.where.kind !== 'eliminated' && u.where.kind !== 'removed') {
      u.where = { kind: 'removed', reason: 'withdrawn' };
      log(s, `${def(u.id).name} is withdrawn from play.`);
    }
    if (u.frozenUntil && s.turn >= u.frozenUntil) {
      u.frozenUntil = undefined;
      log(s, `${def(u.id).name} is released.`);
    }
  }
  const sched = RULES.replacementSchedule[s.turn];
  if (sched) {
    const pools: ReplPool[] = side === 'German' ? ['German'] : ['BR', 'US'];
    for (const p of pools) {
      const add = sched[p];
      if (!add) continue;
      for (const k of ['inf', 'armor', 'any'] as const) s.replacements[p][k] += add[k] ?? 0;
      log(s, `${p === 'German' ? 'German' : p} replacements arrive: ${Object.entries(add).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
    }
  }
}

function doRecovery(s: GameState): void {
  const side = s.activeSide;
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side || !u.disrupted) continue;
    if (RULES.recovery.autoRallyIfNotAdjacentToEnemy && !adjacentEnemy(s, u.where.hex, side)) {
      u.disrupted = false;
      log(s, `${def(u.id).name} rallies.`);
    } else {
      const r = rollD6(s);
      if (r >= RULES.recovery.rallyRollNeeded) {
        u.disrupted = false;
        log(s, `${def(u.id).name} rallies (roll ${r}).`, 'dice');
      } else log(s, `${def(u.id).name} fails to rally (roll ${r}).`, 'dice');
    }
  }
}

function doSupply(s: GameState): void {
  const side = s.activeSide;
  const supplied = suppliedHexes(s, side);
  const wb = RULES.weather.track[s.weather];
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side) continue;
    const ok = supplied.has(u.where.hex);
    u.outOfSupply = !ok;
    if (ok || def(u.id).type === 'asu') continue;
    const drm = side === 'German' && wb.clear ? RULES.supply.alliedClearWeatherDrm : 0;
    const r = rollD6(s);
    if (r + drm >= RULES.supply.isolationLossOn) {
      const notes: string[] = [];
      u.stepsLost += 1;
      if (stepsRemaining(u) <= 0) {
        u.where = { kind: 'eliminated' };
        notes.push('eliminated');
      } else notes.push('loses a step');
      log(s, `${def(u.id).name} is isolated; attrition roll ${r}${drm ? `+${drm}` : ''}: ${notes.join(', ')}.`, 'dice');
    } else log(s, `${def(u.id).name} is isolated; attrition roll ${r}${drm ? `+${drm}` : ''}: no loss.`, 'dice');
  }
}

export function alliedVp(s: GameState): number {
  let vp = 0;
  for (const [h, side] of Object.entries(s.control)) {
    if (side === 'Allied') vp += MAP.hexes[h]?.vp ?? 0;
  }
  for (const [name, ea] of Object.entries(MAP.entryAreas)) {
    if (ea.vp && s.control[name] === 'Allied') vp += ea.vp;
  }
  return vp;
}

function doVictoryCheck(s: GameState): void {
  const vp = alliedVp(s);
  const b = benchmark(s.turn);
  log(s, `Victory check: Allied ${vp} VP${b !== null ? ` vs benchmark ${b}` : ''}.`, 'victory');
  if (b !== null && RULES.suddenDeathBelowBenchmark && vp < b && s.turn < s.lastTurn) {
    s.winner = 'German';
    s.victoryNote = `Allied VP (${vp}) fell below the turn ${s.turn} benchmark (${b}).`;
    s.phase = 'gameOver';
    log(s, `German victory: ${s.victoryNote}`, 'victory');
  }
}

function endGame(s: GameState): void {
  const vp = alliedVp(s);
  const b = benchmark(s.turn) ?? 0;
  s.winner = vp >= b ? 'Allied' : vp >= b - RULES.drawMargin ? 'draw' : 'German';
  s.victoryNote = `Final Allied VP ${vp} vs benchmark ${b}.`;
  s.phase = 'gameOver';
  log(s, `${s.winner === 'draw' ? 'Draw' : `${s.winner} victory`}. ${s.victoryNote}`, 'victory');
}

// ------------------------------------------------------------------ actions

export class IllegalAction extends Error {}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new IllegalAction(msg);
}

function ownUnit(s: GameState, id: string): UnitState {
  const u = s.units[id];
  need(u, `Unknown unit ${id}`);
  need(sideOf(u) === s.activeSide, `${def(id).name} is not the active player's unit.`);
  need(!u.frozenUntil || s.turn >= u.frozenUntil, `${def(id).name} is frozen until turn ${u.frozenUntil}.`);
  return u;
}

/** Landing hexes for an Allied unit in the floating reserve or an airdrop box. */
export function landingHexes(s: GameState, unitId: string): HexId[] {
  const u = s.units[unitId];
  const out: HexId[] = [];
  const enemyIn = (h: HexId) => unitsAt(s, h).some((x) => sideOf(x) === 'German');
  if (u.where.kind === 'reserve') {
    const landedHere = (h: HexId) => s.landings[h] ?? 0;
    for (const b of Object.values(MAP.beaches)) {
      if (!enemyIn(b.hex) && canStack(s, b.hex, unitId)) out.push(b.hex);
    }
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (!d.port || d.port.restricted || s.control[h] !== 'Allied' || enemyIn(h)) continue;
      const cap = d.port.capacity;
      if (landedHere(h) < cap && canStack(s, h, unitId) && !out.includes(h)) out.push(h);
    }
  } else if (u.where.kind === 'entry' && u.where.area === 'airdrop') {
    for (const x of Object.values(s.units)) {
      if (x.where.kind !== 'map' || sideOf(x) !== 'Allied' || def(x.id).type === 'asu') continue;
      const h = x.where.hex;
      if (!adjacentEnemy(s, h, 'Allied') && canStack(s, h, unitId) && !out.includes(h)) out.push(h);
    }
  } else if (u.where.kind === 'entry' && u.where.area.startsWith('hex:')) {
    const h = u.where.area.slice(4);
    if (!enemyIn(h)) out.push(h);
    for (const n of neighbors(h)) if (MAP.hexes[n]?.terrain !== 'sea' && MAP.hexes[n] && !enemyIn(n)) out.push(n);
  }
  return out;
}

function moveAlong(s: GameState, u: UnitState, path: HexId[], spent: number, stop: boolean, strategic: boolean): void {
  const side = sideOf(u);
  for (const h of path) claimHex(s, h, side);
  u.where = { kind: 'map', hex: path[path.length - 1] };
  u.mpSpent = stop ? STOPPED : spent;
  u.strategic = strategic;
}

/** Applies an action to the state (mutating it). Throws IllegalAction if not allowed. */
export function applyAction(s: GameState, a: Action): void {
  need(s.phase !== 'gameOver', 'The game is over.');
  s.seq += 1;
  switch (a.type) {
    case 'endPhase': {
      if (s.pendingAdvance) s.pendingAdvance = null;
      advancePhase(s);
      return;
    }
    case 'move': {
      need(s.phase === 'movement', 'Units move in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'map', 'Unit is not on the map.');
      const mode = a.mode ?? 'tactical';
      need(!(mode === 'strategic' && s.turn === 1 && s.activeSide === 'Allied' && RULES.movement.turn1AlliedTacticalOnly),
        'Allied units may only use tactical movement on turn 1.');
      const dests = legalDestinations(s, a.unitId, mode);
      const r = dests.get(a.to);
      need(r, `${def(a.unitId).name} cannot reach ${a.to}.`);
      const from = u.where.hex;
      const path = pathTo(dests, a.to);
      moveAlong(s, u, path, r.cost, r.stop, mode === 'strategic');
      log(s, `${def(u.id).name} moves ${from} → ${a.to}${mode === 'strategic' ? ' (strategic)' : ''}.`, 'move');
      return;
    }
    case 'enter': {
      need(s.phase === 'movement', 'Reinforcements enter in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'entry' && !u.where.area.startsWith('hex:') && u.where.area !== 'airdrop', 'Unit is not waiting at an entry area.');
      const mode = a.mode ?? 'tactical';
      const dests = entryDestinations(s, a.unitId, u.where.area, mode);
      const r = dests.get(a.to);
      need(r, `${def(a.unitId).name} cannot reach ${a.to} this turn.`);
      const area = u.where.area;
      moveAlong(s, u, pathTo(dests, a.to), r.cost, r.stop, mode === 'strategic');
      log(s, `${def(u.id).name} enters at ${area} and moves to ${a.to}.`, 'move');
      return;
    }
    case 'land': {
      need(s.phase === 'movement' && s.activeSide === 'Allied', 'Landings happen in the Allied movement phase.');
      const u = ownUnit(s, a.unitId);
      need(landingHexes(s, a.unitId).includes(a.to), `${def(a.unitId).name} cannot land at ${a.to}.`);
      const how = u.where.kind === 'reserve' ? 'lands' : 'drops';
      if (u.where.kind === 'reserve' && MAP.hexes[a.to].port && !Object.values(MAP.beaches).some((b) => b.hex === a.to)) {
        s.landings[a.to] = (s.landings[a.to] ?? 0) + 1;
      }
      u.where = { kind: 'map', hex: a.to };
      u.mpSpent = STOPPED;
      claimHex(s, a.to, 'Allied');
      log(s, `${def(u.id).name} ${how} at ${a.to}.`, 'move');
      return;
    }
    case 'exitMap': {
      need(s.phase === 'movement', 'Units leave the map in the movement phase.');
      const u = ownUnit(s, a.unitId);
      need(u.where.kind === 'map', 'Unit is not on the map.');
      need(u.mpSpent === null || u.mpSpent < STOPPED, 'Unit has finished moving.');
      const hex = u.where.hex;
      const fromArea = Object.entries(MAP.entryAreas).find(([, ea]) => ea.hexes.includes(hex))?.[0];
      need(fromArea, 'Unit is not on a map-edge entry hex.');
      const side = sideOf(u);
      if (side === 'Allied') {
        need(a.area === fromArea && MAP.entryAreas[fromArea].vp, 'Allied units may only exit through N1 or N2.');
        u.where = { kind: 'exited', area: fromArea };
        if (s.control[fromArea] !== 'Allied') {
          s.control[fromArea] = 'Allied';
          log(s, `${def(u.id).name} exits via ${fromArea}: Allied gain ${MAP.entryAreas[fromArea].vp} VP.`, 'victory');
        } else log(s, `${def(u.id).name} exits via ${fromArea}.`, 'move');
        return;
      }
      const link = MAP.offmapLinks.find(
        (l) => (l.from === fromArea && l.to === a.area) || (l.to === fromArea && l.from === a.area),
      );
      need(link, `No off-map route from ${fromArea} to ${a.area}.`);
      u.where = { kind: 'transit', to: a.area, arrive: s.turn + link.turns };
      log(s, `${def(u.id).name} moves off-map from ${fromArea} toward ${a.area} (arrives turn ${s.turn + link.turns}).`, 'move');
      return;
    }
    case 'attack': {
      need(s.phase === 'combat', 'Attacks happen in the combat phase.');
      need(!s.pendingAdvance, 'Resolve the pending advance first.');
      for (const id of a.attackers) ownUnit(s, id);
      const rep = resolveAttack(s, a);
      const shifts = rep.shifts.map((x) => `${x.reason} ${x.shift > 0 ? '+' : ''}${x.shift}`).join('; ');
      log(s,
        `Attack on ${rep.defenderHex}: ${rep.attack} vs ${rep.defense} = ${rep.baseColumn}${shifts ? ` [${shifts}]` : ''} → ${rep.finalColumn}. ` +
        `Roll ${rep.roll}${rep.drm ? (rep.drm > 0 ? `+${rep.drm}` : rep.drm) : ''}: ${rep.result}. ${rep.notes.join('; ')}`,
        'combat');
      return;
    }
    case 'advance': {
      const p = s.pendingAdvance;
      need(p, 'No advance is pending.');
      need(a.unitIds.length <= p.max, `At most ${p.max} units may advance.`);
      for (const id of a.unitIds) {
        need(p.unitIds.includes(id), `${def(id).name} did not take part in that attack.`);
        const u = s.units[id];
        if (u.where.kind !== 'map') continue;
        u.where = { kind: 'map', hex: p.hex };
      }
      if (a.unitIds.length) {
        claimHex(s, p.hex, s.activeSide);
        log(s, `${a.unitIds.map((id) => def(id).name).join(', ')} advance into ${p.hex}.`, 'move');
      }
      s.pendingAdvance = null;
      return;
    }
    case 'replace': {
      need(s.phase === 'initial', 'Replacements are used in the initial phase.');
      const u = ownUnit(s, a.unitId);
      need(u.stepsLost > 0, 'Unit is at full strength.');
      need(u.where.kind === 'map' || u.where.kind === 'reserve', 'Unit must be on the map or in reserve.');
      if (u.where.kind === 'map') {
        need(!adjacentEnemy(s, u.where.hex, s.activeSide), 'Unit is adjacent to the enemy.');
        need(!u.outOfSupply, 'Unit is out of supply.');
      }
      const pool = s.replacements[replPool(u.id)];
      const cat = def(u.id).replCategory ?? 'inf';
      if (pool[cat] > 0) pool[cat] -= 1;
      else {
        need(pool.any > 0, `No ${cat} replacements available.`);
        pool.any -= 1;
      }
      u.stepsLost -= 1;
      log(s, `${def(u.id).name} receives a replacement step.`);
      return;
    }
    case 'readyAsu': {
      need(s.phase === 'initial', 'Artillery is resupplied in the initial phase.');
      const u = ownUnit(s, a.unitId);
      need(def(u.id).type === 'asu' && u.fired, 'Unit is not a fired artillery support unit.');
      need(s.supplyPoints[s.activeSide] > 0, 'No supply points left.');
      s.supplyPoints[s.activeSide] -= 1;
      u.fired = false;
      log(s, `${def(u.id).name} is resupplied (1 supply point).`);
      return;
    }
  }
}

/** Clone-and-apply convenience used by the UI and AI. */
export function withAction(s: GameState, a: Action): GameState {
  const next = structuredClone(s);
  applyAction(next, a);
  return next;
}

export function currentWeather(s: GameState) {
  return RULES.weather.track[s.weather];
}

export function sideLabel(side: Side): string {
  return side === 'Allied' ? 'Allied' : 'German';
}

export { other };
