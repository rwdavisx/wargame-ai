import { describe, expect, it } from 'vitest';
import { distance, isAdjacent, neighbors, sideKey } from '../src/engine/hex';
import { MAP, UNIT_DEFS } from '../src/engine/data';
import { alliedVp, applyAction, IllegalAction, landingHexes, newGame } from '../src/engine/game';
import { legalDestinations, stepCost } from '../src/engine/movement';
import { computeOdds } from '../src/engine/combat';
import { suppliedHexes } from '../src/engine/supply';
import { unitsAt } from '../src/engine/units';
import type { GameState } from '../src/engine/types';

function endPhases(s: GameState, n: number) {
  for (let i = 0; i < n; i++) applyAction(s, { type: 'endPhase' });
}

describe('hex grid', () => {
  it('uses odd-q neighbours', () => {
    expect(neighbors('2707').sort()).toEqual(['2607', '2608', '2706', '2708', '2807', '2808'].sort());
    expect(neighbors('2806').sort()).toEqual(['2705', '2706', '2805', '2807', '2905', '2906'].sort());
    expect(isAdjacent('2707', '2807')).toBe(true);
    expect(distance('2707', '2707')).toBe(0);
    expect(distance('2707', '2910')).toBe(4);
    expect(sideKey('2807', '2707')).toBe('2707-2807');
  });
});

describe('map data', () => {
  it('has the key places', () => {
    expect(MAP.hexes['2707'].city).toBe('Salerno');
    expect(MAP.hexes['2707'].vp).toBe(2);
    expect(MAP.hexes['3203'].city).toBe('Avellino');
    expect(MAP.hexes['2409'].terrain).toBe('sea');
    for (const b of Object.values(MAP.beaches)) expect(MAP.hexes[b.hex].terrain).not.toBe('sea');
  });
  it('only joins adjacent hexes with hexside features', () => {
    for (const k of Object.keys(MAP.hexsides)) {
      const [a, b] = k.split('-');
      expect(isAdjacent(a, b)).toBe(true);
    }
  });
  it('runs a major road from Salerno to Battipaglia', () => {
    const path = ['2707', '2708', '2809', '2810', '2910', '2911', '3012'];
    for (let i = 0; i < path.length - 1; i++) expect(MAP.hexsides[sideKey(path[i], path[i + 1])]?.road).toBe('major');
  });
});

describe('game flow', () => {
  it('sets up and starts in the Allied initial phase of turn 1', () => {
    const s = newGame('short', 42);
    expect(s.turn).toBe(1);
    expect(s.activeSide).toBe('Allied');
    expect(s.phase).toBe('initial');
    expect(unitsAt(s, '2710').map((u) => u.id)).toContain('BR-128');
    expect(s.units['GE-FJ'].frozenUntil).toBe(3);
    expect(Object.keys(UNIT_DEFS).length).toBeGreaterThan(50);
  });

  it('moves units and stops in enemy zones of control', () => {
    const s = newGame('short', 1);
    endPhases(s, 1); // -> movement
    expect(s.phase).toBe('movement');
    const dests = legalDestinations(s, 'BR-128', 'tactical');
    expect(dests.size).toBeGreaterThan(0);
    for (const [, r] of dests) expect(r.cost).toBeLessThanOrEqual(4);
    const to = [...dests.keys()][0];
    applyAction(s, { type: 'move', unitId: 'BR-128', to });
    expect(s.units['BR-128'].where).toEqual({ kind: 'map', hex: to });
  });

  it('rejects moves by the inactive side', () => {
    const s = newGame('short', 1);
    endPhases(s, 1);
    expect(() => applyAction(s, { type: 'move', unitId: 'GE-64PG', to: '2807' })).toThrow(IllegalAction);
  });

  it('lands reserve units on beaches', () => {
    const s = newGame('short', 1);
    endPhases(s, 1);
    const hexes = landingHexes(s, 'US-143');
    expect(hexes.length).toBeGreaterThan(0);
    applyAction(s, { type: 'land', unitId: 'US-143', to: hexes[0] });
    expect(s.units['US-143'].where.kind).toBe('map');
  });

  it('charges road and terrain costs', () => {
    const s = newGame('short', 1);
    const u = s.units['GE-II2Pz'];
    expect(stepCost(s, u, '2910', '2911', 'tactical')).toBe(0.5);
    expect(stepCost(s, u, '2707', '2809', 'tactical')).toBeNull(); // not adjacent: no hex data path
  });

  it('resolves an attack and records it', () => {
    const s = newGame('short', 7);
    endPhases(s, 2); // -> combat
    expect(s.phase).toBe('combat');
    // Put an Allied unit next to a German one for a guaranteed legal attack.
    s.units['BR-169'].where = { kind: 'map', hex: '3011' };
    const odds = computeOdds(s, { target: '2911', attackers: ['BR-169'] });
    expect(odds.ok).toBe(true);
    applyAction(s, { type: 'attack', target: '2911', attackers: ['BR-169'] });
    expect(s.combats.length).toBe(1);
    expect(s.units['BR-169'].attacked).toBe(true);
  });

  it('cycles through a full turn into turn 2', () => {
    const s = newGame('short', 3);
    // Allied: initial, movement, combat -> German: initial, movement, combat -> turn 2 Allied initial
    endPhases(s, 6);
    expect(s.turn).toBe(2);
    expect(s.activeSide).toBe('Allied');
    expect(s.phase).toBe('initial');
    expect(s.log.some((l) => l.text.includes('Weather roll'))).toBe(true);
  });

  it('traces supply for both sides', () => {
    const s = newGame('short', 3);
    const ge = suppliedHexes(s, 'German');
    const al = suppliedHexes(s, 'Allied');
    expect(ge.has('3203')).toBe(true);
    expect(al.has('2710')).toBe(true);
    expect(alliedVp(s)).toBeGreaterThanOrEqual(1); // Maiori taken by the Rangers
  });
});
