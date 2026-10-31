// Invariants of data/salerno43/map.json: things that must hold on the physical map whatever the details,
// so a transcription slip (a road into the sea, a river that stops in mid-air, a hexside between
// two hexes that are not neighbours, a town nobody can reach) fails loudly. Where the real map
// does have an oddity, it is listed here by hand with what the photo shows, so a new one fails.
// The review sheets that back the lists are drawn by tools/map-transcription/spots.py.
import { describe, expect, it } from 'vitest';
import mapJson from '../../data/salerno43/map.json';
import { distance, neighbors, parseHex, sideKey } from '../../src/engine/hex';
import type { HexData, HexsideData, MapData } from '../../src/engine/types';

const MAP = mapJson as unknown as MapData & {
  hexes: Record<string, HexData & { landmark?: string }>;
  navalLine: { maxRowExclusive: number; restrictedPorts: string[] };
};
const H = MAP.hexes;
const S = MAP.hexsides as Record<string, HexsideData>;
const ids = Object.keys(H);
const isLand = (h: string) => !!H[h] && H[h].terrain !== 'sea';
const isSea = (h: string) => !!H[h] && H[h].terrain === 'sea';
/** On the edge of the hex grid: some neighbour is not a map hex. */
const onEdge = (h: string) => neighbors(h).length < 6 || neighbors(h).some((n) => !H[n]);
const side = (a: string, b: string): HexsideData => S[sideKey(a, b)] ?? {};
const landNeighbors = (h: string) => neighbors(h).filter(isLand);
const entryHexes = new Set(Object.values(MAP.entryAreas).flatMap((e) => e.hexes));
const placeName = (h: string) => H[h].city ?? H[h].town ?? H[h].landmark;

/** The two hex-grid vertices at the ends of the hexside a-b, each named by its three hexes. */
function vertices(a: string, b: string): string[] {
  const nb = neighbors(b);
  return neighbors(a)
    .filter((c) => nb.includes(c))
    .map((c) => [a, b, c].sort().join('/'));
}
const vertexHexes = (v: string) => v.split('/');
/** A vertex on the coast or the map edge: one of its three hexes is sea or off the map. */
const openVertex = (v: string) => vertexHexes(v).some((h) => !H[h] || isSea(h));

/** Connected groups of hexsides with the given feature, joined where they share a vertex. */
function hexsideNetworks(pred: (s: HexsideData) => boolean): string[][] {
  const keys = Object.keys(S).filter((k) => pred(S[k]));
  const byVertex = new Map<string, string[]>();
  for (const k of keys) for (const v of vertices(...(k.split('-') as [string, string]))) byVertex.set(v, [...(byVertex.get(v) ?? []), k]);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const group: string[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const x = stack.pop()!;
      group.push(x);
      for (const v of vertices(...(x.split('-') as [string, string])))
        for (const y of byVertex.get(v) ?? []) if (!seen.has(y)) (seen.add(y), stack.push(y));
    }
    out.push(group.sort());
  }
  return out;
}

/** Vertices where exactly one hexside of the feature ends. */
function looseEnds(pred: (s: HexsideData) => boolean): { key: string; vertex: string }[] {
  const count = new Map<string, string[]>();
  for (const k of Object.keys(S).filter((x) => pred(S[x])))
    for (const v of vertices(...(k.split('-') as [string, string]))) count.set(v, [...(count.get(v) ?? []), k]);
  return [...count].filter(([, ks]) => ks.length === 1).map(([vertex, ks]) => ({ key: ks[0], vertex }));
}

function hexGroups(members: string[], linked: (a: string, b: string) => boolean): string[][] {
  const set = new Set(members);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const h of members) {
    if (seen.has(h)) continue;
    const g: string[] = [];
    const stack = [h];
    seen.add(h);
    while (stack.length) {
      const x = stack.pop()!;
      g.push(x);
      for (const n of neighbors(x)) if (set.has(n) && !seen.has(n) && linked(x, n)) (seen.add(n), stack.push(n));
    }
    out.push(g.sort());
  }
  return out;
}

describe('hex grid', () => {
  it('covers columns 16-46 and rows 00-27, less the half hexes cut off at the top and the S2 box', () => {
    const gaps: string[] = [];
    for (let c = 16; c <= 46; c++)
      for (let r = 0; r <= 27; r++) {
        const id = String(c).padStart(2, '0') + String(r).padStart(2, '0');
        if (!H[id]) gaps.push(id);
      }
    // Even columns sit half a hex higher, so their row 00 is off the map; 3727 is under the S2 box.
    const expected = [...Array.from({ length: 16 }, (_, i) => `${16 + 2 * i}00`), '3727'].sort();
    expect(gaps.sort()).toEqual(expected);
    expect(ids.filter((h) => !/^\d{4}$/.test(h))).toEqual([]);
  });

  it('gives every hex a known terrain and only known fields', () => {
    const fields = new Set(['terrain', 'city', 'town', 'landmark', 'vp', 'port', 'airfield', 'dropZone', 'sector8', 'shore']);
    const bad = ids.flatMap((h) => [
      ...(['clear', 'hill', 'marsh', 'sea'].includes(H[h].terrain) ? [] : [`${h}: terrain ${H[h].terrain}`]),
      ...Object.keys(H[h]).filter((k) => !fields.has(k)).map((k) => `${h}: unknown field ${k}`),
    ]);
    expect(bad).toEqual([]);
  });

  it('puts nothing but terrain on all-sea hexes', () => {
    expect(ids.filter((h) => isSea(h) && Object.keys(H[h]).length > 1).map((h) => `${h}: ${JSON.stringify(H[h])}`)).toEqual([]);
  });

  it('has one connected land area', () => {
    const groups = hexGroups(ids.filter(isLand), () => true);
    expect(groups.map((g) => `${g.length} hexes from ${g[0]}`)).toHaveLength(1);
  });

  it('has exactly the two marsh hexes on the Sele plain', () => {
    expect(ids.filter((h) => H[h].terrain === 'marsh').sort()).toEqual(['2615', '2714']);
  });
});

describe('hexsides', () => {
  const keys = Object.keys(S);

  it('are keyed "A-B" with A < B, between two neighbouring map hexes', () => {
    const bad: string[] = [];
    for (const k of keys) {
      const m = /^(\d{4})-(\d{4})$/.exec(k);
      if (!m) bad.push(`${k}: not "CCRR-CCRR"`);
      else if (!(m[1] < m[2])) bad.push(`${k}: not canonical (should be ${sideKey(m[1], m[2])})`);
      else if (!neighbors(m[1]).includes(m[2])) bad.push(`${k}: ${m[1]} and ${m[2]} are not neighbours`);
      else if (!H[m[1]] || !H[m[2]]) bad.push(`${k}: hex not on the map`);
    }
    expect(bad).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carry only real features (no empty entries, roads major or minor)', () => {
    const bad: string[] = [];
    for (const k of keys) {
      const s = S[k] as Record<string, unknown>;
      if (Object.keys(s).length === 0) bad.push(`${k}: empty`);
      for (const [f, v] of Object.entries(s)) {
        if (f === 'road' ? v !== 'major' && v !== 'minor' : !['river', 'mountain', 'pass'].includes(f) || v !== true) bad.push(`${k}: ${f}=${v}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('rivers', () => {
  const river = (s: HexsideData) => !!s.river;

  it('never run between two all-sea hexes', () => {
    expect(Object.keys(S).filter((k) => S[k].river && k.split('-').every(isSea))).toEqual([]);
  });

  it('each river system reaches the sea or the map edge', () => {
    // The Sarno leaves the hexsides at the 2203/2302/2303 vertex and crosses the coastal hex 2203
    // (Castellammare) to the sea, which a hexside river cannot show (photo 2).
    const mouthInsideHex = ['2302-2303'];
    const cut = hexsideNetworks(river).filter(
      (g) => !g.some((k) => mouthInsideHex.includes(k) || vertices(...(k.split('-') as [string, string])).some(openVertex)),
    );
    expect(cut.map((g) => `river system ${g.join(' ')} reaches neither the coast nor the map edge`)).toEqual([]);
  });

  it('start inland only at the sources seen on the photos', () => {
    // Each of these is where a river line begins on the map (checked on the photos,
    // map-review/river_ends_*.png), except two mouths: 2302-2303 (the Sarno, above) and 2814-2815
    // (the Sele, which crosses the marsh hexes 2714 and 2615 to the sea). Any other loose end is a missing or
    // extra river hexside.
    const sources = [
      '2302-2303', '2502-2603', '2623-2722', '2624-2625', '2814-2815', '2821-2920', '2922-3023', '3023-3122',
      '3220-3221', '3222-3321', '3303-3404', '3705-3806', '3911-3912', '4010-4109', '4023-4122', '4104-4204',
      '4217-4316', '4319-4420', '4419-4518', '4500-4601',
    ];
    const ends = looseEnds(river).filter((e) => !openVertex(e.vertex));
    expect(ends.map((e) => e.key).sort()).toEqual(sources.sort());
  });
});

describe('mountains and passes', () => {
  it('mountain hexsides are between land hexes', () => {
    expect(Object.keys(S).filter((k) => S[k].mountain && !k.split('-').every(isLand))).toEqual([]);
  });

  it('passes sit on mountain hexsides', () => {
    expect(Object.keys(S).filter((k) => S[k].pass && !S[k].mountain)).toEqual([]);
  });

  it('a hex ringed by mountain hexsides is a hill (2.2.2: a full Mountain hex is a Hill hex)', () => {
    const full = ids.filter((h) => isLand(h) && landNeighbors(h).length > 0 && landNeighbors(h).every((n) => side(h, n).mountain));
    expect(full.filter((h) => H[h].terrain !== 'hill').map((h) => `${h}: ${H[h].terrain}`)).toEqual([]);
  });

  it('has the seven passes printed on the map', () => {
    const passes = Object.keys(S).filter((k) => S[k].pass).sort();
    expect(passes).toEqual(['2105-2205', '2706-2807', '2907-3007', '2920-3020', '3001-3101', '3207-3208', '4226-4325']);
  });
});

describe('roads', () => {
  const roads = Object.keys(S).filter((k) => S[k].road);
  const roadHexes = new Set(roads.flatMap((k) => k.split('-')));
  const roadNeighbors = (h: string) => neighbors(h).filter((n) => side(h, n).road);

  it('never enter an all-sea hex', () => {
    expect(roads.filter((k) => !k.split('-').every(isLand))).toEqual([]);
  });

  it('form networks that all reach the map edge (no island of road)', () => {
    const groups = hexGroups([...roadHexes], (a, b) => !!side(a, b).road);
    expect(groups.filter((g) => !g.some(onEdge)).map((g) => g.join(' '))).toEqual([]);
  });

  it('end only at a town, city, port, entry area or the map edge, or at a spur seen on the photos', () => {
    // Real dead-end spurs on the printed map: 3108 (south of San Cipriano Picentino), 3207 (towards the
    // 3207/3208 pass), 4503 (south of 4502).
    const spurs = ['3108', '3207', '4503'];
    const ends = [...roadHexes].filter((h) => roadNeighbors(h).length === 1 && !placeName(h) && !H[h].port && !H[h].airfield && !entryHexes.has(h) && !onEdge(h));
    expect(ends.sort()).toEqual(spurs);
  });

  it('reach every city and town except the three printed without a road', () => {
    // Bracigliano (2903), Albanella (3017) and Mercogliano (3101) have no road on the map.
    // Pisciotta stands on the coast strip of 2427 on the coast road (confirmed by the owner on the board).
    const roadless = ids.filter((h) => (H[h].city || H[h].town) && !roadHexes.has(h)).sort();
    expect(roadless).toEqual(['2903', '3017', '3101']);
  });

  it('major roads join up into networks that reach the map edge', () => {
    const major = [...new Set(roads.filter((k) => S[k].road === 'major').flatMap((k) => k.split('-')))];
    const groups = hexGroups(major, (a, b) => side(a, b).road === 'major');
    expect(groups.filter((g) => !g.some(onEdge) && !g.some((h) => entryHexes.has(h))).map((g) => g.join(' '))).toEqual([]);
  });
});

describe('cities, towns and landmarks', () => {
  it('are on land, with unique names, and a hex is never both a city and a town', () => {
    const bad: string[] = [];
    const seen = new Map<string, string>();
    for (const h of ids) {
      const n = placeName(h);
      if (!n) continue;
      if (!isLand(h)) bad.push(`${h} ${n}: on a sea hex`);
      if (H[h].city && H[h].town) bad.push(`${h}: both city and town`);
      if (seen.has(n)) bad.push(`${n}: in ${seen.get(n)} and ${h}`);
      seen.set(n, h);
    }
    expect(bad).toEqual([]);
  });

  it('has the ten printed cities', () => {
    const cities = Object.fromEntries(ids.filter((h) => H[h].city).sort().map((h) => [h, H[h].city]));
    expect(cities).toEqual({
      2202: 'Torre Annunziata', 2203: 'Castellammare di Stabia', 2605: 'Nocera Inferiore', 2700: 'Palma Campania', 2702: 'Sarno',
      2707: 'Salerno', 3012: 'Battipaglia', 3203: 'Avellino', 3213: 'Eboli', 4301: 'Ariano Irpino',
    });
  });

  it('prints Paestum as a landmark (ruins), not a town', () => {
    expect(H['2716']).toMatchObject({ landmark: 'Paestum', vp: 1 });
    expect(H['2716'].town).toBeUndefined();
  });
});

describe('ports, airfield, beaches', () => {
  it('every port is a coastal land hex', () => {
    const bad = ids.filter((h) => H[h].port && !(isLand(h) && neighbors(h).some(isSea)));
    expect(bad).toEqual([]);
  });

  it('has the printed port capacities: Salerno 3 (1 with Germans within 2 hexes), the rest 1', () => {
    const ports = Object.fromEntries(ids.filter((h) => H[h].port).sort().map((h) => [h, H[h].port]));
    expect(ports).toEqual({
      1803: { capacity: 1, restricted: true }, // Sorrento: in parentheses (18.2.2)
      2202: { capacity: 1, restricted: true }, // Torre Annunziata: in parentheses (18.2.2)
      2306: { capacity: 1 }, // Amalfi
      2407: { capacity: 1 }, // Maiori
      2418: { capacity: 1 }, // Agropoli
      2424: { capacity: 1 }, // Marina di Casal Velino
      2607: { capacity: 1 }, // Vietri sul Mare
      2707: { capacity: 3, damagedCapacity: 1, major: true }, // Salerno (18.4.4)
    });
  });

  it('the naval line restricts exactly the two mined ports, both north of it', () => {
    const restricted = ids.filter((h) => H[h].port?.restricted).sort();
    expect(MAP.navalLine.restrictedPorts.slice().sort()).toEqual(restricted);
    expect(restricted.every((h) => parseHex(h).r < MAP.navalLine.maxRowExclusive)).toBe(true);
    expect(ids.filter((h) => H[h].port && !H[h].port!.restricted && parseHex(h).r < MAP.navalLine.maxRowExclusive)).toEqual([]);
  });

  it('has one airfield, Montecorvino', () => {
    expect(ids.filter((h) => H[h].airfield)).toEqual(['2811']);
  });

  it('puts every landing beach on a land hex on the coast, in the printed order north to south', () => {
    const b = MAP.beaches;
    const bad = Object.entries(b).filter(([, x]) => !(isLand(x.hex) && neighbors(x.hex).some(isSea))).map(([n, x]) => `${n} ${x.hex}`);
    expect(bad).toEqual([]);
    const order = ['Maiori', 'Vietri', 'Uncle', 'Sugar', 'Roger', 'Red', 'Blue'];
    const rows = order.map((n) => b[n].hex);
    expect(rows).toEqual(['2407', '2607', '2710', '2711', '2712', '2616', '2617']);
    expect(Object.keys(b).sort()).toEqual(order.slice().sort());
    // X Corps beaches north of the Sele, VI Corps south of it.
    expect(order.map((n) => b[n].corps)).toEqual(['X', 'X', 'X', 'X', 'X', 'VI', 'VI']);
  });
});

describe('victory point hexes', () => {
  it('match the red VP circles on the map', () => {
    const vp = Object.fromEntries(ids.filter((h) => H[h].vp).sort().map((h) => [h, H[h].vp]));
    expect(vp).toEqual({
      2202: 1, 2407: 1, 2418: 1, 2605: 1, 2702: 1, 2707: 2, 2716: 1, 2811: 1, 3012: 1, 3116: 1, 3203: 2, 3213: 1,
      3819: 1, 4111: 1, 4301: 1,
    });
  });

  it('has three VP hexes in the 8th Army sector (S2.3.7)', () => {
    expect(ids.filter((h) => H[h].vp && H[h].sector8).sort()).toEqual(['3819', '4111', '4301']);
  });

  it('gives the north entry areas their VPs (23.1.4: N1 5, N2 4)', () => {
    expect(MAP.entryAreas.N1.vp).toBe(5);
    expect(MAP.entryAreas.N2.vp).toBe(4);
  });
});

describe('entry areas', () => {
  it('are land hexes on the matching map edge', () => {
    const bad: string[] = [];
    for (const [id, e] of Object.entries(MAP.entryAreas))
      for (const h of e.hexes) {
        const { c, r } = parseHex(h);
        const okEdge = e.side === 'north' ? r <= 1 : e.side === 'east' ? c === 46 : r === 27;
        if (!H[h] || !isLand(h) || !onEdge(h) || !okEdge) bad.push(`${id} ${h}`);
      }
    expect(bad).toEqual([]);
  });

  it('do not overlap', () => {
    const all = Object.values(MAP.entryAreas).flatMap((e) => e.hexes);
    expect(new Set(all).size).toBe(all.length);
  });

  it('link off-map as printed: N1-N2 German only, E5 to E1 to S3 to S1, never N2-E5', () => {
    const links = MAP.offmapLinks.map((l) => `${l.from}-${l.to}${l.side ? ' ' + l.side : ''}`);
    expect(links).toEqual(['N1-N2 GE', 'E5-E4', 'E4-E3', 'E3-E2', 'E2-E1', 'E1-S3', 'S3-S2', 'S2-S1']);
  });
});

describe('8th Army sector', () => {
  const in8 = (h: string) => !!H[h]?.sector8;

  it('is land only, and both army areas are in one piece', () => {
    expect(ids.filter((h) => in8(h) && !isLand(h))).toEqual([]);
    expect(hexGroups(ids.filter((h) => isLand(h) && in8(h)), () => true)).toHaveLength(1);
    expect(hexGroups(ids.filter((h) => isLand(h) && !in8(h)), () => true)).toHaveLength(1);
  });

  it('is bounded by one continuous line from the 2425/2426 hexside to the 4100/4201 hexside (S2.3.3)', () => {
    const boundary = ids.flatMap((h) => (in8(h) ? landNeighbors(h).filter((n) => !in8(n)).map((n) => sideKey(h, n)) : []));
    // Walk the boundary as a chain of hexsides joined at vertices.
    const byVertex = new Map<string, string[]>();
    for (const k of boundary) for (const v of vertices(...(k.split('-') as [string, string]))) byVertex.set(v, [...(byVertex.get(v) ?? []), k]);
    const branching = [...byVertex].filter(([, ks]) => ks.length > 2).map(([v]) => v);
    const ends = [...byVertex].filter(([, ks]) => ks.length === 1).map(([v]) => v);
    expect(branching).toEqual([]);
    expect(ends.length).toBe(2);
    expect(ends.every(openVertex)).toBe(true);
    // One chain through every boundary hexside.
    const seen = new Set<string>();
    let v = ends[0];
    let k: string | undefined = byVertex.get(v)![0];
    while (k && !seen.has(k)) {
      seen.add(k);
      const [a, b] = k.split('-') as [string, string];
      v = vertices(a, b).find((x) => x !== v)!;
      k = byVertex.get(v)!.find((x) => !seen.has(x));
    }
    expect(seen.size).toBe(boundary.length);
    expect(boundary).toContain('2425-2426');
    expect(boundary).toContain('4100-4201');
    expect(in8('2426') && !in8('2425') && in8('4201') && !in8('4100')).toBe(true);
  });

  it('follows the printed Army Boundary Line hexside by hexside', () => {
    // Traced on photos 3, 5 and 6 (the long-dash line with "5th Army | 8th Army" written along it).
    const printed = `2425-2426 2425-2525 2524-2525 2524-2625 2624-2625 2624-2724 2723-2724 2723-2824 2823-2824 2823-2923
      2922-2923 2922-3023 3022-3023 3022-3122 3121-3122 3121-3222 3221-3222 3221-3321 3320-3321 3320-3421 3420-3421
      3420-3520 3519-3520 3519-3620 3619-3620 3619-3719 3718-3719 3718-3819 3818-3819 3818-3918 3917-3918 3917-4018
      4017-4018 4017-4116 4017-4117 4016-4115 4016-4116 4015-4114 4015-4115 4014-4113 4014-4114 4013-4112 4013-4113
      4012-4111 4012-4112 4011-4110 4011-4111 4010-4109 4010-4110 4009-4108 4009-4109 4008-4107 4008-4108 4007-4106
      4007-4107 4006-4105 4006-4106 4005-4104 4005-4105 4004-4103 4004-4104 4003-4102 4003-4103 4002-4102 4101-4102
      4101-4202 4101-4201 4100-4201`.split(/\s+/);
    const boundary = ids.flatMap((h) => (in8(h) ? landNeighbors(h).filter((n) => !in8(n)).map((n) => sideKey(h, n)) : []));
    expect(boundary.sort()).toEqual(printed.sort());
  });

  it('holds the whole south and east map edges beyond the line', () => {
    for (const id of ['S1', 'S2', 'S3', 'E1', 'E2', 'E3', 'E4', 'E5']) expect(MAP.entryAreas[id].hexes.every(in8), id).toBe(true);
    for (const id of ['N1', 'N2']) expect(MAP.entryAreas[id].hexes.some(in8), id).toBe(false);
  });
});

describe('printed coastal hexes', () => {
  it('keeps every hex the map prints with an outline and number as land, however little land it holds', () => {
    // Found from the owner's report on the Amalfi coast: printed hexes entered as sea (photos 1, 2 and 5).
    for (const h of ['2003', '2006', '2106', '2207', '2408', '2517']) expect(isLand(h), h).toBe(true);
    // Their cliffs: no way round the mountain hexsides of the Amalfi coast along the shore.
    for (const k of ['2106-2206', '2206-2207', '2408-2507']) expect(MAP.hexsides[k]?.mountain, k).toBe(true);
  });
});

describe('distances the rules depend on', () => {
  it('Salerno is one hex from the all-sea area (9.6 example)', () => {
    expect(Math.min(...ids.filter(isSea).map((h) => distance('2707', h)))).toBe(1);
  });
});
