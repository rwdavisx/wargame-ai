// Italy '43's map as transcribed from photos of the owner's copy (data/italy43/map.json, built by
// tools/italy-map/build_map.py), checked against what the rulebook and the set-up cards say about it.
import { describe, expect, it } from 'vitest';
import map from '../../data/italy43/map.json';
import oob from '../../data/italy43/oob.json';

interface Hex {
  terrain: string;
  city?: string;
  majorCity?: boolean;
  town?: string;
  vp?: number;
  gustav?: boolean;
  bernhard?: boolean;
  zone8?: string;
  garrison?: string;
}
const hexes = map.hexes as Record<string, Hex>;
const sides = map.hexsides as Record<string, { river?: boolean; majorRiver?: boolean; riverName?: string; road?: string; mountain?: boolean }>;
const land = (h: string) => !!hexes[h] && hexes[h].terrain !== 'sea';

/** Italy '43's grid: even columns sit half a hex lower. */
function neighbours(h: string): string[] {
  const c = Number(h.slice(0, 2));
  const r = Number(h.slice(2));
  const d = c % 2 === 0 ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  return d.map(([dc, dr]) => `${String(c + dc).padStart(2, '0')}${String(r + dr).padStart(2, '0')}`);
}

describe("Italy '43 map", () => {
  it('keys every hexside by two neighbouring hexes', () => {
    for (const k of Object.keys(sides)) {
      const [a, b] = k.split('-');
      expect(a < b, k).toBe(true);
      expect(neighbours(a), k).toContain(b);
    }
  });

  it('has no holes in the land', () => {
    const holes = new Set<string>();
    for (const h of Object.keys(hexes).filter(land))
      for (const n of neighbours(h)) if (!hexes[n] && neighbours(n).filter(land).length >= 4) holes.add(n);
    expect([...holes]).toEqual([]);
  });

  it('puts the places the rules and the set-up cards name where they say', () => {
    expect(hexes['1706']).toMatchObject({ city: 'Formia', vp: 1 }); // the Formia garrison (S3.3)
    expect(hexes['1706'].garrison).toBeTruthy();
    expect(hexes['1815'].town).toBe('Castel Volturno'); // the naval-range example (9.6)
    expect(hexes['2504'].town).toBe('Cassino');
    expect(hexes['2707'].town).toBe('San Pietro');
    expect(hexes['1908'].town).toBe('Minturno');
    expect(hexes['2108'].town).toBe('Castelforte');
    expect(hexes['3725']).toMatchObject({ city: 'Benevento', majorCity: true });
    // Naples is a major city of three hexes, joined by a major road (5.2.3).
    for (const h of ['2024', '2124', '2125']) expect(hexes[h]).toMatchObject({ city: 'Naples', majorCity: true });
    expect(sides['2124-2125'].road).toBe('major');
  });

  it('draws the lower Volturno and the Garigliano as major rivers', () => {
    const major = (name: string) => Object.values(sides).filter((s) => s.majorRiver && s.riverName?.includes(name)).length;
    expect(major('Volturno')).toBeGreaterThan(10);
    expect(major('Garigliano')).toBeGreaterThan(3);
  });

  it('has the entry areas, the defensive lines and the 8th Army zone', () => {
    expect(Object.keys(map.entryAreas).sort()).toEqual(['E1', 'E2', 'E3', 'N1', 'N2', 'N3', 'N4', 'S1', 'S2']);
    for (const ea of Object.values(map.entryAreas)) expect(ea.hexes.length).toBeGreaterThan(0);
    expect(Object.values(hexes).filter((h) => h.gustav).length).toBeGreaterThan(10);
    expect(Object.values(hexes).filter((h) => h.bernhard).length).toBeGreaterThan(5);
    for (const z of ['N4', 'E1', 'E2', 'E3']) expect(Object.values(hexes).some((h) => h.zone8 === z), z).toBe(true);
  });

  it('has a land hex for every unit the set-up cards place, and the Bernhard forts on the lines', () => {
    for (const u of oob.units as { id: string; setup: Record<string, { start?: { hex?: string } }> }[])
      for (const [card, s] of Object.entries(u.setup)) if (s.start?.hex) expect(land(s.start.hex), `${u.id} ${card} ${s.start.hex}`).toBe(true);
    for (const f of oob.setups.bernhard.fortifications) expect(hexes[f.hex].gustav || hexes[f.hex].bernhard, f.hex).toBe(true);
  });
});
