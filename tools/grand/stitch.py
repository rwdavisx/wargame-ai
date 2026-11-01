"""Joins the Italy '43 and Salerno '43 maps into one grid for the grand campaign (data/grand43/map.json).

The two printed maps share their scale and orientation and meet edge to edge: fitted to the ground (fit.py), Salerno
falls on Italy's grid with no column offset and its rows 27.5 lower, so Salerno hex (c, r) is Italy (c, r + 28) in an
odd column and (c, r + 27) in an even one (the two maps shade opposite columns down). The grand map keeps Italy's
convention (even columns down) and moves every row ROW_SHIFT down, to make room north of the Italy map for the
Adriatic front (Ortona lies about 8 rows above Italy's row 0).

Writes the map and ids.json (each game's hex id to the grand map's), for the later phases' set-ups and scenarios.
Map data only: rules, forces and the Adriatic extension come later."""
import json
import os

ROOT = __file__.rsplit('/tools/', 1)[0]
OUT = f'{ROOT}/data/grand43'
ROW_SHIFT = 14


def hid(c, r):
    return f'{c:02d}{r:02d}'


def from_italy(h):
    return hid(int(h[:2]), int(h[2:]) + ROW_SHIFT)


def from_salerno(h):
    c, r = int(h[:2]), int(h[2:])
    return hid(c, r + (28 if c % 2 else 27) + ROW_SHIFT)


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def remap_side(k, f):
    a, b = k.split('-')
    return side_key(f(a), f(b))


def main():
    it = json.load(open(f'{ROOT}/data/italy43/map.json'))
    sa = json.load(open(f'{ROOT}/data/salerno43/map.json'))
    hexes, hexsides, origin = {}, {}, {}
    for h, d in it['hexes'].items():
        hexes[from_italy(h)] = dict(d)
        origin[from_italy(h)] = 'italy43'
    clashes = []
    for h, d in sa['hexes'].items():
        g = from_salerno(h)
        if g in hexes:
            # Only two all-sea hexes overlap; both maps agree on them.
            if hexes[g]['terrain'] != d['terrain']:
                clashes.append((h, g))
            continue
        d = dict(d)
        # Salerno '43 has one kind of river; Italy '43 two. Its rivers stay minor until checked (see README).
        hexes[g] = d
        origin[g] = 'salerno43'
    for k, d in it['hexsides'].items():
        hexsides[remap_side(k, from_italy)] = dict(d)
    for k, d in sa['hexsides'].items():
        kk = remap_side(k, from_salerno)
        if kk in hexsides:
            continue
        hexsides[kk] = dict(d)
    # Entry areas: the two that face each other across the seam are gone; the rest keep their game as a prefix
    # until the Adriatic extension and the scenario decide which remain.
    entry = {}
    for name, ea in it['entryAreas'].items():
        if name in ('S1', 'S2'):
            continue
        entry[f'I{name}'] = {**ea, 'hexes': [from_italy(h) for h in ea['hexes']]}
    for name, ea in sa['entryAreas'].items():
        if name in ('N1', 'N2'):
            continue
        entry[f'S{name}'] = {**ea, 'hexes': [from_salerno(h) for h in ea['hexes']]}
    beaches = {name: {**b, 'hex': from_salerno(b['hex'])} for name, b in sa['beaches'].items()}
    labels = [[from_italy(h), t, s] for h, t, s in it['meta'].get('seaLabels', [])] + \
             [[from_salerno(h), t, s] for h, t, s in sa['meta'].get('seaLabels', []) if t != 'BAY OF NAPLES']
    out = {
        'meta': {
            'title': 'Grand campaign map data (Italy ’43 and Salerno ’43 joined)',
            'grid': 'flat-top hexes in vertical columns; even columns are offset half a hex down; id = CCRR',
            'evenColumnsDown': True,
            'source': 'The two transcribed maps joined by tools/grand/stitch.py; verify against your copies.',
            'home': from_salerno(sa['meta'].get('home', '2711')),
            'seaLabels': labels,
        },
        'hexes': dict(sorted(hexes.items())),
        'hexsides': dict(sorted(hexsides.items())),
        'entryAreas': entry,
        'beaches': beaches,
        'offmapLinks': [],
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(f'{OUT}/map.json', 'w'), indent=1, ensure_ascii=False)
    ids = {'italy43': {h: from_italy(h) for h in it['hexes']}, 'salerno43': {h: from_salerno(h) for h in sa['hexes']}, 'rowShift': ROW_SHIFT}
    json.dump(ids, open(f'{ROOT}/tools/grand/ids.json', 'w'), indent=0)
    print(f'{len(hexes)} hexes ({sum(1 for o in origin.values() if o == "italy43")} Italy, {sum(1 for o in origin.values() if o == "salerno43")} Salerno), '
          f'{len(hexsides)} hexsides, {len(entry)} entry areas, clashes {clashes}')


if __name__ == '__main__':
    main()
