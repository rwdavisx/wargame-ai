// Set-up, Turn 1 (section 24) and the scenario rules (S1, S2). The set-up tables below are what the engine uses;
// they match the owner's photos of the Campaign Game / Avalanche Scenario Axis and Allied At Start cards (with
// their reinforcement schedules), the back of the Allied card (S1.4 optional start) and the counters (set-up hex or
// arrival code printed on each). A correction to data/oob.json shows up here as a diff.
import { describe, expect, it } from 'vitest';
import { MAP, SCENARIOS, STARTING_SP, UNIT_DEFS, UNIT_SETUP } from '../../src/engine/data';
import { neighbors } from '../../src/engine/hex';
import { computeOdds } from '../../src/engine/combat';
import { landingCapacity, landingHexes, newGame, vpBreakdown } from '../../src/engine/game';
import { loseStep } from '../../src/engine/losses';
import { allowedModes, legalDestinations, movementAllowance, stepCost } from '../../src/engine/movement';
import { unitsAt, values } from '../../src/engine/units';
import type { GameState } from '../../src/engine/types';
import { act, dice, invasionGame, openGround, place, quiet, refused } from './harness';

// ------------------------------------------------------------------ the set-up as the engine has it

/** Axis At Start: printed set-up hexes. III/1 FJ in 2202 may not move until turn 3 (19.2). */
const AT_START_HEX = {
  'GE-III1FJ': '2202',
  'GE-KGDor': '2905',
  'GE-I64': '2909',
  'GE-II64': '3012',
  'GE-III2': '3012',
  'GE-IIa2': '3014',
  'GE-I79': '2817',
  'GE-IIb2': '2817',
  'GE-II79': '2619',
  'GE-16Art': '3213',
  'GE-GarA': '2424',
  'GE-GarC': '2707',
  'GE-GarD': '3203',
  'GE-GarE': '1903',
  'GE-GarF': '2418',
};
/** Allied At Start: the assault landing boxes. */
const ASSAULT = {
  Maiori: ['US-1Rgr', 'US-3Rgr', 'US-4Rgr'],
  Vietri: ['BR-2Cdo', 'BR-41Cdo'],
  Uncle: ['BR-128', 'BR-40RTR', 'BR-5H', 'BR-BH35'],
  Sugar: ['BR-169', 'BR-2-5Q'],
  Roger: ['BR-167', 'BR-7OB', 'BR-BH21', 'BR-Greys'],
  Red: ['US-1-142', 'US-142', 'US-BH531R'],
  Blue: ['US-141', 'US-2-141', 'US-BH531B'],
};
/** The beach hex each landing box points at on the map. */
const BEACH_HEX = { Blue: '2617', Maiori: '2407', Red: '2616', Roger: '2712', Sugar: '2711', Uncle: '2710', Vietri: '2607' };
const FOLLOW_UP = {
  X: ['BR-138', 'BR-201G'],
  VI: ['US-143', 'US-191', 'US-36Art', 'US-645'],
};
const REMNANTS = ['BR-REM-22', 'BR-REM-A', 'BR-REM-B', 'BR-REM-C', 'GE-REM129', 'US-REM-82', 'US-REM-A', 'US-REM-B', 'US-REM-C'];
/** German reinforcements: turn -> entry code -> units. */
const GERMAN_ARRIVALS = {
  1: { N: ['GE-HGAA'], S: ['GE-I3FJ'] },
  2: { N: ['GE-HGArt', 'GE-HGIII', 'GE-I1HG', 'GE-III115'], S: ['GE-29Art', 'GE-76Pz', 'GE-GarB', 'GE-I15', 'GE-III15'] },
  3: { N: ['GE-129', 'GE-14Pz', 'GE-215', 'GE-71NW'], S: ['GE-26AA', 'GE-71'] },
  4: { N: ['GE-HGI'], S: ['GE-129Pz', 'GE-II15'] },
  5: { S: ['GE-29AA', 'GE-I4FJ', 'GE-I71', 'GE-I9', 'GE-II9', 'GE-III4FJ'] },
  6: { N: ['GE-103', 'GE-II29', 'GE-II67'], S: ['GE-26Art'] },
  7: { N: ['GE-826'] },
  9: { E: ['GE-II1FJ'] },
  10: { S: ['GE-I67'] },
  13: { N: ['GE-I2HG'] },
};
/** Allied reinforcements. The card shows the turn-2 group in the Floating Reserve at start; the engine holds them
 * until the Allied Initial Phase of turn 2, the first turn they may land (24.4.1). 'airdrop509' = the 2/509th drop anywhere in the 5th Army sector. */
const ALLIED_ARRIVALS = {
  2: { reserve: ['BR-139', 'BR-46Art', 'BR-56Art', 'BR-XArt', 'US-157', 'US-179', 'US-3-531', 'US-45Art', 'US-601', 'US-751', 'US-753', 'US-VIArt'] },
  5: { airdrop: ['US-504'], reserve: ['US-636'] },
  6: { airdrop: ['US-505'], airdrop509: ['US-2-509'], reserve: ['US-180'] },
  7: { reserve: ['BR-131', 'US-2-157'] },
  8: { reserve: ['BR-5RTR', 'US-3-504', 'US-325'] },
  9: { reserve: ['BR-11H', 'US-756'] },
  10: { reserve: ['BR-7AArt', 'US-30'] },
  11: { S1: ['BR-17'], S3: ['CN-1', 'CN-14', 'CN-3'], reserve: ['BR-22'] },
  12: { S2: ['BR-13', 'BR-15', 'CN-11'], S3: ['CN-2'], reserve: ['US-7'] },
  13: { reserve: ['US-15', 'US-3Art'] },
  14: { reserve: ['US-100', 'US-133'] },
  16: { reserve: ['BR-KDG'] },
  18: { reserve: ['US-135'] },
  19: { reserve: ['US-168'] },
  20: { reserve: ['US-34Art'] },
};

function engineSetup() {
  const hex: Record<string, string> = {};
  const assault: Record<string, string[]> = {};
  const followUp: Record<string, string[]> = {};
  const remnants: string[] = [];
  const arrivals: Record<'German' | 'Allied', Record<number, Record<string, string[]>>> = { German: {}, Allied: {} };
  for (const [id, st] of Object.entries(UNIT_SETUP)) {
    if (st.start?.hex) hex[id] = st.start.hex;
    else if (st.start?.beach) (assault[st.start.beach] ??= []).push(id);
    else if (st.start?.followUp) (followUp[st.start.followUp] ??= []).push(id);
    else if (st.start?.remnant) remnants.push(id);
    else if (st.arrive) ((arrivals[UNIT_DEFS[id].side][st.arrive.turn] ??= {})[st.arrive.at] ??= []).push(id);
  }
  const sorted = (r: Record<string, string[]>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]));
  return {
    hex, assault: sorted(assault), followUp: sorted(followUp), remnants: remnants.sort(),
    german: Object.fromEntries(Object.entries(arrivals.German).map(([t, r]) => [t, sorted(r)])),
    allied: Object.fromEntries(Object.entries(arrivals.Allied).map(([t, r]) => [t, sorted(r)])),
  };
}

describe('set-up', () => {
  it('[S1.1] [S2.1] the engine places and schedules every unit as on the At Start and Reinforcement cards', () => {
    const e = engineSetup();
    expect(e.hex).toEqual(AT_START_HEX);
    expect(e.assault).toEqual(ASSAULT);
    expect(e.followUp).toEqual(FOLLOW_UP);
    expect(e.remnants).toEqual(REMNANTS);
    expect(e.german).toEqual(GERMAN_ARRIVALS);
    expect(e.allied).toEqual(ALLIED_ARRIVALS);
    // Every counter is accounted for exactly once.
    const all = [...Object.keys(AT_START_HEX), ...Object.values(ASSAULT).flat(), ...Object.values(FOLLOW_UP).flat(), ...REMNANTS,
      ...Object.values(GERMAN_ARRIVALS).flatMap((r) => Object.values(r).flat()), ...Object.values(ALLIED_ARRIVALS).flatMap((r) => Object.values(r).flat())];
    expect(all.sort()).toEqual(Object.keys(UNIT_DEFS).sort());
    expect(Object.fromEntries(Object.entries(MAP.beaches).map(([k, b]) => [k, b.hex]))).toEqual(BEACH_HEX);
    expect(UNIT_SETUP['GE-III1FJ'].frozenUntil).toBe(3);
    // Only I+II/HG Pz is shown on its reduced (3-2-5) side among the reinforcements of the Axis card.
    expect(Object.keys(UNIT_SETUP).filter((id) => UNIT_SETUP[id].arrive?.reduced)).toEqual(['GE-HGI']);
  });

  it('[S1.1] [21.1.1] I+II/HG Pz enters on turn 4 already reduced to 3-2-5, as the Axis card shows (fixed)', () => {
    const s = quiet({ side: 'Allied', phase: 'victory', turn: 3, scenario: 'campaign' });
    s.units['GE-HGI'].where = { kind: 'pending', turn: 4, at: 'N' };
    dice(s, 1);
    act(s, { type: 'endPhase' }); // victory -> weather (turn 4) -> German initial
    expect([s.turn, s.activeSide, s.phase]).toEqual([4, 'German', 'initial']);
    const u = s.units['GE-HGI'];
    expect(u.where).toEqual({ kind: 'entry', area: 'N' });
    expect(u.stepsLost).toBe(1);
    expect([values(u).attack, values(u).defense, values(u).move]).toEqual([3, 2, 5]);
  });

  it('[S1.1] three airborne drops (504th turn 5; 505th and 2/509th turn 6); 3/504th and the 325th glider regiment come by sea on turn 8', () => {
    const airborne = Object.values(UNIT_DEFS).filter((d) => d.side === 'Allied' && (d.cat === 'airborne' || d.cat === 'glider') && !d.isRemnant).map((d) => d.id).sort();
    expect(airborne).toEqual(['US-2-509', 'US-3-504', 'US-325', 'US-504', 'US-505']);
    expect(airborne.map((id) => [id, UNIT_SETUP[id].arrive])).toEqual([
      ['US-2-509', { turn: 6, at: 'airdrop509' }], ['US-3-504', { turn: 8, at: 'reserve' }], ['US-325', { turn: 8, at: 'reserve' }],
      ['US-504', { turn: 5, at: 'airdrop' }], ['US-505', { turn: 6, at: 'airdrop' }],
    ]);
  });

  it('[S1.1] the Avalanche Scenario: 8 turns, all four Allied support markers ready, supply 0 / 3, weather box A, turn 1', () => {
    const s = invasionGame([6, 6, 6, 6, 6, 6, 6]);
    expect(SCENARIOS.short.lastTurn).toBe(8);
    expect(s.lastTurn).toBe(8);
    expect(s.support.ready.sort()).toEqual(['BR-air', 'BR-naval', 'US-air', 'US-naval']);
    expect(STARTING_SP).toEqual({ German: 3, Allied: 0 });
    expect(s.supplyPoints).toEqual({ Allied: 0, German: 3 });
    expect(s.weather).toBe(0);
    expect(s.turn).toBe(1);
    expect(s.trucksUsed).toBe(0);
    for (const [id, h] of Object.entries(AT_START_HEX)) expect(s.units[id].where).toEqual({ kind: 'map', hex: h });
    for (const [corps, ids] of Object.entries(FOLLOW_UP)) for (const id of ids) expect(s.units[id].where).toEqual({ kind: 'followUp', corps });
    for (const id of REMNANTS) expect(s.units[id].where).toEqual({ kind: 'remnantPool' });
  });

  it('[S2.1] the Campaign Game uses the same set-up and lasts 22 turns', () => {
    const s = invasionGame([6, 6, 6, 6, 6, 6, 6], 'campaign');
    expect(s.lastTurn).toBe(22);
    expect(s.supplyPoints).toEqual({ Allied: 0, German: 3 });
    for (const [id, h] of Object.entries(AT_START_HEX)) expect(s.units[id].where).toEqual({ kind: 'map', hex: h });
  });
});

// ------------------------------------------------------------------ Turn 1

/** Invasion rolls are made beach by beach in this order. */
const ORDER = ['Blue', 'Maiori', 'Red', 'Roger', 'Sugar', 'Uncle', 'Vietri'] as const;
/** The rolls of the rulebook's extended example: Rangers 3, Commandos 4, Uncle 3, Sugar 5, Roger 3, Red 6, Blue 4. */
const EXAMPLE = { Blue: 4, Maiori: 3, Red: 6, Roger: 3, Sugar: 5, Uncle: 3, Vietri: 4 };
const exampleGame = () => invasionGame(ORDER.map((b) => EXAMPLE[b]));
/** End phases until `pred` holds. */
const until = (s: GameState, pred: (s: GameState) => boolean) => {
  for (let i = 0; i < 20 && !pred(s); i++) act(s, { type: 'endPhase' });
  expect(pred(s)).toBe(true);
};

describe('24 Turn 1', () => {
  it('[24.1] Turn 1: the Invasion Combat Phase replaces the weather, then a German and an Allied player turn', () => {
    const s = exampleGame();
    expect([s.phase, s.activeSide]).toEqual(['invasion', 'Allied']);
    act(s, { type: 'endPhase' });
    expect([s.turn, s.activeSide, s.phase]).toEqual([1, 'German', 'initial']);
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'initial');
    expect(s.turn).toBe(1);
    expect(s.log.some((l) => l.turn === 1 && l.kind === 'weather')).toBe(false);
  });

  it('[24.2.1] [24.2.3] every beach is resolved on the Invasion CRT, the assault units landing in the beach hex first', () => {
    const s = exampleGame();
    for (const [beach, ids] of Object.entries(ASSAULT)) {
      for (const id of ids) expect(s.units[id].where).toEqual({ kind: 'map', hex: BEACH_HEX[beach as keyof typeof BEACH_HEX] });
    }
    expect(s.log.filter((l) => l.text.includes('Landing roll')).length).toBe(7);
    expect(s.control['2407']).toBe('Allied'); // Maiori
    expect(s.control['2607']).toBe('Allied'); // Vietri
  });

  it('[24.2.2] Uncle beach 1-2 costs a step from one of its assault units; the other columns never do', () => {
    const s = invasionGame(ORDER.map((b) => (b === 'Uncle' ? 1 : 1)));
    const lost = ASSAULT.Uncle.filter((id) => s.units[id].stepsLost > 0 || s.units[id].where.kind === 'eliminated');
    expect(lost.length).toBe(1);
    expect(lost[0]).not.toBe('BR-BH35');
    for (const b of ORDER.filter((x) => x !== 'Uncle')) for (const id of ASSAULT[b]) expect(s.units[id].stepsLost).toBe(0);
  });

  it('[24.2.3] example: Uncle rolls 3 (advance 1: stop on the beach); the others advance 2 (one more hex)', () => {
    const s = exampleGame();
    expect(s.units['BR-128'].stopped).toBe(true);
    expect(refused(s, { type: 'move', unitId: 'BR-128', to: '2810' })).toBe(true);
    for (const id of ['BR-169', 'BR-167', 'US-142', 'US-141', 'US-1Rgr']) expect(s.units[id].stopped).toBe(false);
    // Roger: 167 Bde moves inland one hex; no second hex after that.
    act(s, { type: 'move', unitId: 'BR-167', to: '2813' });
    expect(s.units['BR-167'].where).toEqual({ kind: 'map', hex: '2813' });
    expect(refused(s, { type: 'move', unitId: 'BR-167', to: '2814' })).toBe(true);
    // Maiori: one Ranger battalion stays in the port, another goes up the valley.
    const up = ['2406', '2306'].find((h) => !refused(s, { type: 'move', unitId: 'US-3Rgr', to: h }))!;
    act(s, { type: 'move', unitId: 'US-3Rgr', to: up });
    expect(s.units['US-1Rgr'].where).toEqual({ kind: 'map', hex: '2407' });
    // Beachhead units never move.
    expect(refused(s, { type: 'move', unitId: 'BR-BH21', to: '2813' })).toBe(true);
  });

  it('[24.2.4] example: both Commandos attack Salerno; garrison rolls 2, 4 to 2 + Elite = 3-1, DR, failed stand at -1, garrison gone, Commandos enter', () => {
    const s = exampleGame();
    expect(refused(s, { type: 'attack', target: '2707', attackers: ['US-1Rgr'] })).toBe(true); // only the Commandos
    expect(refused(s, { type: 'attack', target: '2707', attackers: ['BR-2Cdo', 'BR-41Cdo'], naval: true })).toBe(true); // no support shifts
    dice(s, 6, 3, 3); // garrison strength 2 (not doubled in the hill city); CRT 3-1 roll 3 = DR2; DD roll 3 - 1 = 2
    act(s, { type: 'attack', target: '2707', attackers: ['BR-2Cdo', 'BR-41Cdo'] });
    const rep = s.combats[0];
    expect([rep.attack, rep.defense, rep.finalColumn, rep.result]).toEqual([4, 2, '3-1', 'DR2 Adv 2']);
    expect(rep.shifts).toEqual([{ reason: 'Elite', shift: 1 }]);
    act(s, { type: 'defend', choice: 'dd' });
    expect(s.combats[0].dd).toMatchObject({ column: 'City', roll: 3, drm: -1 });
    expect(s.units['GE-GarC'].where.kind).toBe('eliminated');
    const pa = s.pendingAdvance!;
    expect(pa.limited).toBe(true);
    act(s, { type: 'advance', unitIds: ['BR-2Cdo', 'BR-41Cdo'], to: '2707' });
    expect(unitsAt(s, '2707').map((u) => u.id).sort()).toEqual(['BR-2Cdo', 'BR-41Cdo']);
    expect(s.control['2707']).toBe('Allied');
  });

  it('[24.3] on Turn 1 German movement allowances are halved, rounded up; Extended and Tactical Movement are unaffected', () => {
    const s = exampleGame();
    act(s, { type: 'endPhase' }); // German initial: HG Recon (N) and I/3 FJ (S) arrive
    expect(s.units['GE-HGAA'].where).toEqual({ kind: 'entry', area: 'N' });
    expect(s.units['GE-I3FJ'].where).toEqual({ kind: 'entry', area: 'S' });
    act(s, { type: 'endPhase' });
    const kg = s.units['GE-KGDor'];
    expect(movementAllowance(s, kg, 'normal')).toBe(3);
    expect(movementAllowance(s, s.units['GE-I64'], 'extended')).toBe(6); // example: MA 5 -> 3, +3 extended
    expect(movementAllowance(s, s.units['GE-I3FJ'], 'truckExtended')).toBe(6); // example F: truck, 3 + 3
    s.turn = 2;
    expect(movementAllowance(s, kg, 'normal')).toBe(6);
  });

  it('[24.3] German units may move onto a vacated beach on Turn 1 (fixed: no such restriction in the rules)', () => {
    const s = exampleGame();
    act(s, { type: 'endPhase' });
    act(s, { type: 'endPhase' });
    // Clear the British beaches (else 2711 sits in an Allied hex bond between Uncle and Roger).
    for (const id of [...ASSAULT.Uncle, ...ASSAULT.Sugar, ...ASSAULT.Roger]) s.units[id].where = { kind: 'removed', reason: 'test' };
    place(s, 'GE-I64', '2811');
    expect(refused(s, { type: 'move', unitId: 'GE-I64', to: '2711', mode: 'tactical' })).toBe(false);
    act(s, { type: 'move', unitId: 'GE-I64', to: '2711', mode: 'tactical' });
    expect(s.units['GE-I64'].where).toEqual({ kind: 'map', hex: '2711' });
  });

  it('[24.4.1] on Turn 1 the Allies use only Tactical Movement and their only reinforcements are the Follow-Up Wave', () => {
    const s = exampleGame();
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'movement');
    expect(allowedModes(s, s.units['US-142'])).toEqual(['tactical']);
    expect(Object.values(s.units).filter((u) => u.where.kind === 'reserve' || (u.where.kind === 'pending' && u.where.turn <= 1 && UNIT_DEFS[u.id].side === 'Allied'))).toEqual([]);
    expect(landingHexes(s, 'US-143').length).toBeGreaterThan(0);
  });

  it('[24.4.2] the Follow-Up Wave lands in the Allied Movement Phase, the beach counting as its first hex; ½ Eff only next to the Germans', () => {
    const s = exampleGame();
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'movement');
    place(s, 'GE-II79', '2618');
    act(s, { type: 'land', unitId: 'US-191', to: '2617' }); // next to II/79
    act(s, { type: 'land', unitId: 'BR-138', to: '2710' }); // Uncle, away from the Germans
    expect(s.units['BR-138'].halfEff).toBe(true);
    expect([...new Set([...legalDestinations(s, 'BR-138', 'tactical').values()].map((r) => r.hexes))]).toEqual([1]); // one more hex
    act(s, { type: 'endPhase' });
    expect(s.units['US-191'].halfEff).toBe(true);
    expect(s.units['BR-138'].halfEff).toBe(false);
    // Follow-up units that did not land wait in the Floating Reserve.
    expect(s.units['US-143'].where).toEqual({ kind: 'reserve' });
  });

  it('[24.4.2] the Follow-Up Wave may also use the other corps\' beaches (disrupted) and captured ports (fixed)', () => {
    const s = exampleGame();
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'movement');
    const h = landingHexes(s, 'US-143');
    expect(h).toEqual(expect.arrayContaining(['2616', '2617', '2710', '2711', '2712']));
    expect(landingHexes(s, 'US-36Art')).toEqual(expect.arrayContaining(['2407', '2607'])); // Maiori, Vietri: 1 LP ports
    act(s, { type: 'land', unitId: 'US-143', to: '2712' });
    expect(s.units['US-143'].status).toBe('disrupted');
  });

  it('[24.4.3] Sugar beach takes 3 LP of follow-up units on Turn 1 and is closed afterwards', () => {
    const s = exampleGame();
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'movement');
    expect(landingCapacity(s, '2711')).toBe(3);
    act(s, { type: 'land', unitId: 'BR-201G', to: '2711' });
    expect(landingHexes(s, 'BR-138')).not.toContain('2711');
    s.turn = 2;
    expect(landingCapacity(s, '2711')).toBe(0);
    expect(landingHexes(s, 'BR-138')).not.toContain('2711');
  });

  it('[24.2.4] [18.1.4] example K: the Red beach stack (BH 2 + two disrupted units 3) defends at 5; 7 to 5 + armour + elite = 3-1; roll 1 = EX', () => {
    const s = quiet({ side: 'German', phase: 'combat', turn: 1 });
    place(s, 'US-BH531R', '2616');
    place(s, 'US-142', '2616', { status: 'disrupted', retreatedThisPhase: true });
    place(s, 'US-1-142', '2616', { status: 'disrupted', retreatedThisPhase: true });
    place(s, 'GE-I79', '2716');
    place(s, 'GE-IIa2', '2716'); // 2 + 5 = 7, an elite PG and a tank
    const o = computeOdds(s, { target: '2616', attackers: ['GE-I79', 'GE-IIa2'], breakthrough: true });
    expect([o.attack, o.defense]).toEqual([7, 5]);
    expect(o.shifts.map((x) => x.reason).sort()).toEqual(['Elite', 'Tank shift']);
    expect(o.finalIndex).toBe(4); // 3-1
  });
});

// ------------------------------------------------------------------ scenario rules

/** Allied supply phase on `turn` with `vp` victory points held (beachheads placed on VP hexes). */
const atVictory = (scenarioId: 'short' | 'campaign', turn: number, setup: (s: GameState) => void) => {
  const s = quiet({ side: 'Allied', phase: 'supply', turn, scenario: scenarioId });
  setup(s);
  dice(s, 1, 1, 1);
  act(s, { type: 'endPhase' });
  return s;
};
const hold = (s: GameState) => {
  // 2 + 2 + 1 + 1 + 1 + 1 = 8: beachheads stand in Salerno, Avellino, Battipaglia and Montecorvino.
  place(s, 'BR-BH21', '2707');
  place(s, 'BR-BH35', '3203');
  place(s, 'US-BH531R', '3012');
  place(s, 'US-BH531B', '2811');
  for (const h of ['2707', '3203', '3012', '2811', '2716', '3116']) s.control[h] = 'Allied';
};

describe('S Scenarios', () => {
  it('[S1.4] optional start: no invasion phase; play opens with the German Turn 1 with the Allies ashore as on the card', () => {
    const s = newGame('short', 1, { optionalStart: true });
    expect([s.turn, s.activeSide, s.phase]).toEqual([1, 'German', 'initial']);
    expect(s.log.some((l) => l.text.includes('Landing roll'))).toBe(false);
    const at = (h: string) => unitsAt(s, h).map((u) => u.id).sort();
    expect(at('2406')).toEqual(['US-1Rgr', 'US-3Rgr']);
    expect(at('2407')).toEqual(['US-4Rgr']);
    expect(at('2707')).toEqual(['BR-2Cdo', 'BR-41Cdo']);
    expect(at('2710')).toEqual(['BR-128', 'BR-40RTR', 'BR-5H', 'BR-BH35']);
    expect(at('2811')).toEqual(['BR-169', 'BR-2-5Q']);
    expect(at('2813')).toEqual(['BR-167', 'BR-Greys']);
    expect(at('2712')).toEqual(['BR-7OB', 'BR-BH21']);
    expect(at('2715')).toEqual(['US-142']);
    expect(at('2616')).toEqual(['US-1-142', 'US-BH531R']);
    expect(at('2717')).toEqual(['US-141']);
    expect(at('2617')).toEqual(['US-2-141', 'US-BH531B']);
    expect(UNIT_DEFS['BR-2-5Q'].name).toBe("2/6 Queen's");
    // Garrison C cannot share Salerno with the Commandos; the rest of the German set-up is the normal one.
    expect(s.units['GE-GarC'].where.kind).toBe('eliminated');
    for (const [id, h] of Object.entries(AT_START_HEX)) if (id !== 'GE-GarC') expect(s.units[id].where).toEqual({ kind: 'map', hex: h });
    for (const h of ['2407', '2707', '2811']) expect(s.control[h]).toBe('Allied');
    for (const [corps, ids] of Object.entries(FOLLOW_UP)) for (const id of ids) expect(s.units[id].where).toEqual({ kind: 'followUp', corps });
    expect(s.support.ready.sort()).toEqual(['BR-air', 'BR-naval', 'US-air', 'US-naval']);
    expect(s.supplyPoints).toEqual({ Allied: 0, German: 3 });
    // Turn 1 rules still apply: German reinforcements arrive now, German MAs are halved, the follow-up wave lands later.
    expect(s.units['GE-HGAA'].where).toEqual({ kind: 'entry', area: 'N' });
    act(s, { type: 'endPhase' });
    expect(movementAllowance(s, s.units['GE-KGDor'], 'normal')).toBe(3);
    until(s, (x) => x.activeSide === 'Allied' && x.phase === 'movement');
    expect(s.turn).toBe(1);
    expect(allowedModes(s, s.units['US-142'])).toEqual(['tactical']);
    expect(landingHexes(s, 'US-143').length).toBeGreaterThan(0);
  });

  it('[S1.2] Avalanche: the Allies win with 8 or more VPs at the end of turn 8; each lost beachhead costs one', () => {
    const s = quiet({ side: 'Allied' });
    hold(s);
    expect(vpBreakdown(s).total).toBe(8);
    expect(atVictory('short', 8, hold).winner).toBe('Allied');
    const t = atVictory('short', 8, (x) => { hold(x); x.units['US-BH21'] ? 0 : 0; x.units['US-REM-A'].where = { kind: 'remnantPool' }; x.units['US-505'].where = { kind: 'eliminated' }; });
    expect(t.winner).toBe('German'); // 8 - 1 for the 505th
    expect(atVictory('short', 7, hold).winner).toBeNull();
  });

  it('[S1.3] the Turn 1 special rules apply (see 24.1)', () => {
    const s = exampleGame();
    expect(s.phase).toBe('invasion');
  });

  it('[S2.2] turn 14: 12+ defense strength of in-supply units leaves, 16th Panzer first, its ASU always', () => {
    const s = quiet({ side: 'German', phase: 'weather', turn: 14, scenario: 'campaign' });
    for (const [id, h] of [['GE-16Art', '2501'], ['GE-IIa2', '2501'], ['GE-II64', '2701'], ['GE-I64', '2601'], ['GE-129', '2502'], ['GE-I15', '3106']] as const) place(s, id, h);
    act(s, { type: 'endPhase' }); // -> German initial, turn 14
    const gone = Object.values(s.units).filter((u) => u.where.kind === 'removed' && u.where.reason.includes('16th')).map((u) => u.id).sort();
    expect(gone).toEqual(['GE-129', 'GE-16Art', 'GE-I64', 'GE-II64', 'GE-IIa2']); // 1 + 4 + 3 + 3 = 11, then 129 (9)
    expect(s.units['GE-I15'].where.kind).toBe('map'); // out of supply: not chosen
  });

  it('[S2.3] 8th Army units are the ones entering from the south edge', () => {
    const eighth = Object.values(UNIT_DEFS).filter((d) => d.army8).map((d) => d.id).sort();
    expect(eighth).toEqual(['BR-13', 'BR-15', 'BR-17', 'CN-1', 'CN-11', 'CN-14', 'CN-2', 'CN-3']);
  });

  it('[S2.3.1] 5th and 8th Army units never attack together', () => {
    const s = quiet({ side: 'Allied', phase: 'combat', turn: 12 });
    place(s, 'GE-I15', openGround());
    place(s, 'CN-1', '2812');
    place(s, 'US-157', '2812'); // stacked together: fine
    expect(refused(s, { type: 'attack', target: openGround(), attackers: ['CN-1', 'US-157'] })).toBe(true);
    expect(refused(s, { type: 'attack', target: openGround(), attackers: ['CN-1'] })).toBe(false);
  });

  it('[S2.3.2] the 8th Army has no ASUs (and so no supply points)', () => {
    expect(Object.values(UNIT_DEFS).filter((d) => d.army8 && d.asu)).toEqual([]);
  });

  it('[S2.3.3] at the end of the Allied Movement Phase only one 8th Army unit may be across the army boundary', () => {
    const s = quiet({ side: 'Allied', turn: 12 });
    place(s, 'CN-1', '2813');
    place(s, 'CN-3', '2814');
    expect(MAP.hexes['2813'].sector8).toBeFalsy();
    act(s, { type: 'endPhase' });
    expect(['CN-1', 'CN-3'].filter((id) => s.units[id].where.kind === 'eliminated').length).toBe(1);
  });

  it('[S2.3.4] roads in the 8th Army sector cost Allied mechanized units 1 MP', () => {
    const s = quiet({ side: 'Allied', turn: 12 });
    const [a, b] = Object.keys(MAP.hexsides).find((k) => MAP.hexsides[k].road && k.split('-').every((h) => MAP.hexes[h]?.sector8))!.split('-');
    expect(stepCost(s, s.units['CN-14'], a, b, 'normal')!.cost).toBe(1);
    expect(stepCost(s, s.units['GE-IIa2'], a, b, 'normal')!.cost).toBeLessThan(1);
    expect(stepCost(s, s.units['CN-1'], a, b, 'normal')!.cost).toBe(1);
  });

  it('[S2.3.5] only German and 8th Army units may use the east edge Entry Areas', () => {
    const s = quiet({ side: 'Allied', turn: 12 });
    s.control.S3 = 'Allied';
    Object.assign(s.units['CN-1'], { where: { kind: 'entry', area: 'S3' }, stopped: false });
    Object.assign(s.units['US-157'], { where: { kind: 'entry', area: 'S3' }, stopped: false });
    expect(refused(s, { type: 'changeArea', unitId: 'US-157', area: 'E1' })).toBe(true);
    expect(refused(s, { type: 'changeArea', unitId: 'CN-1', area: 'E1' })).toBe(false);
  });

  it('[S2.3.6] 8th Army units have no Remnants', () => {
    const s = quiet({ side: 'Allied', turn: 12 });
    expect(UNIT_DEFS['CN-1'].steps.length).toBe(2);
    const u = place(s, 'CN-1', '2813');
    loseStep(s, u, []);
    loseStep(s, u, []);
    expect(u.where.kind).toBe('eliminated');
  });

  it('[S2.3.7] from turn 16 the Germans may abandon the 8th Army sector in their Supply Phase', () => {
    const s = quiet({ side: 'German', turn: 16, scenario: 'campaign' });
    const inSector = Object.keys(MAP.hexes).find((h) => MAP.hexes[h].sector8 && MAP.hexes[h].terrain !== 'sea' && !MAP.hexes[h].vp)!;
    place(s, 'GE-I15', inSector);
    place(s, 'CN-1', '2813');
    act(s, { type: 'abandon8th' });
    act(s, { type: 'endPhase' }); // movement -> combat
    act(s, { type: 'endPhase' }); // combat -> recovery -> supply (abandonment) -> Allied initial
    expect(s.abandoned8th).toBe(true);
    expect(s.units['GE-I15'].where.kind).toBe('eliminated');
    expect(s.units['CN-1'].where.kind).toBe('removed');
    for (const a of ['E1', 'E2', 'E3', 'E4', 'E5']) expect(s.control[a]).toBe('Allied');
    for (const h of ['3819', '4111', '4301']) expect(s.control[h]).toBe('Allied');
    const t = quiet({ side: 'German', turn: 15, scenario: 'campaign' });
    expect(refused(t, { type: 'abandon8th' })).toBe(true);
  });

  it('[S2.4] campaign: 20 VPs at the end; isolated German VP hexes count, lost beachheads do not', () => {
    const s = quiet({ side: 'Allied', scenario: 'campaign' });
    for (const [id, h] of [['US-179', '2419'], ['US-180', '2318'], ['US-157', '2518']] as const) place(s, id, h);
    expect(neighbors('2418').filter((n) => MAP.hexes[n]?.terrain !== 'sea').sort()).toEqual(['2318', '2419', '2518']);
    s.units['BR-BH21'].where = { kind: 'eliminated' };
    expect(vpBreakdown(s, true).total).toBe(1); // Agropoli, cut off: +1; the beachhead: 0
    expect(vpBreakdown(s, false).total).toBe(-1);
    s.scenarioId = 'short';
    expect(vpBreakdown(s, true).total).toBe(-1);
    const end = atVictory('campaign', 22, hold);
    expect(end.winner).toBe('German'); // 8 < 20
  });
});
