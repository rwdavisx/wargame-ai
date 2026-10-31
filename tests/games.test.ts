// The engine as a system for several games: loading another game's data swaps the map, tables and counters, and
// nothing built from the previous game survives.
import { afterAll, describe, expect, it } from 'vitest';
import { GAME_ID, MAP, RULES, UNIT_DEFS, loadGameData } from '../src/engine/data';
import { newGame } from '../src/engine/game';
import { ALL_UNIT_IDS } from '../src/engine/losses';
import { distance, hexToPixel, neighbors } from '../src/engine/hex';
import { hexName } from '../src/engine/words';
import { GAMES, gameInfo, playable, selectGame } from '../src/games';
import { SALERNO_DATA } from '../src/games/salerno43/data';
import italyRules from '../data/italy43/rules.json';

afterAll(() => loadGameData('salerno43', SALERNO_DATA));

describe('the game registry', () => {
  it('lists Salerno and Italy, both playable', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['salerno43', 'italy43']);
    expect(playable('salerno43')).toBe(true);
    expect(playable('italy43')).toBe(true);
    expect(gameInfo('nonsense').id).toBe('salerno43');
  });

  it('loads the chosen game, and falls back to Salerno for one it does not know', () => {
    expect(selectGame('italy43')).toBe('italy43');
    expect(GAME_ID).toBe('italy43');
    expect(MAP.hexes['3725'].city).toBe('Benevento');
    expect(selectGame('nonsense')).toBe('salerno43');
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

describe('the hex grid of each map', () => {
  it("follows the map's column offset: odd columns lower on Salerno's, even ones on Italy's", () => {
    // Salerno '43: column 27 is shifted down, so 2707 touches 2807 and 2808.
    expect(neighbors('2707')).toEqual(expect.arrayContaining(['2807', '2808', '2607', '2608']));
    const map = { ...(SALERNO_DATA.map as object), meta: { evenColumnsDown: true } };
    loadGameData('test', { ...SALERNO_DATA, map });
    // Italy '43: column 27 sits higher, so 2707 touches 2806 and 2807; column 16 is lower, so 1621 touches 1721 and 1722.
    expect(neighbors('2707')).toEqual(expect.arrayContaining(['2806', '2807', '2606', '2607']));
    expect(neighbors('1621')).toEqual(expect.arrayContaining(['1721', '1722', '1521', '1522']));
    expect(distance('1621', '1722')).toBe(1);
    expect(hexToPixel('1621', 10).y).toBeGreaterThan(hexToPixel('1721', 10).y);
    loadGameData('salerno43', SALERNO_DATA);
    expect(neighbors('2707')).toEqual(expect.arrayContaining(['2807', '2808']));
  });
});

