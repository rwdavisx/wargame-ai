// Rule tests for sections 10.0-12.5: combat results, step losses and Remnants, Determined and
// Desperate Defense, and retreats. Positions sit on synthetic clear ground (sandbox.ts); dice are forced.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RULES, UNIT_DEFS } from '../../src/engine/data';
import { distance, neighbors, type HexId } from '../../src/engine/hex';
import { computeOdds, inNavalRange, type AttackPlan } from '../../src/engine/combat';
import { loseStep } from '../../src/engine/losses';
import { retreatChoices } from '../../src/engine/retreat';
import type { GameState } from '../../src/engine/types';
import { act, dice, place, refused, scenario } from './harness';
import { C, N, NE, NW, S, SE, SW, go, remnantsToPool, restoreMap, sandbox, setHex, setSide } from './sandbox';

// Naval gunfire range is cached from the real coastline on first use: warm it before any sandbox.
beforeAll(() => {
  inNavalRange('2707');
});
afterEach(restoreMap);

/** A combat phase for `side` on clear ground around `center`, no support markers ready. */
function setup(side: 'German' | 'Allied' = 'German', o: Parameters<typeof scenario>[0] = {}, center: HexId = C) {
  sandbox(center, 8);
  const s = scenario({ phase: 'combat', side, ...o });
  s.support.ready = [];
  remnantsToPool(s);
  return s;
}
const where = (s: GameState, id: string) => s.units[id].where;
const hexOf = (s: GameState, id: string) => {
  const w = s.units[id].where;
  return w.kind === 'map' ? w.hex : null;
};
const gone = (s: GameState, id: string) => s.units[id].where.kind === 'eliminated';
const last = (s: GameState) => s.combats[s.combats.length - 1];
const attack = (s: GameState, plan: AttackPlan) => act(s, { type: 'attack', ...plan });

// ------------------------------------------------------------------ 10.0 combat results

describe('combat results', () => {
  /** GE-129 (6) attacks a US defender at C from the north. */
  function fight(defenders: string[], roll: number, extra: string[] = [], o: { status?: 'good' | 'disrupted' } = {}) {
    const s = setup('German');
    for (const id of defenders) place(s, id, C, o.status ? { status: o.status } : {});
    place(s, 'GE-129', go(C, N));
    extra.forEach((id) => place(s, id, go(C, N)));
    dice(s, roll);
    attack(s, { target: C, attackers: ['GE-129', ...extra], maf: '15 PG' });
    return s;
  }

  it('[10.1] A1: the attacker loses a step; no retreat and no advance', () => {
    const s = fight(['US-142'], 1); // 6 to 4 = 1-1, roll 1 = A1
    expect(last(s).result).toBe('A1');
    expect(s.units['GE-129'].stepsLost).toBe(1);
    expect(s.units['US-142'].stepsLost).toBe(0);
    expect([s.pendingDefense, s.pendingAdvance]).toEqual([null, null]);
  });

  it('[10.1] EX: both lose a step and the defender stays; a one-step defender gives a Limited Advance into its hex', () => {
    const s = fight(['US-142'], 3); // 1-1, roll 3 = EX
    expect(last(s).result).toBe('EX');
    expect([s.units['GE-129'].stepsLost, s.units['US-142'].stepsLost]).toEqual([1, 1]);
    expect(hexOf(s, 'US-142')).toBe(C);
    expect(s.pendingAdvance).toBeNull();
    const t = fight(['US-1-142'], 1); // 6 to 2 = 3-1, roll 1 = EX
    expect(gone(t, 'US-1-142')).toBe(true);
    expect(t.pendingAdvance).toMatchObject({ limited: true, vacated: C, maxByUnit: { 'GE-129': 1 } });
  });

  it('[10.1] Dis: the defender is disrupted, with no loss, retreat or advance; one already disrupted goes into Full Retreat 2 hexes', () => {
    const s = fight(['US-142'], 4); // 1-1, roll 4 = Dis
    expect(last(s).result).toBe('Dis');
    expect(s.units['US-142']).toMatchObject({ status: 'disrupted', stepsLost: 0, where: { kind: 'map', hex: C } });
    expect(s.pendingAdvance).toBeNull();
    const u = setup('German');
    place(u, 'US-142', C, { status: 'disrupted' }); // defends at 2
    place(u, 'GE-I71', go(C, N)); // 2 to 2 = 1-1
    dice(u, 4);
    attack(u, { target: C, attackers: ['GE-I71'] });
    expect(last(u).result).toBe('Dis');
    expect(u.units['US-142'].status).toBe('fullRetreat');
    expect(distance(hexOf(u, 'US-142')!, C)).toBe(2);
    expect(u.pendingAdvance).toBeNull();
  });

  it('[10.1] DR2: retreat 2 and Disrupted, or Determined Defense; the attacker may advance 2 if the defender goes', () => {
    const s = fight(['US-1-142'], 3); // 3-1, roll 3 = DR2
    expect(last(s).result).toBe('DR2 Adv 2');
    expect(s.pendingDefense).toMatchObject({ retreat: 2, advance: 2 });
    act(s, { type: 'defend', choice: 'retreat' });
    expect(s.units['US-1-142'].status).toBe('disrupted');
    expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(2);
    expect(s.pendingAdvance!.maxByUnit).toEqual({ 'GE-129': 2 });
  });

  it('[10.1] A1/DR2 and A1/D1: the attacker loses a step; the defender retreats 2 (losing a step on A1/D1) or defends', () => {
    const s = fight(['US-142'], 5); // 1-1, roll 5 = A1/DR2
    expect(last(s).result).toBe('A1/DR2 Adv 2');
    expect([s.units['GE-129'].stepsLost, s.units['US-142'].stepsLost]).toEqual([1, 0]);
    expect(s.pendingDefense!.retreat).toBe(2);
    const t = fight(['US-1-142', 'US-2-141'], 6, ['GE-III115']); // 8 to 4 = 2-1, roll 6 = A1/D1
    expect(last(t).result).toBe('A1/D1 Adv 2');
    expect(t.units['GE-129'].stepsLost + t.units['GE-III115'].stepsLost).toBe(1);
    expect(['US-1-142', 'US-2-141'].filter((id) => gone(t, id)).length).toBe(1);
    expect(t.pendingDefense!.retreat).toBe(2);
  });

  it('[10.1] DRX: both lose a step, chosen by the other player, then retreat 2 or defend', () => {
    const s = fight(['US-1-142'], 3, ['GE-III115']); // 8 to 2 = 4-1, roll 3 = DRX
    expect(last(s).result).toBe('DRX Adv 2');
    expect(gone(s, 'US-1-142')).toBe(true);
    // The defender picks the attacker's loss: the most valuable MAF step (GE-129, not the 2-3-5).
    expect([s.units['GE-129'].stepsLost, s.units['GE-III115'].stepsLost]).toEqual([1, 0]);
    expect(s.pendingAdvance).not.toBeNull(); // the hex is empty: advance at once
  });

  it('[10.1] D1: the defender loses a step, then retreats 3 or defends; mechanized units advance 3, others 2', () => {
    const s = setup('German');
    place(s, 'US-142', C, { stepsLost: 1 }); // 1-3-3, its last step
    place(s, 'GE-129', go(C, N)); // motorized
    place(s, 'GE-III115', go(C, NW));
    place(s, 'GE-III1FJ', go(C, NE)); // foot, 1 FJ: half
    dice(s, 6); // 6 + 2 + 1 = 9 to 3 = 3-1, roll 6 = D1
    attack(s, { target: C, attackers: ['GE-129', 'GE-III1FJ', 'GE-III115'], maf: '15 PG' });
    expect(last(s).result).toBe('D1 Adv 3');
    expect(gone(s, 'US-142')).toBe(true);
    expect(s.pendingAdvance!.maxByUnit).toEqual({ 'GE-129': 3, 'GE-III115': 3, 'GE-III1FJ': 2 });
    // With a survivor, the choice is a 3-hex retreat or a Determined Defense.
    const u = setup('German');
    place(u, 'US-142', C);
    place(u, 'US-1-142', C); // 6 defense
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(u, id, go(C, N)); // 10, +1 tank shift
    for (const id of ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15']) place(u, id, go(C, NW)); // 29 PG: 4 x 1
    dice(u, 6); // 14 to 6 = 2-1 +1 = 3-1, roll 6 = D1
    attack(u, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', 'GE-I71', 'GE-I15', 'GE-II15', 'GE-III15'], maf: '15 PG' });
    expect(last(u).result).toBe('D1 Adv 3');
    expect(u.pendingDefense).toMatchObject({ retreat: 3, advance: 3 });
    act(u, { type: 'defend', choice: 'retreat' });
    expect(distance(hexOf(u, 'US-142')!, C)).toBe(3);
  });

  it('[10.1] DR4: retreat 4 in Full Retreat with no Determined Defense; the attacker advances 3 (mechanized) or 2', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N)); // 10 to 2 = 5-1, +1 tank = 6-1
    place(s, 'GE-III1FJ', go(C, NE)); // + 1 = 11 to 2, still 5-1 base
    dice(s, 3); // 6-1, roll 3 = DR4
    attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', 'GE-III1FJ'], maf: '15 PG' });
    expect(last(s).result).toBe('DR4 Adv 3');
    expect(s.pendingDefense).toBeNull();
    expect(s.units['US-1-142'].status).toBe('fullRetreat');
    expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(4);
    expect(s.pendingAdvance!.maxByUnit).toEqual({ 'GE-129': 3, 'GE-III115': 3, 'GE-215': 3, 'GE-III1FJ': 2 });
  });

  it('[10.1] DS: one step lost (the attacker picks), survivors retreat 4 in Full Retreat, no Determined Defense; advance 4 or 2', () => {
    const s = setup('German');
    place(s, 'US-142', C); // 4-4-3, two steps
    place(s, 'US-1-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N));
    for (const id of ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15']) place(s, id, go(C, NW));
    for (const id of ['GE-I67', 'GE-II67', 'GE-I9', 'GE-II9']) place(s, id, go(C, NE));
    s.units['US-142'].stepsLost = 1; // 1-3-3
    s.units['US-1-142'].where = { kind: 'removed', reason: 'test' }; // 10 + 4 + 4 = 18 to 3 = 6-1, +1 tank = 7-1
    dice(s, 4); // 7-1, roll 4 = DS
    const all = ['GE-129', 'GE-III115', 'GE-215', 'GE-I71', 'GE-I15', 'GE-II15', 'GE-III15', 'GE-I67', 'GE-II67', 'GE-I9', 'GE-II9'];
    attack(s, { target: C, attackers: all, maf: '15 PG' });
    expect(last(s).result).toBe('DS Adv 4');
    expect(gone(s, 'US-142')).toBe(true);
    expect(s.pendingDefense).toBeNull();
    expect(s.pendingAdvance!.maxByUnit).toMatchObject({ 'GE-129': 4, 'GE-215': 4, 'GE-I71': 4 });
    // A survivor: a two-unit stack loses one step and the rest go 4 hexes in Full Retreat.
    const t = setup('German');
    place(t, 'US-1-142', C);
    place(t, 'US-36Art', C); // parenthesized: does not defend with a unit present
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(t, id, go(C, N));
    place(t, 'GE-III1FJ', go(C, NW)); // foot: advance 2
    dice(t, 6); // 11 to 2 = 5-1, +1 = 6-1, roll 6 = DS
    attack(t, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', 'GE-III1FJ'], maf: '15 PG' });
    expect(last(t).result).toBe('DS Adv 4');
    expect(gone(t, 'US-1-142')).toBe(true);
    expect(t.units['US-36Art'].status).toBe('fullRetreat');
    expect(distance(hexOf(t, 'US-36Art')!, C)).toBe(4);
    expect(t.pendingAdvance!.maxByUnit).toEqual({ 'GE-129': 4, 'GE-III115': 4, 'GE-215': 4, 'GE-III1FJ': 2 });
  });
});

// ------------------------------------------------------------------ 10.2-10.4 step losses

describe('step losses and remnants', () => {
  it('[10.2.1] the owner picks his own loss (D1); on EX, DRX and DS the opposing player picks', () => {
    // US-142 (4-4-3 flipping to 1-3-3) is the cheaper step to lose; the 2-2-3 battalion the dearer.
    const run = (roll: number, extra: string[]) => {
      const s = setup('German');
      place(s, 'US-142', C);
      place(s, 'US-1-142', C); // 6 defense
      for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N)); // 10, +1 tank shift
      extra.forEach((id) => place(s, id, go(C, NW)));
      dice(s, roll);
      attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', ...extra], maf: '15 PG' });
      return s;
    };
    const d1 = run(6, ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15']); // 14 to 6 = 3-1 with the shift: D1
    expect(last(d1).result).toBe('D1 Adv 3');
    expect([d1.units['US-142'].stepsLost, gone(d1, 'US-1-142')]).toEqual([1, false]);
    const drx = run(3, ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15', 'GE-I67', 'GE-II67', 'GE-I9', 'GE-II9']); // 18 to 6 = 4-1: DRX
    expect(last(drx).result).toBe('DRX Adv 2');
    expect([drx.units['US-142'].stepsLost, gone(drx, 'US-1-142')]).toEqual([0, true]);
  });

  it('[10.2.2] attacker losses come from the MAF; the defender\'s first from units that added strength; the defender loses first', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    place(s, 'GE-129', go(C, N)); // MAF (15 PG)
    place(s, 'GE-I71', go(C, NE)); // 29 PG: half, not in the MAF; the cheaper step
    dice(s, 1); // 7 to 4 = 1-1, roll 1 = A1
    attack(s, { target: C, attackers: ['GE-129', 'GE-I71'], maf: '15 PG' });
    expect([s.units['GE-129'].stepsLost, s.units['GE-I71'].stepsLost]).toEqual([1, 0]);
    // A Full Retreat unit (no defense) and an ASU go only after the units that defended.
    const t = setup('German');
    place(t, 'US-1-142', C);
    place(t, 'US-2-141', C, { status: 'fullRetreat' });
    place(t, 'US-36Art', C);
    place(t, 'GE-129', go(C, N));
    dice(t, 1); // 6 to 2 = 3-1, roll 1 = EX
    attack(t, { target: C, attackers: ['GE-129'] });
    expect(last(t).result).toBe('EX');
    expect([gone(t, 'US-1-142'), gone(t, 'US-2-141'), gone(t, 'US-36Art')]).toEqual([true, false, false]);
    const notes = last(t).notes;
    const i = notes.findIndex((n) => n.includes('1/142'));
    const j = notes.findIndex((n) => n.includes('129'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThan(i);
  });

  it('[10.2.2] units that retreated into the hex earlier in the phase cannot be picked for a loss', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'US-2-141', C, { retreatedThisPhase: true });
    place(s, 'GE-129', go(C, N));
    dice(s, 1); // 6 to 2 (the retreated unit adds nothing) = 3-1, roll 1 = EX
    attack(s, { target: C, attackers: ['GE-129'] });
    expect(last(s).defense).toBe(2);
    expect([gone(s, 'US-1-142'), gone(s, 'US-2-141')]).toEqual([true, false]);
  });

  it('[10.3] a 1-step unit is eliminated, a 2-step unit flips then goes, a 3-step unit becomes a Remnant on its second loss', () => {
    const s = setup('German');
    const n: string[] = [];
    place(s, 'US-1-142', C);
    loseStep(s, s.units['US-1-142'], n);
    expect(gone(s, 'US-1-142')).toBe(true);
    place(s, 'US-142', C);
    loseStep(s, s.units['US-142'], n);
    expect([s.units['US-142'].stepsLost, hexOf(s, 'US-142')]).toEqual([1, C]);
    loseStep(s, s.units['US-142'], n);
    expect(gone(s, 'US-142')).toBe(true);
    place(s, 'US-179', go(C, N));
    loseStep(s, s.units['US-179'], n);
    expect(s.units['US-179'].stepsLost).toBe(1);
    loseStep(s, s.units['US-179'], n);
    expect(where(s, 'US-179').kind).toBe('remnantHeld');
  });

  it('[10.4.1] the second loss of a 3-step unit puts a Remnant of its kind on the map and the unit on the Remnant Display', () => {
    const s = setup('German');
    const n: string[] = [];
    place(s, 'US-179', C, { stepsLost: 1, status: 'disrupted' });
    place(s, 'GE-129', go(C, N), { stepsLost: 1 });
    place(s, 'BR-138', go(C, S), { stepsLost: 1 });
    for (const id of ['US-179', 'GE-129', 'BR-138']) loseStep(s, s.units[id], n);
    const remOf = (id: string) => Object.values(s.units).find((u) => u.represents === id)!;
    expect([remOf('US-179').id, hexOf(s, remOf('US-179').id), remOf('US-179').status]).toEqual(['US-REM-A', C, 'disrupted']);
    expect(remOf('GE-129').id).toBe('GE-REM129');
    expect(remOf('BR-138').id.startsWith('BR-REM-')).toBe(true);
    expect(UNIT_DEFS[remOf('BR-138').id].steps[0]).toMatchObject({ attack: 1, defense: 3 });
  });

  it('[10.4.2] with no Remnant left on the display, a 3-step unit taking its second loss is eliminated', () => {
    const s = setup('German');
    const n: string[] = [];
    for (const id of ['US-REM-A', 'US-REM-B', 'US-REM-C']) s.units[id].where = { kind: 'map', hex: go(C, S, 3) };
    place(s, 'US-179', C, { stepsLost: 1 });
    loseStep(s, s.units['US-179'], n);
    expect(where(s, 'US-179')).toEqual({ kind: 'eliminated', permanent: false });
  });

  it.fails('[10.4.2] the owner may decline a Remnant and eliminate the unit outright', () => {
    // No action or option lets a player refuse an available Remnant: loseStep always uses one.
    const s = setup('German');
    place(s, 'US-179', C, { stepsLost: 1 });
    loseStep(s, s.units['US-179'], [], false);
    expect(gone(s, 'US-179')).toBe(true);
  });

  it('[10.4.3] an eliminated Remnant sends its unit to the Eliminated Box and goes back to the display for reuse', () => {
    const s = setup('German');
    const n: string[] = [];
    place(s, 'US-179', C, { stepsLost: 1 });
    loseStep(s, s.units['US-179'], n);
    const rem = s.units['US-REM-A'];
    expect(rem.represents).toBe('US-179');
    loseStep(s, rem, n);
    expect(where(s, 'US-179')).toEqual({ kind: 'eliminated', permanent: false });
    expect([rem.where.kind, rem.represents]).toEqual(['remnantPool', undefined]);
    place(s, 'US-180', go(C, S), { stepsLost: 1 });
    loseStep(s, s.units['US-180'], n);
    expect(s.units['US-REM-A'].represents).toBe('US-180');
  });
});
