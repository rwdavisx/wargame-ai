"""Re-measure terrain from the photos using the rulebook definitions and compare with data/map.json.

- Hex terrain (clear or hill) is the terrain at the hex centre: six 7x7 patches 0.2 hex from the
  centre (clear of the town symbol) vote.
- A hexside is a mountain hexside only when the shading covers the whole land part of the side:
  the share of dark points along the side (between the corners) is reported.
Writes recheck.json next to the photos' working output.
"""
import sys, json, math
sys.path.insert(0, '.')
from mappers import *
from hexsides import neighbors
from PIL import Image

OUT = sys.argv[1]
m = json.load(open('../../data/map.json'))
HX, SD = m['hexes'], m['hexsides']
cache = {}
def photo(o):
    if o not in cache:
        p, M = mapper(o)
        cache[o] = (np.asarray(Image.open(p).convert('RGB')).astype(int), M)
    return cache[o]

def kind(px, o):
    R, G, B = px[..., 0], px[..., 1], px[..., 2]
    L = px.mean(-1); sat = R - B
    sea = ((B > R + 35) & (B > 140)) | ((B > R + 22) & (G > R + 12) & (L > 120))
    mth = 100 if o == '1' else 118
    ink = L < 55
    clear = (sat < 15) & (L > 130) & ~sea
    dark = (sat >= 15) & (L < mth) & ~ink & ~sea
    return sea, clear, dark, ink

terrain = {}
for h, v in HX.items():
    if v['terrain'] == 'sea': continue
    o = owner(h)
    if not o: continue
    a, M = photo(o)
    x, y = grid_xy(h)
    votes = {'clear': 0, 'hill': 0, 'sea': 0}
    for k in range(6):
        ang = math.radians(30 + 60 * k)
        px, py = M.to_px(x + 0.2 * math.cos(ang), y + 0.2 * math.sin(ang))
        px, py = int(px), int(py)
        if not (3 <= px < a.shape[1] - 3 and 3 <= py < a.shape[0] - 3): continue
        patch = a[py - 3:py + 4, px - 3:px + 4].reshape(-1, 3)
        sea, clear, dark, ink = kind(patch, o)
        n = len(patch) - ink.sum()
        if n < 10: continue
        if sea.sum() > n / 2: votes['sea'] += 1
        elif clear.sum() > n / 2: votes['clear'] += 1
        else: votes['hill'] += 1
    best = max(votes, key=votes.get)
    terrain[h] = {'data': v['terrain'], 'votes': votes, 'photo': best}

def side_pts(M, a_, b_):
    """Points along the side, each paired with points 7 px either side of the printed grid line."""
    (xa, ya), (xb, yb) = grid_xy(a_), grid_xy(b_)
    mx, my = (xa + xb) / 2, (ya + yb) / 2
    dx, dy = xb - xa, yb - ya; L = math.hypot(dx, dy)
    px, py = -dy / L, dx / L; hl = 0.5 / math.sqrt(3)
    out = []
    for t in np.linspace(-0.85, 0.85, 18):
        p = M.to_px(mx + px * hl * t, my + py * hl * t)
        q = M.to_px(mx + px * hl * t + dx / L * 0.05, my + py * hl * t + dy / L * 0.05)
        ux, uy = q[0] - p[0], q[1] - p[1]; ul = math.hypot(ux, uy)
        out.append([(p[0] + ux / ul * s, p[1] + uy / ul * s) for s in (-7, 7)])
    return out

sides = {}
LAND = {'clear', 'hill', 'marsh'}
for h, v in HX.items():
    if v['terrain'] not in LAND: continue
    for n in neighbors(h):
        if n <= h or HX.get(n, {}).get('terrain') not in LAND: continue
        best = None
        for o in dict.fromkeys(x for x in (owner(h), owner(n)) if x):
            a, M = photo(o)
            pts = side_pts(M, h, n)
            inside = all(20 <= px < a.shape[1] - 20 and 20 <= py < a.shape[0] - 20 for pair in pts for px, py in pair)
            dk = []; land = 0
            for pair in pts:
                flags = []
                for px, py in pair:
                    px, py = int(px), int(py)
                    if not (2 <= px < a.shape[1] - 2 and 2 <= py < a.shape[0] - 2): flags.append(None); continue
                    patch = a[py - 2:py + 3, px - 2:px + 3].reshape(-1, 3)
                    sea, clear, dark, ink = kind(patch, o)
                    if sea.sum() > 12 or (patch.mean(-1) > 200).sum() > 12: flags.append(None); continue
                    flags.append(dark.sum() + ink.sum() >= 13)
                if None in flags: continue
                land += 1
                dk.append(1 if all(flags) else 0)
            cand = (inside, land, dk)
            if best is None or (cand[0], cand[1]) > (best[0], best[1]): best = cand
        dk, land = best[2], best[1]
        k = f'{h}-{n}'
        sides[k] = {'data': bool(SD.get(k, {}).get('mountain')), 'pass': bool(SD.get(k, {}).get('pass')),
                    'cover': round(sum(dk) / max(1, len(dk)), 2), 'n': land}

# Share of each land hex's land area under mountain shading (a full Mountain hex is ringed by mountain hexsides).
from PIL import ImageDraw as _D
for h, v in HX.items():
    if v['terrain'] == 'sea': continue
    o = owner(h)
    if not o: continue
    a, M = photo(o)
    cs = M.corners(h)
    xs = [p[0] for p in cs]; ys = [p[1] for p in cs]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
    if x0 < 0 or y0 < 0 or x1 > a.shape[1] or y1 > a.shape[0]: continue
    cx, cy = M.center(h)
    shrink = [(cx + (x - cx) * 0.85 - x0, cy + (y - cy) * 0.85 - y0) for x, y in cs]
    mask = Image.new('L', (x1 - x0, y1 - y0), 0); _D.Draw(mask).polygon(shrink, fill=1)
    mk = np.asarray(mask).astype(bool)
    px = a[y0:y1, x0:x1][mk]
    sea, clear, dark, ink = kind(px, o)
    land = ~sea & ~ink
    terrain.setdefault(h, {})['darkShare'] = round(float(dark.sum()) / max(1, land.sum()), 2)
    terrain[h]['landShare'] = round(float(land.sum()) / len(px), 2)
json.dump({'terrain': terrain, 'sides': sides}, open(OUT, 'w'))
td = [h for h, t in terrain.items() if t['photo'] != t['data'] and not (t['data'] == 'marsh')]
print('terrain disagreements', len(td), 'of', len(terrain))
import collections
print(collections.Counter((terrain[h]['data'], terrain[h]['photo']) for h in td))
md = [k for k, s in sides.items() if s['data'] and not s['pass'] and s['cover'] < 0.9]
mm = [k for k, s in sides.items() if not s['data'] and s['cover'] >= 0.9]
print('mountain sides in data:', sum(s['data'] for s in sides.values()), ' with cover<0.9:', len(md), ' not in data but cover>=0.9:', len(mm))
print('cover histogram of data mountain sides', collections.Counter(round(s['cover'], 1) for s in sides.values() if s['data']))
