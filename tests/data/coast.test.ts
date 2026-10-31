// The printed coastline traced into both maps (tools/map-art/coast_masks.py): a land mask on every coastal hex the
// printed map shows as part land, part sea, and the all-sea hexsides between land hexes.
import { afterAll, describe, expect, it } from 'vitest';
import { loadGameData, MAP } from '../../src/engine/data';
import { neighbors, sideKey } from '../../src/engine/hex';
import { ITALY_DATA } from '../../src/games/italy43/data';
import { SALERNO_DATA } from '../../src/games/salerno43/data';
import { COAST_COLS, COAST_ROWS, decodeCoast, insideHex, landAt, landShare, landSpot } from '../../src/ui/render/coast';
import { center } from '../../src/ui/render/geom';

afterAll(() => loadGameData('salerno43', SALERNO_DATA));

const GAMES = [['salerno43', SALERNO_DATA], ['italy43', ITALY_DATA]] as const;
const isSea = (h: string) => MAP.hexes[h]?.terrain === 'sea';

describe.each(GAMES)('%s coast', (id, data) => {
  const load = () => loadGameData(id, data);

  it('stores each mask as 17 rows of five hex digits, with no land outside the hex outline', () => {
    load();
    const bad: string[] = [];
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (!d.coast) continue;
      if (!/^[0-9a-f]{85}$/.test(d.coast)) bad.push(`${h}: malformed`);
      for (let i = 0; i < COAST_ROWS; i++) {
        const bits = parseInt(d.coast.slice(i * 5, i * 5 + 5), 16);
        for (let j = 0; j < COAST_COLS; j++) if ((bits >> j) & 1 && !insideHex(j - 9, i - 8)) bad.push(`${h}: land outside at ${i},${j}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('masks only coastal hexes: land hexes that are not all land, sea hexes that hold some land', () => {
    load();
    const bad: string[] = [];
    let n = 0;
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (!d.coast) continue;
      n++;
      const share = landShare(d.coast);
      const coastal = neighbors(h).some((x) => MAP.hexes[x] && isSea(x) !== isSea(h));
      if (!coastal) bad.push(`${h}: not on the coast`);
      if (isSea(h) ? share <= 0.02 : share >= 0.98) bad.push(`${h}: ${d.terrain} with ${Math.round(share * 100)}% land`);
    }
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(20);
  });

  it('marks all-sea hexsides only between two land hexes, never along a road', () => {
    load();
    const bad = Object.entries(MAP.hexsides)
      .filter(([, s]) => s.allSea)
      .filter(([k, s]) => k.split('-').some(isSea) || s.road || s.river || s.mountain)
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('the traced coast', () => {
  it('puts the printed water across the Agropoli and Gaeta gulfs', () => {
    loadGameData('salerno43', SALERNO_DATA);
    // Agropoli looks north over open water to the next beach hex; the land meets only beyond the corner (photo 5).
    expect(MAP.hexsides[sideKey('2418', '2517')]?.allSea).toBe(true);
    expect(Object.keys(MAP.hexsides).filter((k) => MAP.hexsides[k].allSea)).toEqual(['2418-2517']);
    loadGameData('italy43', ITALY_DATA);
    // Gaeta and Formia face each other across their gulf.
    expect(Object.keys(MAP.hexsides).filter((k) => MAP.hexsides[k].allSea)).toEqual(['1507-1606']);
  });

  it('keeps the printed split of the Salerno beach hexes: the coast runs through them, land to the east', () => {
    loadGameData('salerno43', SALERNO_DATA);
    for (const h of ['2709', '2710', '2711']) {
      const [x, y] = center(h);
      expect(landAt(h, x - 20, y), h).toBe(false);
      expect(landAt(h, x + 20, y), h).toBe(true);
      expect(landShare(MAP.hexes[h].coast!), h).toBeGreaterThan(0.2);
      expect(landShare(MAP.hexes[h].coast!), h).toBeLessThan(0.6);
    }
    // Sorrento's middle is in the bay: its town stands on the land at the hex's south-west.
    const [sx, sy] = center('1803');
    expect(landAt('1803', sx, sy)).toBe(false);
    const [tx, ty] = landSpot('1803');
    expect(landAt('1803', tx, ty)).toBe(true);
    expect(tx).toBeLessThan(sx);
    expect(ty).toBeGreaterThan(sy);
  });

  it('extends a mask to the corners of its lattice so a hex drawn from it has no gap at its outline', () => {
    loadGameData('salerno43', SALERNO_DATA);
    const m = decodeCoast(MAP.hexes['2710'].coast!);
    // The lattice's top corners lie outside the hex: they copy their nearest inside cell, sea to the west of the
    // beach and land to the east.
    expect(insideHex(-9, -8) || insideHex(9, -8)).toBe(false);
    expect(m[0]).toBe(0);
    expect(m[COAST_COLS - 1]).toBe(1);
  });
});
