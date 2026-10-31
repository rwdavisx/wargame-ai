"""Builds data/italy43/map.json from the six photo transcriptions in source/.

Each photo of the map (NW, N, NE, SW, S, SE) was calibrated and read hex by hex into source/<KEY>.json. The photos
overlap, so many hexes and hexsides were read twice. This script takes, for each one, the most confident reading
(on a tie, the one from the photo whose middle is nearest), turns it into the engine's map format, and writes every
disagreement between photos to report.md for checking against the photos.

    python3 tools/italy-map/build_map.py
"""

import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / 'data' / 'italy43' / 'map.json'
REPORT = HERE / 'report.md'
PHOTOS = ['NW', 'N', 'NE', 'SW', 'S', 'SE']
RANK = {'high': 3, 'medium': 2, 'low': 1}


def cr(h):
    return int(h[:2]), int(h[2:])


def neighbours(h):
    """Italy '43's grid: even columns sit half a hex lower."""
    c, r = cr(h)
    down = c % 2 == 0
    d = [(0, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)] if down else [(0, -1), (1, -1), (1, 0), (0, 1), (-1, 0), (-1, -1)]
    return [f'{c + dc:02d}{r + dr:02d}' for dc, dr in d if 0 <= c + dc < 100 and 0 <= r + dr < 100]


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def load():
    out = {}
    for k in PHOTOS:
        p = HERE / 'source' / f'{k}.json'
        if p.exists():
            out[k] = json.loads(p.read_text())
    return out


def middle(t):
    hs = [cr(h) for h, v in t['hexes'].items() if v.get('terrain') != 'sea'] or [cr(h) for h in t['hexes']]
    return sum(c for c, _ in hs) / len(hs), sum(r for _, r in hs) / len(hs)


def pick(readings, key, mids):
    """The best of several photos' readings of one hex or hexside."""
    c, r = cr(key[:4])
    def score(kv):
        photo, v = kv
        mc, mr = mids[photo]
        return (-RANK.get(v.get('confidence'), 2), not v.get('covered', False) and 0 or 1, (c - mc) ** 2 + (r - mr) ** 2)
    return sorted(readings.items(), key=score)[0]


HEX_FIELDS = ('terrain', 'city', 'cityKind', 'town', 'landmark', 'vp', 'airfield', 'port', 'gustav', 'bernhard', 'zone8', 'peak', 'fullMountain')
SIDE_FIELDS = ('river', 'mountain', 'pass', 'road')


def norm_side(v):
    out = {}
    river = v.get('river')
    if v.get('lake') is True:
        river = 'lake'
    if river in ('minor', 'canal', True):
        out['river'] = True
    elif river in ('major', 'marsh'):
        out['river'] = True
        out['majorRiver'] = True
    elif river == 'lake':
        out['lake'] = True
    if v.get('riverName') and (out.get('river')):
        out['riverName'] = v['riverName']
    if v.get('mountain'):
        out['mountain'] = True
    if v.get('pass'):
        out['pass'] = True
    if v.get('road') in ('major', 'minor'):
        out['road'] = v['road']
    return out


def norm_hex(v):
    out = {'terrain': v.get('terrain') or 'sea'}
    if out['terrain'] == 'mountain' or v.get('fullMountain'):
        out['terrain'] = 'hill'
        out['fullMountain'] = True
    if v.get('city'):
        out['city'] = v['city']
        if v.get('cityKind') == 'major':
            out['majorCity'] = True
    for f in ('town', 'landmark', 'vp', 'airfield', 'peak', 'gustav', 'bernhard', 'zone8'):
        if v.get(f):
            out[f] = v[f]
    if v.get('port'):
        out['harbour'] = True  # no effect on play (TEC); drawn only
    if v.get('label') and not (v.get('city') or v.get('town') or v.get('landmark')):
        out['label'] = v['label']
    if v.get('garrison'):
        out['garrison'] = v['garrison']
    return out


def main():
    src = load()
    fixes = json.loads((HERE / 'source' / 'fixes.json').read_text()) if (HERE / 'source' / 'fixes.json').exists() else {}
    mids = {k: middle(t) for k, t in src.items()}
    hex_reads, side_reads = {}, {}
    for k, t in src.items():
        for h, v in t['hexes'].items():
            if v.get('terrain') is None and v.get('covered'):
                continue
            hex_reads.setdefault(h, {})[k] = v
        for s, v in t['hexsides'].items():
            side_reads.setdefault(s, {})[k] = v
        # Hexsides at the edge of a photo, touching a hex it does not show: a weaker reading.
        for s, v in (t.get('edgeHexsides') or {}).items():
            if k not in side_reads.get(s, {}):
                weaker = {'high': 'medium', 'medium': 'low'}.get(v.get('confidence'), 'low')
                side_reads.setdefault(s, {})[k] = {**v, 'confidence': weaker}

    report = ['# Italy \'43 map: where the photos disagree', '']
    hexes = {}
    for h in sorted(hex_reads):
        reads = hex_reads[h]
        photo, best = pick(reads, h, mids)
        if h in fixes.get('hexes', {}):
            best = {**best, **{k: v for k, v in fixes['hexes'][h].items() if k != 'why'}}
        hexes[h] = norm_hex(best)
        if len(reads) > 1:
            normed = {k: norm_hex(v) for k, v in reads.items()}
            if len({json.dumps(n, sort_keys=True) for n in normed.values()}) > 1:
                report.append(f'- hex {h}: took {photo}; ' + '; '.join(f'{k} {json.dumps(n, ensure_ascii=False)}' for k, n in normed.items()))

    hexsides = {}
    for s in sorted(side_reads):
        reads = side_reads[s]
        photo, best = pick(reads, s, mids)
        if s in fixes.get('hexsides', {}):
            best = {**best, **{k: v for k, v in fixes['hexsides'][s].items() if k != 'why'}}
        n = norm_side(best)
        if len(reads) > 1:
            normed = {k: norm_side(v) for k, v in reads.items()}
            if len({json.dumps(x, sort_keys=True) for x in normed.values()}) > 1:
                report.append(f'- side {s}: took {photo}; ' + '; '.join(f'{k} {json.dumps(x)}' for k, x in normed.items()))
        if n:
            hexsides[s] = n

    # A full Mountain hex is a Hill hex with six Mountain hexsides (2.2.2).
    for h, v in hexes.items():
        if v.get('fullMountain'):
            for n in neighbours(h):
                if n in hexes and hexes[n]['terrain'] != 'sea':
                    hexsides.setdefault(side_key(h, n), {})['mountain'] = True
    # A Major Road joins the three Naples hexes; the city drawing hides it (5.2.3).
    naples = [h for h, v in hexes.items() if v.get('city') == 'Naples']
    for a in naples:
        for b in naples:
            if a < b and b in neighbours(a):
                hexsides.setdefault(side_key(a, b), {})['road'] = 'major'

    # Entry areas: the map-edge hexes each one touches. The photos describe them in slightly different shapes.
    entry = {}
    for k, t in src.items():
        for name, ea in (t.get('entryAreas') or {}).items():
            if not re.fullmatch(r'[NSE]\d', name):
                continue  # a tab seen at a photo's edge and read properly in the next photo
            hs = set()
            if isinstance(ea, list):
                hs = {x.split()[0] for x in ea}
            elif isinstance(ea, dict):
                for key in ('hexes', 'touches', 'touchesHexes', 'touchesMapHexes', 'mapEdgeHexes'):
                    if ea.get(key):
                        hs |= set(ea[key])
                for tab in ea.get('tabs') or []:
                    hs |= set(tab.get('touches') or {})
                hs |= {x for x in ea if re.fullmatch(r'\d{4}', x)}
            side = {'N': 'north', 'S': 'south', 'E': 'east'}[name[0]]
            cur = entry.setdefault(name, {'hexes': [], 'side': side})
            cur['hexes'] = sorted(set(cur['hexes']) | {h for h in hs if h in hexes and hexes[h]['terrain'] != 'sea'})

    land = sum(1 for v in hexes.values() if v['terrain'] != 'sea')
    meta = {
        'title': 'Italy ’43 map data',
        'grid': 'flat-top hexes in vertical columns; even columns are offset half a hex down; id = CCRR',
        'evenColumnsDown': True,
        'source': 'Transcribed from photos of the owner’s physical map (tools/italy-map); verify against your copy.',
    }
    data = {'meta': meta, 'hexes': hexes, 'hexsides': hexsides, 'entryAreas': entry, 'offmapLinks': [], 'beaches': {}}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False, sort_keys=True) + '\n')
    report[1:1] = [f'{len(hexes)} hexes ({land} land), {len(hexsides)} hexsides with a feature, photos: {", ".join(src)}.', '']
    REPORT.write_text('\n'.join(report) + '\n')
    print(f'{OUT}: {len(hexes)} hexes ({land} land), {len(hexsides)} hexsides; {len(report) - 4} disagreements in {REPORT.name}')


if __name__ == '__main__':
    main()
