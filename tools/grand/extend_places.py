"""Towns, cities and roads for the drawn sectors (data/grand43/parts/extension.json, written by extend.py first).

Towns: the places named below at their Wikipedia or gazetteer positions, then, to reach the printed maps' density of
towns (about one land hex in six), the larger comuni of the area (comuni.py, from GeoNames), the largest in each hex. The larger places are cities. Roads: the main roads of 1943 (the national roads of the period), each given
as the towns it ran through; then a minor road to every town not on one, and between neighbouring towns the road
network leaves far apart, as the printed maps draw them. Every road is routed hex by hex along the cheapest way (open
ground preferred, mountain hexsides and rivers avoided where there is a choice, an existing road followed). The
routes are reconstructions to be checked against period maps."""
import heapq
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from geo import ll_to_hex  # noqa: E402
from wiki_places import locate  # noqa: E402
import mtn  # noqa: E402

ROOT = __file__.rsplit('/tools/', 1)[0]

# (name on the map, Wikipedia title or None for the same, city?)
TOWNS = [
    ('Pescara', None, True), ('Chieti', None, True), ('Ortona', None, True), ('Lanciano', None, True), ('Vasto', None, True),
    ('Termoli', None, True), ('Campobasso', None, True), ('Foggia', None, True), ('Lucera', None, True), ('San Severo', None, True),
    ('Francavilla al Mare', None, False), ('San Vito Chietino', None, False), ('Orsogna', None, False), ('Guardiagrele', None, False),
    ('Casoli', None, False), ('Fossacesia', None, False), ('Mozzagrogna', None, False), ('Paglieta', None, False), ('Atessa', None, False),
    ('Archi', 'Archi, Abruzzo', False), ('Bomba', 'Bomba, Abruzzo', False), ('Villa Santa Maria', None, False), ('Castel di Sangro', None, False),
    ('Roccaraso', None, False), ('Pescocostanzo', None, False), ('Ateleta', None, False), ('Palena', None, False), ('Torricella Peligna', None, False),
    ('Casalbordino', None, False), ('Torino di Sangro', None, False), ('San Salvo', None, False), ('Cupello', None, False), ('Gissi', None, False),
    ('Scerni', None, False), ('Castiglione Messer Marino', None, False), ('Tollo', None, False), ('Crecchio', None, False), ('Arielli', None, False),
    ('Canosa Sannita', None, False), ('Miglianico', None, False), ('Castel Frentano', None, False), ('Sant\'Eusanio del Sangro', None, False),
    ('Quadri', 'Quadri, Abruzzo', False), ('Montenero di Bisaccia', None, False), ('Petacciato', None, False), ('Guglionesi', None, False),
    ('Campomarino', None, False), ('Larino', None, False), ('Casacalenda', None, False), ('Palata', 'Palata, Molise', False), ('Montefalcone nel Sannio', None, False),
    ('Trivento', None, False), ('Agnone', None, False), ('Capracotta', None, False), ('Frosolone', None, False), ('Carovilli', None, False),
    ('Pietrabbondante', None, False), ('Castropignano', None, False), ('Lucito', None, False), ('Bonefro', None, False), ('Santa Croce di Magliano', None, False),
    ('Rotello', None, False), ('San Martino in Pensilis', None, False), ('Ururi', None, False), ('Ripabottoni', None, False), ('Ripalimosani', None, False),
    ('Gambatesa', None, False), ('Riccia', None, False), ('Jelsi', None, False), ('Montagano', None, False), ('Petrella Tifernina', None, False),
    ('Limosano', None, False), ('Torella del Sannio', None, False), ('Oratino', None, False), ('Mirabello Sannitico', None, False),
    ('Torremaggiore', None, False), ('Serracapriola', None, False), ('Chieuti', None, False), ('Apricena', None, False), ('San Paolo di Civitate', None, False),
    ('Troia', 'Troia, Apulia', False), ('Biccari', None, False), ('Volturino', None, False), ('Motta Montecorvino', None, False), ('Volturara Appula', None, False),
    ('Casalnuovo Monterotaro', None, False), ('Castelnuovo della Daunia', None, False), ('Celenza Valfortore', None, False), ('Orsara di Puglia', None, False),
    ('Bovino', None, False), ('Lesina', 'Lesina, Apulia', False), ('Poggio Imperiale', None, False), ('Rignano Garganico', None, False),
    ('San Marco in Lamis', None, False), ('Greci', 'Greci, Campania', False), ('Montecalvo Irpino', None, False), ('Castelfranco in Miscano', None, False),
    ('San Bartolomeo in Galdo', None, False), ('Baselice', None, False), ('Colle Sannita', None, False), ('Circello', None, False), ('Pesco Sannita', None, False),
    ('San Marco dei Cavoti', None, False), ('Molinara', None, False), ('San Giorgio La Molara', None, False), ('Buonalbergo', None, False),
    ('Casalbore', None, False), ('Sulmona', None, True), ('Pratola Peligna', None, False), ('Popoli', None, False), ('Lama dei Peligni', None, False),
    ('Taranta Peligna', None, False), ('Gamberale', None, False), ('Pizzoferrato', None, False), ('Rocca San Giovanni', None, False), ('Perano', None, False),
    # the Via Tiburtina Valeria (SS 5) from Avezzano over the Forca Caruso and down the Pescara valley
    ('Celano', None, False), ('Cerchio', None, False), ('Castelvecchio Subequo', None, False), ('Raiano', None, False),
    ('Bussi sul Tirino', None, False), ("Torre de' Passeri", None, False), ('Scafa', None, False),
    # Apulia and Basilicata: the Eighth Army's approach
    ('Potenza', None, True), ('Cerignola', None, True), ('Melfi', None, False), ('Rionero in Vulture', None, False), ('Atella', None, False),
    ('Lavello', None, False), ('Venosa', None, False), ('Canosa di Puglia', None, False), ('Minervino Murge', None, False), ('Spinazzola', None, False),
    ('Palazzo San Gervasio', None, False), ('Genzano di Lucania', None, False), ('Acerenza', None, False), ('Pietragalla', None, False),
    ('Tricarico', None, False), ('Tolve', None, False), ('Vaglio Basilicata', None, False), ('Gravina in Puglia', None, False), ('Irsina', None, False),
    ('Ascoli Satriano', None, False), ('Candela', 'Candela, Apulia', False), ('Orta Nova', None, False), ('Rocchetta Sant\'Antonio', None, False),
    ('Avigliano', None, False), ('Oppido Lucano', None, False), ('Banzi', None, False),
    # Lazio: the roads to Rome
    ('Littoria', 'Latina, Lazio', True), ('Frosinone', None, True), ('Sora', 'Sora, Lazio', True), ('Avezzano', None, True),
    ('Cisterna di Littoria', 'Cisterna di Latina', False), ('Sezze', None, False), ('Priverno', None, False), ('Pontinia', None, False), ('Sabaudia', None, False),
    ('San Felice Circeo', None, False), ('Ceccano', None, False), ('Ceprano', None, False), ('Ferentino', None, False), ('Anagni', None, False),
    ('Alatri', None, False), ('Veroli', None, False), ('Isola del Liri', None, False), ('Arpino', None, False), ('Balsorano', None, False),
    ('Capistrello', None, False), ('Sonnino', None, False), ('Pofi', None, False),
]
# Places given to the map though their hex is on a printed map's edge with no town of its own (the fit puts Potenza
# just inside Salerno '43's east edge, which shows the road to it but not the town).
ON_PRINTED_EDGE = {'Potenza'}

# The main roads of 1943 as the towns they ran through (names as on the grand map, old towns included).
MAJOR = [
    ['Pescara', 'Francavilla al Mare', 'Ortona', 'San Vito Chietino', 'Fossacesia', 'Torino di Sangro', 'Casalbordino', 'Vasto', 'San Salvo',
     'Petacciato', 'Termoli', 'Campomarino', 'Chieuti', 'Serracapriola', 'San Severo', 'Foggia'],            # Via Adriatica (SS 16)
    ['Isernia', 'Castel San Vincenzo', 'Castel di Sangro', 'Roccaraso', 'Sulmona', 'Pratola Peligna', 'Popoli'],  # SS 17 north
    ['Avezzano', 'Celano', 'Cerchio', 'Castelvecchio Subequo', 'Raiano', 'Popoli', 'Bussi sul Tirino', "Torre de' Passeri", 'Scafa',
     'Chieti'],                                                                                         # SS 5 Tiburtina Valeria
    ['Vinchiaturo', 'Campobasso', 'Gambatesa', 'Volturara Appula', 'Motta Montecorvino', 'Lucera', 'Foggia'],  # SS 17 east (approximate)
    ['Benevento', 'Apice', 'Ariano Irpino', 'Greci', 'Savignano di Puglia', 'Orsara di Puglia', 'Bovino', 'Foggia'],  # SS 90 delle Puglie
    ['Pietrelcina', 'Colle Sannita', 'Riccia', 'Campobasso', 'Ripalimosani', 'Montagano', 'Casacalenda', 'Larino', 'Guglionesi', 'Termoli'],  # SS 87 Sannitica (approximate)
    ['Pescara', 'Chieti'],
    ['Foggia', 'Orta Nova', 'Cerignola'],                                                                # Via Adriatica south (SS 16)
    ['Cerignola', 'Canosa di Puglia', 'Lavello', 'Rionero in Vulture', 'Atella', 'Avigliano', 'Potenza'],  # SS 93 Appulo-Lucana (approximate)
    ['Potenza', 'Vaglio Basilicata', 'Tolve', 'Tricarico'],                                             # SS 7 Appia toward Matera
    ['Foggia', 'Ascoli Satriano', 'Candela', 'Rocchetta Sant\'Antonio', 'Melfi', 'Rionero in Vulture'],    # Foggia-Melfi
    ['Terracina', 'Pontinia', 'Littoria', 'Cisterna di Littoria'],                                      # Via Appia
    ['Aquino', 'Ceprano', 'Frosinone', 'Ferentino', 'Anagni'],                                          # Via Casilina (SS 6)
    ['Sora', 'Balsorano', 'Capistrello', 'Avezzano'],                                                   # SS 82 Valle del Liri
]
MINOR = [
    ['Isernia', 'Carovilli', 'Agnone', 'Castiglione Messer Marino', 'Gissi', 'Scerni', 'Vasto'],             # SS 86 Istonia
    ['Lanciano', 'Castel Frentano', 'Casoli', 'Palena', 'Pescocostanzo', 'Roccaraso'],                        # SS 84 Frentana
    ['Ortona', 'Tollo', 'Orsogna', 'Guardiagrele', 'Chieti'],                                # the Ortona–Orsogna lateral
    ['Orsogna', 'Lanciano', 'Mozzagrogna', 'Fossacesia'],
    ['Lanciano', 'San Vito Chietino'],
    ['Castel di Sangro', 'Ateleta', 'Villa Santa Maria', 'Bomba', 'Archi', 'Atessa', 'Paglieta', 'Torino di Sangro'],  # the Sangro valley
    ['Trivento', 'Montefalcone nel Sannio', 'Montenero di Bisaccia', 'San Salvo'],                              # the Trigno valley
    ['Campobasso', 'Oratino', 'Castropignano', 'Trivento', 'Agnone'],
    ['Larino', 'Ururi', 'San Martino in Pensilis', 'Campomarino'],
    ['Larino', 'Bonefro', 'Santa Croce di Magliano', 'Celenza Valfortore', 'Casalnuovo Monterotaro', 'Torremaggiore', 'San Severo'],
    ['Lucera', 'San Severo', 'Apricena', 'San Marco in Lamis'],
    ['Foggia', 'Troia', 'Castelfranco in Miscano', 'Montecalvo Irpino', 'Ariano Irpino'],
    ['Benevento', 'San Giorgio La Molara', 'San Bartolomeo in Galdo', 'Celenza Valfortore'],
    ['Frosolone', 'Carovilli'], ['Frosolone', 'Campobasso'],
    ['Lucera', 'Biccari', 'Troia'],
    ['Melfi', 'Lavello'], ['Venosa', 'Palazzo San Gervasio', 'Spinazzola', 'Minervino Murge', 'Canosa di Puglia'], ['Lavello', 'Venosa'],
    ['Potenza', 'Pietragalla', 'Acerenza', 'Genzano di Lucania', 'Gravina in Puglia'], ['Genzano di Lucania', 'Palazzo San Gervasio'],
    ['Tolve', 'Irsina', 'Gravina in Puglia'],
    ['Frosinone', 'Ceccano', 'Priverno', 'Sezze', 'Littoria'], ['Terracina', 'Sonnino', 'Priverno'], ['Littoria', 'Sabaudia', 'San Felice Circeo'],
    ['Frosinone', 'Alatri', 'Veroli', 'Sora'], ['Sora', 'Isola del Liri', 'Arpino'], ['Isola del Liri', 'Ceprano'], ['Ceccano', 'Pofi', 'Ceprano'],
]
# The gazetteer's names as the map gives them: as in 1943 (Latina was Littoria, Cisterna di Latina Cisterna di
# Littoria, Caramanico Terme plain Caramanico), and the comune for a seat the gazetteer names by a hamlet or a
# double-barrelled form.
RENAME_1943 = {'Latina': 'Littoria', 'Cisterna di Latina': 'Cisterna di Littoria', 'Caramanico Terme': 'Caramanico',
               'Sambuceto': 'San Giovanni Teatino', 'Collefontana-Fontana Liri Inferiore': 'Fontana Liri',
               'Canistro Inferiore': 'Canistro', 'Roccaspinalveti-Santa Giusta': 'Roccaspinalveti', 'Torre Caietani': 'Torre Cajetani'}
TOWN_DENSITY = 0.16      # towns per land hex in the drawn sectors (the printed maps have 0.17-0.18)
CITY_POP = 30000         # comuni this size today are cities on the map


def hid(c, r):
    return f'{c:02d}{r:02d}'


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def cube(h):
    c, r = int(h[:2]), int(h[2:])
    z = r - (c + (c & 1)) // 2
    return c, z


def hex_distance(a, b):
    (x1, z1), (x2, z2) = cube(a), cube(b)
    return max(abs(x1 - x2), abs(z1 - z2), abs((-x1 - z1) - (-x2 - z2)))


def comuni_positions():
    """The comuni of the area (comuni.py, from GeoNames): {name: (lat, lon, population)}."""
    path = f'{os.path.dirname(__file__)}/comuni.json'
    if not os.path.exists(path):
        return {}
    out = {}
    for p in json.load(open(path))['comuni']:
        out.setdefault(p['name'], (p['lat'], p['lon'], p['pop']))
    return out


def town_name(title):
    n = title.split(',')[0].strip()
    return RENAME_1943.get(n, n)


def main():
    ext = json.load(open(f'{ROOT}/data/grand43/parts/extension.json'))
    grand = json.load(open(f'{ROOT}/data/grand43/parts/stitched.json'))
    hexes = {**grand['hexes'], **ext['hexes']}
    sides = {**grand['hexsides'], **ext['hexsides']}
    comuni = comuni_positions()
    titles = {name: (t or name) for name, t, _ in TOWNS}
    # Positions: the gazetteer's (by the place's own name), else Wikipedia's (wiki_places.py, cached).
    cached = json.load(open(f'{os.path.dirname(__file__)}/places_cache.json'))
    pos = {}
    folded = {n.lower(): v for n, v in comuni.items()}
    for t in titles.values():
        base = t.split(',')[0].strip().lower()
        if t in cached:
            pos[t] = tuple(cached[t])
        elif base in folded:
            pos[t] = folded[base][:2]
    rest = [t for t in titles.values() if t not in pos]
    if rest:
        more, missing = locate(rest)
        pos.update({t: more[t] for t in rest if t in more})
        if missing:
            print('not placed:', missing)
    edge_of_printed = lambda h: h in grand['hexes'] and any(n in ext['hexes'] or n not in hexes for n in (hid(*x) for x in mtn.nbrs(int(h[:2]), int(h[2:]))))
    # Towns: the first town in a hex keeps it (cities are listed first).
    at = {}
    for name, t, city in TOWNS:
        ll = pos.get(titles[name])
        if not ll:
            continue
        h = ll_to_hex(*ll)
        if h in grand['hexes']:
            d = grand['hexes'][h]
            if name in ON_PRINTED_EDGE and edge_of_printed(h) and not (d.get('town') or d.get('city')):
                d['city' if city else 'town'] = name
                at[name] = h
                ext.setdefault('printedTowns', {})[h] = {'city' if city else 'town': name}
            continue  # the printed maps' own towns stay as printed
        if h not in ext['hexes']:
            print(f'{name} falls outside the drawn sectors ({h})')
            continue
        if any(v == h for v in at.values()):
            continue
        at[name] = h
        d = ext['hexes'][h]
        if d['terrain'] == 'sea':
            d['terrain'] = 'clear'  # a coastal town stands on land
        d['city' if city else 'town'] = name
    # The larger comuni, the largest in each hex, to the printed maps' density.
    land = [h for h, d in ext['hexes'].items() if d['terrain'] != 'sea']
    best = {}
    # A comune already on the map under its own name, its 1943 name or its title (any case) is not added again.
    have = {n.lower() for n in at} | {titles[n].split(',')[0].strip().lower() for n in at if n in titles}
    for t, (la, lo, size) in comuni.items():
        if t.lower() in have or town_name(t).lower() in have:
            continue
        h = ll_to_hex(la, lo)
        if h not in ext['hexes'] or ext['hexes'][h]['terrain'] == 'sea' or h in at.values():
            continue
        if h not in best or size > best[h][1]:
            best[h] = (t, size)
    want = max(0, round(TOWN_DENSITY * len(land)) - len(at))
    for h, (t, size) in sorted(best.items(), key=lambda kv: -kv[1][1])[:want]:
        name = town_name(t)
        if name in at:
            continue
        at[name] = h
        ext['hexes'][h]['city' if size >= CITY_POP else 'town'] = name
    print(f'{len(at)} towns in the drawn sectors ({sum(1 for h in at.values() if h in ext["hexes"] and ext["hexes"][h].get("city"))} cities) over {len(land)} land hexes')
    # Names of the printed maps' towns, for road ends.
    named = {(d.get('city') or d.get('town')): h for h, d in grand['hexes'].items() if d.get('city') or d.get('town')}
    named.update(at)

    over_mountain = [8.0]   # what crossing a mountain hexside costs a route

    def cost(a, b):
        da, db = hexes[a], hexes[b]
        if da['terrain'] == 'sea' or db['terrain'] == 'sea':
            return None
        s = sides.get(side_key(a, b), {})
        # The printed maps' roads keep off mountain hexsides (a handful cross one) and never use a pass.
        k = 1.0 + (0.6 if db['terrain'] == 'hill' else 0) + (over_mountain[0] if s.get('mountain') else 0) + (0.6 if s.get('river') else 0)
        if s.get('road'):
            k -= 0.6
        return k

    def search(a, goal):
        """Cheapest route from a to the first hex goal(h) accepts."""
        pq = [(0, a)]
        best = {a: 0}
        prev = {a: None}
        while pq:
            g, h = heapq.heappop(pq)
            if g > best[h]:
                continue
            if h != a and goal(h):
                path = [h]
                while prev[path[-1]]:
                    path.append(prev[path[-1]])
                return path[::-1]
            if g > 40:
                break
            c, r = int(h[:2]), int(h[2:])
            for n in mtn.nbrs(c, r):
                nh = hid(*n)
                if nh not in hexes:
                    continue
                k = cost(h, nh)
                if k is None:
                    continue
                if g + k < best.get(nh, 1e18):
                    best[nh] = g + k
                    prev[nh] = h
                    heapq.heappush(pq, (g + k, nh))
        return []

    def route(a, b):
        return search(a, lambda h: h == b)

    made = 0

    def lay(path, kind):
        nonlocal made
        for x, y in zip(path, path[1:]):
            k = side_key(x, y)
            s = sides.setdefault(k, {})
            if s.get('road') == 'major' or (s.get('road') and kind == 'minor'):
                continue
            # The printed maps keep their roads as printed.
            if x in grand['hexes'] and y in grand['hexes']:
                continue
            s['road'] = kind
            ext['hexsides'].setdefault(k, {})['road'] = kind
            if s.pop('pass', None):
                # The printed maps' roads cross a ridge on a mountain hexside, never a pass.
                ext['hexsides'][k].pop('pass', None)
            made += 1

    for roads, kind in ((MAJOR, 'major'), (MINOR, 'minor')):
        for chain in roads:
            pts = [named.get(n) for n in chain]
            for n, p in zip(chain, pts):
                if not p:
                    print(f'road town not on the map: {n}')
            pts = [p for p in pts if p]
            for a, b in zip(pts, pts[1:]):
                path = route(a, b)
                if not path or len(path) - 1 > 1.5 * hex_distance(a, b) + 2:
                    # A road of 1943 that the ranges would send far round went over them (the Forchetta between
                    # Palena and Roccaraso): it may cross a mountain hexside.
                    over_mountain[0] = 2.0
                    short = route(a, b)
                    over_mountain[0] = 8.0
                    if short and (not path or len(short) < len(path)):
                        path = short
                lay(path, kind)
    chains = made

    def road_hex(h):
        c, r = int(h[:2]), int(h[2:])
        return any(sides.get(side_key(h, hid(*n)), {}).get('road') for n in mtn.nbrs(c, r))

    # A minor road to every town of the drawn sectors that has none.
    towns = [h for h in at.values() if h in ext['hexes']]
    for h in towns:
        if not road_hex(h):
            lay(search(h, road_hex), 'minor')
    to_towns = made - chains

    def road_steps(a, limit):
        """Steps from a along roads to every hex within `limit`."""
        dist = {a: 0}
        frontier = [a]
        for d in range(1, limit + 1):
            nxt = []
            for h in frontier:
                c, r = int(h[:2]), int(h[2:])
                for n in mtn.nbrs(c, r):
                    nh = hid(*n)
                    if nh not in dist and sides.get(side_key(h, nh), {}).get('road'):
                        dist[nh] = d
                        nxt.append(nh)
            frontier = nxt
        return dist

    # Neighbouring towns the roads leave far apart get a road between them, nearest pairs first.
    every = [h for h, d in hexes.items() if d.get('town') or d.get('city')]
    pairs = sorted({(hex_distance(a, b), min(a, b), max(a, b)) for a in towns for b in every
                    if a != b and 2 <= hex_distance(a, b) <= 4})
    for d, a, b in pairs:
        if road_steps(a, max(d + 1, int(1.6 * d))).get(b) is None:
            lay(route(a, b), 'minor')
    print(f'{made} road hexsides: {chains} on the main roads, {to_towns} to towns, {made - chains - to_towns} between neighbours')

    # Ports and airfields of the Adriatic sector.
    for name in ('Termoli', 'Ortona', 'Pescara'):
        h = named.get(name)
        if h and h in ext['hexes']:
            ext['hexes'][h]['port'] = {'capacity': 1}
            ext['hexes'][h]['harbour'] = True
    for name, ll, kind in (('Foggia', None, 'major'), ('Amendola Airfield', (41.535, 15.718), 'minor'), ('Lucera', None, 'minor')):
        h = named.get(name) if ll is None else ll_to_hex(*ll)
        if h and h in ext['hexes'] and ext['hexes'][h]['terrain'] != 'sea':
            ext['hexes'][h]['airfield'] = kind
            if ll is not None and not (ext['hexes'][h].get('town') or ext['hexes'][h].get('city')):
                ext['hexes'][h]['label'] = name
    json.dump(ext, open(f'{ROOT}/data/grand43/parts/extension.json', 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
