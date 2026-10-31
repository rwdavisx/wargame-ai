// Every hex the living rules name, by number or by place, with what the rulebook says about it
// (in this program's own words), checked against data/salerno43/map.json and data/salerno43/oob.json.
// Four-digit numbers in the rulebook text: 2202, 2811, 2425/2426, 4100/4201, 3113 (the others are
// years, page furniture and GMT's P.O. box). The example of play on pages 27-31 names places
// instead of hexes; its map excerpts also print the set-up hexes on the German counters.
import { describe, expect, it } from 'vitest';
import mapJson from '../../data/salerno43/map.json';
import oobJson from '../../data/salerno43/oob.json';
import { distance, neighbors, parseHex, sideKey } from '../../src/engine/hex';
import type { HexData, MapData } from '../../src/engine/types';

const MAP = mapJson as unknown as MapData & { hexes: Record<string, HexData & { landmark?: string }>; navalLine: { maxRowExclusive: number } };
const H = MAP.hexes;
const S = MAP.hexsides;
const O = oobJson as any;
const isSea = (h: string) => H[h]?.terrain === 'sea';
const hexOf = (name: string) => Object.keys(H).find((h) => (H[h].city ?? H[h].town ?? H[h].landmark) === name)!;
const road = (a: string, b: string) => S[sideKey(a, b)]?.road;
const startHex = (id: string) => O.units.find((u: any) => u.id === id)?.start?.hex;

/** Hexes reachable from `from` along roads only. */
function roadReach(from: string): Set<string> {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const h = stack.pop()!;
    for (const n of neighbors(h)) if (H[n] && road(h, n) && !seen.has(n)) (seen.add(n), stack.push(n));
  }
  return seen;
}

describe('hexes the rulebook names by number', () => {
  it('[19.2] 2202 is Torre Annunziata, where the frozen German garrison starts', () => {
    expect(H['2202'].city).toBe('Torre Annunziata');
    expect(startHex('GE-III1FJ')).toBe('2202');
    // It is released on turn 3 at the latest.
    expect(O.units.find((u: any) => u.id === 'GE-III1FJ').frozenUntil).toBe(3);
  });

  it('[18.2.2] 2202 is one of the two mined ports whose capacity is in parentheses', () => {
    expect(H['2202'].port).toMatchObject({ capacity: 1, restricted: true });
    expect(H[hexOf('Sorrento')].port).toMatchObject({ capacity: 1, restricted: true });
  });

  it('[22.2.3] 2811 is the Montecorvino airfield', () => {
    expect(H['2811'].airfield).toBe('Montecorvino');
    expect(H['2811'].terrain).not.toBe('sea');
    // Example of play: the 169th Brigade, advancing two hexes from Sugar Beach, takes the airfield.
    expect(distance(MAP.beaches.Sugar.hex, '2811')).toBeLessThanOrEqual(2);
  });

  it('[S2.3.3] the Army Boundary Line starts at the 2425/2426 hexside on the coast', () => {
    expect(neighbors('2425')).toContain('2426');
    expect(H['2425'].sector8).toBeFalsy(); // 5th Army side
    expect(H['2426'].sector8).toBe(true); // 8th Army side
    // The hexside meets the sea at one end.
    const shared = neighbors('2425').filter((c) => neighbors('2426').includes(c));
    expect(shared.some(isSea)).toBe(true);
  });

  it('[S2.3.3] and ends at the 4100/4201 hexside on the north map edge', () => {
    expect(neighbors('4100')).toContain('4201');
    expect(H['4100'].sector8).toBeFalsy();
    expect(H['4201'].sector8).toBe(true);
    expect(parseHex('4100').r).toBe(0);
    const shared = neighbors('4100').filter((c) => neighbors('4201').includes(c));
    expect(shared.some((c) => !H[c])).toBe(true);
  });

  it('[example of play] 3113 is the clear hex next to Eboli where the 16th Panzer ASU moves one hex', () => {
    expect(H['3113'].terrain).toBe('clear');
    expect(O.units.find((u: any) => u.name === '16 Pz Div ASU')?.start?.hex).toBe('3213');
    expect(distance('3213', '3113')).toBe(1);
    expect(H['3213'].city).toBe('Eboli');
  });
});

describe('places the rulebook names', () => {
  it('Salerno: a city with a major port of capacity 3, reduced to 1 with Germans within two hexes [18.4.4]', () => {
    const h = hexOf('Salerno');
    expect(h).toBe('2707');
    expect(H[h].port).toEqual({ capacity: 3, damagedCapacity: 1, major: true });
  });

  it('Salerno is one hex from the all-sea area [9.6]', () => {
    expect(Math.min(...Object.keys(H).filter(isSea).map((x) => distance('2707', x)))).toBe(1);
  });

  it('Amalfi: a port with an LP value of 1 [25.3 example]; no coast road west of it (designer notes)', () => {
    const h = hexOf('Amalfi');
    expect(H[h].port?.capacity).toBe(1);
    const west = neighbors(h).filter((n) => parseHex(n).c < parseHex(h).c && road(h, n));
    expect(west).toEqual([]);
  });

  it('Maiori: the Rangers land at its port and go up the valley towards Chiunzi Pass [example of play]', () => {
    const h = hexOf('Maiori');
    expect(MAP.beaches.Maiori.hex).toBe(h);
    expect(H[h].port).toBeTruthy();
    // The valley road runs north out of Maiori.
    expect(neighbors(h).some((n) => parseHex(n).r < parseHex(h).r && road(h, n))).toBe(true);
  });

  it('Vietri sul Mare: the Commandos land in its port; the next hex is Salerno [example of play]', () => {
    const h = hexOf('Vietri sul Mare');
    expect(MAP.beaches.Vietri.hex).toBe(h);
    expect(H[h].port).toBeTruthy();
    expect(distance(h, '2707')).toBe(1);
  });

  it('Uncle Beach is the 46th Division beach; Sugar and Roger the 56th; Red and Blue the 36th [example of play, hints]', () => {
    expect(MAP.beaches.Uncle.formation).toBe('46th Div');
    expect(MAP.beaches.Sugar.formation).toBe('56th Div');
    expect(MAP.beaches.Roger.formation).toBe('56th Div');
    expect(MAP.beaches.Red.formation).toBe('36th Div');
    expect(MAP.beaches.Blue.formation).toBe('36th Div');
  });

  it('Battipaglia: a city held by a 16th Panzer panzergrenadier battalion at the start [example]', () => {
    const h = hexOf('Battipaglia');
    expect(H[h].city).toBe('Battipaglia');
    expect(startHex('GE-II64')).toBe(h);
  });

  it('Eboli: a city', () => {
    expect(H[hexOf('Eboli')].city).toBe('Eboli');
  });

  it('Nocera Inferiore: reachable by road from N1, where the HG reconnaissance battalion enters [example]', () => {
    const h = hexOf('Nocera Inferiore');
    const reach = roadReach(h);
    expect(MAP.entryAreas.N1.hexes.some((x) => reach.has(x))).toBe(true);
  });

  it('Altavilla Silentina: a VP town south of the Sele [hints]', () => {
    expect(H[hexOf('Altavilla Silentina')].vp).toBe(1);
  });

  it('the Sele river reaches the coast between the British and the American beaches [hints]', () => {
    // On the map the Sele runs along the 2814/2815 hexside, then through the marsh hexes 2714 and
    // 2615 to the sea, so its last hexside ends at the 2714/2814/2815 vertex.
    expect(S['2814-2815']?.river).toBe(true);
    expect([H['2714'].terrain, H['2615'].terrain]).toEqual(['marsh', 'marsh']);
    expect(neighbors('2714')).toContain('2615');
    expect(neighbors('2615').some(isSea)).toBe(true);
    const row = (b: string) => parseHex(MAP.beaches[b].hex).r;
    expect(row('Roger')).toBeLessThan(15);
    expect(row('Red')).toBeGreaterThan(14);
  });

  it('Avellino: a city; the 2/509th lands near it, inside the 5th Army sector [21.6.1]', () => {
    const h = hexOf('Avellino');
    expect(H[h].city).toBe('Avellino');
    const dz = Object.keys(H).find((x) => H[x].dropZone)!;
    expect(distance(h, dz)).toBe(1);
    expect(H[dz].sector8).toBeFalsy();
    expect(H[dz].city).toBeUndefined(); // airdrops may not land in a city
  });

  it('Auletta: in the 8th Army sector, where the 5th Division stopped [design notes]', () => {
    expect(H[hexOf('Auletta')].sector8).toBe(true);
  });

  it('Torre Annunziata and Sorrento are north of the naval line; Amalfi is south of it [9.6, 18.2.2]', () => {
    for (const n of ['Torre Annunziata', 'Sorrento']) expect(parseHex(hexOf(n)).r, n).toBeLessThan(MAP.navalLine.maxRowExclusive);
    expect(parseHex(hexOf('Amalfi')).r).toBeGreaterThanOrEqual(MAP.navalLine.maxRowExclusive);
  });
});

describe('set-up hexes printed on the counters in the example of play (p. 27)', () => {
  it('KG Dörnemann 2905, 16 Pz ASU 3213, III/2 Pz and II/64 PG 3012', () => {
    expect(startHex('GE-KGDor')).toBe('2905');
    expect(startHex('GE-II64')).toBe('3012');
    expect(startHex('GE-III2')).toBe('3012');
    expect(O.units.find((u: any) => u.name === '16 Pz Div ASU').start.hex).toBe('3213');
  });
});
