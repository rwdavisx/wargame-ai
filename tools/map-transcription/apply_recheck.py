"""Apply the second check of the map photos (recheck.py) to data/map.json.

Usage: python3 apply_recheck.py RECHECK_JSON FIXES_TXT

FIXES_TXT lists corrections made by eye from zoomed photos, one per line:
  river+ A-B / river- A-B          add or remove a river hexside
  minor+ A-B / major+ A-B / road- A-B   add, upgrade or remove a road crossing
  terrain HEX TYPE                 set a hex's terrain (e.g. a coastal hex holding land)
  town HEX NAME / untown HEX       move a town symbol

Mountain hexsides follow the rulebook definitions:
- a hexside is a Mountain hexside only when the shading covers the whole of it (measured cover >= 0.85),
- every land side of a full Mountain hex (its land area entirely shaded) is a Mountain hexside,
- passes stay Mountain hexsides.
Hexsides whose measurement was borderline were judged by eye from zoomed photos (KEEP/DROP).
"""
import sys, json
sys.path.insert(0, '.')
from hexsides import neighbors

R = json.load(open(sys.argv[1]))
P = '../../data/map.json'
m = json.load(open(P))
HX, SD = m['hexes'], m['hexsides']
def key(a, b): return f'{a}-{b}' if a < b else f'{b}-{a}'
def land(h): return h in HX and HX[h]['terrain'] != 'sea'

# ---- terrain fixes ----
# Castellabate's hex and the Licosa point hex next to it hold land (and a town) but were read as sea.
HX['2219']['terrain'] = 'hill'
HX['2120']['terrain'] = 'hill'

# ---- mountain hexsides ----
KEEP = {'3407-3506', '3407-3507', '3411-3511', '3426-3526', '3711-3712', '4414-4514', '3418-3518', '3412-3511', '4414-4513'}
DROP = {'3410-3411', '3825-3924'}
FULL = {h for h, t in R['terrain'].items() if t.get('darkShare', 0) >= 0.95} | {'1704'}

before = {k for k, v in SD.items() if v.get('mountain')}
want = set()
for k, s in R['sides'].items():
    if s['pass'] or (s['data'] and s['cover'] >= 0.85) or k in KEEP:
        want.add(k)
want -= DROP
for h in FULL:
    for n in neighbors(h):
        if land(h) and land(n): want.add(key(h, n))
want |= {k for k, v in SD.items() if v.get('pass')}
# Sides that were not measured (off the photos' calibrated area) keep their old value.
want |= {k for k in before if k not in R['sides']}

for k in before - want:
    SD[k].pop('mountain', None)
for k in want - before:
    SD.setdefault(k, {})['mountain'] = True

# ---- rivers ----
# The Sorrento peninsula has no rivers; these two came from the coastline's colour.
for k in ['1803-1903', '1604-1704']:
    SD.get(k, {}).pop('river', None)

# ---- roads ----
for a, b in [('2219', '2319'), ('2219', '2220'), ('2220', '2221')]:
    SD.setdefault(key(a, b), {}).setdefault('road', 'minor')

# ---- corrections by eye ----
for line in open(sys.argv[2]):
    f = line.split('#')[0].split()
    if not f: continue
    op = f[0]
    if op in ('river+', 'river-', 'minor+', 'major+', 'road-'):
        a, b = f[1].split('-'); k = key(a, b)
        assert b in neighbors(a), k
        s = SD.setdefault(k, {})
        if op == 'river+': s['river'] = True
        elif op == 'river-': s.pop('river', None)
        elif op == 'road-': s.pop('road', None)
        elif op == 'major+': s['road'] = 'major'
        elif s.get('road') != 'major': s['road'] = 'minor'
    elif op == 'terrain': HX[f[1]]['terrain'] = f[2]
    elif op == 'town': HX[f[1]]['town'] = ' '.join(f[2:])
    elif op == 'untown': HX[f[1]].pop('town', None)
    else: raise SystemExit('unknown fix: ' + line)

m['hexsides'] = {k: v for k, v in sorted(SD.items()) if v}
json.dump(m, open(P, 'w'), indent=1, sort_keys=True)
print('mountain sides', len(before), '->', len(want), ' removed', len(before - want), ' added', len(want - before))
print('full mountain hexes', sorted(FULL))
