import { describe, expect, it } from 'vitest';
import { loadGameData, MAP } from '../src/engine/data';
import { newGame } from '../src/engine/game';
import { distance, neighbors, sideKey } from '../src/engine/hex';
import type { GameState } from '../src/engine/types';
import { isLand, sideOf } from '../src/engine/units';
import { createHeuristicAi } from '../src/ai/heuristic';
import { SALERNO_DATA } from '../src/games/salerno43/data';

// A lost gun is a victory point to the enemy. Guns cannot move between an advance after combat and the enemy's turn:
// the AI does not advance the last combat unit out of a hex that holds its artillery; and a gun far from the
// fighting comes up to its own troops rather than waiting where it is.
describe('the AI and its guns', () => {
  it('leaves a combat unit with the artillery when it advances after combat', () => {
    loadGameData('salerno43', SALERNO_DATA);
    const s: GameState = newGame('short', 3);
    for (const u of Object.values(s.units)) if (u.where.kind === 'map') u.where = { kind: 'removed', reason: 'test' };
    // An open hex with two open neighbours, well inland.
    const plain = (a: string, b: string) => {
      const hs = MAP.hexsides[sideKey(a, b)] ?? {};
      return !hs.river && !hs.mountain && !hs.allSea && !hs.lake;
    };
    const ok = (h: string) => isLand(h) && MAP.hexes[h].terrain === 'clear' && !MAP.hexes[h].vp && !MAP.hexes[h].city;
    let v = '';
    let pair: string[] = [];
    for (const h of Object.keys(MAP.hexes)) {
      const ns = neighbors(h).filter((n) => ok(n) && plain(h, n));
      if (ok(h) && ns.length >= 2) {
        v = h;
        pair = ns.slice(0, 2);
        break;
      }
    }
    const [withGun, other] = pair;
    // The stronger unit stands with the gun, so it would be the first to advance.
    s.units['GE-IIa2'].where = { kind: 'map', hex: withGun };
    s.units['GE-16Art'].where = { kind: 'map', hex: withGun };
    s.units['GE-I64'].where = { kind: 'map', hex: other };
    s.turn = 3;
    s.activeSide = 'German';
    s.phase = 'combat';
    s.pendingAdvance = { combatId: 0, vacated: v, from: { 'GE-IIa2': withGun, 'GE-I64': other }, maxByUnit: { 'GE-IIa2': 1, 'GE-I64': 1 }, limited: false };
    const a = createHeuristicAi('elite').nextAction(s);
    expect(a).toMatchObject({ type: 'advance', to: v });
    expect((a as { unitIds: string[] }).unitIds).toEqual(['GE-I64']);
    expect(Object.values(s.units).filter((u) => u.where.kind === 'map').every((u) => sideOf(u) === 'German')).toBe(true);
  });

  it('brings a gun far from the fighting up to its own troops', () => {
    loadGameData('salerno43', SALERNO_DATA);
    const s: GameState = newGame('short', 3);
    for (const u of Object.values(s.units)) if (u.where.kind === 'map') u.where = { kind: 'removed', reason: 'test' };
    const land = Object.keys(MAP.hexes).filter((h) => isLand(h) && MAP.hexes[h].terrain === 'clear');
    const friend = land[0];
    const gun = land.find((h) => distance(h, friend) >= 8)!;
    s.units['GE-I64'].where = { kind: 'map', hex: friend };
    s.units['GE-I64'].frozenUntil = 99;
    s.units['GE-16Art'].where = { kind: 'map', hex: gun };
    s.units['BR-128'].where = { kind: 'map', hex: land.find((h) => distance(h, friend) >= 16 && distance(h, gun) >= 16)! };
    s.turn = 4;
    s.activeSide = 'German';
    s.phase = 'movement';
    const a = createHeuristicAi('elite').nextAction(s) as { type: string; unitId: string; to: string };
    expect(a.type).toBe('move');
    expect(a.unitId).toBe('GE-16Art');
    // At least half way there in one march (it was 25 hexes off).
    expect(distance(a.to, friend)).toBeLessThanOrEqual(distance(gun, friend) / 2);
  });
});
