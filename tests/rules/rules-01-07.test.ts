// Rule tests for sections 1.0-7.6: the pieces, the sequence of play, stacking, movement, ZOCs and
// ZOC Bonds. Positions are built on a patch of synthetic clear ground (sandbox.ts) so that every
// hexside feature in a test is one the test put there.
import { afterEach, describe, expect, it } from 'vitest';
import { RULES, UNIT_DEFS } from '../../src/engine/data';
import { neighbors, sideKey } from '../../src/engine/hex';
import { legalDestinations, stepCost } from '../../src/engine/movement';
import { applyAction } from '../../src/engine/game';
import { nationGroup, stackPoints, unitsAt } from '../../src/engine/units';
import { bondsOf, zocOf } from '../../src/engine/zoc';
import { advanceDestinations, computeOdds } from '../../src/engine/combat';
import { retreatChoices } from '../../src/engine/retreat';
import { supplyChecker } from '../../src/engine/supply';
import { act, dice, place, refused, scenario } from './harness';
import { C, N, NE, NW, S, SE, SW, go, restoreMap, sandbox, setHex, setSide } from './sandbox';

afterEach(restoreMap);

/** A German movement phase on a patch of clear ground around C, no support markers ready. */
function setup(o: Parameters<typeof scenario>[0] = {}) {
  sandbox(C, 8);
  const s = scenario(o);
  s.support.ready = [];
  return s;
}
const reach = (s: ReturnType<typeof scenario>, id: string, mode: Parameters<typeof legalDestinations>[2] = 'normal') => legalDestinations(s, id, mode);
/** Did the best route to `to` step straight across from `from`? */
const direct = (r: ReturnType<typeof legalDestinations>, from: string, to: string) => r.get(to)?.prev === from;
const move = (s: ReturnType<typeof scenario>, unitId: string, to: string, mode?: Parameters<typeof legalDestinations>[2]) => act(s, { type: 'move', unitId, to, mode });

// ------------------------------------------------------------------ 1.0-2.3

describe('the map and the pieces', () => {
  it('[2.2.1] movement costs come from the Terrain Effects Chart for the hex entered', () => {
    const s = setup();
    const inf = place(s, 'GE-III1FJ', C);
    const mech = place(s, 'GE-I64', C);
    const t = RULES.movement.terrain;
    setHex(go(C, N), { terrain: 'hill' });
    setHex(go(C, S), { terrain: 'marsh' });
    expect(stepCost(s, inf, C, go(C, N), 'normal')!.cost).toBe(t.hill.inf);
    expect(stepCost(s, mech, C, go(C, N), 'normal')!.cost).toBe(t.hill.mech);
    expect(stepCost(s, inf, C, go(C, S), 'normal')!.cost).toBe(t.marsh.inf);
    expect(stepCost(s, mech, C, go(C, S), 'normal')!.cost).toBe(t.marsh.mech);
    expect(stepCost(s, mech, C, go(C, NE), 'normal')!.cost).toBe(t.clear.mech);
    expect([t.clear.inf, t.hill.inf, t.hill.mech, t.marsh.inf, t.marsh.mech]).toEqual([1, 1, 2, 2, 4]);
  });

  it('[2.2.2] a full Mountain hex is a Hill hex ringed by six Mountain hexsides', () => {
    const s = setup();
    setHex(C, { terrain: 'hill' });
    for (const n of neighbors(C)) setSide(C, n, { mountain: true });
    const from = go(C, S);
    place(s, 'GE-III1FJ', from);
    place(s, 'GE-IIb2', go(C, SE));
    // Infantry may climb in only as the first hex of a Tactical Move, and then must stop (example F, 5.6).
    expect(reach(s, 'GE-III1FJ', 'normal').has(C)).toBe(false);
    const tac = reach(s, 'GE-III1FJ', 'tactical');
    expect(tac.has(C)).toBe(true);
    expect([...tac.keys()].filter((h) => tac.get(h)!.prev === C)).toEqual([]);
    // Vehicles cannot cross the ridge at all.
    expect(reach(s, 'GE-IIb2', 'tactical').has(C)).toBe(false);
    // Defending there, infantry doubles as in a Hill hex.
    const t = scenario({ phase: 'combat', side: 'Allied' });
    t.support.ready = [];
    place(t, 'GE-III1FJ', C);
    place(t, 'US-179', go(C, S));
    expect(computeOdds(t, { target: C, attackers: ['US-179'] }).defense).toBe(4);
  });

  it('[2.3.1] every combat unit, beachheads, ASUs and garrisons included, has a ZOC', () => {
    const s = setup();
    place(s, 'US-BH531R', C);
    place(s, 'US-36Art', go(C, N, 4));
    place(s, 'GE-GarA', go(C, S, 4));
    const az = zocOf(s, 'Allied');
    expect(neighbors(C).every((n) => az.has(n))).toBe(true);
    expect(neighbors(go(C, N, 4)).every((n) => az.has(n))).toBe(true);
    expect(neighbors(go(C, S, 4)).every((n) => zocOf(s, 'German').has(n))).toBe(true);
  });

  it('[2.3.2] the Movement Allowance is the most a unit may spend and still attack (Extended Movement units may not attack)', () => {
    // A US tank's ZOC does not reach across a ridge, so a German unit can end next to it there.
    const y = go(C, N);
    const build = (start: string) => {
      const s = setup();
      setSide(C, y, { mountain: true });
      place(s, 'US-191', C);
      place(s, 'GE-I79', start);
      return s;
    };
    const far = build(go(y, N, 6)); // six hexes: only Extended Movement gets there
    expect(reach(far, 'GE-I79', 'normal').has(y)).toBe(false);
    move(far, 'GE-I79', y, 'extended');
    far.phase = 'combat';
    expect(refused(far, { type: 'attack', target: C, attackers: ['GE-I79'] })).toBe(true);
    const near = build(go(y, N, 5)); // five hexes: within its MA of 5
    move(near, 'GE-I79', y, 'normal');
    near.phase = 'combat';
    expect(refused(near, { type: 'attack', target: C, attackers: ['GE-I79'] })).toBe(false);
  });

  it('[2.3.3] infantry, mechanized and vehicle types', () => {
    const d = UNIT_DEFS;
    expect([d['US-179'].mech, d['US-179'].infantryType, d['US-179'].vehicle]).toEqual([false, true, false]);
    // Panzergrenadiers and motorized infantry move as mechanized units but are infantry types.
    expect([d['GE-I64'].mech, d['GE-I64'].infantryType, d['GE-I64'].vehicle]).toEqual([true, true, false]);
    expect([d['GE-129'].mech, d['GE-129'].infantryType]).toEqual([true, true]);
    for (const id of ['GE-IIa2', 'GE-KGDor', 'US-36Art', 'GE-71NW']) expect([id, d[id].vehicle, d[id].mech]).toEqual([id, true, true]);
    expect(d['GE-IIa2'].tankRating).toBe(3);
    expect(d['GE-KGDor'].tankRating).toBeUndefined();
    // Recon units are vehicles but double on defense in hills; silhouetted tanks do not.
    const s = setup({ phase: 'combat', side: 'Allied' });
    setHex(C, { terrain: 'hill' });
    place(s, 'GE-KGDor', C);
    place(s, 'US-179', go(C, S));
    expect(computeOdds(s, { target: C, attackers: ['US-179'] }).defense).toBe(8);
    s.units['GE-KGDor'].where = { kind: 'removed', reason: 'test' };
    place(s, 'GE-IIa2', C);
    expect(computeOdds(s, { target: C, attackers: ['US-179'] }).defense).toBe(4);
  });

  it('[2.3.4] British and Canadian units are Commonwealth', () => {
    expect(['US-179', 'BR-138', 'CN-1', 'GE-129'].map(nationGroup)).toEqual(['US', 'CW', 'CW', 'GE']);
  });

  it('[2.3.5] units have one, two or three steps', () => {
    expect(UNIT_DEFS['BR-5H'].steps.length).toBe(1);
    expect(UNIT_DEFS['GE-I64'].steps.length).toBe(2);
    expect(UNIT_DEFS['US-179'].steps.length).toBe(3);
    expect(UNIT_DEFS['US-179'].steps.map((v) => `${v.attack}-${v.defense}-${v.move}`)).toEqual(['6-6-3', '4-4-3', '1-3-3']);
  });
});

// ------------------------------------------------------------------ 3.0

describe('sequence of play', () => {
  it('[3.0] weather, then the German and Allied player turns (initial, movement, combat, recovery, supply), then victory', () => {
    const s = scenario({ turn: 3, side: 'German', phase: 'initial' });
    place(s, 'GE-I64', '3412', { halfEff: true, truck: true, repl: true });
    place(s, 'US-179', '2010', { halfEff: true });
    const at = () => `${s.turn}:${s.activeSide}:${s.phase}`;
    const seen = [at()];
    for (let i = 0; i < 6; i++) {
      applyAction(s, { type: 'endPhase' });
      seen.push(at());
      if (at() === '3:Allied:initial') {
        // The German Recovery Phase took the German markers off, not the Allied ones.
        expect([s.units['GE-I64'].halfEff, s.units['GE-I64'].truck, s.units['GE-I64'].repl, s.units['US-179'].halfEff]).toEqual([false, false, false, true]);
      }
    }
    expect(seen).toEqual(['3:German:initial', '3:German:movement', '3:German:combat', '3:Allied:initial', '3:Allied:movement', '3:Allied:combat', '4:German:initial']);
    expect(s.units['US-179'].halfEff).toBe(false);
    const phases = s.log.filter((l) => l.kind === 'phase').map((l) => `${l.side ?? '-'}:${l.phase}`);
    expect(phases).toEqual([
      'German:movement', 'German:combat', 'German:recovery', 'German:supply', 'Allied:initial', 'Allied:movement', 'Allied:combat',
      'Allied:recovery', 'Allied:supply', '-:victory', '-:weather', 'German:initial',
    ]);
    expect(s.log.some((l) => l.kind === 'weather' && l.turn === 4)).toBe(true);
  });
});

// ------------------------------------------------------------------ 4.0 stacking

describe('stacking', () => {
  it('[4.1] six stacking points per hex at the end of a move', () => {
    const s = setup();
    place(s, 'GE-129', C); // 3
    place(s, 'GE-71', C); // 2
    place(s, 'GE-I64', go(C, N)); // 1
    place(s, 'GE-II64', go(C, S)); // 1
    move(s, 'GE-I64', C);
    expect(stackPoints(unitsAt(s, C).map((u) => u.id), s)).toBe(6);
    expect(refused(s, { type: 'move', unitId: 'GE-II64', to: C })).toBe(true);
  });

  it('[4.2] units with a stacking value of 0 stack without limit', () => {
    const s = setup();
    for (const id of ['GE-129', 'GE-71', 'GE-I64']) place(s, id, C);
    const asus = ['GE-16Art', 'GE-HGArt', 'GE-29Art', 'GE-76Pz'];
    asus.forEach((id, i) => place(s, id, neighbors(C)[i]));
    for (const id of asus) move(s, id, C);
    expect(unitsAt(s, C).length).toBe(7);
    expect(stackPoints(unitsAt(s, C).map((u) => u.id), s)).toBe(6);
  });

  it('[4.3] one silhouetted tank per hex stacks free, the others count one point each', () => {
    expect(stackPoints(['GE-III2'])).toBe(0);
    expect(stackPoints(['GE-III2', 'GE-IIa2', 'GE-IIb2'])).toBe(2);
    const s = setup();
    place(s, 'GE-129', C);
    place(s, 'GE-III2', C);
    place(s, 'GE-IIa2', C);
    place(s, 'GE-I64', C); // 3 + 0 + 1 + 1 = 5
    place(s, 'GE-IIb2', go(C, N));
    place(s, 'GE-II64', go(C, S));
    move(s, 'GE-IIb2', C); // 6
    expect(refused(s, { type: 'move', unitId: 'GE-II64', to: C })).toBe(true);
  });

  it('[4.4] the limit is enforced at the end of the phasing player\'s movement and combat phases; retreats may overstack meanwhile', () => {
    // A retreat may end on a full hex (12.1.4).
    const s = setup({ phase: 'combat' });
    const full = go(C, S, 2);
    for (const id of ['US-179', 'US-143']) place(s, id, full);
    place(s, 'US-157', C);
    const opts = retreatChoices(s, ['US-157'], 2, C);
    expect(opts.some((p) => p.path[p.path.length - 1] === full)).toBe(true);
    // Overstacked Allied units survive the German phases and are culled at the end of the Allied movement phase.
    place(s, 'US-180', full); // 9 points
    act(s, { type: 'endPhase' }); // German combat ends
    expect(unitsAt(s, full).length).toBe(3);
    while (!(s.activeSide === 'Allied' && s.phase === 'movement')) act(s, { type: 'endPhase' });
    expect(unitsAt(s, full).length).toBe(3);
    act(s, { type: 'endPhase' });
    expect(stackPoints(unitsAt(s, full).map((u) => u.id), s)).toBeLessThanOrEqual(6);
    expect(unitsAt(s, full).length).toBe(2);
  });

  it('[4.4] the limit is also enforced at the moment an Auto DS is resolved', () => {
    const s = setup({ phase: 'movement' });
    place(s, 'US-36Art', C); // defends at 1, alone
    const n = go(C, N);
    for (const id of ['GE-129', 'GE-71', 'GE-I71']) place(s, id, n); // 6 points
    place(s, 'GE-II15', n); // 7: overstacked (as after a retreat)
    place(s, 'GE-I15', go(C, NE));
    place(s, 'GE-III15', go(C, NE));
    act(s, { type: 'autoDs', target: C, attackers: ['GE-129', 'GE-71', 'GE-I71', 'GE-II15', 'GE-I15', 'GE-III15'] });
    expect(stackPoints(unitsAt(s, n).map((u) => u.id), s)).toBe(6);
    expect(s.units['US-36Art'].where.kind).not.toBe('map');
  });

  it('[4.4] the phasing player loses excess units at the end of his combat phase', () => {
    const s = setup({ phase: 'combat' });
    for (const id of ['GE-129', 'GE-71', 'GE-I64', 'GE-II64']) place(s, id, C); // 7 points
    act(s, { type: 'endPhase' });
    expect(stackPoints(unitsAt(s, C).map((u) => u.id), s)).toBe(6);
    expect(s.units['GE-I64'].where.kind === 'eliminated' || s.units['GE-II64'].where.kind === 'eliminated').toBe(true);
  });
});

// ------------------------------------------------------------------ 5.0 movement

describe('land movement', () => {
  it('[5.1] a unit spends up to its MA, moves once, and never enters an enemy-occupied hex', () => {
    const s = setup();
    place(s, 'GE-III1FJ', C); // MA 3
    place(s, 'US-179', go(C, NE, 5));
    const r = reach(s, 'GE-III1FJ');
    expect(r.has(go(C, N, 3))).toBe(true);
    expect(r.has(go(C, N, 4))).toBe(false);
    setHex(go(C, S), { terrain: 'marsh' }); // 2 MP for infantry
    expect(reach(s, 'GE-III1FJ').get(go(C, S, 2))!.cost).toBe(3);
    // Cannot enter the enemy's hex.
    const t = setup();
    place(t, 'GE-I64', C);
    place(t, 'US-179', go(C, N));
    expect(reach(t, 'GE-I64').has(go(C, N))).toBe(false);
    move(t, 'GE-I64', go(C, S));
    expect(refused(t, { type: 'move', unitId: 'GE-I64', to: go(C, S, 2) })).toBe(true); // already moved
  });

  it('[5.2] roads: reduced rates, bridges over rivers, and road rates into and out of an EZOC', () => {
    const s = setup();
    // A minor road running north from C: mechanized units pay 1/2 per hex.
    for (let i = 0; i < 8; i++) setSide(go(C, N, i), go(C, N, i + 1), { road: 'minor' });
    place(s, 'GE-I64', C); // MA 5
    expect(reach(s, 'GE-I64').get(go(C, N, 8))!.cost).toBeCloseTo(4);
    // A major road: 1/3.
    for (let i = 0; i < 8; i++) setSide(go(C, S, i), go(C, S, i + 1), { road: 'major' });
    expect(reach(s, 'GE-I64').get(go(C, S, 6))!.cost).toBeCloseTo(2, 2);
    // Where the road crosses a river there is a bridge: no extra cost, vehicles cross normally.
    setSide(go(C, N, 1), go(C, N, 2), { road: 'minor', river: true });
    place(s, 'GE-IIb2', C);
    const r = reach(s, 'GE-IIb2');
    expect(r.get(go(C, N, 2))!.cost).toBeCloseTo(1);
    expect(r.get(go(C, N, 2))!.halfEff).toBe(false);
    // Leaving an EZOC along the road: road rate plus 2.
    const t = setup();
    for (let i = 0; i < 4; i++) setSide(go(C, N, i), go(C, N, i + 1), { road: 'minor' });
    place(t, 'GE-I64', C);
    place(t, 'US-179', go(C, SE));
    expect(reach(t, 'GE-I64').get(go(C, N))!.cost).toBeCloseTo(2.5);
  });

  it('[5.3] Extended Movement adds 3 MPs but may not enter an EZOC; it may start in one if the first hex leaves it', () => {
    const s = setup();
    place(s, 'GE-III1FJ', C); // MA 3
    const ext = reach(s, 'GE-III1FJ', 'extended');
    expect(ext.has(go(C, N, 6))).toBe(true);
    expect(ext.has(go(C, N, 7))).toBe(false);
    place(s, 'US-179', go(C, S, 3));
    expect(reach(s, 'GE-III1FJ', 'extended').has(go(C, S, 2))).toBe(false); // in the US ZOC
    expect(reach(s, 'GE-III1FJ', 'normal').has(go(C, S, 2))).toBe(true);
    // Starting in an EZOC: allowed if the first hex is outside it (and the exit costs 2 more).
    const t = setup();
    place(t, 'GE-III1FJ', C);
    place(t, 'US-179', go(C, S));
    const e2 = reach(t, 'GE-III1FJ', 'extended');
    expect(e2.get(go(C, N))!.cost).toBe(3);
    expect(e2.has(go(C, SE))).toBe(false); // still in the EZOC
    expect(e2.has(go(C, N, 4))).toBe(true); // 3 + 3 MPs
  });

  it('[5.4] Tactical Movement: one or two hexes whatever the cost, stop on entering an EZOC, never into a ZOC Bond', () => {
    const s = setup();
    setHex(go(C, N), { terrain: 'marsh' });
    setHex(go(C, N, 2), { terrain: 'marsh' });
    place(s, 'GE-IIb2', C); // a tank: 4 MP per marsh hex
    const tac = reach(s, 'GE-IIb2', 'tactical');
    expect(tac.has(go(C, N, 2))).toBe(true);
    expect(tac.has(go(C, N, 3))).toBe(false);
    expect(reach(s, 'GE-IIb2', 'normal').has(go(C, N, 2))).toBe(false);
    // Stops on entering an EZOC.
    place(s, 'US-179', go(C, S, 2));
    const tz = reach(s, 'GE-IIb2', 'tactical');
    expect(tz.has(go(C, S))).toBe(true);
    expect([...tz.values()].some((v) => v.prev === go(C, S))).toBe(false);
    // Allied Hex Bond on go(C, SW): cannot be entered.
    const t = setup();
    const bondHex = go(C, SW);
    place(t, 'US-179', go(bondHex, NW));
    place(t, 'US-143', go(bondHex, SE));
    place(t, 'GE-I64', go(bondHex, NE));
    expect(bondsOf(t, 'Allied').hexes.has(bondHex)).toBe(true);
    expect(reach(t, 'GE-I64', 'tactical').has(bondHex)).toBe(false);
    // And units that move tactically may attack.
    const u = setup();
    place(u, 'GE-I64', C);
    place(u, 'US-179', go(C, N, 3));
    move(u, 'GE-I64', go(C, N, 2), 'tactical');
    u.phase = 'combat';
    expect(refused(u, { type: 'attack', target: go(C, N, 3), attackers: ['GE-I64'] })).toBe(false);
  });

  it('[5.5] rivers: +1 MP for infantry; vehicles only as the first hex of a Tactical Move (not in Rain), and they become 1/2 Eff', () => {
    const s = setup();
    const x = go(C, N);
    setSide(C, x, { river: true });
    place(s, 'GE-III1FJ', C);
    expect(reach(s, 'GE-III1FJ').get(x)!.cost).toBe(2);
    place(s, 'GE-IIb2', C);
    expect(direct(reach(s, 'GE-IIb2', 'normal'), C, x)).toBe(false);
    const tac = reach(s, 'GE-IIb2', 'tactical');
    expect(direct(tac, C, x)).toBe(true);
    expect(tac.get(x)!.halfEff).toBe(true);
    place(s, 'US-179', go(x, N, 2)); // ends next to an enemy, so the marker stays
    move(s, 'GE-IIb2', go(x, N), 'tactical');
    expect(s.units['GE-IIb2'].halfEff).toBe(true);
    // Not as the second hex of a move.
    const t = setup();
    setSide(go(C, S), C, { river: true });
    place(t, 'GE-IIb2', go(C, S, 2));
    expect(reach(t, 'GE-IIb2', 'tactical').has(C)).toBe(false);
    // Not in Rain.
    const rain = RULES.weather.track.findIndex((w) => w.rain);
    const r = setup({ weather: rain });
    setSide(C, x, { river: true });
    place(r, 'GE-IIb2', C);
    expect(direct(reach(r, 'GE-IIb2', 'tactical'), C, x)).toBe(false);
  });

  it('[5.6] mountain hexsides: infantry by Tactical first hex only (1/2 Eff), vehicles only by road or pass', () => {
    const s = setup();
    const x = go(C, N);
    setSide(C, x, { mountain: true });
    place(s, 'GE-III1FJ', C);
    place(s, 'GE-IIb2', C);
    expect(direct(reach(s, 'GE-III1FJ', 'normal'), C, x)).toBe(false);
    expect(direct(reach(s, 'GE-III1FJ', 'tactical'), C, x)).toBe(true);
    expect(reach(s, 'GE-III1FJ', 'tactical').get(x)!.halfEff).toBe(true);
    expect(direct(reach(s, 'GE-IIb2', 'tactical'), C, x)).toBe(false);
    // A pass lets vehicles over (pass cost added); so does a road.
    setSide(C, x, { mountain: true, pass: true });
    const viaPass = stepCost(s, s.units['GE-IIb2'], C, x, 'normal');
    expect(viaPass!.cost).toBe(RULES.movement.terrain.clear.mech + RULES.movement.pass.mech);
    expect(viaPass!.firstHexOnly).toBe(false);
    setSide(C, x, { mountain: true, road: 'minor' });
    expect(reach(s, 'GE-IIb2', 'normal').get(x)!.cost).toBe(0.5);
    // Not as the second hex of a Tactical Move.
    const t = setup();
    setSide(x, go(x, N), { mountain: true });
    place(t, 'GE-III1FJ', C);
    expect(reach(t, 'GE-III1FJ', 'tactical').has(go(x, N))).toBe(false);
  });

  it('[5.7] 1/2 Eff: attack halved (rounded up) and Advance After Combat of one hex at most', () => {
    const s = setup({ phase: 'combat' });
    const tgt = go(C, N);
    place(s, 'US-1-142', tgt); // 2-2-3
    place(s, 'GE-II64', C, { halfEff: true }); // 3 attack, halved to 2
    place(s, 'GE-I64', go(C, NW)); // 2
    const odds = computeOdds(s, { target: tgt, attackers: ['GE-II64', 'GE-I64'] });
    expect(odds.attack).toBe(4);
    // 4 to 2 = 2-1, +1 Elite = 3-1; a 3 there is DR2 (advance 2).
    expect(odds.finalIndex).toBe(4);
    dice(s, 3);
    act(s, { type: 'attack', target: tgt, attackers: ['GE-II64', 'GE-I64'] });
    act(s, { type: 'defend', choice: 'retreat' });
    expect(s.pendingAdvance!.maxByUnit).toEqual({ 'GE-II64': 1, 'GE-I64': 2 });
  });

  it('[5.7] 1/2 Eff units may not attack across a mountain hexside, nor vehicles across a river', () => {
    const s = setup({ phase: 'combat' });
    const tgt = go(C, N);
    place(s, 'US-1-142', tgt);
    place(s, 'GE-II64', C, { halfEff: true });
    place(s, 'GE-IIb2', C, { halfEff: true });
    setSide(C, tgt, { mountain: true, road: 'minor' });
    expect(refused(s, { type: 'attack', target: tgt, attackers: ['GE-II64'] })).toBe(true);
    s.units['GE-II64'].halfEff = false;
    expect(refused(s, { type: 'attack', target: tgt, attackers: ['GE-II64'] })).toBe(false);
    setSide(C, tgt, { river: true });
    expect(refused(s, { type: 'attack', target: tgt, attackers: ['GE-IIb2'] })).toBe(true);
    s.units['GE-IIb2'].halfEff = false;
    expect(refused(s, { type: 'attack', target: tgt, attackers: ['GE-IIb2'] })).toBe(false);
  });

  it('[5.7] the marker is dropped if the unit ends its move away from the enemy, and removed in the Recovery Phase', () => {
    const s = setup();
    setSide(C, go(C, N), { mountain: true });
    setSide(go(C, S), go(C, S, 2), { mountain: true });
    place(s, 'GE-III1FJ', C);
    place(s, 'GE-I3FJ', go(C, S));
    place(s, 'US-179', go(C, S, 4));
    move(s, 'GE-III1FJ', go(C, N), 'tactical');
    move(s, 'GE-I3FJ', go(C, S, 3), 'tactical'); // next to the US unit
    expect([s.units['GE-III1FJ'].halfEff, s.units['GE-I3FJ'].halfEff]).toEqual([true, true]);
    act(s, { type: 'endPhase' });
    expect([s.units['GE-III1FJ'].halfEff, s.units['GE-I3FJ'].halfEff]).toEqual([false, true]);
    act(s, { type: 'endPhase' }); // combat -> recovery
    expect(s.units['GE-I3FJ'].halfEff).toBe(false);
  });

  it('[5.7] a unit already 1/2 Eff may not earn a second marker the same turn', () => {
    const s = setup();
    setSide(C, go(C, N), { mountain: true });
    place(s, 'GE-III1FJ', C, { halfEff: true }); // e.g. scattered by an airdrop
    expect(direct(reach(s, 'GE-III1FJ', 'tactical'), C, go(C, N))).toBe(false);
    s.units['GE-III1FJ'].halfEff = false;
    expect(direct(reach(s, 'GE-III1FJ', 'tactical'), C, go(C, N))).toBe(true);
  });

  it('[5.8] trucks: two German non-mechanized units in supply move as mechanized with MA 5 and attack 0', () => {
    const s = setup();
    const Z = '3503'; // three hexes from the N2 Entry Area: in supply
    sandbox(Z, 3);
    for (const id of ['GE-III1FJ', 'GE-I3FJ', 'GE-I4FJ']) place(s, id, Z);
    place(s, 'GE-I64', go(Z, SE)); // mechanized: no trucks
    place(s, 'US-179', go(Z, S, 3));
    expect(supplyChecker(s, 'German').inSupply(Z)).toBe(true);
    // Mechanized rates: a hill costs the trucked infantry 2 MP.
    setHex(go(Z, SW), { terrain: 'hill' });
    expect(reach(s, 'GE-III1FJ', 'truck').get(go(Z, SW))!.cost).toBe(2);
    expect(reach(s, 'GE-III1FJ', 'normal').get(go(Z, SW))!.cost).toBe(1);
    move(s, 'GE-III1FJ', go(Z, S, 2), 'truck'); // next to the enemy: allowed when not extended
    move(s, 'GE-I3FJ', go(Z, NW), 'truck');
    expect(s.trucksUsed).toBe(2);
    expect(refused(s, { type: 'move', unitId: 'GE-I4FJ', to: go(Z, NE), mode: 'truck' })).toBe(true);
    expect(refused(s, { type: 'move', unitId: 'GE-I64', to: go(Z, NE), mode: 'truck' })).toBe(true);
    s.phase = 'combat';
    expect(refused(s, { type: 'attack', target: go(Z, S, 3), attackers: ['GE-III1FJ'] })).toBe(true);
    // Recovery removes the markers.
    act(s, { type: 'endPhase' });
    expect(s.units['GE-III1FJ'].truck).toBe(false);
  });

  it('[5.8] supply for trucks is judged at that instant', () => {
    const s = setup();
    place(s, 'GE-III1FJ', C, { outOfSupply: false }); // marked in supply last turn, cut off now
    expect(supplyChecker(s, 'German').inSupply(C)).toBe(false);
    expect(refused(s, { type: 'move', unitId: 'GE-III1FJ', to: go(C, N, 4), mode: 'truck' })).toBe(true);
    expect(refused(s, { type: 'move', unitId: 'GE-III1FJ', to: go(C, N, 3), mode: 'normal' })).toBe(false);
  });
});

// ------------------------------------------------------------------ 6.0 ZOCs

describe('zones of control', () => {
  it('[6.1] ZOCs cover the six adjacent land hexes; vehicle ZOCs cross mountain hexsides only at roads and passes', () => {
    const s = setup();
    const inf = go(C, N, 3);
    const tank = go(C, S, 3);
    place(s, 'US-179', inf);
    place(s, 'US-191', tank);
    setSide(inf, go(inf, N), { mountain: true });
    setSide(tank, go(tank, S), { mountain: true });
    setSide(tank, go(tank, SE), { mountain: true, pass: true });
    setSide(tank, go(tank, SW), { mountain: true, road: 'minor' });
    setHex(go(inf, SE), { terrain: 'sea' });
    const z = zocOf(s, 'Allied');
    expect(z.has(go(inf, N))).toBe(true); // infantry: across the ridge
    expect(z.has(go(inf, SE))).toBe(false); // never into the sea
    expect(z.has(go(tank, S))).toBe(false); // tank: not across a bare ridge
    expect(z.has(go(tank, SE))).toBe(true); // ... but at a pass
    expect(z.has(go(tank, SW))).toBe(true); // ... or a road
    expect(neighbors(inf).filter((n) => n !== go(inf, SE)).every((n) => z.has(n))).toBe(true);
  });

  it('[6.2] units stop on entering an EZOC, pay +2 MP to leave one, and may go EZOC to EZOC unless a ZOC Bond is in the way', () => {
    const s = setup();
    place(s, 'GE-I64', go(C, S, 2));
    place(s, 'US-179', go(C, N));
    const r = reach(s, 'GE-I64');
    expect(r.has(C)).toBe(true); // in the US ZOC: no extra cost to enter
    expect(r.get(C)!.cost).toBe(2);
    expect([...r.values()].some((v) => v.prev === C)).toBe(false); // must stop there
    // Unit B of the example: from one EZOC straight into another, then stop.
    const t = setup();
    place(t, 'GE-I64', C);
    place(t, 'US-179', go(C, N));
    const rb = reach(t, 'GE-I64');
    expect(rb.get(go(C, NE))!.cost).toBe(3);
    expect([...rb.values()].some((v) => v.prev === go(C, NE))).toBe(false);
    // A hexside bond across C|NE (anchors N and SE of C) closes that step.
    place(t, 'US-143', go(C, SE));
    expect(bondsOf(t, 'Allied').sides.has(sideKey(C, go(C, NE)))).toBe(true);
    expect(direct(reach(t, 'GE-I64'), C, go(C, NE))).toBe(false);
  });

  it('[6.3] ZOC effects on retreats, advances and supply are pointers to 12.2, 14.4 and 16.3', () => {
    // Covered by the 12.2 tests and by the 14.4 and 16.3 tests of those sections; a quick check of the retreat case.
    const s = setup({ phase: 'combat' });
    place(s, 'US-157', C);
    place(s, 'GE-129', go(C, N, 2));
    const p = retreatChoices(s, ['US-157'], 1, C)[0];
    expect(zocOf(s, 'German').has(p.path[0])).toBe(false);
  });
});

// ------------------------------------------------------------------ 7.0 ZOC Bonds

describe('ZOC bonds', () => {
  it('[7.1] Good Order units two hexes apart bond across a vacant hex (Hex Bond) or a hexside (Hexside Bond); free-stacking units do not', () => {
    const s = setup();
    // Hex Bond: anchors on opposite sides of C.
    place(s, 'GE-I64', go(C, NW));
    place(s, 'GE-II64', go(C, SE));
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
    s.units['GE-II64'].status = 'disrupted';
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    s.units['GE-II64'].where = { kind: 'removed', reason: 'test' };
    place(s, 'GE-IIb2', go(C, SE)); // silhouetted tank: free stacking
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    s.units['GE-IIb2'].where = { kind: 'removed', reason: 'test' };
    place(s, 'GE-16Art', go(C, SE)); // ASU: free stacking
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    place(s, 'GE-I79', go(C, SE)); // a regular unit in the same stack restores it
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
    // Not with an occupied intervening hex (it is no longer vacant).
    place(s, 'GE-I71', C);
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    // Hexside Bond: anchors N and SE of C share the neighbours C and NE.
    const t = setup();
    place(t, 'GE-I64', go(C, N));
    place(t, 'GE-II64', go(C, SE));
    expect(bondsOf(t, 'German').sides.has(sideKey(C, go(C, NE)))).toBe(true);
  });

  it('[7.2] enemy units may not enter or cross a bond in the Movement Phase', () => {
    const s = setup();
    place(s, 'GE-I64', go(C, NW));
    place(s, 'GE-II64', go(C, SE));
    place(s, 'US-179', go(C, NE, 2));
    s.activeSide = 'Allied';
    expect(reach(s, 'US-179').has(C)).toBe(false);
    expect(reach(s, 'US-179', 'tactical').has(C)).toBe(false);
  });

  it('[7.2] a unit forced to retreat across an enemy Hexside Bond is eliminated', () => {
    const run = (bonded: boolean) => {
      const s = setup({ phase: 'combat' });
      place(s, 'US-1-142', C); // 2-2-3
      place(s, 'GE-II64', go(C, N)); // anchor a, attacker
      place(s, 'GE-I71', go(C, SE), { status: bonded ? 'good' : 'disrupted' }); // anchor b
      place(s, 'GE-I64', go(C, S));
      place(s, 'GE-I79', go(C, SW));
      place(s, 'GE-II79', go(C, NW));
      // The only way out is across the hexside C|NE.
      dice(s, 5); // 3 to 2 = 1-1, +1 Elite = 2-1: DR2
      act(s, { type: 'attack', target: C, attackers: ['GE-II64'] });
      act(s, { type: 'defend', choice: 'retreat' });
      return s.units['US-1-142'].where;
    };
    expect(run(true).kind).toBe('eliminated');
    expect(run(false)).toEqual({ kind: 'map', hex: go(C, NE, 2) });
  });

  it('[7.2] no Advance After Combat into or across an enemy bond, except into the defender\'s vacated hex', () => {
    const s = setup({ phase: 'combat' });
    // Allied anchors NW and SE of C: C itself becomes a Hex Bond once vacated.
    place(s, 'US-179', go(C, NW));
    place(s, 'US-143', go(C, SE));
    place(s, 'GE-I64', go(C, N));
    const pa = { combatId: 0, vacated: C, from: { 'GE-I64': go(C, N) }, maxByUnit: { 'GE-I64': 2 }, limited: false };
    expect(bondsOf(s, 'Allied').hexes.has(C)).toBe(true);
    const before = advanceDestinations(s, pa, 'GE-I64');
    expect(before.has(C)).toBe(true);
    expect(before.has(go(C, S))).toBe(true);
    // A third US unit makes S of C a Hex Bond too (anchors SE of C and SW of S).
    place(s, 'US-180', go(go(C, S), SW));
    expect(bondsOf(s, 'Allied').hexes.has(go(C, S))).toBe(true);
    const after = advanceDestinations(s, pa, 'GE-I64');
    expect(after.has(C)).toBe(true);
    expect(after.has(go(C, S))).toBe(false);
  });

  it('[7.3] a Hexside Bond breaks when enemy units stand on both sides of the hexside (the rulebook example)', () => {
    const s = setup();
    // Unit B (German) at C, between US units N and SE of it (a Hexside Bond across C|NE).
    place(s, 'GE-I64', C); // B
    place(s, 'US-179', go(C, N));
    place(s, 'US-143', go(C, SE));
    place(s, 'GE-II64', go(go(C, NE), NE)); // A
    expect(bondsOf(s, 'Allied').sides.has(sideKey(C, go(C, NE)))).toBe(true);
    expect(refused(s, { type: 'move', unitId: 'GE-I64', to: go(C, NE) })).toBe(true);
    // A moves next to B, into NE of C: the bond is broken at once and B may join A.
    move(s, 'GE-II64', go(C, NE));
    expect(bondsOf(s, 'Allied').sides.has(sideKey(C, go(C, NE)))).toBe(false);
    expect(refused(s, { type: 'move', unitId: 'GE-I64', to: go(C, NE) })).toBe(false);
  });

  it('[7.3] a Hex Bond breaks when an enemy unit enters the intervening hex', () => {
    const s = setup();
    place(s, 'US-179', go(C, NW));
    place(s, 'US-143', go(C, SE));
    expect(bondsOf(s, 'Allied').hexes.has(C)).toBe(true);
    place(s, 'GE-I64', C);
    expect(bondsOf(s, 'Allied').hexes.has(C)).toBe(false);
  });

  it('[7.4] intersecting bonds: neither side may cross the other\'s', () => {
    const s = setup();
    place(s, 'GE-I64', go(C, NW));
    place(s, 'GE-II64', go(C, SE));
    place(s, 'US-179', go(C, N));
    place(s, 'US-143', go(C, S));
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
    expect(bondsOf(s, 'Allied').hexes.has(C)).toBe(true);
    place(s, 'GE-I79', go(C, NE));
    expect(reach(s, 'GE-I79', 'tactical').has(C)).toBe(false);
    s.activeSide = 'Allied';
    place(s, 'US-157', go(C, SW));
    expect(reach(s, 'US-157', 'tactical').has(C)).toBe(false);
  });

  it('[7.5] a Hexside Bond (never a Hex Bond) with a friendly Entry Area; none with an enemy one', () => {
    const s = scenario();
    sandbox('4514', 2);
    // 4514 touches E3's edge hexes 4614 and 4615.
    place(s, 'GE-I64', '4514');
    expect(bondsOf(s, 'German').sides.has(sideKey('4614', '4615'))).toBe(true);
    expect([...bondsOf(s, 'German').hexes]).toEqual([]);
    s.control.E3 = 'Allied';
    expect(bondsOf(s, 'German').sides.has(sideKey('4614', '4615'))).toBe(false);
  });

  it('[7.6.1] no bond across two non-road mountain hexsides; a Hexside Bond may be pushed round a ridge but not into an enemy unit', () => {
    const s = setup();
    const a = go(C, NW);
    const b = go(C, SE);
    place(s, 'GE-I64', a);
    place(s, 'GE-II64', b);
    setSide(a, C, { mountain: true });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true); // one ridge (B-C in the example)
    setSide(C, b, { mountain: true });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false); // two ridges (A-B)
    setSide(C, b, { mountain: true, road: 'minor' });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
    // A road-less pass is still a non-road mountain hexside.
    setSide(C, b, { mountain: true, pass: true });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    // Hexside Bond between N and SE of C (via C or NE): ridges on both legs through C push it to NE...
    const t = setup();
    const p = go(C, N);
    const q = go(C, SE);
    const ne = go(C, NE);
    place(t, 'GE-I64', p);
    place(t, 'GE-II64', q);
    setSide(p, C, { mountain: true });
    setSide(C, q, { mountain: true });
    expect(bondsOf(t, 'German').sides.has(sideKey(C, ne))).toBe(true);
    // ... unless an enemy unit holds NE (D-E in the example): then the bond is broken.
    place(t, 'US-179', ne);
    expect(bondsOf(t, 'German').sides.has(sideKey(C, ne))).toBe(false);
  });

  it('[7.6.1] vehicles bond across a mountain hexside only where a road crosses it (a pass is not enough)', () => {
    const s = setup();
    const a = go(C, NW);
    const b = go(C, SE);
    place(s, 'GE-KGDor', a); // recon: a vehicle
    place(s, 'GE-II64', b);
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
    setSide(a, C, { mountain: true, pass: true });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
    setSide(a, C, { mountain: true, road: 'minor' });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
  });

  it('[7.6.2] no bond with or across the coast', () => {
    const s = setup();
    place(s, 'GE-I64', go(C, NW));
    place(s, 'GE-II64', go(C, SE));
    setHex(C, { terrain: 'sea' });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(false);
  });

  it('[7.6.3] bonds may be formed across two minor river hexsides', () => {
    const s = setup();
    place(s, 'GE-I64', go(C, NW));
    place(s, 'GE-II64', go(C, SE));
    setSide(go(C, NW), C, { river: true });
    setSide(C, go(C, SE), { river: true });
    expect(bondsOf(s, 'German').hexes.has(C)).toBe(true);
  });
});

describe('all-sea hexsides', () => {
  // Two land hexes whose shared side is water all along it on the printed map (Agropoli and the next beach hex
  // north, Gaeta and Formia): nothing goes across, and nothing reaches across.
  const Y = go(C, N);
  const sea = () => setSide(C, Y, { allSea: true });

  it('[5.1, 8.2] no unit moves or attacks across one', () => {
    const s = setup();
    sea();
    place(s, 'GE-I64', C);
    const r = reach(s, 'GE-I64', 'tactical');
    expect(stepCost(s, s.units['GE-I64'], C, Y, 'normal')).toBeNull();
    expect(r.get(Y)?.prev).not.toBe(C); // only the long way round
    const t = setup({ phase: 'combat' });
    sea();
    place(t, 'GE-I64', C);
    place(t, 'US-179', Y);
    expect(refused(t, { type: 'attack', target: Y, attackers: ['GE-I64'] })).toBe(true);
  });

  it('[6.1, 7.6.2] no ZOC and no ZOC bond leg reaches across one', () => {
    const s = setup();
    place(s, 'GE-I64', C);
    expect(zocOf(s, 'German').has(Y)).toBe(true);
    sea();
    expect(zocOf(s, 'German').has(Y)).toBe(false);
    expect(neighbors(C).filter((n) => n !== Y).every((n) => zocOf(s, 'German').has(n))).toBe(true);
    // Anchors two hexes apart in a line, the bond hex between them: one leg across the water breaks it.
    restoreMap();
    const b = setup();
    place(b, 'GE-I64', C);
    place(b, 'GE-I79', go(C, N, 2));
    expect(bondsOf(b, 'German').hexes.has(Y)).toBe(true);
    sea();
    expect(bondsOf(b, 'German').hexes.has(Y)).toBe(false);
  });

  it('[16.3.2] no Line of Supply is traced overland across one', () => {
    const s = setup();
    const Z = '3503'; // three hexes from the N2 Entry Area: in supply
    sandbox(Z, 3);
    place(s, 'GE-III1FJ', Z);
    expect(supplyChecker(s, 'German').inSupply(Z)).toBe(true);
    for (const n of neighbors(Z)) setSide(Z, n, { allSea: true });
    expect(supplyChecker(s, 'German').inSupply(Z)).toBe(false);
  });

  it('[12.1, 14.4] no retreat and no advance after combat across one', () => {
    const s = setup({ phase: 'combat' });
    place(s, 'US-157', C);
    expect(retreatChoices(s, ['US-157'], 1, go(C, S)).some((p) => p.path[0] === Y)).toBe(true);
    sea();
    expect(retreatChoices(s, ['US-157'], 1, go(C, S)).some((p) => p.path[0] === Y)).toBe(false);
    place(s, 'GE-I64', go(C, S));
    const pa = { combatId: 0, vacated: C, from: { 'GE-I64': go(C, S) }, maxByUnit: { 'GE-I64': 2 }, limited: false };
    s.units['US-157'].where = { kind: 'removed', reason: 'test' };
    const dest = advanceDestinations(s, pa, 'GE-I64');
    expect(dest.has(C)).toBe(true);
    expect(dest.has(Y)).toBe(false); // two hexes straight on, across the water
    restoreMap();
    sandbox(C, 8);
    expect(advanceDestinations(s, pa, 'GE-I64').has(Y)).toBe(true);
  });
});
