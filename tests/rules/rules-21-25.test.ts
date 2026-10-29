// Rule tests for sections 21 (Reinforcements and Entry Areas), 22 (Weather), 23 (Victory Points) and
// 25 (Optional Rules). Section 24 and the scenarios are in scenarios.test.ts. Comments paraphrase the rules.
import { describe, expect, it } from 'vitest';
import { MAP, RULES } from '../../src/engine/data';
import { distance, neighbors, sideKey } from '../../src/engine/hex';
import { computeOdds } from '../../src/engine/combat';
import { entryReach, landingHexes, vpBreakdown } from '../../src/engine/game';
import { entryDestinations, stepCost } from '../../src/engine/movement';
import { retreatChoices } from '../../src/engine/retreat';
import { losTo } from '../../src/engine/supply';
import { bondsOf, zocOf } from '../../src/engine/zoc';
import type { GameState } from '../../src/engine/types';
import { act, dice, openGround, place, quiet, refused, scenario } from './harness';

const O = openGround(); // 2813
const N = '2812';
const inArea = (s: GameState, id: string, area: string, patch = {}) => Object.assign(s.units[id], { where: { kind: 'entry', area }, status: 'good', stopped: false, repl: false, ...patch });

describe('21 Reinforcements and entry areas', () => {
  it('[21.1.1] reinforcements appear in the Initial Phase: Germans at their edge, 5th Army in the Floating Reserve, 8th Army in named areas', () => {
    const s = scenario({ side: 'Allied', phase: 'supply', turn: 1, keepUnits: true });
    s.log = [];
    dice(s, 1); // weather
    act(s, { type: 'endPhase' }); // -> turn 2, German initial
    expect(s.units['GE-HGArt'].where).toEqual({ kind: 'entry', area: 'N' });
    expect(s.units['GE-I15'].where).toEqual({ kind: 'entry', area: 'S' });
    const t = scenario({ side: 'German', phase: 'supply', turn: 2, keepUnits: true });
    act(t, { type: 'endPhase' }); // Allied initial, turn 2
    expect(t.units['US-179'].where).toEqual({ kind: 'reserve' });
    const e = scenario({ side: 'German', phase: 'supply', turn: 11, keepUnits: true });
    act(e, { type: 'endPhase' }); // Allied initial, turn 11
    expect(e.units['BR-17'].where).toEqual({ kind: 'entry', area: 'S1' });
    expect(e.units['CN-1'].where).toEqual({ kind: 'entry', area: 'S3' });
    expect(e.units['BR-22'].where).toEqual({ kind: 'reserve' });
  });

  it('[21.1.2] Floating Reserve units land at a friendly beach or port in the Movement Phase, stopping there if it is in an EZOC', () => {
    const s = quiet({ side: 'Allied', phase: 'initial', turn: 3 });
    place(s, 'US-BH531B', '2617');
    place(s, 'GE-I15', '2618');
    s.units['US-157'].where = { kind: 'reserve' };
    expect(landingHexes(s, 'US-157')).toEqual([]); // not in the Initial Phase
    act(s, { type: 'endPhase' });
    act(s, { type: 'land', unitId: 'US-157', to: '2617' });
    expect(s.units['US-157'].stopped).toBe(true);
  });

  it('[21.1.3] units enter from the edge paying the first hex\'s cost, may use Extended Movement, or stay', () => {
    const s = quiet({ side: 'German', turn: 3 });
    inArea(s, 'GE-I15', 'N1');
    const normal = entryDestinations(s, 'GE-I15', 'N1', 'normal');
    // 2100 carries the Naples road off the map edge: road rate; 2300 has no road: its terrain cost.
    expect(normal.get('2100')!.cost).toBe(RULES.movement.majorRoad.mech);
    expect(normal.get('2300')!.cost).toBe(RULES.movement.terrain.hill.mech);
    const ext = entryReach(s, 'GE-I15', 'extended');
    expect([...ext.keys()].some((h) => !normal.has(h))).toBe(true);
    act(s, { type: 'endPhase' }); // staying put is allowed
    expect(s.units['GE-I15'].where).toEqual({ kind: 'entry', area: 'N1' });
  });

  it('[21.2.1] on turn 11 S1-S3 become Allied and Germans there are lost; an east area falls when an 8th Army unit enters', () => {
    const s = quiet({ side: 'German', phase: 'supply', turn: 11 });
    inArea(s, 'GE-I15', 'S2');
    act(s, { type: 'endPhase' }); // Allied initial, turn 11
    expect(s.units['GE-I15'].where.kind).toBe('eliminated');
    expect(s.control.S2).toBe('Allied');
    const t = quiet({ side: 'Allied', turn: 12 });
    t.control.S3 = 'Allied';
    inArea(t, 'CN-1', 'S3');
    inArea(t, 'GE-III15', 'E1');
    act(t, { type: 'changeArea', unitId: 'CN-1', area: 'E1' });
    expect(t.control.E1).toBe('Allied');
    expect(t.units['GE-III15'].where.kind).toBe('eliminated');
    t.activeSide = 'German';
    inArea(t, 'GE-II15', 'E2');
    expect(refused(t, { type: 'changeArea', unitId: 'GE-II15', area: 'E1' })).toBe(true);
  });

  it('[21.2.2] only 8th Army units may use the east Entry Areas', () => {
    const s = quiet({ side: 'Allied', turn: 12 });
    s.control.S3 = 'Allied';
    inArea(s, 'BR-22', 'S3'); // 7th Armoured: 5th Army
    expect(refused(s, { type: 'changeArea', unitId: 'BR-22', area: 'E1' })).toBe(true);
  });

  it('[21.2.3] N1 and N2 stay German; Allied and German units may share them', () => {
    const s = quiet({ side: 'Allied', turn: 5 });
    place(s, 'US-179', '2100');
    inArea(s, 'GE-I15', 'N1');
    act(s, { type: 'changeArea', unitId: 'US-179', area: 'N1' });
    expect(s.units['US-179'].where).toEqual({ kind: 'entry', area: 'N1' });
    expect(s.units['GE-I15'].where).toEqual({ kind: 'entry', area: 'N1' });
    expect(s.control.N1 ?? 'German').toBe('German');
  });

  it('[21.3.1] an Entry Area has no stacking limit, except for units attacking out of it', () => {
    const s = quiet({ side: 'German', phase: 'combat', turn: 5 });
    for (const id of ['GE-129', 'GE-71', 'GE-I15', 'GE-III15']) inArea(s, id, 'N1'); // 3 + 2 + 1 + 1 = 7
    place(s, 'US-1-142', '2100');
    expect(refused(s, { type: 'attack', target: '2100', attackers: ['GE-129', 'GE-71', 'GE-I15', 'GE-III15'] })).toBe(true);
    expect(refused(s, { type: 'attack', target: '2100', attackers: ['GE-129', 'GE-71', 'GE-I15'] })).toBe(false);
  });

  it('[21.3.2] a unit entering an Entry Area stops there until next turn and needs Good Order to come back', () => {
    const s = quiet({ side: 'German', turn: 5 });
    place(s, 'GE-I15', '2100');
    act(s, { type: 'changeArea', unitId: 'GE-I15', area: 'N1' });
    expect(refused(s, { type: 'enter', unitId: 'GE-I15', to: '2300', mode: 'normal' })).toBe(true);
    const t = quiet({ side: 'German', turn: 5 });
    inArea(t, 'GE-I15', 'N1', { status: 'disrupted' });
    expect(refused(t, { type: 'enter', unitId: 'GE-I15', to: '2100', mode: 'tactical' })).toBe(true);
  });

  it('[21.3.3] ZOCs do not reach into Entry Areas; units may enter into an EZOC but not into a ZOC Bond', () => {
    const s = quiet({ side: 'German', turn: 5 });
    place(s, 'US-179', '2201');
    inArea(s, 'GE-I15', 'N1');
    expect(zocOf(s, 'Allied').has('2100')).toBe(true);
    expect(entryDestinations(s, 'GE-I15', 'N1', 'normal').get('2100')!.stop).toBe(true);
    // A hex bond on an N1 edge hex: two Allied units two hexes apart with that edge hex the only hex between them.
    const land = (h: string) => MAP.hexes[h] && MAP.hexes[h].terrain !== 'sea';
    let pair: [string, string, string, string] | null = null;
    for (const [area, ea] of Object.entries(MAP.entryAreas)) for (const c of ea.hexes) {
      for (const a of neighbors(c).filter(land)) for (const b of neighbors(c).filter(land)) {
        if (a < b && distance(a, b) === 2 && neighbors(a).filter((x) => neighbors(b).includes(x)).length === 1 && !ea.hexes.includes(a) && !ea.hexes.includes(b)) pair ??= [a, b, c, area];
      }
    }
    expect(pair).not.toBeNull();
    const [a, b, c, area] = pair!;
    const t = quiet({ side: 'German', turn: 5 });
    place(t, 'US-179', a);
    place(t, 'US-180', b);
    inArea(t, 'GE-I15', area);
    expect(bondsOf(t, 'Allied').hexes.has(c)).toBe(true);
    expect(entryReach(t, 'GE-I15', 'normal').has(c)).toBe(false);
  });

  it('[21.3.4] units in an Entry Area cannot be attacked but, if they did not move, may attack adjacent hexes', () => {
    const s = quiet({ side: 'German', phase: 'combat', turn: 5 });
    inArea(s, 'GE-I15', 'N1');
    inArea(s, 'GE-III15', 'N1', { stopped: true });
    place(s, 'US-1-142', '2100');
    expect(refused(s, { type: 'attack', target: '2100', attackers: ['GE-III15'] })).toBe(true); // moved in this turn
    dice(s, 6);
    act(s, { type: 'attack', target: '2100', attackers: ['GE-I15'] });
    expect(s.combats.length).toBe(1);
  });

  it('[21.4] a unit retreating off the map into a friendly Entry Area is placed there, disrupted', () => {
    const s = quiet({ side: 'Allied', phase: 'combat', turn: 5 });
    place(s, 'GE-I15', '2100');
    const opts = retreatChoices(s, ['GE-I15'], 2, '2201');
    expect(opts.some((p) => p.intoArea === 'N1')).toBe(true);
    const t = quiet({ side: 'German', phase: 'combat', turn: 5 });
    place(t, 'US-157', '2100');
    expect(retreatChoices(t, ['US-157'], 2, '2201').some((p) => p.intoArea)).toBe(false); // N1 is never Allied
  });

  it('[21.5] moving between adjacent Entry Areas takes the whole move; N1-N2 Germans only; never N2-E5', () => {
    const s = quiet({ side: 'German', turn: 5 });
    inArea(s, 'GE-I15', 'N1');
    act(s, { type: 'changeArea', unitId: 'GE-I15', area: 'N2' });
    expect(s.units['GE-I15'].stopped).toBe(true);
    inArea(s, 'GE-III15', 'N2');
    expect(refused(s, { type: 'changeArea', unitId: 'GE-III15', area: 'E5' })).toBe(true);
    inArea(s, 'GE-II15', 'N1', { status: 'disrupted' });
    expect(refused(s, { type: 'changeArea', unitId: 'GE-II15', area: 'N2' })).toBe(true);
    const a = quiet({ side: 'Allied', turn: 5 });
    inArea(a, 'US-179', 'N1');
    expect(refused(a, { type: 'changeArea', unitId: 'US-179', area: 'N2' })).toBe(true);
  });

  const dropReady = (unit: string, area: 'airdrop' | 'airdrop509', weather = 0) => {
    const s = quiet({ side: 'Allied', phase: 'initial', turn: 6, weather });
    place(s, 'US-BH531R', '2616');
    s.units[unit].where = { kind: 'entry', area };
    return s;
  };

  it('[21.6.1] the 504th and 505th drop within 3 hexes of a beachhead, the 2/509th anywhere in the 5th Army sector; not in cities or enemy hexes or hex bonds', () => {
    const s = dropReady('US-505', 'airdrop');
    const h = landingHexes(s, 'US-505');
    expect(h.length).toBeGreaterThan(0);
    for (const x of h) expect(distance(x, '2616')).toBeLessThanOrEqual(3);
    expect(refused(s, { type: 'endPhase' })).toBe(true); // the drop may not be put off
    const t = dropReady('US-2-509', 'airdrop509');
    place(t, 'GE-I15', '3105');
    place(t, 'GE-III15', '3305');
    const bond = bondsOf(t, 'German');
    const h509 = new Set(landingHexes(t, 'US-2-509'));
    expect(h509.has('3203')).toBe(false); // Avellino: a city
    expect(h509.has('3303')).toBe(true);
    expect(h509.has('3105')).toBe(false);
    for (const b of bond.hexes) expect(h509.has(b)).toBe(false);
    for (const x of h509) expect(MAP.hexes[x].sector8).toBeFalsy();
    dice(t, 6);
    act(t, { type: 'land', unitId: 'US-2-509', to: '3303' });
    expect(t.units['US-2-509'].where).toEqual({ kind: 'map', hex: '3303' });
  });

  it('[21.6.1] airlanding table: <=-2 eliminated, 0/-1 step and Disrupted, 1-2 Disrupted, 3-4 ½ Eff, 5-6 fine', () => {
    const drop = (roll: number, hex = '2716') => {
      const s = dropReady('US-505', 'airdrop');
      dice(s, roll);
      act(s, { type: 'land', unitId: 'US-505', to: hex });
      return s.units['US-505'];
    };
    expect(drop(6).status).toBe('good');
    expect(drop(4).halfEff).toBe(true);
    expect(drop(2).status).toBe('disrupted');
    const m = drop(2, '2615'); // marsh: 2 - 2 = 0
    expect(m.stepsLost).toBe(1);
    expect(m.status).toBe('disrupted');
  });

  it('[21.6.2] landing in a marsh is -2, and in an EZOC another -2 (more EZOCs add nothing)', () => {
    const drop = (roll: number, extra: (s: GameState) => void) => {
      const s = dropReady('US-505', 'airdrop');
      extra(s);
      dice(s, roll);
      act(s, { type: 'land', unitId: 'US-505', to: '2615' });
      return s.units['US-505'];
    };
    expect(drop(5, () => {}).halfEff).toBe(true); // 5 - 2 = 3
    expect(drop(5, (s) => place(s, 'GE-I15', '2714')).status).toBe('disrupted'); // 5 - 4 = 1
    expect(drop(5, (s) => { place(s, 'GE-I15', '2714'); place(s, 'GE-III15', '2614'); }).status).toBe('disrupted');
  });

  it('[21.6.2] landing in a full Mountain hex is -2', () => {
    const full = Object.keys(MAP.hexes).find((h) => MAP.hexes[h].terrain !== 'sea' && !MAP.hexes[h].sector8 && !MAP.hexes[h].city &&
      neighbors(h).every((n) => MAP.hexes[n]) && neighbors(h).every((n) => MAP.hexes[n].terrain === 'sea' || MAP.hexsides[sideKey(h, n)]?.mountain))!;
    expect(full).toBeDefined();
    const s = dropReady('US-2-509', 'airdrop509');
    dice(s, 5);
    act(s, { type: 'land', unitId: 'US-2-509', to: full });
    expect(s.units['US-2-509'].halfEff).toBe(true); // 5 - 2 = 3
  });

  it('[21.6.3] airborne units are in supply on the turn they drop', () => {
    const s = dropReady('US-2-509', 'airdrop509');
    dice(s, 6);
    act(s, { type: 'land', unitId: 'US-2-509', to: '3303' }); // far from any Allied source
    s.phase = 'recovery';
    act(s, { type: 'endPhase' }); // Allied supply phase
    expect(s.units['US-2-509'].outOfSupply).toBe(false);
  });

  it('[21.6.4] weather has no effect on airborne landings', () => {
    const s = dropReady('US-505', 'airdrop', 5); // rain
    dice(s, 6);
    act(s, { type: 'land', unitId: 'US-505', to: '2716' });
    expect(s.units['US-505'].status).toBe('good');
    expect(s.units['US-505'].halfEff).toBe(false);
  });
});

describe('22 Weather', () => {
  const weatherPhase = (box: number, roll: number, extra?: (s: GameState) => void) => {
    const s = quiet({ side: 'Allied', phase: 'victory', turn: 2, weather: box });
    extra?.(s);
    dice(s, roll);
    act(s, { type: 'endPhase' }); // -> turn 3 weather -> German initial
    return s;
  };

  it('[22.1] from turn 2 the weather marker moves 0 (1), 1 (2-4) or 2 (5-6) boxes, wrapping from F to A', () => {
    expect(weatherPhase(0, 1).weather).toBe(0);
    expect(weatherPhase(0, 3).weather).toBe(1);
    expect(weatherPhase(0, 6).weather).toBe(2);
    expect(weatherPhase(5, 2).weather).toBe(0);
    expect(weatherPhase(4, 5).weather).toBe(0);
  });

  it('[22.2.1] the box sets which air and naval markers are ready', () => {
    expect(weatherPhase(0, 1).support.ready.sort()).toEqual(['BR-air', 'BR-naval', 'US-air', 'US-naval']);
    expect(weatherPhase(3, 1).support.ready.sort()).toEqual(['BR-air', 'BR-naval', 'US-naval']);
    expect(weatherPhase(4, 1).support.ready.sort()).toEqual(['BR-naval', 'US-air', 'US-naval']);
    expect(weatherPhase(5, 1).support.ready).toEqual([]);
  });

  it('[22.2.2] the Luftwaffe flies only in box C, and only while the Allies cannot use Montecorvino', () => {
    expect(weatherPhase(2, 1).support.ready).toContain('GE-air');
    expect(weatherPhase(1, 1).support.ready).not.toContain('GE-air');
  });

  it('[22.2.3] Montecorvino (2811) in Allied hands with no German within 3 hexes grounds the Luftwaffe', () => {
    expect(weatherPhase(2, 1, (s) => { s.control['2811'] = 'Allied'; }).support.ready).not.toContain('GE-air');
    expect(weatherPhase(2, 1, (s) => { s.control['2811'] = 'Allied'; place(s, 'GE-I15', '2913'); }).support.ready).toContain('GE-air');
  });

  it('[22.3.1] supply points come from the weather box, at most 19', () => {
    const s = weatherPhase(3, 1, (x) => { x.supplyPoints = { Allied: 18, German: 5 }; }); // D: Allies 2, Germans 1
    expect(s.supplyPoints).toEqual({ Allied: 19, German: 6 });
  });

  it('[22.3.2] once Salerno is Allied with no German within 2 hexes, starred boxes give the Allies +1', () => {
    expect(weatherPhase(0, 1, (s) => { s.control['2707'] = 'Allied'; }).supplyPoints.Allied).toBe(2);
    expect(weatherPhase(0, 1, (s) => { s.control['2707'] = 'Allied'; place(s, 'GE-I15', '2809'); }).supplyPoints.Allied).toBe(1);
    expect(weatherPhase(3, 1, (s) => { s.control['2707'] = 'Allied'; }).supplyPoints.Allied).toBe(2); // D: no star
  });

  it('[22.4] rain: one column left in every combat; vehicles may not cross or attack across unbridged rivers', () => {
    const s = quiet({ side: 'Allied', phase: 'combat', weather: 5 });
    place(s, 'GE-I15', O);
    place(s, 'US-179', N);
    expect(computeOdds(s, { target: O, attackers: ['US-179'] }).shifts).toContainEqual({ reason: 'Rain', shift: -1 });
    place(s, 'GE-III15', '2914');
    place(s, 'US-191', '2814'); // tank across the 2814-2914 river
    expect(refused(s, { type: 'attack', target: '2914', attackers: ['US-191'] })).toBe(true);
    expect(stepCost(s, s.units['US-191'], '2814', '2914', 'normal')).toBeNull();
    s.weather = 0;
    expect(stepCost(s, s.units['US-191'], '2814', '2914', 'normal')).not.toBeNull();
    expect(refused(s, { type: 'attack', target: '2914', attackers: ['US-191'] })).toBe(false);
  });

  it('[22.5] clear and cloudy weather change nothing in combat', () => {
    for (const w of [0, 3]) {
      const s = quiet({ side: 'Allied', phase: 'combat', weather: w });
      place(s, 'GE-I15', O);
      place(s, 'US-179', N);
      expect(computeOdds(s, { target: O, attackers: ['US-179'] }).shifts).toEqual([]);
    }
  });
});

describe('23 Victory points', () => {
  it('[23.1.1] an Allied VP hex counts only with a line of supply to a port, beachhead or friendly Entry Area', () => {
    const s = quiet({ side: 'Allied' });
    s.control['2716'] = 'Allied';
    expect(vpBreakdown(s).total).toBe(0);
    place(s, 'US-BH531B', '2617');
    expect(vpBreakdown(s).total).toBe(1);
  });

  it('[23.1.2] -1 per Allied airborne/glider regiment or ASU eliminated, +1 per German ASU; not for a 1-step battalion', () => {
    const s = quiet({ side: 'Allied' });
    for (const id of ['US-504', 'US-325', 'US-2-509', 'US-3-504', 'US-36Art', 'GE-16Art']) s.units[id].where = { kind: 'eliminated' };
    expect(vpBreakdown(s).total).toBe(-1 - 1 - 1 + 1);
    s.units['US-504'].where = { kind: 'remnantHeld' }; // its Remnant is in play
    expect(vpBreakdown(s).total).toBe(-1);
  });

  it('[23.1.3] each lost beachhead is -1 VP during play and in the Avalanche scenario, but not at the end of the campaign', () => {
    const s = quiet({ side: 'Allied', scenario: 'campaign' });
    s.units['BR-BH21'].where = { kind: 'eliminated' };
    expect(vpBreakdown(s).total).toBe(-1);
    expect(vpBreakdown(s, true).total).toBe(0);
    const a = quiet({ side: 'Allied', scenario: 'short' });
    a.units['BR-BH21'].where = { kind: 'eliminated' };
    expect(vpBreakdown(a, true).total).toBe(-1);
  });

  it('[23.1.4] two or more 5th Army units with 6+ attack in N1 earn 5 VPs (N2: 4) if a supply line reaches the area', () => {
    const s = quiet({ side: 'Allied', phase: 'supply', turn: 2 });
    inArea(s, 'US-179', 'N1');
    inArea(s, 'US-1-142', 'N1'); // 6 + 2
    place(s, 'US-BH531B', '2201'); // a source next to the N1 edge
    dice(s, 1);
    act(s, { type: 'endPhase' }); // victory check
    expect(s.northVp.N1).toBe(true);
    expect(vpBreakdown(s).parts).toContain('N1 +5');
    const t = quiet({ side: 'Allied', phase: 'supply', turn: 2 });
    inArea(t, 'US-179', 'N1'); // one unit only
    place(t, 'US-BH531B', '2201');
    dice(t, 1);
    act(t, { type: 'endPhase' });
    expect(t.northVp.N1).toBeFalsy();
    expect(refused(t, { type: 'enter', unitId: 'US-179', to: '2100' })).toBe(true); // never leaves
  });

  it('[23.2] from turn 4: 5 above the benchmark or 20 VPs wins for the Allies, 5 below for the Germans', () => {
    const run = (turn: number, vp: number) => {
      const s = quiet({ side: 'Allied', phase: 'supply', turn });
      place(s, 'US-BH531B', '2617');
      const vps = Object.keys(MAP.hexes).filter((h) => MAP.hexes[h].vp && losTo(s, 'Allied', h, ['2617'])).sort((a, b) => MAP.hexes[b].vp! - MAP.hexes[a].vp!);
      let got = 0;
      for (const h of vps) if (got + MAP.hexes[h].vp! <= vp) { s.control[h] = 'Allied'; got += MAP.hexes[h].vp!; }
      expect(got).toBe(vp);
      dice(s, 1);
      act(s, { type: 'endPhase' });
      return s.winner;
    };
    expect(RULES.benchmarks[4]).toBe(6);
    expect(run(4, 1)).toBe('German');
    expect(run(4, 2)).toBeNull();
    expect(run(3, 0)).toBeNull(); // no benchmark before turn 4
  });
});

describe('25 Optional rules', () => {
  const engaged = (ids: string[], roll: number) => {
    const s = quiet({ side: 'German', phase: 'combat' });
    for (const id of ids) place(s, id, O);
    place(s, 'US-179', N);
    dice(s, roll);
    act(s, { type: 'disengage', hex: O });
    return s;
  };

  it('[25.1.2] Disengagement Table: 1-2 no, 3 yes with a step lost, 4-6 yes; +1 if all mechanized', () => {
    expect(engaged(['GE-I3FJ'], 2).units['GE-I3FJ'].where).toEqual({ kind: 'map', hex: O });
    const three = engaged(['GE-I3FJ'], 3);
    expect(three.units['GE-I3FJ'].where.kind).toBe('eliminated'); // one step
    const four = engaged(['GE-I3FJ'], 4).units['GE-I3FJ'];
    expect(four.where.kind === 'map' && four.where.hex).not.toBe(O);
    const mech = engaged(['GE-I15'], 3).units['GE-I15']; // 3 + 1 = 4
    expect(mech.stepsLost).toBe(0);
    expect(mech.where.kind === 'map' && mech.where.hex).not.toBe(O);
  });

  it('[25.1.3] a unit that disengages may not attack, and one that attacked may not disengage', () => {
    const s = engaged(['GE-I15'], 1); // fails, stays
    expect(refused(s, { type: 'attack', target: N, attackers: ['GE-I15'] })).toBe(true);
    const t = quiet({ side: 'German', phase: 'combat' });
    place(t, 'GE-I15', O);
    place(t, 'US-1-142', N);
    dice(t, 1);
    act(t, { type: 'attack', target: N, attackers: ['GE-I15'] });
    expect(refused(t, { type: 'disengage', hex: O })).toBe(true);
  });

  it('[25.1.4] a successful disengagement retreats the unit, which is disrupted (Full Retreat if already disrupted)', () => {
    const s = engaged(['GE-I15'], 5);
    expect(s.units['GE-I15'].status).toBe('disrupted');
    const t = quiet({ side: 'German', phase: 'combat' });
    place(t, 'GE-I15', O, { status: 'disrupted' });
    place(t, 'US-179', N);
    dice(t, 5);
    act(t, { type: 'disengage', hex: O });
    expect(t.units['GE-I15'].status).toBe('fullRetreat');
  });

  it('[25.2] a recon unit alone ignores the step loss of a D1 or DS (but still retreats) and then makes no Determined Defense', () => {
    const s = quiet({ side: 'Allied', phase: 'combat' });
    s.options = { recon: true };
    place(s, 'GE-26AA', O); // 3-3-6 recon
    place(s, 'US-179', N);
    place(s, 'US-180', '2912'); // 12 vs 3: 4-1
    dice(s, 5); // 4-1, roll 5: D1/3
    act(s, { type: 'attack', target: O, attackers: ['US-179', 'US-180'] });
    expect(s.pendingDefense).toBeNull();
    expect(s.units['GE-26AA'].stepsLost).toBe(0);
    expect((s.units['GE-26AA'].where as { hex: string }).hex).not.toBe(O);
  });

  it('[25.3] limited port supply: a port supplies ten times its landing value in LPs of units', () => {
    const s = quiet({ side: 'Allied', phase: 'recovery', turn: 2 });
    s.options = { limitedPortSupply: true };
    s.control['2306'] = 'Allied'; // Amalfi, value 1: 10 LP
    const near = Object.keys(MAP.hexes).filter((h) => MAP.hexes[h].terrain !== 'sea' && losTo(s, 'Allied', h, ['2306']))
      .sort((a, b) => distance(a, '2306') - distance(b, '2306') || a.localeCompare(b));
    // 3 + 3 + 3 + 1 = 10 LP, then one regiment more.
    place(s, 'US-179', '2306');
    place(s, 'US-180', '2306');
    const third = near.find((h) => distance(h, '2306') === 1)!;
    place(s, 'US-30', third);
    place(s, 'US-36Art', third);
    const last = near.find((h) => distance(h, '2306') >= 2)!;
    place(s, 'US-7', last);
    act(s, { type: 'endPhase' });
    expect(['US-179', 'US-180', 'US-30', 'US-36Art'].map((id) => s.units[id].outOfSupply)).toEqual([false, false, false, false]);
    expect(s.units['US-7'].outOfSupply).toBe(true);
  });
});
