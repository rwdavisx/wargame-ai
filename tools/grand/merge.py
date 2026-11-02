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
    # Apulia, Basilicata and Lazio
    ('Potenza', 1, '1943-09-20'), ('Frosinone', 2, None),
]

# Defence lines across the Adriatic sector (research/german.json): the line's places, joined hex to hex.
LINES = {
    'bernhard': [(41.735, 14.035), (41.784, 14.108), (41.94, 14.18), (42.04, 14.27), (42.11, 14.30), (42.12, 14.35), (42.20, 14.46), (42.24, 14.52)],
    'gustav': [(41.735, 14.035), (41.80, 14.19), (41.98, 14.18), (42.10, 14.22), (42.20, 14.20), (42.22, 14.28), (42.29, 14.33), (42.32, 14.38)],
}

# Roads leaving the map: from a town to the edge, toward the place given.
STUBS = [
    ('Cisterna di Latina', (41.69, 12.78), 'major'),   # Via Appia toward Velletri and Rome
    ('Anagni', (41.78, 12.92), 'major'),               # Via Casilina (SS 6) toward Valmontone and Rome
    ('Avezzano', (42.10, 13.40), 'minor'),             # the Fucino toward Tagliacozzo and Rome
    ('Popoli', (42.33, 13.55), 'major'),               # Via Tiburtina (SS 5) toward L'Aquila
    ('Pescara', (42.53, 14.13), 'major'),              # Via Adriatica north (SS 16) toward Ancona
    ('Tricarico', (40.63, 16.28), 'major'),            # SS 7 Appia toward Grassano and Matera
    ('Gravina in Puglia', (40.83, 16.55), 'minor'),    # toward Altamura and Bari
    ('Canosa di Puglia', (41.23, 16.29), 'minor'),     # toward Andria and Bari
    ('Cerignola', (41.32, 16.28), 'major'),            # Via Adriatica south (SS 16) toward Barletta and Bari
]

# Entry areas: (name, side, label, hexes or a stitched area to take them from)
ENTRY = [
    ('G1', 'north', 'G1 Via Appia, to Rome', 'stub:Cisterna di Latina'),
    ('G2', 'north', 'G2 Via Casilina, to Rome', 'stub:Anagni'),
    ('G3', 'north', 'G3 to Avezzano and Rome', 'stub:Avezzano'),
    ('G4', 'north', "G4 Via Tiburtina, to L'Aquila", 'stub:Popoli'),
    ('G5', 'north', 'G5 Via Adriatica, to Ancona', 'stub:Pescara'),
    ('A1', 'south', 'A1 to Calabria (coast)', 'SS1'),
    ('A2', 'south', 'A2 to Calabria (Sala Consilina)', 'SS2'),
    ('A3', 'south', 'A3 to Calabria (inland)', 'SS3'),
    ('A4', 'south', 'A4 to Matera and Taranto', 'stub:Tricarico'),
    ('A5', 'east', 'A5 to Altamura and Bari', 'stub:Gravina in Puglia'),
    ('A6', 'east', 'A6 to Andria and Bari', 'stub:Canosa di Puglia'),
    ('A7', 'east', 'A7 Via Adriatica, to Barletta and Bari', 'stub:Cerignola'),
]
LINKS = [('G1', 'G2'), ('G2', 'G3'), ('G3', 'G4'), ('G4', 'G5'), ('A1', 'A2'), ('A2', 'A3'), ('A3', 'A4'), ('A4', 'A5'), ('A5', 'A6'),
         ('A6', 'A7')]


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


def reconnect(hexes, sides, st, edge, cost):
    """Join up what the printed maps' edges and the drawn sectors left apart. Each road that stops short (not at a town,
    a port or the map's edge) is led on to the nearest road it does not already reach nearby; each piece of road cut
    off from the network is joined to it by the shortest way; each river that stops at a join between two of the
    three sources is led on to the nearest river across it."""
    from extend import edge_hexes, vertex_steps, vertices_of, vpos
    ids = json.load(open(f'{os.path.dirname(__file__)}/ids.json'))
    origin = {h: 'italy' for h in ids['italy43'].values()}
    for h in ids['salerno43'].values():
        origin.setdefault(h, 'salerno')
    for h in hexes:
        origin.setdefault(h, 'drawn')
    land = lambda h: h in hexes and hexes[h]['terrain'] != 'sea'

    def road_adj():
        adj = {}
        for k, v in sides.items():
            if v.get('road'):
                a, b = k.split('-')
                if a in hexes and b in hexes:
                    adj.setdefault(a, set()).add(b)
                    adj.setdefault(b, set()).add(a)
        return adj

    def search(starts, goal, limit, not_first=()):
        pq = [(0, h) for h in starts]
        best = {h: 0 for h in starts}
        prev = {h: None for h in starts}
        while pq:
            g, h = heapq.heappop(pq)
            if g > best[h] or g > limit:
                continue
            if goal(h) and prev[h] is not None:
                path = [h]
                while prev[path[-1]]:
                    path.append(prev[path[-1]])
                return path[::-1]
            for n in nbr_ids(h):
                k = cost(h, n) if n in hexes else None
                if k is None or (prev[h] is None and n in not_first):
                    continue
                if any(sides.get(side_key(h, n), {}).get(f) for f in ('mountain',)):
                    k += 5
                if g + k < best.get(n, 1e18):
                    best[n], prev[n] = g + k, h
                    heapq.heappush(pq, (g + k, n))
        return []

    def lay(path, kind):
        for p, q in zip(path, path[1:]):
            sd = sides.setdefault(side_key(p, q), {})
            if sd.get('road') != 'major':
                sd['road'] = kind

    # Roads that stop short.
    adj = road_adj()
    fixed = 0
    for h in sorted(adj):
        if len(adj[h]) != 1 or edge(h) or hexes[h].get('town') or hexes[h].get('city') or hexes[h].get('port'):
            continue
        # Hexes the road already reaches within six steps do not count.
        near, frontier = {h}, [h]
        for _ in range(6):
            frontier = [y for x in frontier for y in adj.get(x, ()) if y not in near]
            near.update(frontier)
        kind = sides[side_key(h, next(iter(adj[h])))]['road']
        path = search([h], lambda g: g in adj and g not in near, 7, adj[h])
        if not path:
            # A road ending in a tight knot of roads: on to the nearest road or town it does not touch.
            close = {h} | adj[h]
            path = search([h], lambda g: (g in adj or hexes[g].get('town') or hexes[g].get('city')) and g not in close, 12, adj[h])
        if path:
            lay(path, kind)
            fixed += 1
            adj = road_adj()
    # Road pieces cut off from the network.
    def components():
        seen, out = set(), []
        for h in adj:
            if h in seen:
                continue
            comp, stack = [], [h]
            seen.add(h)
            while stack:
                x = stack.pop()
                comp.append(x)
                for y in adj[x]:
                    if y not in seen:
                        seen.add(y)
                        stack.append(y)
            out.append(comp)
        return sorted(out, key=len, reverse=True)
    bridged = 0
    while True:
        comps = components()
        if len(comps) < 2:
            break
        main_net = set(comps[0])
        piece = comps[1]
        path = search(piece, lambda g: g in main_net, 14)
        if not path:
            print('road piece left apart:', sorted(piece)[:5])
            break
        lay(path, 'minor')
        bridged += 1
        adj = road_adj()
    # Rivers that stop at a join.
    def river_sides():
        return [k for k, v in sides.items() if (v.get('river') or v.get('majorRiver')) and all(x in hexes for x in k.split('-'))]
    def verts(k):
        a, b = k.split('-')
        return set(vertices_of(int(a[:2]), int(a[2:]))) & set(vertices_of(int(b[:2]), int(b[2:])))
    def around(v, k):
        a, b = k.split('-')
        out = {a, b}
        for n in set(nbr_ids(a)) & set(nbr_ids(b)):
            if v in vertices_of(int(n[:2]), int(n[2:])):
                out.add(n)
        return out
    rivers_joined = 0
    for _ in range(40):
        rs = river_sides()
        deg, parent = {}, {}
        def find(v):
            while parent.get(v, v) != v:
                v = parent[v]
            return v
        side_of = {}
        for k in rs:
            vs = list(verts(k))
            for v in vs:
                deg[v] = deg.get(v, 0) + 1
                side_of[v] = k
            if len(vs) == 2:
                a, b = find(vs[0]), find(vs[1])
                if a != b:
                    parent[a] = b
        ends = []
        for v, d in deg.items():
            if d != 1:
                continue
            hs = around(v, side_of[v])
            if any(not land(x) for x in hs) or len({origin.get(x) for x in hs}) < 2:
                continue
            ends.append(v)
        done = False
        for v in ends:
            x, y = vpos(v)
            cands = [w for w in deg if find(w) != find(v) and (vpos(w)[0] - x) ** 2 + (vpos(w)[1] - y) ** 2 <= 3.6 ** 2]
            if not cands:
                continue
            w = min(cands, key=lambda w: (vpos(w)[0] - x) ** 2 + (vpos(w)[1] - y) ** 2)
            steps = vertex_steps(v, w)
            ok = steps and all(all(land(hh) for hh in edge_hexes(p, q)) for p, q in steps)
            if not ok:
                continue
            for p, q in steps:
                sides.setdefault(side_key(*edge_hexes(p, q)), {})['river'] = True
            rivers_joined += 1
            done = True
            break
        if not done:
            break
    # A printed river that begins at a join (its upper course was off the printed map) is led on up its valley from the
    # elevation data, a few hexsides along the lowest way up, so it tapers off rather than stopping at a line.
    from extend import is_vertex, vkey
    from geo import Dem, plane_to_ll
    dem = Dem(10)
    height = lambda v: dem.at(*plane_to_ll(*vpos(v)))
    def vnbrs(v):
        x, y = vpos(v)
        out = []
        for k in range(6):
            nx, ny = x + math.cos(math.radians(60 * k)), y + math.sin(math.radians(60 * k))
            w = vkey(nx, ny)
            if abs(vpos(w)[0] - nx) < 1e-6 and abs(vpos(w)[1] - ny) < 1e-6 and is_vertex(w):
                out.append(w)
        return out
    rs = river_sides()
    deg, side_of = {}, {}
    for k in rs:
        for v in verts(k):
            deg[v] = deg.get(v, 0) + 1
            side_of[v] = k
    led = 0
    for v, d in list(deg.items()):
        if d != 1:
            continue
        hs = around(v, side_of[v])
        if any(not land(x) for x in hs) or len({origin.get(x) for x in hs}) < 2:
            continue
        cur, seen = v, {v}
        for _ in range(4):
            steps = []
            for w in vnbrs(cur):
                if w in seen:
                    continue
                e = edge_hexes(cur, w)
                if not all(land(x) for x in e) or sides.get(side_key(*e), {}).get('mountain'):
                    continue
                if deg.get(w) and _ > 0:
                    steps = []
                    break
                steps.append((height(w), w, e))
            up = [t for t in steps if t[0] >= height(cur) - 5]
            if not up:
                break
            h, w, e = min(up)
            sides.setdefault(side_key(*e), {})['river'] = True
            seen.add(w)
            cur = w
        if cur != v:
            led += 1
    print(f'joins: {fixed} roads led on, {bridged} road pieces joined to the network, {rivers_joined} rivers joined, {led} led up their valleys')


def main():
    st = json.load(open(f'{PARTS}/stitched.json'))
    ex = json.load(open(f'{PARTS}/extension.json'))
    hexes = {h: dict(d) for h, d in st['hexes'].items()}
    for h, d in ex['hexes'].items():
        hexes.setdefault(h, dict(d))
    sides = {k: dict(v) for k, v in st['hexsides'].items()}
    for k, v in ex['hexsides'].items():
        sides.setdefault(k, {}).update(v)
    # Towns the drawn sectors give to a printed map's empty edge hex (Potenza).
    for h, d in ex.get('printedTowns', {}).items():
        hexes[h].update(d)
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

    reconnect(hexes, sides, st, edge, cost)

    # Entry areas.
    entry = {}
    for name, side, label, src in ENTRY:
        if src.startswith('stub:'):
            e = stub_ends[src[5:]]
            hs = [e] + [n for n in nbr_ids(e) if edge(n)]
        else:
            hs = [h for h in st['entryAreas'][src]['hexes'] if edge(h)]
        hs = sorted(set(h for h in hs if land(h) and not any(h in e['hexes'] for e in entry.values())))
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
