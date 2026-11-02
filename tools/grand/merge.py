"""The grand campaign's map (data/grand43/map.json): the two printed maps joined on one grid (parts/stitched.json, from
stitch.py) and the Adriatic front drawn from the ground (parts/extension.json, from extend.py and extend_places.py).

On top of the join this script sets what the scenario needs:
- the entry areas of the joined map (the printed maps' inner edges are gone; new ones where the 1943 roads leave the
  map: the Via Tiburtina at Popoli and the Via Adriatica north of Pescara for the Germans, the roads from Cerignola
  and Candela for the Eighth Army coming up from Apulia);
- the victory hexes of one VP total for both fronts, each with the date the Allies took it in 1943 (or none), from
  which rules.json's benchmarks are worked out (build_oob.py);
- the Bernhard and Gustav positions across the Adriatic sector (research/german.json, 'lines');
- Naples as a port the Allies can sail into once they hold it.
Marks that only meant something in one printed game go: Salerno's 8th Army sector and Italy's 8th Army zone (the
Eighth Army is on the map, played by the Allied player)."""
import heapq
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from geo import ll_to_hex, ll_to_plane, SQ3  # noqa: E402
from stitch import ROW_SHIFT  # noqa: E402
import mtn  # noqa: E402

ROOT = __file__.rsplit('/tools/', 1)[0]
PARTS = f'{ROOT}/data/grand43/parts'


def hid(c, r):
    return f'{c:02d}{r:02d}'


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def nbr_ids(h):
    return [hid(*n) for n in mtn.nbrs(int(h[:2]), int(h[2:]))]


# Victory hexes: (hex or place name, VP, the date the Allies held it for good in 1943 or None). The printed maps' own
# VP hexes keep their values; Naples (an exit worth 5 on Salerno's map, behind the start line on Italy's) and the
# Adriatic towns are new. Dates: Molony vol. V, Blumenson, Nicholson, CMH 100-7/100-8 (see research/*.md).
VP = [
    # Salerno '43's map
    ('Agropoli', 1, '1943-09-09'), ('2758', 1, '1943-09-09'), ('Maiori', 1, '1943-09-09'), ('Salerno', 2, '1943-09-10'),
    ('2852', 1, '1943-09-10'), ('Battipaglia', 1, '1943-09-18'), ('Altavilla Silentina', 1, '1943-09-19'), ('Eboli', 1, '1943-09-19'),
    ('Auletta', 1, '1943-09-20'), ('4153', 1, '1943-09-28'), ('Nocera Inferiore', 1, '1943-09-28'), ('Sarno', 1, '1943-09-29'),
    ('Torre Annunziata', 1, '1943-09-30'), ('Avellino', 2, '1943-10-01'), ('Ariano Irpino', 1, '1943-10-03'),
    # Italy '43's map
    ('2138', 4, '1943-10-01'),  # Naples
    ('Benevento', 1, '1943-10-02'), ('Caserta', 1, '1943-10-03'), ('3033', 1, '1943-10-06'), ('2130', 1, '1943-10-14'),
    ('2531', 1, '1943-10-14'), ('Amorosi', 1, '1943-10-18'), ('2529', 1, '1943-10-22'), ('Alife', 1, '1943-10-21'),
    ('Mondragone', 1, '1943-11-01'), ('2725', 1, '1943-11-02'), ('Sessa Aurunca', 1, '1943-11-02'), ('2522', 1, '1943-12-08'),
    ('San Pietro', 1, '1943-12-17'), ('2920', 1, '1943-12-27'), ('3219', 1, None), ('Castel San Vincenzo', 1, None),
    ('2818', 1, None), ('Terracina', 4, None), ('Fondi', 1, None), ('Formia', 1, None), ('Minturno', 1, None), ('Castelforte', 1, None),
    ('2315', 5, None), ('2420', 1, None), ('Cassino', 2, None), ("Sant'Elia Fiumerapido", 1, None), ('Atina', 3, None),
    ('San Biagio Saracinisco', 1, None), ('Isernia', 1, '1943-11-04'),
    # the Adriatic front
    ('Foggia', 3, '1943-09-27'), ('Lucera', 1, '1943-10-01'), ('San Severo', 1, '1943-09-30'), ('Termoli', 2, '1943-10-06'),
    ('Larino', 1, '1943-10-07'), ('Campobasso', 2, '1943-10-14'), ('Vasto', 1, '1943-11-04'), ('Castel di Sangro', 1, '1943-11-24'),
    ('Lanciano', 1, '1943-12-03'), ('Ortona', 2, '1943-12-28'), ('Orsogna', 1, None), ('Chieti', 2, None), ('Pescara', 3, None),
    ('Sulmona', 2, None),
]

# Defence lines across the Adriatic sector (research/german.json): the line's places, joined hex to hex.
LINES = {
    'bernhard': [(41.735, 14.035), (41.784, 14.108), (41.94, 14.18), (42.04, 14.27), (42.11, 14.30), (42.12, 14.35), (42.20, 14.46), (42.24, 14.52)],
    'gustav': [(41.735, 14.035), (41.80, 14.19), (41.98, 14.18), (42.10, 14.22), (42.20, 14.20), (42.22, 14.28), (42.29, 14.33), (42.32, 14.38)],
}

# Roads leaving the map that the joined maps lack (from a town to the edge, toward the place given).
STUBS = [
    ('Pescara', (42.53, 14.13), 'major'),    # Via Adriatica north (SS 16) toward Montesilvano and Ancona
    ('Popoli', (42.33, 13.55), 'major'),     # Via Tiburtina (SS 5) toward L'Aquila, Avezzano and Rome
    ('Sulmona', (42.00, 13.70), 'minor'),    # the Marsicana over the Forca Caruso toward Avezzano
    ('Foggia', (41.265, 15.90), 'major'),    # Via Adriatica south (SS 16) toward Cerignola and Bari
    ('Bovino', (41.137, 15.513), 'minor'),   # toward Candela and Melfi
    ('Lucera', (41.40, 15.45), 'minor'),
]

# Entry areas: (name, side, label, hexes or a stitched area to take them from)
ENTRY = [
    ('G1', 'north', 'G1 Via Appia, to Rome', 'IN1'),
    ('G2', 'north', 'G2 Via Casilina, to Rome', 'IN2'),
    ('G3', 'north', 'G3 to Sora and Avezzano', 'IN3'),
    ('G4', 'north', "G4 Via Tiburtina, to L'Aquila", 'stub:Popoli'),
    ('G5', 'north', 'G5 Via Adriatica, to Ancona', 'stub:Pescara'),
    ('A1', 'south', 'A1 to Calabria (coast)', 'SS1'),
    ('A2', 'south', 'A2 to Calabria (Sala Consilina)', 'SS2'),
    ('A3', 'south', 'A3 to Calabria (inland)', 'SS3'),
    ('A4', 'east', 'A4 to Lucania', 'SE1'),
    ('A5', 'east', 'A5 Potenza', 'SE2'),
    ('A6', 'east', 'A6 to Melfi', 'SE3'),
    ('A7', 'east', 'A7 to Melfi (north)', 'SE4'),
    ('A8', 'south', 'A8 Via Adriatica, to Bari', 'stub:Foggia'),
    ('A9', 'south', 'A9 to Candela', 'stub:Bovino'),
]
LINKS = [('G1', 'G2'), ('G2', 'G3'), ('G3', 'G4'), ('G4', 'G5'), ('A1', 'A2'), ('A2', 'A3'), ('A3', 'A4'), ('A4', 'A5'), ('A5', 'A6'),
         ('A6', 'A7'), ('A7', 'A9'), ('A9', 'A8')]


def ll_to_cr(lat, lon):
    """Grid position (column, row) of a place, off the map or on it."""
    x, y = ll_to_plane(lat, lon)
    c = round(x / 1.5)
    return c, round(-y / SQ3 - (0.5 if c % 2 == 0 else 0)) + ROW_SHIFT


def line_hexes(points):
    """Hexes along a line through `points` (lat, lon): each leg sampled finely and snapped to the grid."""
    out = []
    for (la1, lo1), (la2, lo2) in zip(points, points[1:]):
        n = 40
        for i in range(n + 1):
            h = ll_to_hex(la1 + (la2 - la1) * i / n, lo1 + (lo2 - lo1) * i / n)
            if h not in out:
                out.append(h)
    return out


def main():
    st = json.load(open(f'{PARTS}/stitched.json'))
    ex = json.load(open(f'{PARTS}/extension.json'))
    hexes = {h: dict(d) for h, d in st['hexes'].items()}
    for h, d in ex['hexes'].items():
        hexes.setdefault(h, dict(d))
    sides = {k: dict(v) for k, v in st['hexsides'].items()}
    for k, v in ex['hexsides'].items():
        sides.setdefault(k, {}).update(v)
    for d in hexes.values():
        for k in ('sector8', 'zone8'):
            d.pop(k, None)
        d.pop('vp', None)
    land = lambda h: h in hexes and hexes[h]['terrain'] != 'sea'
    named = {}
    for h, d in sorted(hexes.items()):
        for k in ('city', 'town'):
            if d.get(k):
                named.setdefault(d[k], h)

    def at(ref):
        if ref in hexes:
            return ref
        if ref not in named:
            raise SystemExit(f'no hex for {ref}')
        return named[ref]

    # Naples is the port the Allies sail into once they hold it (its two harbour hexes).
    for h in ('2038', '2139'):
        hexes[h]['port'] = {'capacity': 3, 'major': True}

    # Victory hexes.
    taken = {}
    for ref, vp, date in VP:
        h = at(ref)
        hexes[h]['vp'] = vp
        taken[h] = date

    # Lines across the Adriatic sector.
    for flag, pts in LINES.items():
        for h in line_hexes(pts):
            if land(h) and h in ex['hexes']:
                hexes[h][flag] = True

    # Road stubs to the map edge.
    def edge(h):
        return land(h) and any(n not in hexes for n in nbr_ids(h))

    def cost(a, b):
        if not land(b):
            return None
        s = sides.get(side_key(a, b), {})
        return 1.0 + (0.6 if hexes[b]['terrain'] == 'hill' else 0) + (3.0 if s.get('mountain') else 0) + (0.6 if s.get('river') else 0) - (0.6 if s.get('road') else 0)

    def route(a, goal):
        pq, best, prev = [(0, a)], {a: 0}, {a: None}
        while pq:
            g, h = heapq.heappop(pq)
            if h == goal:
                break
            if g > best[h]:
                continue
            for n in nbr_ids(h):
                k = cost(h, n) if n in hexes else None
                if k is None or g + k >= best.get(n, 1e18):
                    continue
                best[n], prev[n] = g + k, h
                heapq.heappush(pq, (g + k, n))
        path = [goal]
        while prev.get(path[-1]):
            path.append(prev[path[-1]])
        return path[::-1] if path[-1] == a else []

    stub_ends = {}
    for town, toward, kind in STUBS:
        a = at(town)
        tc, tr = ll_to_cr(*toward)
        # The edge hex nearest the place beyond the map.
        e = min((h for h in hexes if edge(h)), key=lambda h: (int(h[:2]) - tc) ** 2 + (int(h[2:]) - tr) ** 2)
        path = route(a, e)
        for p, q in zip(path, path[1:]):
            s = sides.setdefault(side_key(p, q), {})
            if s.get('road') != 'major':
                s['road'] = kind
        stub_ends[town] = e

    # Entry areas.
    entry = {}
    for name, side, label, src in ENTRY:
        if src.startswith('stub:'):
            e = stub_ends[src[5:]]
            hs = [e] + [n for n in nbr_ids(e) if edge(n)]
        else:
            hs = [h for h in st['entryAreas'][src]['hexes'] if edge(h)]
        hs = sorted(set(h for h in hs if land(h)))
        if not hs:
            raise SystemExit(f'entry area {name} has no edge hexes')
        entry[name] = {'side': side, 'label': label, 'hexes': hs}

    meta = dict(st['meta'])
    meta.update({
        'title': 'Grand campaign map data (Salerno ’43 and Italy ’43 joined, the Adriatic front added)',
        'source': 'The two transcribed maps joined by tools/grand/stitch.py; the Adriatic front drawn from elevation data and period '
                  'roads by tools/grand/extend.py; merged by tools/grand/merge.py.',
        # The landing rules' fixed places, which Salerno '43 names by its own hex numbers.
        'salernoPort': at('Salerno'),
        'germanAirfield': '2852',
        'minedPorts': ['1844', '2243'],
        'landingBeach': 'Sugar',
    })
    meta['seaLabels'] = meta.get('seaLabels', []) + [['6010', 'ADRIATIC SEA', 30]]
    out = {
        'meta': meta,
        'hexes': dict(sorted(hexes.items())),
        'hexsides': dict(sorted((k, v) for k, v in sides.items() if v)),
        'entryAreas': entry,
        'beaches': st['beaches'],
        'offmapLinks': [{'from': a, 'to': b, 'turns': 1} for a, b in LINKS],
    }
    json.dump(out, open(f'{ROOT}/data/grand43/map.json', 'w'), indent=1, ensure_ascii=False)
    json.dump({h: taken[h] for h in sorted(taken)}, open(f'{os.path.dirname(__file__)}/vp_dates.json', 'w'), indent=1)
    import backdrop  # the painter's ground beyond the playable hexes
    backdrop.main()
    total = sum(d.get('vp', 0) for d in hexes.values())
    print(f'{len(hexes)} hexes, {len(out["hexsides"])} hexsides, {total} VP in {len(taken)} hexes; entry areas',
          {k: v['hexes'] for k, v in entry.items()})


if __name__ == '__main__':
    main()
