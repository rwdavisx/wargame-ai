"""Towns, cities and roads for the Adriatic extension (data/grand43/extension.json, written by extend.py first).

Towns are placed at their Wikipedia positions (wiki_places.py); the larger ones are cities. Roads: the main roads of
1943 (the national roads of the period), each given as the towns it ran through, routed hex by hex along the cheapest
way between them (open ground preferred, mountain hexsides and rivers avoided where there is a choice, an existing
road followed where it joins the printed maps). These are reconstructions to be checked against period maps."""
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
]

# The main roads of 1943 as the towns they ran through (names as on the grand map, old towns included).
MAJOR = [
    ['Pescara', 'Francavilla al Mare', 'Ortona', 'San Vito Chietino', 'Fossacesia', 'Torino di Sangro', 'Casalbordino', 'Vasto', 'San Salvo',
     'Petacciato', 'Termoli', 'Campomarino', 'Chieuti', 'Serracapriola', 'San Severo', 'Foggia'],            # Via Adriatica (SS 16)
    ['Isernia', 'Castel San Vincenzo', 'Castel di Sangro', 'Roccaraso', 'Sulmona'],                          # SS 17 north
    ['Vinchiaturo', 'Campobasso', 'Gambatesa', 'Volturara Appula', 'Motta Montecorvino', 'Lucera', 'Foggia'],  # SS 17 east (approximate)
    ['Benevento', 'Apice', 'Ariano Irpino', 'Greci', 'Savignano di Puglia', 'Orsara di Puglia', 'Bovino', 'Foggia'],  # SS 90 delle Puglie
    ['Pietrelcina', 'Pesco Sannita', 'Colle Sannita', 'Riccia', 'Campobasso', 'Ripalimosani', 'Montagano', 'Casacalenda', 'Larino', 'Guglionesi', 'Termoli'],  # SS 87 Sannitica (approximate)
    ['Pescara', 'Chieti'],
]
MINOR = [
    ['Isernia', 'Carovilli', 'Agnone', 'Castiglione Messer Marino', 'Gissi', 'Scerni', 'Vasto'],             # SS 86 Istonia
    ['Lanciano', 'Castel Frentano', 'Casoli', 'Palena', 'Pescocostanzo', 'Roccaraso'],                        # SS 84 Frentana
    ['Ortona', 'Tollo', 'Canosa Sannita', 'Orsogna', 'Guardiagrele', 'Chieti'],                                # the Ortona–Orsogna lateral
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
    ['Sulmona', 'Pratola Peligna', 'Popoli'],
]


def hid(c, r):
    return f'{c:02d}{r:02d}'


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def main():
    ext = json.load(open(f'{ROOT}/data/grand43/extension.json'))
    grand = json.load(open(f'{ROOT}/data/grand43/map.json'))
    hexes = {**grand['hexes'], **ext['hexes']}
    sides = {**grand['hexsides'], **ext['hexsides']}
    titles = {name: (t or name) for name, t, _ in TOWNS}
    pos, missing = locate(list(titles.values()))
    if missing:
        print('not placed:', missing)
    # Towns: the first town in a hex keeps it (cities are listed first).
    at = {}
    for name, t, city in TOWNS:
        ll = pos.get(titles[name])
        if not ll:
            continue
        h = ll_to_hex(*ll)
        if h in grand['hexes']:
            continue  # the printed maps' own towns stay as printed
        if h not in ext['hexes']:
            print(f'{name} falls outside the extension ({h})')
            continue
        if any(v == h for v in at.values()):
            continue
        at[name] = h
        d = ext['hexes'][h]
        if d['terrain'] == 'sea':
            d['terrain'] = 'clear'  # a coastal town stands on land
        d['city' if city else 'town'] = name
    # Names of the printed maps' towns, for road ends.
    named = {(d.get('city') or d.get('town')): h for h, d in grand['hexes'].items() if d.get('city') or d.get('town')}
    named.update(at)

    def cost(a, b):
        da, db = hexes[a], hexes[b]
        if da['terrain'] == 'sea' or db['terrain'] == 'sea':
            return None
        s = sides.get(side_key(a, b), {})
        k = 1.0 + (0.6 if db['terrain'] == 'hill' else 0) + (3.0 if s.get('mountain') else 0) + (0.6 if s.get('river') else 0)
        if s.get('road'):
            k -= 0.6
        return k

    def route(a, b):
        pq = [(0, a)]
        best = {a: 0}
        prev = {a: None}
        while pq:
            g, h = heapq.heappop(pq)
            if h == b:
                break
            if g > best[h]:
                continue
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
        if b not in prev:
            return []
        path = [b]
        while prev[path[-1]]:
            path.append(prev[path[-1]])
        return path[::-1]

    made = 0
    for roads, kind in ((MAJOR, 'major'), (MINOR, 'minor')):
        for chain in roads:
            pts = [named.get(n) for n in chain]
            for n, p in zip(chain, pts):
                if not p:
                    print(f'road town not on the map: {n}')
            pts = [p for p in pts if p]
            for a, b in zip(pts, pts[1:]):
                path = route(a, b)
                for x, y in zip(path, path[1:]):
                    k = side_key(x, y)
                    s = sides.setdefault(k, {})
                    if s.get('road') == 'major':
                        continue
                    # The printed maps keep their roads as printed.
                    if x in grand['hexes'] and y in grand['hexes']:
                        continue
                    s['road'] = kind
                    ext['hexsides'].setdefault(k, {})['road'] = kind
                    made += 1
    print(f'{len(at)} towns placed, {made} road hexsides')
    json.dump(ext, open(f'{ROOT}/data/grand43/extension.json', 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
