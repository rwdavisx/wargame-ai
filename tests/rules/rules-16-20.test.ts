// Rule tests for sections 16 (Supply and Isolation), 17 (Artillery Support Units), 18 (Beachheads, Ports and
// Naval Transport), 19 (Special Units) and 20 (Replacements). Comments paraphrase the rules.
import { describe, expect, it } from 'vitest';
import { MAP, RULES, UNIT_DEFS } from '../../src/engine/data';
import { distance, neighbors } from '../../src/engine/hex';
import { computeOdds, readyAsusFor } from '../../src/engine/combat';
import { landingCapacity, landingHexes, lpCost, navalDestinations, vpBreakdown } from '../../src/engine/game';
import { allowedModes, cannotMove, legalDestinations } from '../../src/engine/movement';
import { losTo, supplyChecker, supplySources, usablePorts } from '../../src/engine/supply';
import { stackPoints } from '../../src/engine/units';
import { bondsOf, zocOf } from '../../src/engine/zoc';
import type { GameState } from '../../src/engine/types';
import { act, dice, openGround, place, quiet, refused } from './harness';

const O = openGround(); // 2813
const N = '2812';
const reserve = (s: GameState, ...ids: string[]) => { for (const id of ids) Object.assign(s.units[id], { where: { kind: 'reserve' }, stopped: false, status: 'good' }); };
/** Allied movement phase entered properly (landing points, ports at start). */
const alliedMovement = (turn = 3, setup?: (s: GameState) => void) => {
  const s = quiet({ side: 'Allied', phase: 'initial', turn });
  setup?.(s);
  act(s, { type: 'endPhase' });
  expect(s.phase).toBe('movement');
  return s;
};

describe('16 Supply and isolation', () => {
  // Column 25: 2520..2525 is a straight run of roadless, mountain-free hexes; 2525 has no road.
  it('[16.1] the Supply Phase marks units out of supply and clears the marker when supply returns', () => {
    const s = quiet({ side: 'Allied', phase: 'recovery', turn: 2 });
    place(s, 'US-BH531B', '2525');
    place(s, 'US-179', '2520');
    place(s, 'US-180', '2519', { outOfSupply: false });
    place(s, 'US-157', '2521', { outOfSupply: true });
    act(s, { type: 'endPhase' }); // recovery -> supply -> victory -> turn 3
    expect(s.units['US-179'].outOfSupply).toBe(false);
    expect(s.units['US-180'].outOfSupply).toBe(true);
    expect(s.units['US-157'].outOfSupply).toBe(false);
  });

  it('[16.2.1] German supply comes from N1/N2 and any South or East Entry Area still friendly', () => {
    const s = quiet();
    const src = new Set(supplySources(s, 'German'));
    for (const h of [...MAP.entryAreas.N1.hexes, ...MAP.entryAreas.S1.hexes, ...MAP.entryAreas.E3.hexes]) if (MAP.hexes[h].terrain !== 'sea') expect(src.has(h)).toBe(true);
    s.control.S1 = 'Allied';
    expect(supplySources(s, 'German').some((h) => MAP.entryAreas.S1.hexes.includes(h))).toBe(false);
  });

  it('[16.2.2] Allied supply: beachheads, ports (garrisoned or free of EZOC), south edge from turn 11, captured east areas', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'BR-BH21', '2712');
    s.control['2306'] = 'Allied'; // Amalfi
    s.control['1803'] = 'Allied'; // Sorrento: mined, never
    expect(supplySources(s, 'Allied')).toEqual(expect.arrayContaining(['2712', '2306']));
    expect(supplySources(s, 'Allied')).not.toContain('1803');
    place(s, 'GE-I15', '2305'); // EZOC on Amalfi
    expect(supplySources(s, 'Allied')).not.toContain('2306');
    place(s, 'US-1Rgr', '2306');
    expect(supplySources(s, 'Allied')).toContain('2306');
    expect(supplySources(s, 'Allied').some((h) => MAP.entryAreas.S2.hexes.includes(h))).toBe(false);
    s.control.S2 = 'Allied';
    s.control.E4 = 'Allied';
    expect(supplySources(s, 'Allied')).toEqual(expect.arrayContaining([MAP.entryAreas.S2.hexes[0], MAP.entryAreas.E4.hexes[0]]));
  });

  it('[16.3.1] [16.3.3] a short overland leg then a road of any length reaches the source', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'US-BH531B', '2617');
    expect(distance('3011', '2617')).toBeGreaterThanOrEqual(8);
    expect(supplyChecker(s, 'Allied').inSupply('3011')).toBe(true); // 8 road hexes from Blue beach
  });

  it('[16.3.2] the overland portion is at most five hexes', () => {
    const s = quiet({ side: 'Allied' });
    expect(losTo(s, 'Allied', '2520', ['2525'])).toBe(true);
    expect(losTo(s, 'Allied', '2519', ['2525'])).toBe(false);
  });

  it('[16.3.2] ... and may not enter an enemy unit, two EZOC hexes in a row, or an enemy ZOC Bond', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'GE-I15', '2523');
    expect(losTo(s, 'Allied', '2520', ['2525'])).toBe(false);
    s.units['GE-I15'].where = { kind: 'map', hex: '2622' }; // ZOC on 2521 and 2522 in a row
    expect(losTo(s, 'Allied', '2520', ['2525'])).toBe(false);
    place(s, 'US-157', '2522'); // a friendly unit negates the EZOC in its hex
    expect(losTo(s, 'Allied', '2520', ['2525'])).toBe(true);
    // Hexside bond 2522-2523 between German units at 2423 and 2623.
    s.units['GE-I15'].where = { kind: 'map', hex: '2423' };
    place(s, 'GE-III15', '2623');
    expect(bondsOf(s, 'German').sides.has('2522-2523')).toBe(true);
    expect(losTo(s, 'Allied', '2520', ['2525'])).toBe(false);
  });

  it('[16.3.2] ... and may not cross a mountain hexside without road or pass', () => {
    const s = quiet({ side: 'Allied' });
    expect(MAP.hexsides['1604-1704'].mountain).toBe(true);
    expect(losTo(s, 'Allied', '1604', ['1704'])).toBe(false);
  });

  it('[16.3.4] a line of supply may not pass a vacant enemy-controlled port, city or VP hex', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'BR-BH21', '2712');
    s.control['2607'] = 'Allied'; // Vietri
    expect(supplyChecker(s, 'Allied').inSupply('2507')).toBe(true);
    s.control['2607'] = 'German';
    expect(supplyChecker(s, 'Allied').inSupply('2507')).toBe(false);
  });

  it('[16.4] out of supply: mechanized units tactical only, attack halved, advance at most 2, no ASU flip or replacement', () => {
    const s = quiet({ side: 'German' });
    const pg = place(s, 'GE-I15', O, { outOfSupply: true });
    expect(allowedModes(s, pg)).toEqual(['tactical']);
    const fj = place(s, 'GE-I3FJ', '2913', { outOfSupply: true });
    expect(allowedModes(s, fj)).toContain('normal');
    s.phase = 'combat';
    place(s, 'US-1-142', '2914');
    place(s, 'GE-71', '2915', { outOfSupply: true }); // 4 -> 2
    expect(computeOdds(s, { target: '2914', attackers: ['GE-71'] }).attack).toBe(2);
    // Advance limit: a 6-1 DR4/3 advance for an out-of-supply PG unit is cut to 2.
    const t = quiet({ phase: 'combat' });
    place(t, 'US-1-142', O);
    for (const id of ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15']) place(t, id, N);
    place(t, 'GE-I71', '2912', { outOfSupply: true }); // 1 + 10 = 11 vs 2: 5-1 ... use 6-1 roll table
    dice(t, 2); // 5-1, roll 2: DRX/2y -> Determined Defense offered
    act(t, { type: 'attack', target: O, attackers: ['GE-71', 'GE-I15', 'GE-III15', 'GE-II15', 'GE-I71'] });
    if (t.pendingDefense) act(t, { type: 'defend', choice: 'retreat' });
    if (t.pendingAdvance) expect(t.pendingAdvance.maxByUnit['GE-I71'] ?? 0).toBeLessThanOrEqual(2);
    // ASU flip and replacement need supply at that instant.
    const u = quiet({ side: 'German', phase: 'initial', turn: 5 });
    u.supplyPoints.German = 3;
    place(u, 'GE-16Art', '3106', { fired: true }); // mountain-locked: no German line of supply
    expect(refused(u, { type: 'readyAsu', unitId: 'GE-16Art' })).toBe(true);
    u.replacements.German.inf = 1;
    place(u, 'GE-I64', '3107', { stepsLost: 1 });
    expect(supplyChecker(u, 'German').inSupply('3107')).toBe(false);
    expect(refused(u, { type: 'replace', unitId: 'GE-I64' })).toBe(true);
  });

  it('[16.5.1] isolation: a Line of Communication has unlimited overland length and may cross one adjacent mountain hexside', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'US-BH531B', '1704');
    const sc = supplyChecker(s, 'Allied');
    expect(sc.inSupply('1604')).toBe(false);
    expect(sc.hasLoc('1604')).toBe(true);
    const t = quiet({ side: 'Allied' });
    place(t, 'US-BH531B', '2525');
    expect(supplyChecker(t, 'Allied').hasLoc('2519')).toBe(true);
  });

  // An Allied unit with no source anywhere is isolated; a German unit next to it triggers attrition.
  const isolatedTurn = (roll: number, opts: { weather?: number; extra?: (s: GameState) => void; unit?: string; since?: number } = {}) => {
    const s = quiet({ side: 'Allied', phase: 'recovery', turn: 2, weather: opts.weather ?? 5 });
    const id = opts.unit ?? 'US-179';
    place(s, id, O, { isolated: true, outOfSupply: true, isolatedSince: opts.since ?? 1 });
    place(s, 'GE-I15', N);
    opts.extra?.(s);
    dice(s, roll);
    act(s, { type: 'endPhase' });
    return s;
  };

  it('[16.5.2] isolated units next to the enemy roll for attrition, but not on the turn they become isolated', () => {
    expect(isolatedTurn(1).units['US-179'].stepsLost).toBe(1);
    expect(isolatedTurn(1, { since: 2 }).units['US-179'].stepsLost).toBe(0); // the marker is new this turn
    const far = isolatedTurn(1, { extra: (s) => { s.units['GE-I15'].where = { kind: 'removed', reason: 'test' }; } });
    expect(far.units['US-179'].stepsLost).toBe(0);
  });

  it('[16.5.2] an isolated ASU that cannot reach a non-ASU friend is eliminated', () => {
    const s = quiet({ side: 'Allied', phase: 'recovery', turn: 2 });
    place(s, 'US-36Art', O);
    act(s, { type: 'endPhase' });
    expect(s.units['US-36Art'].where.kind).toBe('eliminated');
    const t = quiet({ side: 'Allied', phase: 'recovery', turn: 2 });
    place(t, 'US-36Art', O);
    place(t, 'US-157', O);
    act(t, { type: 'endPhase' });
    expect(t.units['US-36Art'].where.kind).toBe('map');
  });

  it('[16.5.3] Isolation Attrition Table: 1-4 a step, 5-6 no effect', () => {
    expect(isolatedTurn(4).units['US-179'].stepsLost).toBe(1);
    expect(isolatedTurn(5).units['US-179'].stepsLost).toBe(0);
  });

  it('[16.5.4] each isolated unit rolls; a unit can lose its last step', () => {
    const s = isolatedTurn(1, { unit: 'US-1-142' });
    expect(s.units['US-1-142'].where.kind).toBe('eliminated');
  });

  it('[16.5.5] +2 with a line of supply to a friendly city or corps ASU; +1 for the Allies in clear weather', () => {
    expect(isolatedTurn(3).units['US-179'].stepsLost).toBe(1);
    const corps = isolatedTurn(3, { extra: (s) => place(s, 'US-VIArt', '2814') });
    expect(corps.units['US-179'].stepsLost).toBe(0); // 3 + 2 = 5
    expect(isolatedTurn(4, { weather: 0 }).units['US-179'].stepsLost).toBe(0); // clear: 4 + 1 = 5
  });

  it('[16.5.6] units destroyed by isolation are gone for good, yet still count for VPs', () => {
    const t = isolatedTurn(1, { unit: 'US-1-142' });
    const w = t.units['US-1-142'].where;
    expect(w.kind === 'eliminated' && w.permanent).toBe(true);
    t.phase = 'initial';
    t.activeSide = 'Allied';
    t.replacements.US.inf = 1;
    expect(refused(t, { type: 'replace', unitId: 'US-1-142' })).toBe(true);
    // An Allied ASU lost this way still costs a VP.
    t.units['US-36Art'].where = { kind: 'eliminated', permanent: true };
    expect(vpBreakdown(t).parts.some((p) => p.includes('36 Div'))).toBe(true);
  });
});

describe('17 Artillery support units', () => {
  const allied = () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-I15', O);
    place(s, 'US-142', N); // 36 Div, 4 vs 3: 1-1
    return s;
  };

  it('[17.1] an ASU gives a column shift and is flipped to its Fired side', () => {
    const s = allied();
    place(s, 'US-36Art', '2811');
    const o = computeOdds(s, { target: O, attackers: ['US-142'], asus: ['US-36Art'] });
    expect(o.finalIndex - computeOdds(s, { target: O, attackers: ['US-142'] }).finalIndex).toBe(1);
    dice(s, 1);
    act(s, { type: 'attack', target: O, attackers: ['US-142'], asus: ['US-36Art'] });
    expect(s.units['US-36Art'].fired).toBe(true);
  });

  it('[17.2] ASUs: no stacking value, one step, a ZOC but no bond, never a Lead Unit, cannot attack', () => {
    const s = quiet({ side: 'German', phase: 'combat' });
    expect(stackPoints(['GE-16Art', 'GE-14Pz', 'GE-29Art'])).toBe(0);
    expect(['GE-16Art', 'GE-14Pz', 'US-VIArt'].map((id) => UNIT_DEFS[id].steps.length)).toEqual([1, 1, 1]);
    place(s, 'GE-16Art', '2911');
    place(s, 'GE-14Pz', '2913');
    expect(zocOf(s, 'German').has('2912')).toBe(true);
    expect(bondsOf(s, 'German').hexes.has('2912')).toBe(false);
    place(s, 'US-157', '2914');
    expect(refused(s, { type: 'attack', target: '2914', attackers: ['GE-14Pz'] })).toBe(true);
    // An ASU alone cannot lead a Determined Defense: the DR2 is simply carried out.
    const t = quiet({ side: 'Allied', phase: 'combat' });
    place(t, 'GE-16Art', O);
    place(t, 'US-1-142', N); // 2 vs 1
    dice(t, 5); // 2-1, 5: DR2
    act(t, { type: 'attack', target: O, attackers: ['US-1-142'] });
    expect(t.pendingDefense).toBeNull();
  });

  it('[17.3] an ASU that moves more than one hex is disrupted', () => {
    const s = quiet({ side: 'German' });
    place(s, 'GE-16Art', O);
    place(s, 'GE-29Art', '2913');
    act(s, { type: 'move', unitId: 'GE-16Art', to: '2911', mode: 'normal' });
    act(s, { type: 'move', unitId: 'GE-29Art', to: '3013', mode: 'normal' });
    expect(s.units['GE-16Art'].status).toBe('disrupted');
    expect(s.units['GE-29Art'].status).toBe('good');
  });

  it('[17.4] an ASU must be within its printed range of the defender', () => {
    const s = allied();
    const far = Object.keys(MAP.hexes).find((h) => MAP.hexes[h].terrain !== 'sea' && distance(h, O) === 5)!;
    place(s, 'US-36Art', far); // range 4
    expect(computeOdds(s, { target: O, attackers: ['US-142'], asus: ['US-36Art'] }).ok).toBe(false);
    place(s, 'US-VIArt', far); // range 5
    expect(computeOdds(s, { target: O, attackers: ['US-142'], asus: ['US-VIArt'] }).ok).toBe(true);
  });

  it('[17.5] a Fired ASU is readied for one Supply Point in the Initial Phase if in Good Order and in supply', () => {
    const s = quiet({ side: 'German', phase: 'initial', turn: 5 });
    s.supplyPoints.German = 2;
    place(s, 'GE-16Art', '2501', { fired: true }); // next to N1
    act(s, { type: 'readyAsu', unitId: 'GE-16Art' });
    expect(s.units['GE-16Art'].fired).toBe(false);
    expect(s.supplyPoints.German).toBe(1);
  });

  it('[17.6.1] a division and a corps ASU together give two shifts', () => {
    const s = allied();
    place(s, 'US-36Art', '2811');
    place(s, 'US-VIArt', '2811');
    const base = computeOdds(s, { target: O, attackers: ['US-142'] }).finalIndex;
    expect(computeOdds(s, { target: O, attackers: ['US-142'], asus: ['US-36Art', 'US-VIArt'] }).finalIndex).toBe(base + 2);
  });

  it('[17.6.2] one ASU may add +1 to a Determined Defense roll', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-I15', O);
    place(s, 'GE-14Pz', '2913');
    place(s, 'US-179', N); // 6 vs 3: 2-1
    dice(s, 5, 4); // DR2; DD roll 4 +1 = 5 on the Clear column
    act(s, { type: 'attack', target: O, attackers: ['US-179'] });
    expect(s.pendingDefense!.supportOptions).toContain('GE-14Pz');
    act(s, { type: 'defend', choice: 'dd', support: 'GE-14Pz' });
    expect(s.combats[0].dd!.drm).toBe(1);
    expect(s.units['GE-14Pz'].fired).toBe(true);
  });

  it('[17.6.3] support needs a ready, Good Order, non-½ Eff ASU; division ASUs only for their own division', () => {
    const s = allied();
    place(s, 'US-45Art', '2811');
    expect(readyAsusFor(s, 'Allied', O, ['US-142']).map((u) => u.id)).not.toContain('US-45Art');
    place(s, 'US-36Art', '2811', { halfEff: true });
    expect(readyAsusFor(s, 'Allied', O, ['US-142']).map((u) => u.id)).not.toContain('US-36Art');
    place(s, 'BR-XArt', '2811'); // a British corps ASU cannot support US units
    expect(readyAsusFor(s, 'Allied', O, ['US-142']).map((u) => u.id)).not.toContain('BR-XArt');
    place(s, 'US-VIArt', '2911');
    expect(readyAsusFor(s, 'Allied', O, ['US-142']).map((u) => u.id)).toContain('US-VIArt');
  });

  it('[17.7] an ASU defends only when alone in its hex, and then only one ASU counts', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-16Art', O);
    place(s, 'GE-29Art', O);
    place(s, 'US-179', N);
    expect(computeOdds(s, { target: O, attackers: ['US-179'] }).defense).toBe(1);
    place(s, 'GE-I15', O);
    expect(computeOdds(s, { target: O, attackers: ['US-179'] }).defense).toBe(3);
  });
});

describe('18 Beachheads, ports and naval transport', () => {
  it('[18.1.1] beachhead units never move and have no stacking value', () => {
    const s = quiet({ side: 'Allied' });
    const bh = place(s, 'BR-BH21', '2712');
    expect(cannotMove(s, bh)).toBeTruthy();
    expect(stackPoints(['BR-BH21', 'US-179', 'US-157', 'US-1-142'])).toBe(6);
  });

  it('[18.1.2] each beachhead is a supply source for all Allied units', () => {
    const s = quiet({ side: 'Allied' });
    place(s, 'US-BH531B', '2617');
    expect(supplySources(s, 'Allied')).toContain('2617');
    expect(supplyChecker(s, 'Allied').inSupply('2715')).toBe(true);
  });

  it('[18.1.3] a beachhead ignores Dis, is lost to a step loss or a retreat, may lead a Determined Defense, and is not replaced', () => {
    const run = (roll: number) => {
      const s = quiet({ phase: 'combat' });
      place(s, 'BR-BH21', '2712');
      place(s, 'GE-IIa2', O); // 5 vs 2: 2-1 +tank = 3-1
      dice(s, roll);
      act(s, { type: 'attack', target: '2712', attackers: ['GE-IIa2'] });
      return s;
    };
    expect(run(2).units['BR-BH21'].status).toBe('good'); // 3-1, 2: Dis
    const dr = run(3); // DR2: the BH may lead a Determined Defense
    expect(dr.pendingDefense).not.toBeNull();
    act(dr, { type: 'defend', choice: 'retreat' });
    expect(dr.units['BR-BH21'].where.kind).toBe('eliminated');
    expect(run(1).units['BR-BH21'].where.kind).toBe('eliminated'); // EX: a step loss
    const t = quiet({ side: 'Allied', phase: 'initial', turn: 5 });
    t.units['BR-BH21'].where = { kind: 'eliminated' };
    t.replacements.BR = { inf: 1, armor: 1, special: 1 };
    expect(refused(t, { type: 'replace', unitId: 'BR-BH21' })).toBe(true);
  });

  it('[18.1.4] example: a beachhead adds half the strength of a neighbour that also faces the attacker (5 to 4 + tank = 2-1)', () => {
    const s = quiet({ phase: 'combat' });
    place(s, 'BR-BH21', '2712');
    place(s, 'GE-IIa2', O); // tank 5
    place(s, 'US-157', '2713'); // unit A: next to the BH and to the attacker, defense 4 -> +2
    place(s, 'US-1-142', '2711'); // unit B: next to the BH only
    const o = computeOdds(s, { target: '2712', attackers: ['GE-IIa2'] });
    expect(o.defense).toBe(4);
    expect(o.bhSupporters).toEqual(['US-157']);
    expect(RULES.combat.columns[o.finalIndex]).toBe('2-1');
    dice(s, 1); // 2-1, roll 1: A1 -- nothing happens to unit A either way
    act(s, { type: 'attack', target: '2712', attackers: ['GE-IIa2'] });
    expect(s.units['US-157'].stepsLost).toBe(0);
  });

  it('[18.2.1] an Allied port acts like a beachhead if it was friendly at the start of the Movement Phase', () => {
    const s = alliedMovement(3, (x) => { x.control['2306'] = 'Allied'; reserve(x, 'US-1-142'); });
    expect(landingHexes(s, 'US-1-142')).toContain('2306');
    s.control['2407'] = 'Allied'; // taken during the phase: not usable yet
    expect(landingHexes(s, 'US-1-142')).not.toContain('2407');
  });

  it('[18.2.2] Sorrento and Torre Annunziata may not be used at all', () => {
    const s = quiet({ side: 'Allied' });
    s.control['1803'] = 'Allied';
    s.control['2202'] = 'Allied';
    expect(usablePorts(s)).not.toContain('1803');
    expect(usablePorts(s)).not.toContain('2202');
  });

  it('[18.3] the Floating Reserve holds any number of Allied units waiting to land', () => {
    const t = quiet({ side: 'German', phase: 'supply', turn: 2, keepUnits: true });
    act(t, { type: 'endPhase' }); // Allied initial of turn 2: the Floating Reserve fills
    expect(Object.values(t.units).filter((u) => u.where.kind === 'reserve').length).toBe(12);
  });

  it('[18.4.1] only the Allies use naval transport, and only in their Movement Phase', () => {
    const s = alliedMovement(3, (x) => { place(x, 'BR-BH21', '2712'); reserve(x, 'US-1-142'); });
    expect(landingHexes(s, 'US-1-142')).toContain('2712');
    s.phase = 'combat';
    expect(landingHexes(s, 'US-1-142')).toEqual([]);
    const g = quiet({ side: 'German' });
    place(g, 'GE-I15', '2712');
    expect(refused(g, { type: 'naval', unitId: 'GE-I15', to: 'reserve' })).toBe(true);
  });

  it('[18.4.2] landing costs the first tactical hex and gives ½ Eff (Rangers/Commandos exempt); the other nation\'s beach disrupts', () => {
    const s = alliedMovement(3, (x) => {
      place(x, 'BR-BH21', '2712');
      place(x, 'US-BH531B', '2617');
      reserve(x, 'US-1-142', 'US-157', 'US-1Rgr');
    });
    act(s, { type: 'land', unitId: 'US-1-142', to: '2617' });
    expect(s.units['US-1-142'].halfEff).toBe(true);
    expect(legalDestinations(s, 'US-1-142', 'tactical').size).toBeGreaterThan(0);
    expect([...legalDestinations(s, 'US-1-142', 'tactical').values()].every((r) => r.hexes === 1)).toBe(true);
    act(s, { type: 'land', unitId: 'US-157', to: '2712' });
    expect(s.units['US-157'].status).toBe('disrupted');
    act(s, { type: 'land', unitId: 'US-1Rgr', to: '2617' });
    expect(s.units['US-1Rgr'].halfEff).toBe(false);
  });

  it('[18.4.2] an ASU that landed this turn supports an attack only if it has not moved since', () => {
    const s = alliedMovement(3, (x) => { place(x, 'US-BH531B', '2617'); reserve(x, 'US-36Art'); });
    act(s, { type: 'land', unitId: 'US-36Art', to: '2617' });
    act(s, { type: 'endPhase' }); // ½ Eff comes off: no enemy adjacent
    place(s, 'GE-I15', '2619');
    place(s, 'US-142', '2618');
    expect(readyAsusFor(s, 'Allied', '2619', ['US-142']).map((u) => u.id)).toContain('US-36Art');
    s.units['US-36Art'].hexesMoved = 1;
    expect(readyAsusFor(s, 'Allied', '2619', ['US-142']).map((u) => u.id)).not.toContain('US-36Art');
  });

  it('[18.4.3] 12 landing points a turn; cost by stacking points; example: tank + ASU + remnant = 3', () => {
    expect(RULES.landingPoints.perTurn).toBe(12);
    expect(lpCost('US-191') + lpCost('US-36Art') + lpCost('US-REM-A')).toBe(3);
    expect([lpCost('US-1-142'), lpCost('US-157'), lpCost('US-179')]).toEqual([1, 2, 3]);
    const s = alliedMovement(3, (x) => {
      for (const [bh, h] of [['BR-BH21', '2712'], ['BR-BH35', '2710'], ['US-BH531B', '2617'], ['US-BH531R', '2616']]) place(x, bh, h);
      reserve(x, 'US-179', 'US-180', 'BR-139', 'BR-138', 'US-157');
    });
    act(s, { type: 'land', unitId: 'US-179', to: '2617' });
    act(s, { type: 'land', unitId: 'US-180', to: '2616' });
    act(s, { type: 'land', unitId: 'BR-139', to: '2712' });
    act(s, { type: 'land', unitId: 'BR-138', to: '2710' });
    expect(s.landingPoints).toBe(0);
    expect(landingHexes(s, 'US-157')).toEqual([]);
  });

  it('[18.4.4] capacity: 3 per beachhead, the port\'s number, Salerno 1 with Germans within 2; in or out, not both; 2-turn transfers', () => {
    const s = alliedMovement(3, (x) => {
      place(x, 'BR-BH21', '2712');
      x.control['2306'] = 'Allied';
      x.control['2707'] = 'Allied';
      place(x, 'BR-128', '2707');
      reserve(x, 'US-1-142', 'US-157', 'US-179');
    });
    expect(landingCapacity(s, '2712')).toBe(3);
    expect(landingCapacity(s, '2306')).toBe(1);
    expect(landingCapacity(s, '2707')).toBe(3);
    place(s, 'GE-I15', '2809');
    expect(landingCapacity(s, '2707')).toBe(1);
    act(s, { type: 'land', unitId: 'US-157', to: '2306' }); // 2 LP into a 1-capacity port: two turns
    expect(s.units['US-157'].where).toEqual({ kind: 'atSea', port: '2306', since: 3 });
    act(s, { type: 'land', unitId: 'US-1-142', to: '2712' });
    expect(landingHexes(s, 'US-179')).not.toContain('2712'); // 1 + 3 > 3
    // A port that received units this turn cannot ship any out.
    expect(navalDestinations(s, 'US-1-142')).toEqual([]);
  });

  it('[18.4.5] units may sail from a port or beachhead to another, or back to the reserve; at most 3 LP port to port', () => {
    const s = alliedMovement(3, (x) => {
      place(x, 'BR-BH21', '2712');
      place(x, 'US-BH531B', '2617');
      place(x, 'BR-BH35', '2710');
      place(x, 'US-179', '2712');
      place(x, 'US-1-142', '2710');
      place(x, 'GE-I15', '2812'); // starting in an EZOC is fine
    });
    const d = navalDestinations(s, 'US-179').map((x) => x.to);
    expect(d).toEqual(expect.arrayContaining(['reserve', '2617']));
    act(s, { type: 'naval', unitId: 'US-179', to: '2617' }); // 3 LP
    expect(s.units['US-179'].where).toEqual({ kind: 'map', hex: '2617' });
    expect(navalDestinations(s, 'US-1-142').map((x) => x.to)).toEqual(['reserve']);
  });
});

describe('19 Special units', () => {
  it('[19.1] the Nebelwerfer shifts like a corps ASU, needs no supply point, and readies free in the German Initial Phase', () => {
    const s = quiet({ side: 'German', phase: 'combat' });
    place(s, 'US-157', O);
    place(s, 'GE-I15', N);
    place(s, 'GE-III15', N);
    place(s, 'GE-71NW', '2911');
    const base = computeOdds(s, { target: O, attackers: ['GE-I15', 'GE-III15'] }).finalIndex;
    expect(computeOdds(s, { target: O, attackers: ['GE-I15', 'GE-III15'], asus: ['GE-71NW'] }).finalIndex).toBe(base + 1);
    const t = quiet({ side: 'German', phase: 'initial', turn: 5 });
    t.supplyPoints.German = 3;
    place(t, 'GE-71NW', '2501', { fired: true });
    expect(refused(t, { type: 'readyAsu', unitId: 'GE-71NW' })).toBe(true);
    const u = quiet({ side: 'Allied', phase: 'supply', turn: 2 });
    place(u, 'GE-71NW', '2501', { fired: true });
    dice(u, 1); // weather
    act(u, { type: 'endPhase' }); // Allied supply -> victory -> turn 3 weather -> German initial
    expect(u.units['GE-71NW'].fired).toBe(false);
  });

  it('[19.2] the Torre Annunziata garrison may not move until an Allied unit comes within 3 hexes or turn 3', () => {
    const s = quiet({ side: 'German', turn: 2 });
    const fj = place(s, 'GE-III1FJ', '2202', { frozenUntil: 3 });
    expect(cannotMove(s, fj)).toMatch(/frozen/);
    s.activeSide = 'Allied';
    const to = Object.keys(MAP.hexes).find((h) => MAP.hexes[h].terrain !== 'sea' && distance(h, '2202') === 3 &&
      neighbors(h).some((n) => MAP.hexes[n]?.terrain !== 'sea' && distance(n, '2202') === 4))!;
    const from = neighbors(to).find((n) => MAP.hexes[n]?.terrain !== 'sea' && distance(n, '2202') === 4)!;
    place(s, 'US-1Rgr', from);
    act(s, { type: 'move', unitId: 'US-1Rgr', to, mode: 'tactical' });
    expect(s.units['GE-III1FJ'].frozenUntil).toBeUndefined();
    const t = quiet({ side: 'Allied', phase: 'victory', turn: 2 });
    place(t, 'GE-III1FJ', '2202', { frozenUntil: 3 });
    act(t, { type: 'endPhase' }); // to the German Initial Phase of turn 3
    expect(t.units['GE-III1FJ'].frozenUntil).toBeUndefined();
  });

  it('[19.3] variable strength: cannot attack, strength rolled when attacked, 0 = gone (DS), never doubled', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    place(s, 'GE-GarA', '2916'); // a hill
    place(s, 'US-157', '2915');
    expect(refused({ ...s, activeSide: 'German' } as GameState, { type: 'attack', target: '2915', attackers: ['GE-GarA'] })).toBe(true);
    dice(s, 6, 1); // strength 2 (not doubled in the hill); 4 vs 2: 2-1, roll 1: A1
    act(s, { type: 'attack', target: '2916', attackers: ['US-157'] });
    expect(s.combats[0].defense).toBe(2);
    const t = quiet({ side: 'Allied', phase: 'combat' });
    place(t, 'GE-GarA', O);
    place(t, 'US-157', N);
    dice(t, 2); // strength 0
    act(t, { type: 'attack', target: O, attackers: ['US-157'] });
    expect(t.units['GE-GarA'].where.kind).toBe('eliminated');
    expect(t.combats[0].result).toMatch(/^DS/);
  });

  it('[19.3] an MA 0 garrison never moves (not even by truck) and dies if it must retreat; Auto DS assumes strength 2', () => {
    const s = quiet({ side: 'German' });
    const g = place(s, 'GE-GarC', O);
    expect(cannotMove(s, g)).toBeTruthy();
    expect(refused(s, { type: 'move', unitId: 'GE-GarC', to: N, mode: 'truck' })).toBe(true);
    const t = quiet({ side: 'Allied', phase: 'combat' });
    place(t, 'GE-GarC', O);
    place(t, 'US-179', N);
    dice(t, 6, 6); // strength 2; 6 vs 2: 3-1, roll 6: D1 -> retreat or stand
    act(t, { type: 'attack', target: O, attackers: ['US-179'] });
    if (t.pendingDefense) act(t, { type: 'defend', choice: 'retreat' });
    expect(t.units['GE-GarC'].where.kind).toBe('eliminated');
    const u = quiet({ side: 'Allied', phase: 'movement' });
    place(u, 'GE-GarC', O);
    place(u, 'US-179', N);
    expect(computeOdds(u, { target: O, attackers: ['US-179'] }, { autoDs: true }).defense).toBe(2);
  });

  it('[19.4] Valiant and Warspite, from turn 8: +1 to a naval-supported roll, twice, never above 6 on the CRT', () => {
    const s = quiet({ side: 'Allied', phase: 'combat', turn: 8 });
    s.support.ready = ['US-naval'];
    s.support.battleships = 2;
    place(s, 'GE-I15', '2617');
    place(s, 'US-157', '2616');
    dice(s, 6);
    act(s, { type: 'attack', target: '2617', attackers: ['US-157'], naval: true, battleships: true });
    expect(s.combats[0].drm).toBe(1);
    expect(s.support.battleships).toBe(1);
    const t = quiet({ side: 'Allied', phase: 'combat', turn: 7 });
    t.support.ready = ['US-naval'];
    t.support.battleships = 2;
    place(t, 'GE-I15', '2617');
    place(t, 'US-157', '2616');
    expect(computeOdds(t, { target: '2617', attackers: ['US-157'], naval: true, battleships: true }).drm).toBe(0);
  });
});

describe('20 Replacements', () => {
  const initial = (side: 'German' | 'Allied' = 'German', turn = 5) => quiet({ side, phase: 'initial', turn });

  it('[20.1.1] a replacement restores one step; unused ones are lost; each side gets 18 steps in all', () => {
    const s = initial();
    s.replacements.German.inf = 1;
    place(s, 'GE-I64', '2501', { stepsLost: 1 });
    act(s, { type: 'replace', unitId: 'GE-I64' });
    expect(s.units['GE-I64'].stepsLost).toBe(0);
    const total = (pools: string[]) => Object.values(RULES.replacementSchedule)
      .reduce((a, t) => a + pools.reduce((b, p) => b + Object.values((t as Record<string, Record<string, number>>)[p] ?? {}).reduce((x, y) => x + y, 0), 0), 0);
    expect(total(['German'])).toBe(18);
    expect(total(['US', 'BR'])).toBe(18);
    const t = quiet({ side: 'German', phase: 'supply', turn: 5 });
    t.replacements.BR.inf = 1;
    act(t, { type: 'endPhase' }); // the Allied Initial Phase of turn 5 starts with fresh pools
    expect(t.replacements.BR.inf).toBe(1); // turn 5: one British infantry step (the old one is gone)
  });

  it('[20.1.2] tank replacements for tanks, infantry for infantry types, special for the rest (or as infantry)', () => {
    const s = initial();
    place(s, 'GE-IIa2', '2501', { stepsLost: 1 });
    place(s, 'GE-I64', '2701', { stepsLost: 1 });
    s.replacements.German = { inf: 1, armor: 0, special: 0 };
    expect(refused(s, { type: 'replace', unitId: 'GE-IIa2' })).toBe(true);
    s.replacements.German = { inf: 0, armor: 0, special: 1 };
    act(s, { type: 'replace', unitId: 'GE-I64' }); // special used as infantry
    expect(s.replacements.German.special).toBe(0);
  });

  it('[20.2] only Good Order units in supply, one replacement per unit per turn', () => {
    const s = initial();
    s.replacements.German.inf = 2;
    place(s, 'GE-129', '2501', { stepsLost: 2 });
    act(s, { type: 'replace', unitId: 'GE-129' });
    expect(refused(s, { type: 'replace', unitId: 'GE-129' })).toBe(true);
  });

  it('[20.3.1] returning units go to an Entry Area (Germans, 8th Army), the Floating Reserve (5th Army) or a corps/division ASU hex in supply, not next to the enemy', () => {
    const s = initial();
    s.replacements.German.inf = 3;
    for (const id of ['GE-I15', 'GE-III15', 'GE-II15']) s.units[id].where = { kind: 'eliminated' };
    act(s, { type: 'replace', unitId: 'GE-I15', to: 'N1' });
    expect(s.units['GE-I15'].where).toEqual({ kind: 'entry', area: 'N1' });
    place(s, 'GE-14Pz', '2501');
    act(s, { type: 'replace', unitId: 'GE-III15', to: '2501' });
    expect(s.units['GE-III15'].where).toEqual({ kind: 'map', hex: '2501' });
    place(s, 'US-157', '2601');
    expect(refused(s, { type: 'replace', unitId: 'GE-II15', to: '2501' })).toBe(true);
    const a = initial('Allied');
    a.replacements.US.inf = 1;
    a.units['US-157'].where = { kind: 'eliminated' };
    expect(refused(a, { type: 'replace', unitId: 'US-157', to: 'S1' })).toBe(true);
    act(a, { type: 'replace', unitId: 'US-157' });
    expect(a.units['US-157'].where).toEqual({ kind: 'reserve' });
  });

  it('[20.3.2] overstacking from returning units is allowed until the end of the Movement Phase', () => {
    const s = initial();
    s.replacements.German.inf = 1;
    place(s, 'GE-14Pz', '2501');
    place(s, 'GE-129', '2501');
    place(s, 'GE-71', '2501');
    place(s, 'GE-II15', '2501'); // 3 + 2 + 1 = 6
    s.units['GE-I15'].where = { kind: 'eliminated' };
    act(s, { type: 'replace', unitId: 'GE-I15', to: '2501' });
    expect(s.units['GE-I15'].where).toEqual({ kind: 'map', hex: '2501' });
    act(s, { type: 'endPhase' }); // to movement
    act(s, { type: 'endPhase' }); // end of movement: the excess is lost
    expect(['GE-I15', 'GE-II15'].some((id) => s.units[id].where.kind === 'eliminated')).toBe(true);
  });

  it('[20.3.3] a returning ASU comes back on its Fired side', () => {
    const s = initial();
    s.replacements.German.special = 1;
    s.units['GE-16Art'].where = { kind: 'eliminated' };
    act(s, { type: 'replace', unitId: 'GE-16Art', to: 'N1' });
    expect(s.units['GE-16Art'].fired).toBe(true);
  });

  it('[20.3.4] a 3-step unit returns as its Remnant', () => {
    const s = initial('Allied');
    s.replacements.US.inf = 1;
    s.units['US-179'].where = { kind: 'eliminated' };
    s.units['US-REM-A'].where = { kind: 'remnantPool' };
    act(s, { type: 'replace', unitId: 'US-179' });
    expect(s.units['US-179'].where.kind).toBe('remnantHeld');
    expect(s.units['US-REM-A'].where).toEqual({ kind: 'reserve' });
    expect(s.units['US-REM-A'].represents).toBe('US-179');
  });

  it('[20.3.5] a Remnant that receives a replacement becomes its unit on the reduced side', () => {
    const s = initial('Allied');
    s.replacements.US.inf = 1;
    place(s, 'BR-BH21', '2712');
    s.units['US-179'].where = { kind: 'remnantHeld' };
    s.units['US-179'].stepsLost = 2;
    place(s, 'US-REM-A', '2713', { represents: 'US-179' });
    act(s, { type: 'replace', unitId: 'US-REM-A' });
    expect(s.units['US-179'].where).toEqual({ kind: 'map', hex: '2713' });
    expect(s.units['US-179'].stepsLost).toBe(1);
    expect(s.units['US-REM-A'].where.kind).toBe('remnantPool');
  });

  it('[20.4] a replaced unit moves at most one hex, may not attack, and blocks all attacks from its hex until Recovery', () => {
    const s = initial();
    s.replacements.German.inf = 1;
    place(s, 'GE-I64', '2501', { stepsLost: 1 });
    act(s, { type: 'replace', unitId: 'GE-I64' });
    act(s, { type: 'endPhase' }); // to movement
    expect([...legalDestinations(s, 'GE-I64', 'tactical').values()].every((r) => r.hexes === 1)).toBe(true);
    expect(refused(s, { type: 'changeArea', unitId: 'GE-I64', area: 'N1' })).toBe(true);
    s.phase = 'combat';
    place(s, 'GE-II64', '2501');
    place(s, 'US-157', '2502');
    expect(refused(s, { type: 'attack', target: '2502', attackers: ['GE-II64'] })).toBe(true);
    act(s, { type: 'endPhase' }); // recovery removes the marker
    expect(s.units['GE-I64'].repl).toBe(false);
  });
});
