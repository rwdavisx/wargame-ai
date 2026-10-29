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

// ------------------------------------------------------------------ 11.0 Determined Defense

/** The first die roll that gives `result` on the CRT column this attack would be fought on. */
function rollFor(s: GameState, plan: AttackPlan, result: string): number {
  const o = computeOdds(s, plan);
  expect(o.ok).toBe(true);
  const r = [1, 2, 3, 4, 5, 6].find((n) => RULES.combat.crt[String(n)][o.finalIndex].split('/').slice(0, -1).join('/') === result ||
    RULES.combat.crt[String(n)][o.finalIndex] === result);
  if (!r) throw new Error(`no ${result} on column ${o.finalIndex}`);
  return r;
}

/** German `attackers` (placed north of C unless already on the map) attack C and get `result`; then the DD rolls queue. */
function ddFight(s: GameState, attackers: string[], result: string, ddRolls: number[] = []) {
  for (const id of attackers) if (s.units[id].where.kind !== 'map') place(s, id, go(C, N));
  const plan: AttackPlan = { target: C, attackers };
  dice(s, rollFor(s, plan, result), ...ddRolls);
  attack(s, plan);
  expect(s.pendingDefense).not.toBeNull();
}

describe('Determined Defense', () => {
  it('[11.1] a successful stand cancels the retreat, the disruption and the advance', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    place(s, 'US-1-142', C);
    ddFight(s, ['GE-129'], 'DR2', [6]); // 6 to 6 = 1-1; Clear column, 6 = -/1 H
    act(s, { type: 'defend', choice: 'dd', lead: 'US-142' });
    expect(last(s).dd).toMatchObject({ column: 'Clear', roll: 6, result: '-/1 H' });
    expect(s.units['US-142']).toMatchObject({ stepsLost: 1, status: 'good', where: { kind: 'map', hex: C } });
    expect(s.units['US-1-142']).toMatchObject({ status: 'good', where: { kind: 'map', hex: C } });
    expect(s.pendingAdvance).toBeNull();
  });

  it('[11.1] no Determined Defense on DR4 or DS, nor when no step survives the combat', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N));
    dice(s, 3); // 10 to 2 = 5-1, +1 tank = 6-1: DR4
    attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215'] });
    expect(last(s).result).toBe('DR4 Adv 3');
    expect(s.pendingDefense).toBeNull();
    const t = setup('German');
    place(t, 'US-1-142', C);
    place(t, 'GE-129', go(C, N));
    place(t, 'GE-III115', go(C, N));
    dice(t, 6); // 8 to 2 = 4-1, roll 6 = D1 (orange): the only step is lost
    attack(t, { target: C, attackers: ['GE-129', 'GE-III115'] });
    expect(gone(t, 'US-1-142')).toBe(true);
    expect(t.pendingDefense).toBeNull();
    expect(t.pendingAdvance).not.toBeNull();
  });

  it('[11.2.1] CRT losses come first; the defender names the Lead Unit; the hex picks the City, Clear or Other column', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    place(s, 'US-1-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N));
    for (const id of ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15']) place(s, id, go(C, NW));
    dice(s, 6, 1); // 3-1 with the tank shift: D1; then a 1 on the Clear column = -/1 (the lead loses a step)
    attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', 'GE-I71', 'GE-I15', 'GE-II15', 'GE-III15'] });
    expect(s.units['US-142'].stepsLost).toBe(1); // the D1 loss is already taken
    act(s, { type: 'defend', choice: 'dd', lead: 'US-1-142' });
    expect(gone(s, 'US-1-142')).toBe(true); // the named lead took the -/1 loss
    expect(s.units['US-142'].stepsLost).toBe(1);
    const column = (hex: Parameters<typeof setHex>[1]) => {
      const t = setup('German');
      setHex(C, hex);
      place(t, 'US-1-142', C);
      ddFight(t, ['GE-71'], 'DR2', [3]);
      act(t, { type: 'defend', choice: 'dd' });
      return last(t).dd!.column;
    };
    expect(column({ terrain: 'clear' })).toBe('Clear');
    expect(column({ terrain: 'clear', town: 'Testville' })).toBe('Other');
    expect(column({ terrain: 'hill' })).toBe('Other');
    expect(column({ terrain: 'clear', city: 'Testopoli' })).toBe('City');
  });

  it('[11.2.2] an orange CRT result gives -1 on the Determined Defense; a red one allows none, even with no way out', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N));
    place(s, 'GE-I71', go(C, NW));
    place(s, 'GE-II29', go(C, NE));
    dice(s, 6, 4); // 12 to 4 = 3-1, +1 tank = 4-1: a 6 is D1 on orange
    attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215', 'GE-I71', 'GE-II29'] });
    expect(last(s).result).toBe('D1 Adv 3');
    expect(s.pendingDefense!.yellow).toBe(true);
    act(s, { type: 'defend', choice: 'dd' });
    expect(last(s).dd!.drm).toBe(-1);
    // Red: surrounded, DR4, no stand allowed: the defender is lost.
    const t = setup('German');
    place(t, 'US-1-142', C);
    for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(t, id, go(C, N));
    ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15', 'GE-I67'].forEach((id, i) => place(t, id, neighbors(C)[i + 1]));
    dice(t, 3); // 10 to 2 = 5-1, +1 tank = 6-1: DR4 (red)
    attack(t, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-215'] });
    expect(last(t).result).toBe('DR4 Adv 3');
    expect(t.pendingDefense).toBeNull();
    expect(gone(t, 'US-1-142')).toBe(true);
  });

  it('[11.2.3] the Lead Unit must be a Good Order combat unit, not an ASU; with none there is no Determined Defense', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'US-36Art', C);
    place(s, 'US-2-141', C, { status: 'disrupted' });
    ddFight(s, ['GE-129'], 'DR2', [3]);
    expect(refused(s, { type: 'defend', choice: 'dd', lead: 'US-36Art' })).toBe(true);
    expect(refused(s, { type: 'defend', choice: 'dd', lead: 'US-2-141' })).toBe(true);
    expect(refused(s, { type: 'defend', choice: 'dd', lead: 'US-1-142' })).toBe(false);
    // Only a disrupted unit and an ASU: straight to the retreat.
    const t = setup('German');
    place(t, 'US-2-141', C, { status: 'disrupted' });
    place(t, 'US-36Art', C);
    place(t, 'GE-I71', go(C, N));
    dice(t, rollFor(t, { target: C, attackers: ['GE-I71'] }, 'DR2'));
    attack(t, { target: C, attackers: ['GE-I71'] });
    expect(t.pendingDefense).toBeNull();
    expect(hexOf(t, 'US-2-141')).not.toBe(C);
  });

  it('[11.2.4] +1 Elite lead, -1 Low Quality lead, +1 Defensive Support; at most +2 without the battleships', () => {
    const drm = (lead: string, support: boolean, patch?: () => () => void) => {
      const undo = patch?.();
      try {
        const s = setup('German');
        s.options = { defensiveAir: { Allied: 'never' } }; // keep the air marker for the stand, not the CRT shift
        place(s, lead, C);
        if (support) s.support.ready = ['US-air'];
        ddFight(s, ['GE-129'], 'DR2', [3]);
        act(s, { type: 'defend', choice: 'dd', support: support ? 'US-air' : null });
        return last(s).dd!.drm;
      } finally {
        undo?.();
      }
    };
    expect(drm('US-1-142', false)).toBe(0);
    expect(drm('US-100', false)).toBe(1); // elite
    expect(drm('US-1-142', true)).toBe(1);
    expect(drm('US-100', true)).toBe(2);
    // No counter in the game is Low Quality yet: mark one for the test.
    expect(drm('US-1-142', false, () => {
      UNIT_DEFS['US-1-142'].lowQuality = true;
      return () => { UNIT_DEFS['US-1-142'].lowQuality = false; };
    })).toBe(-1);
  });

  it('[11.3] one Ready Air, Naval or ASU of the Lead Unit\'s nationality, a division ASU only for its division; then flipped', () => {
    const s = setup('German');
    place(s, 'US-1-142', C); // 36th Division
    place(s, 'BR-5H', C);
    place(s, 'US-36Art', go(C, S, 2));
    place(s, 'US-45Art', go(C, S, 2));
    s.support.ready = ['US-air', 'BR-air'];
    ddFight(s, ['GE-71'], 'DR2', [3]);
    const opts = s.pendingDefense!.supportOptions;
    expect(opts).toEqual(expect.arrayContaining(['US-air', 'BR-air', 'US-36Art']));
    expect(opts).not.toContain('US-45Art'); // no 45th Division unit in the hex
    expect(refused(s, { type: 'defend', choice: 'dd', lead: 'US-1-142', support: 'BR-air' })).toBe(true);
    act(s, { type: 'defend', choice: 'dd', lead: 'US-1-142', support: 'US-36Art' });
    expect(last(s).dd!.drm).toBe(1);
    expect(s.units['US-36Art'].fired).toBe(true);
    expect(s.support.ready).toEqual(['US-air', 'BR-air']);
    const t = setup('German');
    place(t, 'US-1-142', C);
    t.support.ready = ['US-air'];
    ddFight(t, ['GE-71'], 'DR2', [3]);
    act(t, { type: 'defend', choice: 'dd', support: 'US-air' });
    expect(t.support.ready).toEqual([]);
  });

  it('[11.4.1] the results: -/1 and -/- fail; -/1 H holds for a step; 1*/1 H costs both, the defender picking; 1/dis H', () => {
    const run = (hex: Parameters<typeof setHex>[1], lead: string, roll: number) => {
      const s = setup('German');
      setHex(C, hex);
      place(s, lead, C);
      place(s, 'US-142', C);
      for (const id of ['GE-129', 'GE-III115', 'GE-215']) place(s, id, go(C, N)); // the 15 PG MAF
      place(s, 'GE-I71', go(C, NW));
      place(s, 'GE-II29', go(C, NE)); // 12 to 6 = 2-1 +1 tank in the clear; 12 to 12 = 1-1 on a hill
      ddFight(s, ['GE-129', 'GE-III115', 'GE-215', 'GE-I71', 'GE-II29'], 'DR2', [roll]);
      act(s, { type: 'defend', choice: 'dd', lead });
      return s;
    };
    const fail1 = run({ terrain: 'clear' }, 'US-1-142', 1); // -/1
    expect(gone(fail1, 'US-1-142')).toBe(true);
    expect(hexOf(fail1, 'US-142')).not.toBe(C);
    expect(fail1.units['US-142'].status).toBe('disrupted');
    const fail0 = run({ terrain: 'hill' }, 'US-1-142', 2); // Other 2: -/-
    expect(last(fail0).dd!.result).toBe('-/-');
    expect(hexOf(fail0, 'US-1-142')).not.toBe(C);
    const both = run({ terrain: 'clear' }, 'US-100', 6); // 6 +1 Elite = 7: 1*/1 H
    expect(last(both).dd!.result).toBe('1*/1 H');
    expect(gone(both, 'US-100')).toBe(true);
    expect(gone(both, 'GE-215')).toBe(true); // the defender takes the dearest MAF step (a one-step tank)
    expect(hexOf(both, 'US-142')).toBe(C);
    const dis = run({ terrain: 'hill' }, 'US-100', 6); // Other 7: 1/dis H
    expect(last(dis).dd!.result).toBe('1/dis H');
    expect(dis.units['US-100'].status).toBe('disrupted');
    expect(dis.units['US-142'].status).toBe('good');
    expect([dis.units['GE-III115'].stepsLost, dis.units['GE-129'].stepsLost, gone(dis, 'GE-215')]).toEqual([1, 0, false]); // his cheapest MAF step
  });

  it('[11.4.2] a lone one-step defender that dies holding gives the attacker a Limited Advance', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    ddFight(s, ['GE-71'], 'DR2', [6]); // 4 to 2 = 2-1; Clear 6 = -/1 H
    act(s, { type: 'defend', choice: 'dd' });
    expect(gone(s, 'US-1-142')).toBe(true);
    expect(s.pendingAdvance).toMatchObject({ limited: true, maxByUnit: { 'GE-71': 1 } });
  });

  it('[11.4.3] where the table offers Delay or -/1 H, the defender picks', () => {
    const run = (prefer: 'hold' | 'delay') => {
      const s = setup('German');
      place(s, 'US-142', C);
      ddFight(s, ['GE-129'], 'DR2', [5]); // Clear 5 = -/- D | -/1 H
      act(s, { type: 'defend', choice: 'dd', prefer });
      return s;
    };
    const hold = run('hold');
    expect([hexOf(hold, 'US-142'), hold.units['US-142'].stepsLost]).toEqual([C, 1]);
    const delay = run('delay');
    expect(delay.units['US-142'].stepsLost).toBe(0);
    expect(distance(hexOf(delay, 'US-142')!, C)).toBe(1);
  });

  it('[11.4.4] a failed stand means the full CRT retreat and the full advance', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    ddFight(s, ['GE-129'], 'DR2', [3]); // Clear 3 = -/-
    act(s, { type: 'defend', choice: 'dd' });
    expect(distance(hexOf(s, 'US-142')!, C)).toBe(2);
    expect(s.units['US-142'].status).toBe('disrupted');
    expect(s.pendingAdvance).toMatchObject({ limited: false, maxByUnit: { 'GE-129': 2 } });
  });
});

// ------------------------------------------------------------------ 11.5-11.6

describe('Desperate Defense, Delay and City Battles', () => {
  /** Germans in all six hexes round C: any retreat from C is fatal. */
  function surround(s: GameState) {
    const ring = [['GE-IIa2', 'GE-KGDor'], ['GE-II64', 'GE-III2'], ['GE-I64'], ['GE-I79'], ['GE-II79'], ['GE-IIb2']];
    ring.forEach((ids, i) => ids.forEach((id) => place(s, id, neighbors(C)[i])));
    return ring.flat();
  }

  it('[11.5.1] [11.5.3] the rulebook example: commandos and a brigade on a hill with no way out roll on until they hold', () => {
    // The book's D1 first costs the 5H/46 its step: the engine picks D1 losses itself, so the
    // example starts after that loss, with an A1/DR2 (no defender loss) on the same Other column.
    const s = setup('German');
    setHex(C, { terrain: 'hill' });
    place(s, 'BR-2Cdo', C);
    place(s, 'BR-138', C); // 5-7-3 brigade: 9 doubled = 18
    const all = surround(s);
    const plan: AttackPlan = { target: C, attackers: all, maf: '16 Pz' };
    expect(computeOdds(s, plan)).toMatchObject({ attack: 20, defense: 18, finalIndex: 2 });
    dice(s, rollFor(s, plan, 'A1/DR2'), 2, 3, 5);
    attack(s, plan);
    expect(s.pendingDefense!.desperate).toBe(true);
    act(s, { type: 'defend', choice: 'dd', lead: 'BR-2Cdo' });
    // 2 +1 Elite = 3: fail, the commandos go; the brigade rolls 3: fail, a step; then 5: -/1 H.
    expect(gone(s, 'BR-2Cdo')).toBe(true);
    expect(where(s, 'BR-138').kind).toBe('remnantHeld');
    const rem = Object.values(s.units).find((u) => u.represents === 'BR-138')!;
    expect(hexOf(s, rem.id)).toBe(C);
    expect(UNIT_DEFS[rem.id].steps[0]).toMatchObject({ attack: 1, defense: 3, move: 3 });
    expect(last(s).dd).toMatchObject({ roll: 5, result: '-/1 H' });
    expect(s.pendingAdvance).toBeNull();
  });

  it('[11.5.2] Desperate Defense only when a retreat would eliminate someone, or would lose a port or beachhead and its supply', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    ddFight(s, ['GE-71'], 'DR2');
    expect(s.pendingDefense!.desperate).toBe(false);
    const t = setup('German');
    place(t, 'US-1-142', C);
    surround(t);
    dice(t, rollFor(t, { target: C, attackers: ['GE-I64'] }, 'DR2'));
    attack(t, { target: C, attackers: ['GE-I64'] });
    expect(t.pendingDefense!.desperate).toBe(true);
    // A port: with it lost, the stack would be out of supply at the end of its retreat.
    const p = setup('German');
    setHex(C, { terrain: 'clear', port: { capacity: 1 } });
    place(p, 'US-1-142', C);
    ddFight(p, ['GE-71'], 'DR2');
    expect(p.pendingDefense!.desperate).toBe(true);
    // Beachhead units cannot retreat at all (MA 0), so a stack with one always qualifies.
    const b = setup('German');
    place(b, 'US-1-142', C);
    place(b, 'US-BH531R', C);
    ddFight(b, ['GE-71'], 'DR2');
    expect(b.pendingDefense!.desperate).toBe(true);
  });

  it('[11.5.4] units that can retreat must; a tank that cannot (unbridged rivers all round) fights a Desperate Defense', () => {
    const s = setup('German');
    for (const n of neighbors(C)) setSide(C, n, { river: true });
    place(s, 'US-1-142', C);
    place(s, 'US-191', C); // tank: dies crossing an unbridged river
    // Defense 4 doubled behind the river = 8; 6 + 2 + 1 (a tank across a river is halved) = 9: 1-1.
    // The German tank earns no shift across the river but cancels the defender's (9.3.3).
    ddFight(s, ['GE-129', 'GE-III115', 'GE-215'], 'DR2', [6]); // Clear 6 = -/1 H for the tank
    expect(s.pendingDefense!.desperate).toBe(true);
    act(s, { type: 'defend', choice: 'dd', lead: 'US-191' });
    expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(2);
    expect(gone(s, 'US-191')).toBe(true); // -/1 H: holds, at the cost of its only step
  });

  it('[11.6.1] Delay: back 1-3 hexes (defender\'s choice), Disrupted, and only a Limited Advance', () => {
    for (const n of [1, 3]) {
      const s = setup('German');
      setHex(C, { terrain: 'hill' });
      place(s, 'US-1-142', C);
      ddFight(s, ['GE-129'], 'DR2', [4]); // Other 4 = -/- D
      act(s, { type: 'defend', choice: 'dd', delay: n });
      expect(last(s).dd!.result).toBe('-/- D');
      expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(n);
      expect(s.units['US-1-142'].status).toBe('disrupted');
      expect(s.pendingAdvance).toMatchObject({ limited: true, maxByUnit: { 'GE-129': 1 } });
    }
  });

  it('[11.6.1] in a Desperate Defense a Delay counts as a failure, and a second Delay as -/1 H', () => {
    const s = setup('German');
    setHex(C, { terrain: 'hill' });
    place(s, 'US-142', C, { stepsLost: 0 });
    place(s, 'US-1-142', C);
    surround(s);
    const plan: AttackPlan = { target: C, attackers: ['GE-IIa2', 'GE-KGDor', 'GE-II64'] }; // 12 to 12 = 1-1
    dice(s, rollFor(s, plan, 'DR2'), 4, 4); // Other 4 = -/- D, twice
    attack(s, plan);
    expect(s.pendingDefense!.desperate).toBe(true);
    act(s, { type: 'defend', choice: 'dd', lead: 'US-142' });
    // First Delay: a step from the lead; second: hold at the cost of another.
    expect(gone(s, 'US-142')).toBe(true);
    expect(hexOf(s, 'US-1-142')).toBe(C);
    expect(s.pendingAdvance).toBeNull();
  });

  it('[11.6.2] a Partial Success in a City places a City Battle marker and holds; a second one there is a Delay', () => {
    const s = setup('German');
    setHex(C, { terrain: 'clear', city: 'Testopoli' });
    place(s, 'US-142', C);
    ddFight(s, ['GE-129', 'GE-III115', 'GE-I71'], 'DR2', [3]); // City 3 = -/- P
    act(s, { type: 'defend', choice: 'dd' });
    expect(last(s).dd!.result).toBe('-/- P');
    expect(s.cityBattle[C]).toBe(1);
    expect(hexOf(s, 'US-142')).toBe(C);
    expect(s.pendingAdvance).toBeNull();
    for (const id of ['GE-129', 'GE-III115', 'GE-I71']) s.units[id].attacked = false;
    s.combats = [];
    dice(s, rollFor(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-I71'] }, 'DR2'), 3);
    attack(s, { target: C, attackers: ['GE-129', 'GE-III115', 'GE-I71'] });
    act(s, { type: 'defend', choice: 'dd' });
    expect(distance(hexOf(s, 'US-142')!, C)).toBe(1);
    expect(s.pendingAdvance!.limited).toBe(true);
  });

  it('[11.6.3] the City Battle marker goes when the defender leaves the city or no enemy is adjacent', () => {
    const s = setup('German', { phase: 'movement' });
    setHex(C, { terrain: 'clear', city: 'Testopoli' });
    place(s, 'US-142', C);
    place(s, 'GE-129', go(C, N));
    s.cityBattle[C] = 1;
    act(s, { type: 'move', unitId: 'GE-129', to: go(C, N, 3) });
    act(s, { type: 'endPhase' });
    expect(s.cityBattle[C]).toBeUndefined();
    const t = setup('German', { phase: 'movement' });
    setHex(C, { terrain: 'clear', city: 'Testopoli' });
    place(t, 'US-142', C);
    place(t, 'GE-129', go(C, N));
    t.cityBattle[C] = 1;
    t.units['US-142'].where = { kind: 'removed', reason: 'test' };
    act(t, { type: 'endPhase' });
    expect(t.cityBattle[C]).toBeUndefined();
  });
});

// ------------------------------------------------------------------ 12.0 retreats

describe('retreats', () => {
  /** GE-71 attacks `from` from `attackerHex` for a DR2 (or `result`) and the defender falls back. */
  function pushBack(s: GameState, from: HexId, attackerHex: HexId, result = 'DR2') {
    if (s.units['GE-71'].where.kind !== 'map') place(s, 'GE-71', attackerHex);
    const plan: AttackPlan = { target: from, attackers: ['GE-71'] };
    dice(s, rollFor(s, plan, result));
    attack(s, plan);
    if (s.pendingDefense) act(s, { type: 'defend', choice: 'retreat' });
  }
  /** Disrupted German blockers (ZOCs but no ZOC Bonds) on the given hexes. */
  const BLOCKERS = ['GE-I71', 'GE-I15', 'GE-II15', 'GE-III15', 'GE-I67', 'GE-II67', 'GE-I9', 'GE-II9'];
  function block(s: GameState, hexes: HexId[]) {
    hexes.forEach((h, i) => place(s, BLOCKERS[i], h, { status: 'disrupted' }));
  }
  /** Of C's neighbours only SE stays open (N is the attacker). */
  const onlySE = () => [go(C, NE), go(C, S), go(C, SW), go(C, NW)];

  it('[12.1.1] the CRT sets the length; retreating into a friendly Entry Area fulfils it at once', () => {
    const s = setup('Allied', {}, '3702');
    place(s, 'GE-I71', '3701'); // next to 3700, a hex of the N2 Entry Area
    for (const id of ['US-179', 'US-180', 'US-157']) place(s, id, '3702'); // 16 to 3 = 5-1
    const plan: AttackPlan = { target: '3701', attackers: ['US-179', 'US-180', 'US-157'] };
    // Reaching the Entry Area counts as the whole 4-hex retreat.
    const into = retreatChoices(s, ['GE-I71'], 4, '3701').find((p) => p.intoArea === 'N2');
    expect(into!.path.length).toBeLessThan(4);
    s.options = { chooseRetreats: ['German'] };
    dice(s, rollFor(s, plan, 'DR4'));
    attack(s, plan);
    expect(last(s).result).toBe('DR4 Adv 3');
    expect(distance(hexOf(s, 'GE-I71')!, '3701')).toBe(4); // the default: the full four hexes
    act(s, { type: 'retreatChoice', index: s.retreatQueue![0].options.findIndex((o) => o.intoArea === 'N2') });
    expect(where(s, 'GE-I71')).toEqual({ kind: 'entry', area: 'N2' });
  });

  it('[12.1.2] a retreat may pass through friendly units, leaving them where they are', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    block(s, [go(C, NE), go(C, NW), go(C, SE), go(C, SW)]);
    place(s, 'US-179', go(C, S)); // the only way out
    pushBack(s, C, go(C, N));
    expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(2);
    expect(s.trails?.['US-1-142']).toContain(go(C, S));
    expect(s.units['US-179']).toMatchObject({ where: { kind: 'map', hex: go(C, S) }, status: 'good' });
  });

  it.fails('[12.1.2] the owner may split a retreating stack between different hexes', () => {
    // A stack always retreats along one path (the queue offers whole-stack destinations only).
    const s = setup('German');
    s.options = { chooseRetreats: ['Allied'] };
    place(s, 'US-1-142', C);
    place(s, 'US-2-141', C);
    pushBack(s, C, go(C, N));
    expect(s.retreatQueue!.map((q) => q.units.length)).toEqual([1, 1]);
  });

  it('[12.1.3] guideline 1 first: a retreat that is not fatal beats one that moves away', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'GE-71', go(C, N));
    // The hexes two away to the south are all in German ZOCs and their first hexes too: fatal.
    block(s, [go(go(C, S, 2), SE), go(go(C, S, 2), SW), go(C, S, 3)]);
    const plans = retreatChoices(s, ['US-1-142'], 2, C);
    expect(plans[0].lost).toEqual([]);
  });

  it('[12.1.3] guideline 2: each hex of the retreat goes farther from the combat hex', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'GE-71', go(C, N));
    const plans = retreatChoices(s, ['US-1-142'], 2, C);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) expect(p.path.map((h) => distance(h, C))).toEqual([1, 2]);
  });

  it('[12.1.3] guideline 3: after the first hex, a retreat avoids enemy ZOCs if it can', () => {
    const s = setup('German');
    place(s, 'US-142', C);
    place(s, 'GE-71', go(C, N));
    block(s, [go(C, S, 3)]); // its ZOC covers some second hexes of a 3-hex retreat south
    const plans = retreatChoices(s, ['US-142'], 3, C);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) expect(p.laterZoc).toBe(false);
    for (const p of plans) expect(p.path.slice(1).every((h) => distance(h, go(C, S, 3)) > 1)).toBe(true);
  });

  it('[12.1.3] guideline 4: a retreat ends in supply if it can', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'GE-71', go(C, N));
    const without = retreatChoices(s, ['US-1-142'], 2, C).map((p) => p.path[p.path.length - 1]);
    place(s, 'US-BH531R', go(C, S, 6)); // a beachhead: supply reaches 5 hexes overland
    const withBh = retreatChoices(s, ['US-1-142'], 2, C).map((p) => p.path[p.path.length - 1]);
    expect(withBh.length).toBeGreaterThan(0);
    expect(withBh.length).toBeLessThan(without.length);
    for (const h of withBh) expect(distance(h, go(C, S, 6))).toBeLessThanOrEqual(5);
  });

  it('[12.1.3] guideline 5: a retreat avoids mountain hexsides (without road or pass) if it can', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'GE-71', go(C, N));
    for (const n of [go(C, SE), go(C, S)]) setSide(C, n, { mountain: true });
    const plans = retreatChoices(s, ['US-1-142'], 2, C);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) expect([go(C, SE), go(C, S)]).not.toContain(p.path[0]);
    setSide(C, go(C, S), { mountain: true, pass: true }); // with a pass it is no obstacle
    expect(retreatChoices(s, ['US-1-142'], 2, C).some((p) => p.path[0] === go(C, S))).toBe(true);
  });

  it('[12.1.4] a retreat may end overstacked', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    for (const id of ['US-179', 'US-180']) place(s, id, go(C, S, 2)); // 6 stacking points already
    block(s, [go(C, NE), go(C, NW), go(C, SE), go(C, SW)]);
    // Every other 2-hex end is in a vacant EZOC: the battalion joins the full stack.
    pushBack(s, C, go(C, N));
    expect(hexOf(s, 'US-1-142')).toBe(go(C, S, 2));
  });

  it('[12.1.5] a retreat may stop early in a friendly city, or (Allies) with a Beachhead unit, and stays Disrupted', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'GE-71', go(C, N));
    setHex(go(C, S), { terrain: 'clear', city: 'Testopoli' });
    s.control[go(C, S)] = 'Allied';
    expect(retreatChoices(s, ['US-1-142'], 2, C).some((p) => p.path.length === 1 && p.path[0] === go(C, S))).toBe(true);
    s.control[go(C, S)] = 'German';
    expect(retreatChoices(s, ['US-1-142'], 2, C).some((p) => p.path.length === 1)).toBe(false);
    place(s, 'US-BH531R', go(C, SE));
    expect(retreatChoices(s, ['US-1-142'], 2, C).some((p) => p.path.length === 1 && p.path[0] === go(C, SE))).toBe(true);
    s.options = { chooseRetreats: ['Allied'] };
    pushBack(s, C, go(C, N));
    const i = s.retreatQueue![0].options.findIndex((o) => o.end === go(C, SE));
    expect(i).toBeGreaterThanOrEqual(0);
    act(s, { type: 'retreatChoice', index: i });
    expect(s.units['US-1-142']).toMatchObject({ where: { kind: 'map', hex: go(C, SE) }, status: 'disrupted' });
  });

  it('[12.2] eliminated: with nowhere to go but enemy units, into an enemy ZOC Bond, or with an MA of 0', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    block(s, neighbors(C).slice(1));
    pushBack(s, C, go(C, N));
    expect(gone(s, 'US-1-142')).toBe(true);
    // Good Order Germans at NE and S bond across SE, the only way out.
    const b = setup('German');
    place(b, 'US-1-142', C);
    place(b, 'GE-71', go(C, N));
    block(b, [go(C, SW), go(C, NW)]);
    place(b, 'GE-I67', go(C, NE));
    place(b, 'GE-II67', go(C, S));
    expect(retreatChoices(b, ['US-1-142'], 2, C)[0].lost).toEqual(['US-1-142']);
    b.units['GE-II67'].status = 'disrupted'; // no bond: SE is open
    expect(retreatChoices(b, ['US-1-142'], 2, C)[0].lost).toEqual([]);
    // A static garrison (MA 0) cannot retreat at all.
    const g = setup('Allied');
    place(g, 'GE-GarC', C);
    expect(retreatChoices(g, ['GE-GarC'], 2, C)[0].lost).toEqual(['GE-GarC']);
  });

  /** Example 2's ground: C's only exit is S (in an EZOC), and every hex beyond S is in an EZOC too. */
  function example2(s: GameState) {
    place(s, 'GE-71', go(C, N));
    block(s, [go(C, NE), go(C, NW), go(C, SW), go(C, SE), go(go(C, S, 2), SE), go(C, SW, 2)]);
    place(s, 'US-1-142', C);
  }

  it('[12.2] rulebook example 2: A dies entering two vacant EZOC hexes in a row; B survives through friendly C plus one extra hex', () => {
    const s = setup('German');
    example2(s);
    expect(retreatChoices(s, ['US-1-142'], 2, C)[0].lost).toEqual(['US-1-142']); // unit A
    // Unit B: friendly unit C stands on S; then a vacant EZOC hex, so one hex more to get out of it.
    place(s, 'US-179', go(C, S));
    const p = retreatChoices(s, ['US-1-142'], 2, C)[0];
    expect(p.lost).toEqual([]);
    expect(p.path.length).toBe(3);
    expect(p.path[0]).toBe(go(C, S));
    pushBack(s, C, go(C, N));
    expect(hexOf(s, 'US-1-142')).toBe(p.path[2]);
    expect(hexOf(s, 'US-179')).toBe(go(C, S));
  });

  it('[12.2] a retreat may end in an EZOC only where a friendly unit that has not retreated this phase stands', () => {
    const s = setup('German');
    example2(s);
    place(s, 'US-179', go(C, S));
    place(s, 'US-180', go(C, S, 2));
    const ends = (x: GameState) => retreatChoices(x, ['US-1-142'], 2, C).filter((p) => !p.lost.length).map((p) => p.path);
    expect(ends(s)).toContainEqual([go(C, S), go(C, S, 2)]);
    s.units['US-180'].retreatedThisPhase = true;
    expect(ends(s)).not.toContainEqual([go(C, S), go(C, S, 2)]);
  });

  it('[12.3.1] a vehicle retreating across an unbridged river is eliminated; a bridge, or a foot unit, is fine', () => {
    const run = (id: string, side: Parameters<typeof setSide>[2]) => {
      const s = setup('German');
      place(s, id, C);
      block(s, onlySE());
      setSide(C, go(C, SE), side);
      pushBack(s, C, go(C, N));
      return s.units[id].where.kind;
    };
    expect(run('US-191', { river: true })).toBe('eliminated');
    expect(run('US-191', { river: true, road: 'minor' })).toBe('map');
    expect(run('US-1-142', { river: true })).toBe('map');
  });

  it('[12.3.2] mountain hexsides: vehicles die crossing one without road or pass, others get 1/2 Eff, two crossings kill anyone', () => {
    const run = (id: string, side: Parameters<typeof setSide>[2], second = false) => {
      const s = setup('German');
      place(s, id, C);
      block(s, onlySE());
      setSide(C, go(C, SE), side);
      if (second) for (const n of neighbors(go(C, SE))) if (n !== C) setSide(go(C, SE), n, { mountain: true });
      pushBack(s, C, go(C, N));
      return s.units[id];
    };
    expect(run('US-191', { mountain: true }).where.kind).toBe('eliminated');
    expect(run('US-191', { mountain: true, pass: true })).toMatchObject({ where: { kind: 'map' }, halfEff: false });
    expect(run('US-1-142', { mountain: true })).toMatchObject({ where: { kind: 'map' }, halfEff: true });
    expect(run('US-1-142', { mountain: true }, true).where.kind).toBe('eliminated');
  });

  it('[12.4] a defender eliminated by its retreat still gives the full advance', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    block(s, neighbors(C).slice(1));
    pushBack(s, C, go(C, N));
    expect(gone(s, 'US-1-142')).toBe(true);
    expect(s.pendingAdvance).toMatchObject({ limited: false, maxByUnit: { 'GE-71': 2 } });
  });

  it('[12.5] units that retreated into a hex add no defense, cannot lead, and die if that hex must retreat again', () => {
    const s = setup('German');
    place(s, 'US-1-142', C);
    place(s, 'US-100', C, { retreatedThisPhase: true }); // elite, but not eligible to lead
    place(s, 'GE-71', go(C, N));
    expect(computeOdds(s, { target: C, attackers: ['GE-71'] }).defense).toBe(2);
    dice(s, rollFor(s, { target: C, attackers: ['GE-71'] }, 'DR2'), 3);
    attack(s, { target: C, attackers: ['GE-71'] });
    expect(refused(s, { type: 'defend', choice: 'dd', lead: 'US-100' })).toBe(true);
    act(s, { type: 'defend', choice: 'dd' });
    expect(last(s).dd!.drm).toBe(0); // 1/142 led: no Elite bonus
    expect(gone(s, 'US-100')).toBe(true); // the stand failed and the stack retreated: the twice-retreated unit is lost
    expect(distance(hexOf(s, 'US-1-142')!, C)).toBe(2);
  });
});
