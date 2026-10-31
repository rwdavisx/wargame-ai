// The engine as a system for several games: loading another game's data swaps the map, tables and counters, and
// nothing built from the previous game survives.
import { afterAll, describe, expect, it } from 'vitest';
import { GAME_ID, MAP, RULES, UNIT_DEFS, loadGameData } from '../src/engine/data';
import { newGame } from '../src/engine/game';
import { ALL_UNIT_IDS } from '../src/engine/losses';
import { hexName } from '../src/engine/words';
import { GAMES, gameInfo, playable, selectGame } from '../src/games';
import { SALERNO_DATA } from '../src/games/salerno43/data';
import italyRules from '../data/italy43/rules.json';

afterAll(() => loadGameData('salerno43', SALERNO_DATA));

describe('the game registry', () => {
  it('lists Salerno as playable and Italy as in preparation', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['salerno43', 'italy43']);
    expect(playable('salerno43')).toBe(true);
    expect(playable('italy43')).toBe(false);
    expect(gameInfo('nonsense').id).toBe('salerno43');
  });

  it('falls back to Salerno when a game cannot be played yet', () => {
    expect(selectGame('italy43')).toBe('salerno43');
    expect(GAME_ID).toBe('salerno43');
  });
});

describe('loading another game', () => {
  it('swaps the data and drops everything built from the old game', () => {
    const before = hexName('2811');
    expect(before).toBeTruthy();
    // A test game: Salerno's map without its named places, one counter and Italy's tables.
    const map = structuredClone(SALERNO_DATA.map) as { hexes: Record<string, { city?: string; town?: string; airfield?: string }> };
    for (const h of Object.values(map.hexes)) {
      delete h.city;
      delete h.town;
      delete h.airfield;
    }
    const oob = structuredClone(SALERNO_DATA.oob) as { units: { id: string }[] };
    oob.units = oob.units.slice(0, 1);
    loadGameData('test', { ...SALERNO_DATA, map, oob, rules: { ...(SALERNO_DATA.rules as object), combat: { ...(SALERNO_DATA.rules as { combat: object }).combat, crt: italyRules.combat.crt } } });
    expect(GAME_ID).toBe('test');
    expect(Object.keys(UNIT_DEFS)).toHaveLength(1);
    expect(ALL_UNIT_IDS).toHaveLength(1);
    expect(hexName('2811')).toBeNull();
    expect(RULES.combat.crt['6'][8]).toBe('DS/2+r');
    expect(newGame('short').gameId).toBe('test');
    expect(MAP).toBe(map);

    loadGameData('salerno43', SALERNO_DATA);
    expect(hexName('2811')).toBe(before);
    expect(Object.keys(UNIT_DEFS).length).toBeGreaterThan(100);
    expect(newGame('short').gameId).toBe('salerno43');
  });
});
