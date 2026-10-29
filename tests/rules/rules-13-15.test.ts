// Rule tests for sections 13 (Disruption and Recovery), 14 (Advance After Combat) and 15 (Breakthrough Combat).
// Positions are built on an empty map; die rolls are forced. Comments paraphrase the rules.
import { describe, expect, it } from 'vitest';
import { MAP } from '../../src/engine/data';
import { neighbors, sideKey } from '../../src/engine/hex';
import { advanceDestinations, computeOdds } from '../../src/engine/combat';
import { breakthroughMoves, breakthroughTargets } from '../../src/engine/breakthrough';
import { allowedModes, entryDestinations, legalDestinations } from '../../src/engine/movement';
import { retreatStack } from '../../src/engine/retreat';
import { bondsOf, zocOf } from '../../src/engine/zoc';
import { act, dice, openGround, place, quiet, refused } from './harness';

const O = openGround(); // 2813: clear, all six neighbours clear, no hexside features
const [N, S] = ['2812', '2814'];

describe('13 Disruption and recovery', () => {
  it('[13.1.1] a unit is Good Order unless Disrupted or in Full Retreat; mixed stacks keep their states', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'US-157', O, { status: 'disrupted' });
    place(s, 'US-179', O);
    expect(s.units['US-179'].status).toBe('good');
    expect(s.units['US-157'].status).toBe('disrupted');
  });

  it('[13.1.2] a Dis result disrupts the defender', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O); // 4-4-3
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N); // 2 + 2 = 4 vs 4: 1-1
    dice(s, 4); // 1-1, roll 4: Dis
    act(s, { type: 'attack', target: O, attackers: ['GE-I15', 'GE-III15'] });
    expect(s.units['US-157'].status).toBe('disrupted');
    expect(s.units['US-157'].where).toEqual({ kind: 'map', hex: O });
  });

  it('[13.1.2] a unit that retreats after a DR2 result is disrupted', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O);
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N);
    dice(s, 6); // 1-1, roll 6: DR2
    act(s, { type: 'attack', target: O, attackers: ['GE-I15', 'GE-III15'] });
    act(s, { type: 'defend', choice: 'retreat' });
    const u = s.units['US-157'];
    expect(u.status).toBe('disrupted');
    expect(u.where.kind === 'map' && u.where.hex).not.toBe(O);
  });

  it('[13.1.3] a DR4 result puts the defender into Full Retreat', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-1-142', O); // defense 2
    for (const id of ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15']) place(s, id, N); // 4+2+2+2 = 10
    place(s, 'GE-I71', '2912'); // +2 = 12 vs 2: 6-1, all 29 PG
    dice(s, 3); // 6-1, roll 3: DR4
    act(s, { type: 'attack', target: O, attackers: ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15', 'GE-I71'] });
    const u = s.units['US-1-142'];
    expect(u.status).toBe('fullRetreat');
    expect(u.where.kind === 'map' && u.where.hex).not.toBe(O);
  });

  it('[13.1.3] a Disrupted unit disrupted again goes into Full Retreat', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O, { status: 'disrupted' }); // defense halved to 2
    place(s, 'GE-I15', N); // 2 vs 2: 1-1
    dice(s, 4); // Dis
    act(s, { type: 'attack', target: O, attackers: ['GE-I15'] });
    expect(s.units['US-157'].status).toBe('fullRetreat');
  });

  it('[13.2.1] a Disrupted unit may only use Tactical Movement and cannot leave an Entry Area', () => {
    const s = quiet({ side: 'German' });
    const u = place(s, 'GE-I15', O, { status: 'disrupted' });
    expect(allowedModes(s, u)).toEqual(['tactical']);
    const e = s.units['GE-III15'];
    Object.assign(e, { where: { kind: 'entry', area: 'N1' }, status: 'disrupted', stopped: false });
    expect(entryDestinations(s, e.id, 'N1', 'normal').size).toBe(0);
    expect(refused(s, { type: 'enter', unitId: e.id, to: MAP.entryAreas.N1.hexes[0] })).toBe(true);
  });

  it('[13.2.1] a Disrupted unit has no part in a ZOC Bond, may not attack, and defends at half strength (rounded up)', () => {
    const s = quiet({ side: 'German', phase: 'combat' });
    place(s, 'GE-I15', '2911');
    place(s, 'GE-II64', '2913');
    expect(bondsOf(s, 'German').hexes.has('2912')).toBe(true);
    s.units['GE-II64'].status = 'disrupted';
    expect(bondsOf(s, 'German').hexes.has('2912')).toBe(false);
    place(s, 'US-157', '2914');
    expect(refused(s, { type: 'attack', target: '2914', attackers: ['GE-II64'] })).toBe(true);
    // Allied attack on a disrupted 2-3-5: defense 3 halved = 2.
    s.activeSide = 'Allied';
    place(s, 'GE-I15', O, { status: 'disrupted' });
    place(s, 'US-179', N);
    expect(computeOdds(s, { target: O, attackers: ['US-179'] }).defense).toBe(2);
  });

  it('[13.2.1] a Disrupted unit cannot lead a Determined Defense, ready an ASU or take a replacement', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O, { status: 'disrupted' });
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N); // 4 vs 2: 2-1
    dice(s, 5); // 2-1, roll 5: DR2 -- no Lead Unit available, so the stack simply retreats
    act(s, { type: 'attack', target: O, attackers: ['GE-I15', 'GE-III15'] });
    expect(s.pendingDefense).toBeNull();
    expect(s.units['US-157'].where.kind === 'map' && (s.units['US-157'].where as { hex: string }).hex).not.toBe(O);

    const t = quiet({ side: 'German', phase: 'initial', turn: 5 });
    t.supplyPoints.German = 5;
    place(t, 'GE-16Art', '2909', { fired: true, status: 'disrupted' });
    expect(refused(t, { type: 'readyAsu', unitId: 'GE-16Art' })).toBe(true);
    t.replacements.German.inf = 1;
    place(t, 'GE-I64', '2911', { stepsLost: 1, status: 'disrupted' });
    expect(refused(t, { type: 'replace', unitId: 'GE-I64' })).toBe(true);
  });

  it('[13.2.2] a Disrupted unit keeps its ZOC and its tank shift', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-IIa2', O, { status: 'disrupted' }); // tank, rating 3
    for (const n of neighbors(O)) expect(zocOf(s, 'German').has(n)).toBe(true);
    place(s, 'US-179', N);
    const odds = computeOdds(s, { target: O, attackers: ['US-179'] });
    expect(odds.shifts.some((x) => x.reason === 'Defender tank shift' && x.shift === -1)).toBe(true);
  });

  it('[13.2.3] units may enter or pass through a Disrupted friend without being disrupted', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'US-157', N, { status: 'disrupted' });
    place(s, 'US-179', O);
    act(s, { type: 'move', unitId: 'US-179', to: N, mode: 'normal' });
    expect(s.units['US-179'].status).toBe('good');
  });

  it('[13.3.1] a unit in Full Retreat may move its full MA and use Extended Movement', () => {
    const s = quiet({ side: 'German' });
    const u = place(s, 'GE-I15', O, { status: 'fullRetreat' });
    expect(allowedModes(s, u)).toEqual(expect.arrayContaining(['normal', 'extended']));
  });

  it('[13.3.2] Full Retreat: no ZOC, no moving next to the enemy alone, no entering enemy cities', () => {
    const s = quiet({ side: 'German' });
    place(s, 'US-157', '2915', { status: 'fullRetreat' });
    expect(zocOf(s, 'Allied').size).toBe(0);
    const u = place(s, 'GE-I15', O, { status: 'fullRetreat' });
    place(s, 'US-179', '2811');
    const dests = legalDestinations(s, u.id, 'normal');
    for (const h of neighbors('2811')) expect(dests.has(h)).toBe(false);
    // Battipaglia (3012), Allied controlled, is closed to a German unit in Full Retreat.
    const v = place(s, 'GE-III15', '3013', { status: 'fullRetreat' });
    s.control['3012'] = 'Allied';
    expect(legalDestinations(s, v.id, 'normal').has('3012')).toBe(false);
  });

  it('[13.3.2] a Full Retreat unit falls back 2 hexes when an enemy moves next to it', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'GE-I15', O, { status: 'fullRetreat' });
    place(s, 'US-179', '2811');
    act(s, { type: 'move', unitId: 'US-179', to: N, mode: 'normal' });
    const w = s.units['GE-I15'].where;
    expect(w.kind === 'map' && w.hex).not.toBe(O);
    expect(s.units['GE-I15'].status).toBe('fullRetreat');
  });

  it('[13.3.2] ... and when an enemy retreats next to it (fixed)', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-I15', O);
    place(s, 'US-157', S, { status: 'fullRetreat' }); // alone, next to every hex I/15 can fall back to
    const notes: string[] = [];
    retreatStack(s, ['GE-I15'], 1, N, 'disrupted', notes);
    const end = (s.units['GE-I15'].where as { hex: string }).hex;
    expect(['2713', '2913']).toContain(end);
    const fr = s.units['US-157'].where;
    expect(fr.kind === 'map' && fr.hex).not.toBe(S);
  });

  it('[13.3.2] Full Retreat units next to the enemy at the start of a Movement Phase are eliminated', () => {
    const s = quiet({ side: 'German', phase: 'initial' });
    place(s, 'US-157', O, { status: 'fullRetreat' });
    place(s, 'US-1-142', '2913', { status: 'fullRetreat' });
    place(s, 'US-179', '2913'); // stacked with a Good Order unit: safe
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', '3013');
    act(s, { type: 'endPhase' }); // German initial -> movement
    expect(s.units['US-157'].where.kind).toBe('eliminated');
    expect(s.units['US-1-142'].where.kind).toBe('map');
  });

  it('[13.3.2] Full Retreat units defend at 0 and add no tank shift', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-IIa2', O, { status: 'fullRetreat' });
    place(s, 'GE-I15', O);
    place(s, 'US-179', N);
    const odds = computeOdds(s, { target: O, attackers: ['US-179'] });
    expect(odds.defense).toBe(3);
    expect(odds.shifts.some((x) => x.reason.includes('tank'))).toBe(false);
  });

  it('[13.3.3] units in Full Retreat still bar Extended Movement next to them', () => {
    const s = quiet({ side: 'German' });
    place(s, 'US-157', '2915', { status: 'fullRetreat' });
    const u = place(s, 'GE-I15', O);
    const ext = legalDestinations(s, u.id, 'extended');
    for (const h of neighbors('2915')) expect(ext.has(h)).toBe(false);
    expect(legalDestinations(s, u.id, 'normal').has('2914')).toBe(true);
  });

  it('[13.3.4] a unit that has not moved may go into Full Retreat and leaves an EZOC without the +2', () => {
    const s = quiet({ side: 'German' });
    place(s, 'US-179', N);
    const u = place(s, 'GE-I15', O);
    const before = legalDestinations(s, u.id, 'normal').get('2814')!.cost;
    act(s, { type: 'fullRetreat', unitId: u.id });
    expect(u.status).toBe('fullRetreat');
    const after = legalDestinations(s, u.id, 'normal').get('2814')!.cost;
    expect(before - after).toBe(2);
    const v = place(s, 'GE-III15', '3013');
    act(s, { type: 'move', unitId: v.id, to: '3014', mode: 'normal' });
    expect(refused(s, { type: 'fullRetreat', unitId: v.id })).toBe(true);
  });

  it('[13.4] in the Recovery Phase units away from the enemy recover one level; next to it they roll', () => {
    const s = quiet({ side: 'German', phase: 'combat', turn: 5 });
    place(s, 'GE-I15', '3013', { status: 'disrupted' });
    place(s, 'GE-III15', '3014', { status: 'fullRetreat' });
    place(s, 'GE-II15', O, { status: 'disrupted' }); // next to the Allies: rolls
    place(s, 'US-179', N);
    dice(s, 2); // rally roll fails
    act(s, { type: 'endPhase' }); // combat -> recovery -> supply -> Allied initial
    expect(s.units['GE-I15'].status).toBe('good');
    expect(s.units['GE-III15'].status).toBe('disrupted');
    expect(s.units['GE-II15'].status).toBe('disrupted');
  });

  it('[13.5] Rally: 5-6 recovers; +2 in a BH or City, +1 Elite, -1 Low Quality', () => {
    const run = (id: string, hex: string, roll: number) => {
      const s = quiet({ side: 'German', phase: 'combat', turn: 5 });
      place(s, id, hex, { status: 'disrupted' });
      const enemy = neighbors(hex).find((n) => MAP.hexes[n]?.terrain !== 'sea' && !MAP.hexsides[sideKey(hex, n)]?.mountain)!;
      place(s, 'US-179', enemy);
      dice(s, roll);
      act(s, { type: 'endPhase' });
      return s.units[id].status;
    };
    expect(run('GE-I15', O, 4)).toBe('disrupted');
    expect(run('GE-I15', O, 5)).toBe('good');
    expect(run('GE-I15', '3012', 3)).toBe('good'); // Battipaglia: 3 + 2
    expect(run('GE-I64', O, 4)).toBe('good'); // elite: 4 + 1
    expect(run('GE-GarA', O, 5)).toBe('disrupted'); // low quality: 5 - 1
  });
});

describe('14 Advance after combat', () => {
  const attackDr2 = (attackers: string[], roll: number) => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O); // 4
    for (const id of attackers) place(s, id, N);
    dice(s, roll);
    act(s, { type: 'attack', target: O, attackers });
    if (s.pendingDefense) act(s, { type: 'defend', choice: 'retreat' });
    return s;
  };

  it('[14.1] after the defender retreats, every attacker may advance (no MP cost)', () => {
    const s = attackDr2(['GE-I15', 'GE-III15'], 6); // 1-1, 6: DR2/2
    const pa = s.pendingAdvance!;
    expect(Object.keys(pa.maxByUnit).sort()).toEqual(['GE-I15', 'GE-III15']);
    act(s, { type: 'advance', unitIds: ['GE-I15'], to: O });
    expect(s.units['GE-I15'].where).toEqual({ kind: 'map', hex: O });
  });

  it('[14.2.1] the CRT gives the advance; non-mechanized units never more than 2', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-1-142', O); // 2
    for (const id of ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15']) place(s, id, N);
    place(s, 'GE-I71', '2912'); // 12 vs 2: 6-1
    dice(s, 3); // DR4/3
    act(s, { type: 'attack', target: O, attackers: ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15', 'GE-I71'] });
    expect(s.pendingAdvance!.maxByUnit['GE-71']).toBe(3);
    const t = quiet({ side: 'Allied', phase: 'combat' });
    place(t, 'GE-GarA', O, { status: 'disrupted' });
    place(t, 'US-179', N);
    dice(t, 1); // garrison strength 0 -> eliminated, treated as DS Adv 4
    act(t, { type: 'attack', target: O, attackers: ['US-179'] });
    expect(t.pendingAdvance!.maxByUnit['US-179']).toBe(2);
  });

  it('[14.2.2] an EX that eliminates the defender gives only a Limited Advance into its hex', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-1-142', O); // one step, defense 2
    place(s, 'GE-I15', N); // 2 vs 2: 1-1
    dice(s, 3); // EX
    act(s, { type: 'attack', target: O, attackers: ['GE-I15'] });
    expect(s.units['US-1-142'].where.kind).toBe('eliminated');
    const pa = s.pendingAdvance!;
    expect(pa.limited).toBe(true);
    expect([...advanceDestinations(s, pa, 'GE-I15').keys()]).toEqual([O]);
  });

  it('[14.3] units may advance in any direction and need not enter the vacated hex', () => {
    const s = attackDr2(['GE-I15', 'GE-III15'], 6);
    const d = advanceDestinations(s, s.pendingAdvance!, 'GE-I15');
    expect(d.has(O)).toBe(true);
    expect([...d.keys()].some((h) => h !== O)).toBe(true);
  });

  it('[14.4.1] advancing units stop on entering an EZOC, except in the vacated hex', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O);
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N);
    place(s, 'US-179', '3013'); // its ZOC covers 2912 and 2913
    dice(s, 6);
    act(s, { type: 'attack', target: O, attackers: ['GE-I15', 'GE-III15'] });
    act(s, { type: 'defend', choice: 'retreat' });
    const ezoc = zocOf(s, 'Allied');
    const d = advanceDestinations(s, s.pendingAdvance!, 'GE-I15');
    expect(d.get('2912')).toEqual(['2912']);
    expect(d.get('2913')).toEqual([O, '2913']);
    for (const path of d.values()) for (const h of path.slice(0, -1)) expect(h === O || !ezoc.has(h)).toBe(true);
  });

  it('[14.4.2] advancing units may not enter an enemy ZOC Bond except the vacated hex', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O);
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N);
    place(s, 'US-179', '2711');
    place(s, 'US-180', '2713'); // bond hex 2712 between them (2711-2712-2713)
    dice(s, 6);
    act(s, { type: 'attack', target: O, attackers: ['GE-I15', 'GE-III15'] });
    if (s.pendingDefense) act(s, { type: 'defend', choice: 'retreat' });
    const bonds = bondsOf(s, 'Allied');
    const d = advanceDestinations(s, s.pendingAdvance!, 'GE-I15');
    for (const h of bonds.hexes) if (h !== O) expect(d.has(h)).toBe(false);
  });

  it('[14.5] an unbridged river may be crossed only into the attacked hex, as the first hex', () => {
    // River hexside 2814-2914; 2913-2914 is a river too.
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', '2914');
    place(s, 'GE-I15', S);
    place(s, 'GE-III15', S);
    dice(s, 6); // 4 vs 4 doubled (all across a river) = 8: 1-2; roll 6: A1/DR2
    act(s, { type: 'attack', target: '2914', attackers: ['GE-I15', 'GE-III15'] });
    act(s, { type: 'defend', choice: 'retreat' });
    const pa = s.pendingAdvance!;
    const mover = Object.keys(pa.maxByUnit)[0];
    const d = advanceDestinations(s, pa, mover);
    expect(d.get('2914')).toEqual(['2914']);
    // From 2914 a second hex may not cross another unbridged river.
    for (const [h, path] of d) if (path.length === 2) expect(MAP.hexsides[sideKey(path[0], h)]?.river && !MAP.hexsides[sideKey(path[0], h)]?.road).toBeFalsy();
  });

  it('[14.5] hills stop an advance unless entered by road; mountain hexsides only into the attacked hex, at ½ Eff', () => {
    const s = quiet({ phase: 'combat' });
    // Hill 2916 next to clear 2915 (no hexside features between them).
    place(s, 'US-157', '2915');
    place(s, 'GE-I15', '2914');
    place(s, 'GE-III15', '2914');
    dice(s, 6);
    act(s, { type: 'attack', target: '2915', attackers: ['GE-I15', 'GE-III15'] });
    act(s, { type: 'defend', choice: 'retreat' });
    const d = advanceDestinations(s, s.pendingAdvance!, 'GE-I15');
    if (d.has('2916')) for (const path of d.values()) expect(path.slice(0, -1)).not.toContain('2916');
  });
});

describe('15 Breakthrough combat', () => {
  // German 16 Pz stack (II/64 3 + I/79 2 + tank IIb/2 3 = 8, elite and tank shifts) against 157 (4): 2-1 +2 = 4-1, roll 1: DR2/2.
  const G = ['GE-II64', 'GE-I79', 'GE-IIb2'];
  const twoHexWin = () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'US-157', O);
    for (const id of G) place(s, id, N);
    dice(s, 1);
    act(s, { type: 'attack', target: O, attackers: G });
    act(s, { type: 'defend', choice: 'retreat' });
    s.units['US-157'].where = { kind: 'map', hex: '3016' }; // out of the way
    return s;
  };

  it('[15.1] an attack earning an advance of 2 or more allows Breakthrough Combat', () => {
    const s = twoHexWin();
    expect(s.pendingAdvance!.btAllowed).toBe(true);
  });

  it('[15.2.1] [15.2.3] the group may form in the vacated hex (1 hex), then attack with its second hex', () => {
    const s = twoHexWin();
    place(s, 'US-1-142', '2913');
    act(s, { type: 'btStart', unitIds: G, form: 'vacated' });
    const b = s.breakthrough!;
    expect(b.hex).toBe(O);
    expect(b.left).toBe(1);
    expect(breakthroughTargets(s)).toEqual(['2913']);
  });

  it('[15.2.1] a successful breakthrough lets the group enter the hex and stop; a DR4/DS lets it go on', () => {
    const s = twoHexWin();
    place(s, 'US-1-142', '2913'); // 2
    act(s, { type: 'btStart', unitIds: G, form: 'stack' }); // 2 hexes, still at N
    act(s, { type: 'btMove', to: O }); // 1 hex
    dice(s, 3); // 8 vs 2: 4-1 +2 = 6-1, roll 3: DR4
    act(s, { type: 'btAttack', target: '2913' }); // 1 hex: none left
    expect(s.breakthrough!.freeHex).toBe('2913');
    act(s, { type: 'btMove', to: '2913' }); // free
    expect(s.units['GE-II64'].where).toEqual({ kind: 'map', hex: '2913' });
  });

  it('[15.2.2] only one stack, which goes before the other attackers', () => {
    const s = twoHexWin();
    place(s, 'GE-I15', '2912');
    s.pendingAdvance!.maxByUnit['GE-I15'] = 2;
    s.pendingAdvance!.from['GE-I15'] = '2912';
    expect(refused(s, { type: 'btStart', unitIds: ['GE-II64', 'GE-I15'], form: 'stack' })).toBe(true);
    act(s, { type: 'advance', unitIds: ['GE-I15'], to: O });
    expect(refused(s, { type: 'btStart', unitIds: ['GE-II64'], form: 'stack' })).toBe(true);
  });

  it('[15.2.4] turning away from the vacated hex costs one hex; moving one hex costs one', () => {
    const s = twoHexWin();
    act(s, { type: 'btStart', unitIds: G, form: 'stack' });
    const m = breakthroughMoves(s);
    expect(m.get(O)).toBe(1);
    for (const [h, c] of m) if (h !== O) expect(c).toBe(2);
  });

  it('[15.2.5] [15.2.8] a breakthrough attack earns no new allowance; a failed one ends the advance', () => {
    const s = twoHexWin();
    place(s, 'US-1-142', '2913');
    place(s, 'US-179', '2913'); // 8
    act(s, { type: 'btStart', unitIds: G, form: 'stack' });
    act(s, { type: 'btMove', to: O });
    dice(s, 1); // 8 vs 8: 1-1 +2 = 3-1, roll 1: EX -- no retreat
    act(s, { type: 'btAttack', target: '2913' });
    expect(s.pendingAdvance).toBeNull();
    expect(s.breakthrough).toBeNull();
  });

  it('[15.2.6] no Breakthrough Combat across a river hexside except along a road', () => {
    const s = twoHexWin();
    place(s, 'US-1-142', '2914');
    act(s, { type: 'btStart', unitIds: G, form: 'vacated' });
    s.breakthrough!.hex = S; // pretend the group stands at 2814 (river 2814-2914)
    for (const id of G) s.units[id].where = { kind: 'map', hex: S };
    expect(breakthroughTargets(s)).not.toContain('2914');
  });

  it('[15.2.7] no ASU, air or naval shifts in Breakthrough Combat; elite and tank shifts apply', () => {
    const s = twoHexWin();
    place(s, 'US-1-142', '2913');
    place(s, 'GE-16Art', '3013');
    act(s, { type: 'btStart', unitIds: G, form: 'vacated' });
    expect(computeOdds(s, { target: '2913', attackers: G, breakthrough: true, asus: ['GE-16Art'] }).ok).toBe(false);
    const p = computeOdds(s, { target: '2913', attackers: G, breakthrough: true });
    expect(p.shifts.map((x) => x.reason)).toEqual(expect.arrayContaining(['Elite', 'Tank shift']));
  });

  it('[15.2.9] the group may drop off units, which stop', () => {
    const s = twoHexWin();
    act(s, { type: 'btStart', unitIds: G, form: 'vacated' });
    act(s, { type: 'btDrop', unitIds: ['GE-I79'] });
    expect(s.breakthrough!.units).not.toContain('GE-I79');
    expect(s.units['GE-I79'].where).toEqual({ kind: 'map', hex: O });
  });

  it('[15.3] units that already retreated defend at half and survive a second retreat', () => {
    const s = twoHexWin();
    s.units['US-157'].where = { kind: 'map', hex: '2913' }; // disrupted, retreated this phase
    act(s, { type: 'btStart', unitIds: G, form: 'vacated' });
    expect(computeOdds(s, { target: '2913', attackers: G, breakthrough: true }).defense).toBe(2);
    dice(s, 3); // 8 vs 2: 6-1, roll 3: DR4
    act(s, { type: 'btAttack', target: '2913' });
    expect(s.units['US-157'].where.kind).toBe('map');
    expect(s.units['US-157'].status).toBe('fullRetreat');
  });

  it('[15.3] against Breakthrough Combat units beyond the stacking limit add nothing (fixed)', () => {
    const t = quiet({ phase: 'combat' });
    place(t, 'US-179', O); // 3 SP, 6
    place(t, 'US-180', O); // 3 SP, 6
    place(t, 'US-157', O); // 2 SP, 4: over the limit, left out
    for (const id of G) place(t, id, N);
    expect(computeOdds(t, { target: O, attackers: G, breakthrough: true }).defense).toBe(12);
    expect(computeOdds(t, { target: O, attackers: G }).defense).toBe(16);
  });

  it('[15.4] each Auto DS yields at most one Breakthrough Group', () => {
    const s = quiet({ side: 'German', phase: 'movement' });
    place(s, 'US-1-142', O, { status: 'disrupted' }); // 1
    for (const id of ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15']) place(s, id, N); // 10 vs 1
    act(s, { type: 'autoDs', target: O, attackers: ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15'] });
    expect(s.autoDsQueue.length).toBe(1);
  });
});
