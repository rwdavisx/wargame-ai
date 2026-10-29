// Rule tests for sections 8.0-9.9: combat procedure, the Main Assault Force, odds limits, Automatic
// DS and the combat modifiers. Positions sit on synthetic clear ground (sandbox.ts); dice are forced.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MAP, RULES, UNIT_DEFS } from '../../src/engine/data';
import { distance, neighbors } from '../../src/engine/hex';
import { computeOdds, inNavalRange, type AttackPlan } from '../../src/engine/combat';
import { bondsOf } from '../../src/engine/zoc';
import type { GameState } from '../../src/engine/types';
import { act, dice, place, refused, scenario } from './harness';
import { C, N, NE, NW, S, SE, SW, go, restoreMap, sandbox, setHex, setSide } from './sandbox';

// Naval gunfire range is cached from the real coastline on first use: warm it before any sandbox.
beforeAll(() => {
  inNavalRange('2707');
});
afterEach(restoreMap);

/** A combat phase for `side` on clear ground around C, no support markers ready. */
function setup(side: 'German' | 'Allied' = 'German', o: Parameters<typeof scenario>[0] = {}) {
  sandbox(C, 8);
  const s = scenario({ phase: 'combat', side, ...o });
  s.support.ready = [];
  return s;
}
const odds = (s: GameState, plan: AttackPlan) => computeOdds(s, plan);
const shiftNames = (s: GameState, plan: AttackPlan) => computeOdds(s, plan).shifts.map((x) => x.reason);
const gone = (s: GameState, id: string) => s.units[id].where.kind === 'eliminated';

// ------------------------------------------------------------------ 8.1-8.3

describe('combat basics', () => {
  it('[8.1] no unit attacks, and no hex is attacked, more than once per Combat Phase; a stack may split its attacks', () => {
    const s = setup();
    const t1 = go(C, N);
    const t2 = go(C, NE);
    place(s, 'US-179', t1);
    place(s, 'US-143', t2);
    place(s, 'GE-129', C); // 6
    place(s, 'GE-71', C); // 4
    place(s, 'GE-I71', go(C, NW)); // 2, 29 PG
    dice(s, 4); // 6 to 6 = 1-1: a 4 is Dis (no retreat, no advance)
    act(s, { type: 'attack', target: t1, attackers: ['GE-129'] });
    expect(s.units['US-179'].status).toBe('disrupted');
    expect(refused(s, { type: 'attack', target: t1, attackers: ['GE-I71'] })).toBe(true); // hex already attacked
    expect(refused(s, { type: 'attack', target: t2, attackers: ['GE-129'] })).toBe(true); // unit already attacked
    expect(refused(s, { type: 'attack', target: t2, attackers: ['GE-71'] })).toBe(false); // the rest of the stack may attack elsewhere
  });

  it('[8.1] all defenders in a hex are attacked together; no attack across a hexside the unit could not cross', () => {
    const s = setup();
    const t = go(C, N);
    place(s, 'US-179', t);
    place(s, 'US-1-142', t);
    place(s, 'GE-129', C);
    expect(odds(s, { target: t, attackers: ['GE-129'] }).defense).toBe(8);
    s.units['US-179'].where = { kind: 'removed', reason: 'test' };
    place(s, 'GE-IIb2', go(t, NE)); // a tank across a bare ridge
    setSide(go(t, NE), t, { mountain: true });
    expect(refused(s, { type: 'attack', target: t, attackers: ['GE-IIb2'] })).toBe(true);
    place(s, 'GE-I64', go(t, NE)); // infantry may (halved)
    expect(refused(s, { type: 'attack', target: t, attackers: ['GE-I64'] })).toBe(false);
  });

  it('[8.1] attacking is voluntary: the phase may end with adjacent enemies unattacked', () => {
    const s = setup();
    place(s, 'US-179', go(C, N));
    place(s, 'GE-129', C);
    act(s, { type: 'endPhase' });
    expect(s.combats.length).toBe(0);
  });

  it('[8.2] one target hex per combat, attacked from up to six hexes at once', () => {
    const s = setup();
    place(s, 'US-179', C);
    const ids = ['GE-I64', 'GE-II64', 'GE-I79', 'GE-II79', 'GE-III2', 'GE-IIb2'];
    ids.forEach((id, i) => place(s, id, neighbors(C)[i]));
    const o = odds(s, { target: C, attackers: ids });
    expect(o.ok).toBe(true);
    expect(o.attack).toBe(2 + 3 + 2 + 2 + 2 + 3);
  });

  it('[8.3] odds are rounded down to a CRT column: 7-2 = 3-1, 9-4 = 2-1, 6-4 = 1-1, 5-6 = 1-2', () => {
    const cases: [string[], string, number][] = [
      [['GE-IIa2', 'GE-I64'], 'US-1-142', 4], // 7 to 2
      [['GE-IIa2', 'GE-KGDor'], 'US-141', 3], // 9 to 4
      [['GE-KGDor', 'GE-I64'], 'US-141', 2], // 6 to 4
      [['GE-IIa2'], 'US-179', 1], // 5 to 6
    ];
    for (const [att, dfn, col] of cases) {
      const s = setup();
      place(s, dfn, C);
      att.forEach((id, i) => place(s, id, neighbors(C)[i]));
      expect([att.join('+'), odds(s, { target: C, attackers: att }).baseIndex]).toEqual([att.join('+'), col]);
    }
  });

  it('[8.3] procedure: variable strength is revealed before the CRT roll; the attacker advances only if the hex was vacated', () => {
    const g = go(C, S);
    const t = setup('Allied');
    place(t, 'GE-GarB', g);
    place(t, 'US-179', C);
    dice(t, 6, 4); // garrison roll 6 = strength 2; then 6 to 2 = 3-1, a 4 is DR2
    act(t, { type: 'attack', target: g, attackers: ['US-179'] });
    const rep = t.combats[0];
    expect([rep.defense, rep.finalColumn, rep.roll]).toEqual([2, '3-1', 4]);
    // A Dis result leaves the defender in place: no advance.
    const u = setup();
    place(u, 'US-179', go(C, N));
    place(u, 'GE-129', C);
    dice(u, 4);
    act(u, { type: 'attack', target: go(C, N), attackers: ['GE-129'] });
    expect(u.pendingAdvance).toBeNull();
    expect(u.pendingDefense).toBeNull();
  });
});

// ------------------------------------------------------------------ 8.4 MAF

describe('main assault force', () => {
  it('[8.4.1] the MAF attacks at full strength, everyone else at half (rounded up); the 8.4.3 example totals 20', () => {
    const s = setup('Allied');
    setHex(C, { terrain: 'clear' });
    place(s, 'GE-129', C);
    place(s, 'US-30', go(C, NW)); // 3rd Division
    place(s, 'US-15', go(C, NW)); // 3rd Division
    place(s, 'US-751', go(C, NW)); // attached tank battalion
    place(s, 'US-179', go(C, N)); // 45th Division: half
    place(s, 'US-191', go(C, NE)); // independent tank battalion, not stacked with the MAF: half
    const o = odds(s, { target: C, attackers: ['US-30', 'US-15', 'US-751', 'US-179', 'US-191'], maf: '3 Inf Div' });
    expect(o.mafUnits.sort()).toEqual(['US-15', 'US-30', 'US-751']);
    expect(o.attack).toBe(6 + 6 + 3 + 3 + 2);
    // An independent unit may be the MAF on its own.
    expect(odds(s, { target: C, attackers: ['US-191', 'US-179'], maf: 'US-191' }).attack).toBe(3 + 3);
  });

  it('[8.4.2] Darby\'s Rangers and the Commando Brigade are formations', () => {
    const s = setup('Allied');
    place(s, 'GE-129', C);
    place(s, 'US-1Rgr', go(C, N));
    place(s, 'US-3Rgr', go(C, NE));
    place(s, 'US-4Rgr', go(C, SE));
    expect(odds(s, { target: C, attackers: ['US-1Rgr', 'US-3Rgr', 'US-4Rgr'] }).attack).toBe(6);
    expect(UNIT_DEFS['BR-2Cdo'].division).toBe(UNIT_DEFS['BR-41Cdo'].division);
    expect(UNIT_DEFS['US-1Rgr'].division).toBe("Darby's Rangers");
  });

  it('[8.4.3] one attachment: for the Allies a silhouetted tank or a battalion stacked with the MAF; for the Germans any unit', () => {
    const s = setup('Allied');
    place(s, 'GE-129', C);
    place(s, 'US-30', go(C, N));
    place(s, 'US-179', go(C, N)); // a regiment: may not attach
    expect(odds(s, { target: C, attackers: ['US-30', 'US-179'], maf: '3 Inf Div' }).attack).toBe(6 + 3);
    place(s, 'US-1-142', go(C, N)); // a battalion: may
    place(s, 'US-2-141', go(C, N)); // only one attachment
    const o = odds(s, { target: C, attackers: ['US-30', 'US-1-142', 'US-2-141'], maf: '3 Inf Div' });
    expect(o.attack).toBe(6 + 2 + 1);
    const g = setup();
    place(g, 'US-179', C);
    place(g, 'GE-I64', go(C, N)); // 16 Pz
    place(g, 'GE-129', go(C, N)); // a 15 PG regiment attaches to the 16 Pz MAF
    expect(odds(g, { target: C, attackers: ['GE-I64', 'GE-129'], maf: '16 Pz' }).attack).toBe(2 + 6);
  });

  it('[8.4.3] the attacker names the attachment (e.g. a weaker tank for the Tank Shift)', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C); // 2-3-5, no tanks, not elite
    place(s, 'US-30', go(C, N));
    place(s, 'US-1-142', go(C, N)); // 2 attack
    place(s, 'US-645', go(C, N)); // TD battalion, 2 attack, tank rating 3 (2 attacking)
    const plan = { target: C, attackers: ['US-30', 'US-1-142', 'US-645'], maf: '3 Inf Div' };
    expect(odds(s, { ...plan, attach: 'US-645' }).shifts.map((x) => x.reason)).toContain('Tank shift');
    expect(odds(s, { ...plan, attach: 'US-1-142' }).shifts.map((x) => x.reason)).not.toContain('Tank shift');
    expect(odds(s, { ...plan, attach: 'US-179' }).ok).toBe(false);
  });

  it('[8.4.4] independent units belong to no formation (2/509 and beachheads included) but may attach', () => {
    for (const id of ['US-191', 'US-2-509', 'US-BH531R', 'BR-40RTR', 'US-601']) expect([id, UNIT_DEFS[id].division]).toEqual([id, null]);
    expect(UNIT_DEFS['US-179'].division).toBe('45 Inf Div');
  });

  it('[8.4.5] at most 20 strength points a side, counted after doubling and halving (both rulebook examples)', () => {
    // Example 1: two 5-7-3s in a Hill hex defend with 20, not 28.
    const s = setup('German');
    setHex(C, { terrain: 'hill' });
    place(s, 'BR-138', C);
    place(s, 'BR-201G', C);
    place(s, 'GE-129', go(C, N));
    place(s, 'GE-215', go(C, N)); // 6 + 2 = 8 to 20 (1-3)
    expect(odds(s, { target: C, attackers: ['GE-129', 'GE-215'] }).defense).toBe(20);
    // Example 2: 24 attacking across mountain hexsides is halved to 12 (not capped to 20 first).
    const t = setup('Allied');
    place(t, 'GE-129', C);
    const ids = ['US-30', 'US-15', 'US-7', 'US-180'];
    ids.forEach((id, i) => {
      place(t, id, neighbors(C)[i]);
      setSide(neighbors(C)[i], C, { mountain: true });
    });
    expect(odds(t, { target: C, attackers: ids, maf: '3 Inf Div' }).attack).toBe(12);
    // Play note: against 11 the best is 1-1 before shifts.
    const u = setup('Allied');
    place(u, 'GE-129', C); // 9
    place(u, 'GE-I67', C); // 3: 12 in all
    u.units['GE-I67'].stepsLost = 1; // 1-2-5: 11 in all
    const big = ['US-30', 'US-15', 'US-7', 'US-180']; // 18 + 3 = 21, capped at 20
    big.forEach((id, i) => place(u, id, neighbors(C)[i]));
    const o = odds(u, { target: C, attackers: big, maf: '3 Inf Div' });
    expect([o.attack, o.defense, o.baseIndex]).toEqual([20, 11, 2]);
  });

  it('[8.4.6] a parenthesized unit (ASU) defends only when alone, only one counts, and takes losses last', () => {
    const s = setup();
    place(s, 'US-36Art', C);
    place(s, 'US-45Art', C);
    place(s, 'GE-129', go(C, N));
    expect(odds(s, { target: C, attackers: ['GE-129'] }).defense).toBe(1);
    place(s, 'US-1-142', C);
    expect(odds(s, { target: C, attackers: ['GE-129'] }).defense).toBe(2);
    // An EX at 3-1 (6 to 2): the defender's step comes from the battalion, never the ASU.
    s.units['US-45Art'].where = { kind: 'removed', reason: 'test' };
    dice(s, 1);
    act(s, { type: 'attack', target: C, attackers: ['GE-129'] });
    expect(s.combats[0].result).toBe('EX');
    expect(gone(s, 'US-1-142')).toBe(true);
    expect(s.units['US-36Art'].where).toEqual({ kind: 'map', hex: C });
    expect(s.units['GE-129'].stepsLost).toBe(1);
  });
});

// ------------------------------------------------------------------ 8.5 coordination

describe('Allied coordination', () => {
  it('[8.5.1] US and Commonwealth units never attack together, but defend together and bond with each other', () => {
    const s = setup('Allied');
    place(s, 'GE-129', C);
    place(s, 'US-179', go(C, N));
    place(s, 'BR-138', go(C, S));
    expect(refused(s, { type: 'attack', target: C, attackers: ['US-179', 'BR-138'] })).toBe(true);
    expect(refused(s, { type: 'attack', target: C, attackers: ['US-179'] })).toBe(false);
    const g = setup();
    place(g, 'US-179', C);
    place(g, 'BR-138', C);
    place(g, 'GE-129', go(C, N));
    expect(odds(g, { target: C, attackers: ['GE-129'] }).defense).toBe(13);
    const b = setup();
    place(b, 'US-179', go(C, NW));
    place(b, 'BR-138', go(C, SE));
    expect(bondsOf(b, 'Allied').hexes.has(C)).toBe(true);
  });

  it('[8.5.2] 5th and 8th Army units never attack together', () => {
    const s = setup('Allied');
    place(s, 'GE-129', C);
    place(s, 'CN-1', go(C, N)); // 8th Army
    place(s, 'BR-138', go(C, S)); // 5th Army
    expect(UNIT_DEFS['CN-1'].army8).toBe(true);
    expect(refused(s, { type: 'attack', target: C, attackers: ['CN-1', 'BR-138'] })).toBe(true);
    expect(refused(s, { type: 'attack', target: C, attackers: ['CN-1'] })).toBe(false);
  });
});

// ------------------------------------------------------------------ 8.6 odds limits

describe('minimum and maximum odds', () => {
  it('[8.6.1] below 1-3 is not allowed; 8-1 and 9-1 use the 7-1 column; 10-1 is an automatic DS', () => {
    const s = setup('Allied');
    place(s, 'GE-129', C); // 9
    place(s, 'US-1-142', go(C, N)); // 2 to 9: 1-5
    expect(refused(s, { type: 'attack', target: C, attackers: ['US-1-142'] })).toBe(true);
    const t = setup('Allied');
    place(t, 'GE-I67', C);
    t.units['GE-I67'].stepsLost = 1; // 1-2-5: defense 2
    place(t, 'US-30', go(C, N));
    place(t, 'US-15', go(C, N)); // 12 to 2 = 6-1
    expect(odds(t, { target: C, attackers: ['US-30', 'US-15'] }).finalIndex).toBe(7);
    place(t, 'US-7', go(C, S)); // 18 to 2 = 9-1: on the 7-1 column
    expect(odds(t, { target: C, attackers: ['US-30', 'US-15', 'US-7'] }).finalIndex).toBe(8);
    place(t, 'US-180', go(C, NE)); // + 3 (half): 21, capped at 20, to 2 = 10-1: DS without a roll
    dice(t, 1);
    act(t, { type: 'attack', target: C, attackers: ['US-30', 'US-15', 'US-7', 'US-180'], maf: '3 Inf Div' });
    expect(t.combats[0].result).toMatch(/^DS/);
    expect(t.combats[0].roll).toBe(0);
    expect(t.forcedRolls).toEqual([1]);
  });

  it('[8.6.2] shifts count from columns beyond 7-1 and the limits apply to the net result (rulebook examples)', () => {
    // 8-1 with one shift left for Defensive Air Support is resolved on 7-1, not 6-1.
    const t = setup('Allied');
    place(t, 'GE-I67', C, { stepsLost: 1 }); // 1-2-5
    place(t, 'US-30', go(C, N));
    place(t, 'US-15', go(C, N));
    place(t, 'US-7', go(C, S), { stepsLost: 1 }); // 4-5-3: 16 to 2 = 8-1
    t.support.ready = ['GE-air'];
    t.options = { defensiveAir: { German: 'always' } };
    const o = odds(t, { target: C, attackers: ['US-30', 'US-15', 'US-7'] });
    expect(o.baseIndex).toBe(9);
    expect(o.shifts.map((x) => x.reason)).toEqual(['Defensive air support']);
    expect(o.finalIndex).toBe(8);
    // 7-1 with one shift right stays on 7-1: the 82nd Airborne (elite), 15 to 2.
    const e = setup('Allied');
    place(e, 'GE-I67', C, { stepsLost: 1 });
    place(e, 'US-505', go(C, N));
    place(e, 'US-325', go(C, S));
    place(e, 'US-504', go(C, NE));
    place(e, 'US-3-504', go(C, SE));
    const o2 = odds(e, { target: C, attackers: ['US-505', 'US-325', 'US-504', 'US-3-504'] });
    expect([o2.attack, o2.baseIndex, o2.finalIndex, o2.autoDs]).toEqual([15, 8, 8, false]);
    expect(o2.shifts.map((x) => x.reason)).toEqual(['Elite']);
  });

  it('[8.6.2] a 1-4 lifted by a shift is fought on the 1-3 column; a 1-5 is not', () => {
    const s = setup('Allied');
    place(s, 'GE-71', C); // 4-6-5
    place(s, 'GE-I71', C, { stepsLost: 1 }); // 1-2-5: 8 in all
    place(s, 'US-2-509', go(C, N)); // 2, elite: 2 to 8 = 1-4
    const o = odds(s, { target: C, attackers: ['US-2-509'] });
    expect([o.ok, o.baseIndex, o.finalIndex]).toEqual([true, -1, 0]);
    s.units['GE-I71'].stepsLost = 0; // 2 to 9 rounds down to 1-5: one shift is not enough
    expect(odds(s, { target: C, attackers: ['US-2-509'] }).ok).toBe(false);
  });
});

// ------------------------------------------------------------------ 8.7 Automatic DS

describe('automatic DS', () => {
  /** The rulebook example: six 16th Panzer units against a US battalion, stack B waiting behind. */
  function example() {
    const s = setup('German');
    s.phase = 'movement';
    const x = C;
    place(s, 'US-1-142', x); // 2-2-3
    // Stack A (two hexes): III/2, I/64, II/64 and IIa/2, I/79, II/79 = 16 attack strength.
    const a1 = go(x, N, 2);
    const a2 = go(x, SW, 2);
    for (const id of ['GE-III2', 'GE-I64', 'GE-II64']) place(s, id, a1);
    for (const id of ['GE-IIa2', 'GE-I79', 'GE-II79']) place(s, id, a2);
    // Stack B and the Remnant at Y.
    const y = go(x, SE, 3);
    place(s, 'GE-KGDor', go(x, NW, 3));
    place(s, 'GE-IIb2', go(x, NW, 3));
    place(s, 'US-REM-A', y);
    return { s, x, a1, a2, y };
  }

  it('[8.7.1] in the Movement Phase, 10-1 with Tank and Elite shifts: the defender is shattered at once (rulebook example)', () => {
    const { s, x } = example();
    act(s, { type: 'move', unitId: 'GE-III2', to: go(x, N) });
    act(s, { type: 'move', unitId: 'GE-I64', to: go(x, N) });
    act(s, { type: 'move', unitId: 'GE-II64', to: go(x, N) });
    act(s, { type: 'move', unitId: 'GE-IIa2', to: go(x, SW) });
    act(s, { type: 'move', unitId: 'GE-I79', to: go(x, SW) });
    act(s, { type: 'move', unitId: 'GE-II79', to: go(x, SW) });
    const six = ['GE-III2', 'GE-I64', 'GE-II64', 'GE-IIa2', 'GE-I79', 'GE-II79'];
    const o = computeOdds(s, { target: x, attackers: six }, { autoDs: true });
    expect([o.attack, o.defense]).toEqual([16, 2]);
    expect(o.shifts.map((v) => v.reason).sort()).toEqual(['Elite', 'Tank shift']);
    dice(s, 1);
    act(s, { type: 'autoDs', target: x, attackers: six });
    expect(gone(s, 'US-1-142')).toBe(true);
    expect(s.forcedRolls).toEqual([1]); // no die roll
    for (const id of six) expect([id, s.units[id].autoDs]).toEqual([id, true]);
    // They may not move again this phase, nor attack in the Combat Phase.
    expect(refused(s, { type: 'move', unitId: 'GE-I64', to: go(x, N, 2) })).toBe(true);
    act(s, { type: 'endPhase' });
    place(s, 'US-179', go(x, NE)); // a new target next to stack A's north hex
    expect(refused(s, { type: 'attack', target: go(x, NE), attackers: ['GE-I64'] })).toBe(true);
  });

  it('[8.7.1] stack B then sets up a 4-1 against the Remnant at Y (7 to 3 with two shifts)', () => {
    const { s, y } = example();
    s.phase = 'combat';
    const nextToY = go(y, N);
    place(s, 'GE-KGDor', nextToY);
    place(s, 'GE-IIb2', nextToY);
    const o = odds(s, { target: y, attackers: ['GE-KGDor', 'GE-IIb2'] });
    expect([o.attack, o.defense, o.finalIndex]).toEqual([7, 3, 5]); // 2-1 +2 = 4-1
  });

  it('[8.7.1] no Air, Naval or Artillery shifts for an Auto DS, and only in the Movement Phase', () => {
    const s = setup('Allied');
    s.phase = 'movement';
    place(s, 'GE-I67', C, { stepsLost: 1 }); // defense 2
    for (const id of ['US-30', 'US-15']) place(s, id, go(C, N));
    place(s, 'US-3Art', go(C, N, 2));
    s.support.ready = ['US-air'];
    expect(refused(s, { type: 'autoDs', target: C, attackers: ['US-30', 'US-15'] })).toBe(true); // 6-1
    place(s, 'US-7', go(C, S));
    expect(refused(s, { type: 'autoDs', target: C, attackers: ['US-30', 'US-15', 'US-7'] })).toBe(true); // 9-1
    place(s, 'US-180', go(C, NE)); // 20 (capped) to 2
    const all = ['US-30', 'US-15', 'US-7', 'US-180'];
    s.phase = 'combat';
    expect(refused(s, { type: 'autoDs', target: C, attackers: all })).toBe(true);
    s.phase = 'movement';
    act(s, { type: 'autoDs', target: C, attackers: all });
    expect(gone(s, 'GE-I67')).toBe(true);
    expect(s.support.ready).toEqual(['US-air']);
    expect(s.units['US-3Art'].fired).toBe(false);
  });

  it('[8.7.1] survivors retreat 4 hexes in Full Retreat; [8.7.2] the attackers advance after all combats, at the full rate', () => {
    const s = setup('Allied');
    s.phase = 'movement';
    place(s, 'GE-826', C); // 2-1-5 tank, one step
    place(s, 'GE-16Art', C); // parenthesized: survives the DS step loss
    for (const id of ['US-30', 'US-15']) place(s, id, go(C, N)); // 12 to 1
    act(s, { type: 'autoDs', target: C, attackers: ['US-30', 'US-15'] });
    expect(gone(s, 'GE-826')).toBe(true);
    const asu = s.units['GE-16Art'];
    expect(asu.status).toBe('fullRetreat');
    expect(asu.where.kind === 'map' && distance(asu.where.hex, C)).toBe(4);
    expect(s.pendingAdvance).toBeNull();
    expect(s.autoDsQueue.length).toBe(1);
    act(s, { type: 'endPhase' }); // to the Combat Phase: nothing yet
    expect(s.phase).toBe('combat');
    expect(s.pendingAdvance).toBeNull();
    act(s, { type: 'endPhase' }); // after all combats: the advance
    expect(s.phase).toBe('combat');
    expect(s.pendingAdvance!.maxByUnit).toEqual({ 'US-30': 2, 'US-15': 2 });
    act(s, { type: 'advance', unitIds: ['US-30'], to: C });
    act(s, { type: 'endPhase' }); // US-15 stays put
    expect(s.units['US-30'].autoDs).toBe(true);
    act(s, { type: 'endPhase' }); // the markers come off as the phase ends
    expect(s.units['US-30'].autoDs).toBe(false);
    expect(s.phase).not.toBe('combat');
  });
});

// ------------------------------------------------------------------ 9.0 modifiers

describe('combat modifiers', () => {
  it('[9.1] halve unit by unit, rounding up, and never more than once', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-30', go(C, N)); // MAF, 6
    place(s, 'US-191', go(C, S)); // 3 -> 2
    place(s, 'US-751', go(C, S)); // 3 -> 2 (halving the stack's 6 would give 3)
    const plan = { target: C, attackers: ['US-30', 'US-191', 'US-751'], maf: '3 Inf Div' };
    expect(odds(s, plan).attack).toBe(10);
    s.units['US-191'].outOfSupply = true; // outside the MAF and out of supply: still halved once
    expect(odds(s, plan).attack).toBe(10);
  });

  it('[9.1] a unit both halved and doubled (Disrupted in a City) defends at its printed strength', () => {
    const s = setup('German');
    place(s, 'GE-129', go(C, N));
    place(s, 'GE-215', go(C, N));
    const plan = { target: C, attackers: ['GE-129', 'GE-215'] };
    setHex(C, { terrain: 'clear', city: 'Testville' });
    place(s, 'US-179', C, { status: 'disrupted' });
    expect(odds(s, plan).defense).toBe(6);
    s.units['US-179'].status = 'good';
    expect(odds(s, plan).defense).toBe(12);
    setHex(C, { terrain: 'clear' });
    s.units['US-179'].status = 'disrupted';
    expect(odds(s, plan).defense).toBe(3);
  });

  it('[9.2] US air supports only US attacks, CW air only CW attacks; a defender needs a unit of the marker\'s nationality', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-179', go(C, N));
    s.support.ready = ['BR-air'];
    expect(odds(s, { target: C, attackers: ['US-179'], air: true }).ok).toBe(false);
    s.support.ready = ['US-air'];
    expect(shiftNames(s, { target: C, attackers: ['US-179'], air: true })).toEqual(['Air support']);
    // Defending: the British defender cannot call on the US marker.
    const g = setup('German');
    g.options = { defensiveAir: { Allied: 'always' } };
    place(g, 'BR-138', C);
    place(g, 'GE-129', go(C, N));
    g.support.ready = ['US-air'];
    expect(shiftNames(g, { target: C, attackers: ['GE-129'] })).toEqual([]);
    g.support.ready = ['BR-air'];
    expect(shiftNames(g, { target: C, attackers: ['GE-129'] })).toEqual(['Defensive air support']);
  });

  it('[9.3.1] [9.3.2] tank shifts: rulebook examples A (attacker), B (neither) and C (defender)', () => {
    const a = setup('Allied');
    place(a, 'GE-II64', C);
    place(a, 'US-141', go(C, N));
    place(a, 'US-191', go(C, N));
    expect(shiftNames(a, { target: C, attackers: ['US-141', 'US-191'], maf: '36 Inf Div' })).toEqual(['Tank shift']);
    const b = setup('Allied');
    place(b, 'GE-IIa2', C);
    place(b, 'US-753', go(C, N));
    place(b, 'US-751', go(C, N));
    expect(shiftNames(b, { target: C, attackers: ['US-753', 'US-751'], maf: 'US-753' })).toEqual([]);
    const c = setup('Allied');
    place(c, 'GE-IIb2', C);
    place(c, 'US-141', go(C, N));
    expect(shiftNames(c, { target: C, attackers: ['US-141'] })).toEqual(['Defender tank shift']);
  });

  it('[9.3.1] the tank must be in the MAF to earn the shift; ratings are compared, not added', () => {
    const s = setup('Allied');
    place(s, 'GE-II64', C);
    place(s, 'US-141', go(C, N));
    place(s, 'US-191', go(C, S)); // not stacked with the MAF: not attached
    expect(shiftNames(s, { target: C, attackers: ['US-141', 'US-191'], maf: '36 Inf Div' })).toEqual([]);
    const t = setup('German');
    place(t, 'US-191', C); // rating 3
    place(t, 'GE-III2', go(C, N));
    place(t, 'GE-IIb2', go(C, N)); // two rating-3 tanks do not beat one
    expect(shiftNames(t, { target: C, attackers: ['GE-III2', 'GE-IIb2'] })).toEqual([]);
  });

  it('[9.3.3] no tank shift for either side against a Hill, Marsh, full Mountain or City hex', () => {
    for (const hex of [{ terrain: 'hill' }, { terrain: 'marsh' }, { terrain: 'clear', city: 'Testville' }] as const) {
      const a = setup('Allied');
      setHex(C, { ...hex });
      place(a, 'GE-II64', C);
      place(a, 'US-141', go(C, N));
      place(a, 'US-191', go(C, N));
      expect(shiftNames(a, { target: C, attackers: ['US-141', 'US-191'], maf: '36 Inf Div' })).toEqual([]);
      const c = setup('Allied');
      setHex(C, { ...hex });
      place(c, 'GE-IIb2', C);
      place(c, 'US-141', go(C, N));
      expect(shiftNames(c, { target: C, attackers: ['US-141'] })).toEqual([]);
    }
  });

  it('[9.3.3] tanks attacking across a river earn no shift, but still deny the defender his', () => {
    const s = setup('Allied');
    place(s, 'GE-IIb2', C);
    place(s, 'US-141', go(C, N));
    setSide(go(C, N), C, { river: true });
    expect(shiftNames(s, { target: C, attackers: ['US-141'] })).toEqual(['Defender tank shift']);
    place(s, 'US-191', go(C, N));
    expect(shiftNames(s, { target: C, attackers: ['US-141', 'US-191'], maf: '36 Inf Div' })).toEqual([]);
    const t = setup('Allied');
    place(t, 'GE-II64', C);
    place(t, 'US-141', go(C, N));
    place(t, 'US-191', go(C, N));
    setSide(go(C, N), C, { river: true });
    expect(shiftNames(t, { target: C, attackers: ['US-141', 'US-191'], maf: '36 Inf Div' })).toEqual([]);
  });

  it('[9.3.4] tank destroyers lose 1 from their rating when attacking only (rulebook examples A and B)', () => {
    const a = setup('Allied');
    place(a, 'GE-IIb2', C);
    place(a, 'US-601', go(C, N));
    expect(shiftNames(a, { target: C, attackers: ['US-601'] })).toEqual(['Defender tank shift']);
    const b = setup('German');
    place(b, 'US-601', C);
    place(b, 'GE-IIb2', go(C, N));
    expect(shiftNames(b, { target: C, attackers: ['GE-IIb2'] })).toEqual([]);
  });

  it('[9.4] one air unit per side per combat, any range, flipped once used', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-179', go(C, N));
    s.support.ready = ['US-air', 'GE-air'];
    s.options = { defensiveAir: { German: 'always' } };
    const o = odds(s, { target: C, attackers: ['US-179'], air: true });
    expect(o.shifts.map((x) => x.reason)).toEqual(['Air support', 'Defensive air support']);
    dice(s, 6);
    act(s, { type: 'attack', target: C, attackers: ['US-179'], air: true });
    expect(s.support.ready).toEqual([]);
    expect(refused(s, { type: 'attack', target: go(C, S), attackers: ['US-179'], air: true })).toBe(true);
  });

  it('[9.5.1] a ready Division ASU in range supports an attack by its own division, then is used', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-141', go(C, N)); // 36th Division
    place(s, 'US-179', go(C, S)); // 45th Division
    place(s, 'US-36Art', go(C, N, 4)); // range 4
    place(s, 'US-45Art', go(C, S, 5)); // out of range
    expect(shiftNames(s, { target: C, attackers: ['US-141'], asus: ['US-36Art'] })).toEqual(['Division artillery (36 Div ASU)']);
    expect(odds(s, { target: C, attackers: ['US-179'], asus: ['US-36Art'] }).ok).toBe(false); // wrong division
    expect(odds(s, { target: C, attackers: ['US-179'], asus: ['US-45Art'] }).ok).toBe(false); // out of range
    // Any participating unit of the division will do, not only the MAF.
    expect(shiftNames(s, { target: C, attackers: ['US-141', 'US-179'], maf: '45 Inf Div', asus: ['US-36Art'] })).toEqual(['Division artillery (36 Div ASU)']);
    dice(s, 6);
    act(s, { type: 'attack', target: C, attackers: ['US-141'], asus: ['US-36Art'] });
    expect(s.units['US-36Art'].fired).toBe(true);
  });

  it('[9.5.2] a ready Corps ASU in range supports any attack of its nationality', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-179', go(C, N));
    place(s, 'US-VIArt', go(C, N, 5));
    place(s, 'BR-XArt', go(C, S, 2));
    expect(shiftNames(s, { target: C, attackers: ['US-179'], asus: ['US-VIArt'] })).toEqual(['Corps artillery (VI Corps ASU)']);
    expect(odds(s, { target: C, attackers: ['US-179'], asus: ['BR-XArt'] }).ok).toBe(false);
    s.units['US-VIArt'].fired = true;
    expect(odds(s, { target: C, attackers: ['US-179'], asus: ['US-VIArt'] }).ok).toBe(false);
  });

  it('[9.5.3] at most two artillery shifts: one Division and one Corps', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-141', go(C, N));
    place(s, 'US-179', go(C, S));
    for (const id of ['US-36Art', 'US-45Art', 'US-VIArt']) place(s, id, go(C, NE, 2));
    const plan = { target: C, attackers: ['US-141', 'US-179'], maf: '45 Inf Div', asus: ['US-36Art', 'US-45Art', 'US-VIArt'] };
    expect(odds(s, plan).shifts.filter((x) => /artillery/.test(x.reason)).length).toBe(2);
    dice(s, 6);
    act(s, { type: 'attack', ...plan });
    expect(['US-36Art', 'US-45Art', 'US-VIArt'].map((id) => s.units[id].fired)).toEqual([true, false, true]);
  });

  it('[9.6] naval support: within 2 hexes of the sea south of Campanella Point, used once, never with a Corps ASU', () => {
    expect(inNavalRange('2707')).toBe(true); // Salerno
    expect(inNavalRange('2202')).toBe(false); // north of Campanella Point
    expect(inNavalRange(C)).toBe(false); // inland
    const s = scenario({ phase: 'combat', side: 'Allied' });
    s.support.ready = ['US-naval'];
    place(s, 'GE-I67', '2707');
    const from = neighbors('2707').find((n) => MAP.hexes[n] && MAP.hexes[n].terrain !== 'sea' && !MAP.hexes[n].city)!;
    place(s, 'US-179', from);
    place(s, 'US-VIArt', from);
    expect(shiftNames(s, { target: '2707', attackers: ['US-179'], naval: true })).toEqual(['Naval support']);
    // Naval support counts as the Corps support: a Corps ASU adds nothing more and is not spent.
    expect(shiftNames(s, { target: '2707', attackers: ['US-179'], naval: true, asus: ['US-VIArt'] })).toEqual(['Naval support']);
    dice(s, 6);
    act(s, { type: 'attack', target: '2707', attackers: ['US-179'], naval: true, asus: ['US-VIArt'] });
    expect(s.support.ready).toEqual([]);
    expect(s.units['US-VIArt'].fired).toBe(false);
    const t = setup('Allied');
    t.support.ready = ['US-naval'];
    place(t, 'GE-I67', C);
    place(t, 'US-179', go(C, N));
    expect(odds(t, { target: C, attackers: ['US-179'], naval: true }).ok).toBe(false);
  });

  it('[9.7] the Elite Shift: an elite unit in the MAF and none among the defenders; never for the defender', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-505', go(C, N));
    expect(shiftNames(s, { target: C, attackers: ['US-505'] })).toEqual(['Elite']);
    place(s, 'GE-II64', C); // an elite defender
    expect(shiftNames(s, { target: C, attackers: ['US-505'] })).toEqual([]);
    const t = setup('Allied');
    place(t, 'GE-I67', C);
    place(t, 'US-141', go(C, N));
    place(t, 'US-2-509', go(C, S)); // elite, but not in the MAF
    expect(shiftNames(t, { target: C, attackers: ['US-141', 'US-2-509'], maf: '36 Inf Div' })).toEqual([]);
    const g = setup('German');
    place(g, 'US-505', C);
    place(g, 'GE-129', go(C, N));
    expect(shiftNames(g, { target: C, attackers: ['GE-129'] })).toEqual([]);
  });

  it('[9.8] rivers: the defender doubles only if every attacker is across a river (rulebook examples X and Y)', () => {
    const x = setup('Allied');
    place(x, 'GE-I67', C);
    const xs: [string, number][] = [['US-141', N], ['US-2-141', NE], ['US-142', NW]];
    for (const [id, d] of xs) {
      place(x, id, go(C, d));
      setSide(go(C, d), C, { river: true });
    }
    const ox = odds(x, { target: C, attackers: xs.map(([id]) => id) });
    expect([ox.attack, ox.defense, ox.baseIndex]).toEqual([10, 6, 2]); // 1-1
    const y = setup('Allied');
    place(y, 'GE-II67', C);
    const ys: [string, number][] = [['US-179', N], ['US-157', NE], ['US-2-157', S]];
    for (const [id, d] of ys) place(y, id, go(C, d));
    setSide(go(C, N), C, { river: true });
    setSide(go(C, NE), C, { river: true });
    const oy = odds(y, { target: C, attackers: ys.map(([id]) => id) });
    expect([oy.attack, oy.defense, oy.baseIndex]).toEqual([12, 3, 5]); // 4-1
  });

  it('[9.8] vehicles attacking across a river, bridged or not, are halved', () => {
    const s = setup('Allied');
    place(s, 'GE-I67', C);
    place(s, 'US-191', go(C, N));
    setSide(go(C, N), C, { river: true, road: 'minor' });
    expect(odds(s, { target: C, attackers: ['US-191'] }).attack).toBe(2);
    place(s, 'US-179', go(C, N)); // infantry is not halved by the river
    expect(odds(s, { target: C, attackers: ['US-179'] }).attack).toBe(6);
  });

  it('[9.8] Hill, Marsh and City double every defender except silhouetted tanks, ASUs and variable-strength units', () => {
    for (const hex of [{ terrain: 'hill' }, { terrain: 'marsh' }, { terrain: 'clear', city: 'Testville' }] as const) {
      const s = setup('Allied');
      setHex(C, { ...hex });
      place(s, 'US-179', go(C, N));
      place(s, 'US-30', go(C, N));
      const def = (ids: string[], variableValue?: Record<string, number>) => {
        for (const u of Object.values(s.units)) if (u.where.kind === 'map' && u.where.hex === C) u.where = { kind: 'removed', reason: 'test' };
        for (const id of ids) place(s, id, C);
        return computeOdds(s, { target: C, attackers: ['US-179', 'US-30'] }, { variableValue }).defense;
      };
      expect(def(['GE-I67'])).toBe(6); // infantry type
      expect(def(['GE-KGDor'])).toBe(8); // recon
      expect(def(['GE-IIa2'])).toBe(4); // silhouetted tank
      expect(def(['GE-16Art'])).toBe(1); // ASU
      expect(def(['GE-GarB'], { 'GE-GarB': 2 })).toBe(2); // variable strength
    }
    // A non-silhouetted tank unit (the 22nd Armoured Brigade) does double.
    const g = setup('German');
    setHex(C, { terrain: 'hill' });
    place(g, 'BR-22', C);
    place(g, 'GE-129', go(C, N));
    place(g, 'GE-71', go(C, N));
    expect(odds(g, { target: C, attackers: ['GE-129', 'GE-71'], attach: undefined }).defense).toBe(12);
  });

  it('[9.8] every unit is halved attacking across a mountain hexside; tanks and recon only by road or pass', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    const n = go(C, N);
    place(s, 'GE-II64', n);
    setSide(n, C, { mountain: true });
    expect(odds(s, { target: C, attackers: ['GE-II64'] }).attack).toBe(2);
    setSide(n, C, { mountain: true, road: 'minor' });
    expect(odds(s, { target: C, attackers: ['GE-II64'] }).attack).toBe(2);
    setSide(n, C, { mountain: true });
    place(s, 'GE-IIb2', n);
    place(s, 'GE-KGDor', n);
    expect(refused(s, { type: 'attack', target: C, attackers: ['GE-IIb2'] })).toBe(true);
    expect(refused(s, { type: 'attack', target: C, attackers: ['GE-KGDor'] })).toBe(true);
    setSide(n, C, { mountain: true, pass: true });
    expect(odds(s, { target: C, attackers: ['GE-KGDor'] }).attack).toBe(2);
    expect(refused(s, { type: 'attack', target: C, attackers: ['GE-IIb2'] })).toBe(false);
  });

  it('[9.9] Disrupted defenders are halved, Full Retreat defends at 0, Out of Supply attackers are halved, Rain shifts left', () => {
    const s = setup('German');
    place(s, 'US-179', C, { status: 'disrupted' });
    place(s, 'GE-129', go(C, N));
    expect(odds(s, { target: C, attackers: ['GE-129'] }).defense).toBe(3);
    s.units['US-179'].status = 'fullRetreat';
    expect(odds(s, { target: C, attackers: ['GE-129'] }).defense).toBe(0);
    s.units['US-179'].status = 'good';
    s.units['GE-129'].outOfSupply = true;
    expect(odds(s, { target: C, attackers: ['GE-129'] }).attack).toBe(3);
    const rain = RULES.weather.track.findIndex((w) => w.rain);
    const r = setup('German', { weather: rain });
    place(r, 'US-179', C);
    place(r, 'GE-129', go(C, N));
    expect(shiftNames(r, { target: C, attackers: ['GE-129'] })).toEqual(['Rain']);
  });
});
