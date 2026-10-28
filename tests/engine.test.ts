import { describe, expect, it } from 'vitest';
import { distance, isAdjacent, neighbors, sideKey } from '../src/engine/hex';
import { MAP, UNIT_DEFS } from '../src/engine/data';
import { actingSide, applyAction, IllegalAction, landingHexes, newGame } from '../src/engine/game';
import { legalDestinations, stepCost } from '../src/engine/movement';
import { computeOdds, parseCell } from '../src/engine/combat';
import { supplyChecker } from '../src/engine/supply';
import { stackPoints, unitsAt } from '../src/engine/units';
import { bondsOf } from '../src/engine/zoc';
import type { GameState } from '../src/engine/types';

function clearMap(s: GameState) {
  for (const u of Object.values(s.units)) if (u.where.kind === 'map') u.where = { kind: 'removed', reason: 'test' };
}
function put(s: GameState, id: string, hex: string) {
  s.units[id].where = { kind: 'map', hex };
}

describe('hex grid and map', () => {
  it('uses odd-q neighbours', () => {
    expect(neighbors('2707').sort()).toEqual(['2607', '2608', '2706', '2708', '2807', '2808'].sort());
    expect(distance('2707', '2910')).toBe(4);
    expect(sideKey('2807', '2707')).toBe('2707-2807');
  });
  it('has the key places and only adjacent hexsides', () => {
    expect(MAP.hexes['2707'].city).toBe('Salerno');
    expect(MAP.hexes['3203'].vp).toBe(2);
    for (const k of Object.keys(MAP.hexsides)) {
      const [a, b] = k.split('-');
      expect(isAdjacent(a, b)).toBe(true);
    }
  });
});

describe('order of battle', () => {
  it('matches the set-up cards', () => {
    expect(UNIT_DEFS['US-179'].steps[0]).toEqual({ attack: 6, defense: 6, move: 3 });
    expect(UNIT_DEFS['US-179'].steps.length).toBe(3);
    expect(UNIT_DEFS['GE-129'].steps[0]).toEqual({ attack: 6, defense: 9, move: 5 });
    expect(UNIT_DEFS['GE-IIa2'].tankRating).toBe(3);
    expect(UNIT_DEFS['US-504'].elite).toBe(true);
    expect(UNIT_DEFS['CN-1'].army8).toBe(true);
    expect(UNIT_DEFS['US-36Art'].asu).toBe('division');
    expect(UNIT_DEFS['GE-71NW'].asu).toBe('corps');
  });
  it('counts stacking points with one free silhouetted tank', () => {
    expect(stackPoints(['US-179', 'US-157', 'US-191'])).toBe(5);
    expect(stackPoints(['US-179', 'US-191', 'US-751'])).toBe(4);
    expect(stackPoints(['US-36Art', 'US-BH531R'])).toBe(0);
  });
});

describe('turn 1', () => {
  it('starts with the invasion and lands the assault waves', () => {
    const s = newGame('campaign', 42);
    expect(s.phase).toBe('invasion');
    expect(s.activeSide).toBe('Allied');
    expect(unitsAt(s, '2617').map((u) => u.id)).toContain('US-BH531B');
    expect(unitsAt(s, '2710').some((u) => u.id === 'BR-128' || u.where.kind === 'map')).toBe(true);
    expect(s.log.filter((l) => l.text.includes('invasion roll')).length).toBe(7);
    expect(s.supplyPoints).toEqual({ Allied: 0, German: 3 });
  });

  it('then plays the German turn with half movement', () => {
    const s = newGame('campaign', 42);
    applyAction(s, { type: 'endPhase' });
    expect(s.activeSide).toBe('German');
    expect(s.phase).toBe('initial');
    expect(s.units['GE-HGAA'].where).toEqual({ kind: 'entry', area: 'N' });
    applyAction(s, { type: 'endPhase' });
    expect(s.phase).toBe('movement');
    // KG Dörnemann (MA 6) has 3 MP on turn 1.
    const d = legalDestinations(s, 'GE-KGDor', 'normal');
    for (const [, r] of d) expect(r.cost).toBeLessThanOrEqual(3);
    expect(() => applyAction(s, { type: 'move', unitId: 'GE-III1FJ', to: '2302' })).toThrow(IllegalAction);
  });

  it('lands the follow-up wave at its corps beaches', () => {
    const s = newGame('campaign', 42);
    for (let i = 0; i < 4; i++) applyAction(s, { type: 'endPhase' }); // through the German turn
    expect(s.activeSide).toBe('Allied');
    applyAction(s, { type: 'endPhase' }); // Allied initial -> movement
    expect(s.phase).toBe('movement');
    const hexes = landingHexes(s, 'US-143');
    expect(hexes.length).toBeGreaterThan(0);
    for (const h of hexes) expect(['2616', '2617']).toContain(h);
    applyAction(s, { type: 'land', unitId: 'US-143', to: hexes[0] });
    expect(s.units['US-143'].halfEff || s.units['US-143'].status === 'disrupted').toBe(true);
  });
});

describe('movement', () => {
  it('uses the TEC costs', () => {
    const s = newGame('campaign', 1);
    const tank = s.units['GE-IIa2'];
    const inf = s.units['GE-III1FJ'];
    const road = Object.entries(MAP.hexsides).find(([, v]) => v.road === 'major')![0].split('-');
    expect(stepCost(s, tank, road[0], road[1], 'normal')!.cost).toBeCloseTo(1 / 3, 2);
    expect(stepCost(s, inf, road[0], road[1], 'normal')!.cost).toBe(1);
    // A mountain hexside without road or pass: prohibited for vehicles, first-hex tactical only for infantry.
    const mtn = Object.entries(MAP.hexsides).find(([, v]) => v.mountain && !v.road && !v.pass && !v.river)![0].split('-');
    expect(stepCost(s, tank, mtn[0], mtn[1], 'normal')).toBeNull();
    expect(stepCost(s, inf, mtn[0], mtn[1], 'tactical')!.firstHexOnly).toBe(true);
  });
});

describe('zones of control', () => {
  it('forms a hex bond between two units two hexes apart', () => {
    const s = newGame('campaign', 1);
    clearMap(s);
    put(s, 'GE-I64', '2911');
    put(s, 'GE-II64', '2913');
    const b = bondsOf(s, 'German');
    expect(b.hexes.has('2912')).toBe(true);
  });
});

describe('combat', () => {
  it('parses CRT cells', () => {
    expect(parseCell('A1/D1/2y')).toEqual({ result: 'A1/D1', adv: 2, color: 'y' });
    expect(parseCell('DS/4r')).toEqual({ result: 'DS', adv: 4, color: 'r' });
    expect(parseCell('EX')).toEqual({ result: 'EX', adv: 0, color: '' });
  });

  it('halves units outside the Main Assault Force and doubles defenders in hills', () => {
    const s = newGame('campaign', 1);
    clearMap(s);
    s.phase = 'combat';
    s.activeSide = 'Allied';
    put(s, 'US-179', '2909');
    put(s, 'US-142', '2909');
    put(s, 'GE-I64', '3009');
    const odds = computeOdds(s, { target: '3009', attackers: ['US-179', 'US-142'] });
    expect(odds.ok).toBe(true);
    // 45 Div MAF: 6 full + 36 Div 4 halved = 8; I/64 (3) doubled in hills = 6.
    const hillDefender = MAP.hexes['3009'].terrain === 'hill';
    expect(odds.attack).toBe(8);
    expect(odds.defense).toBe(hillDefender ? 6 : 3);
  });

  it('asks the defender to choose and resolves either choice', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = newGame('campaign', seed);
      clearMap(s);
      s.phase = 'combat';
      s.activeSide = 'Allied';
      put(s, 'US-179', '2910');
      put(s, 'US-751', '2910');
      put(s, 'GE-I64', '2911');
      applyAction(s, { type: 'attack', target: '2911', attackers: ['US-179', 'US-751'] });
      if (s.pendingDefense) {
        expect(actingSide(s)).toBe('German');
        expect(() => applyAction(s, { type: 'endPhase' })).toThrow(IllegalAction);
        applyAction(s, { type: 'defend', choice: 'dd' });
        expect(s.pendingDefense).toBeNull();
        expect(s.combats[0].dd).toBeDefined();
        return;
      }
    }
    throw new Error('no seed produced a Determined Defense choice');
  });

  it('forbids US and Commonwealth units attacking together', () => {
    const s = newGame('campaign', 1);
    clearMap(s);
    s.phase = 'combat';
    s.activeSide = 'Allied';
    put(s, 'US-179', '2810');
    put(s, 'BR-139', '2911');
    put(s, 'GE-I64', '2910');
    const odds = computeOdds(s, { target: '2910', attackers: ['US-179', 'BR-139'] });
    expect(odds.ok).toBe(false);
  });
});

describe('supply', () => {
  it('supplies Germans from the north edge and Allies from beachheads', () => {
    const s = newGame('campaign', 3);
    expect(supplyChecker(s, 'German').inSupply('3203')).toBe(true);
    expect(supplyChecker(s, 'Allied').inSupply('2617')).toBe(true);
  });
});
