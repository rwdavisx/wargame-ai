"""Traces the printed coastline into the map data: a land mask for every coastal hex, and the all-sea hexsides.

For each photo of the printed map (calibrated by the map transcription), a colour model is learnt from the
middles of hexes that are all sea and all land in the data (each class clustered, so printed lettering on the
water counts as water and roads and labels on land count as land). Every hex where land meets sea is then sampled
on a lattice of 19 x 17 points, cleaned (a 3 x 3 majority vote; land that touches no land neighbour is dropped from
a sea hex, sea that touches no sea neighbour from a land hex) and stored as `coast` in data/<game>/map.json: on
every land hex that is not all land, and every sea hex that holds some land. A hexside between two land hexes with
water all along it is marked `allSea`. Check the sheet against the photos before writing: lettering printed on the
water (LETTERING) and coasts meeting at a hex corner on a photo seam (KEEP_OPEN) are set by hand.

Usage (the photos are not in the repository):
    python3 tools/map-art/coast_masks.py salerno43 [--write]
    python3 tools/map-art/coast_masks.py italy43 <folder with the six Italy photos> [--write]
Without --write it reports and draws a check sheet only.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'map-transcription'))
import grid  # noqa: E402

GAME = sys.argv[1]
WRITE = '--write' in sys.argv
EVEN = GAME == 'italy43'
STEP = 1 / 16
COLS = range(-9, 10)  # u = c * STEP across the hex (flat-topped: half-width 0.577)
ROWS = range(-8, 9)  # v = r * STEP down the hex (half-height 0.5)

if EVEN:
    def _gxy(h, label=False):
        c, r = int(h[:2]), int(h[2:])
        return c * grid.SQ, r + (0.5 if c % 2 == 0 else 0) - (0.37 if label else 0)
    grid.grid_xy = _gxy
gxy = grid.grid_xy

MAP_PATH = os.path.join(REPO, 'data', GAME, 'map.json')
M_ = json.load(open(MAP_PATH))
H = M_['hexes']
SIDES = M_['hexsides']


def nb(h):
    c, r = int(h[:2]), int(h[2:])
    down = (c % 2 == 0) if EVEN else (c % 2 == 1)
    d = [(0, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)] if down else [(0, -1), (1, -1), (1, 0), (0, 1), (-1, 0), (-1, -1)]
    return [f'{c + a:02d}{r + b:02d}' for a, b in d]


def is_sea(h):
    return h in H and H[h]['terrain'] == 'sea'


def inside_hex(u, v):
    """Is the hex-local point (u, v) (grid units, hex height 1) inside the flat-topped hex?"""
    return abs(v) <= 0.5 and abs(u) * math.sqrt(3) / 2 + abs(v) / 2 <= 0.5


# ------------------------------------------------------------------ photos and their colour models
photos = []
if GAME == 'salerno43':
    cwd = os.getcwd()
    os.chdir(os.path.join(REPO, 'tools', 'map-transcription'))
    import mappers  # noqa: E402
    for k in mappers.PHOTOS:
        path, M = mappers.mapper(k)
        photos.append((k, np.asarray(Image.open(path).convert('RGB')).astype(float), M))
    os.chdir(cwd)
else:
    folder = sys.argv[2]
    files = {'NW': 'map-nw-terracina.jpg', 'N': 'map-n-cassino.jpg', 'NE': 'map-ne-isernia.jpg', 'SW': 'map-sw-turntrack.jpg',
             'S': 'map-s-naples.jpg', 'SE': 'map-se-benevento.jpg'}
    for k, f in files.items():
        a = json.load(open(os.path.join(REPO, 'tools', 'italy-map', 'anchors', f'{k}.json')))
        photos.append((k, np.asarray(Image.open(os.path.join(folder, f)).convert('RGB')).astype(float), grid.Mapper(a, sigma=3)))


def reach(M, h):
    """Distance (hexes) from h to the nearest calibration anchor of a photo."""
    x, y = gxy(h)
    return min(math.hypot(sx - x, sy - y) for sx, sy in M.src)


def px(img, M, x, y):
    u, v = M.to_px(x, y)
    if not (1 <= u < img.shape[1] - 1 and 1 <= v < img.shape[0] - 1):
        return None
    return img[int(v), int(u)]


def kmeans(X, k, iters=20, seed=0):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), size=min(k, len(X)), replace=False)]
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None, :, :]) ** 2).sum(-1), axis=1)
        C = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(len(C))])
    return C


models = {}
for key, img, M in photos:
    samples = {True: [], False: []}
    for h, v in H.items():
        if v.get('covered') or reach(M, h) > 3:
            continue
        sea = v['terrain'] == 'sea'
        # Interior hexes only: every neighbour of the same kind (a sea position off the edge of the data is sea).
        if not all((is_sea(n) or (sea and n not in H)) if sea else (n in H and not is_sea(n)) for n in nb(h)):
            continue
        cx, cy = gxy(h)
        for du in np.linspace(-0.3, 0.3, 5):
            for dv in np.linspace(-0.3, 0.3, 5):
                p = px(img, M, cx + du, cy + dv)
                # The printed sea is blue or blue-grey: a reddish or very dark 'sea' sample is the map margin or the
                # table beyond the map, and would teach the model that pale ground is water.
                if p is not None and (not sea or (p[2] >= p[0] - 4 and p.sum() > 150)):
                    samples[sea].append(p)
    if len(samples[True]) < 30:
        # Too little open sea in this photo's calibrated part: add the middles of coastal sea hexes too.
        for h, v in H.items():
            if v['terrain'] != 'sea' or reach(M, h) > 3:
                continue
            cx, cy = gxy(h)
            for du in (-0.1, 0, 0.1):
                for dv in (-0.1, 0, 0.1):
                    p = px(img, M, cx + du, cy + dv)
                    if p is not None and p[2] >= p[0] + 10 and p.sum() > 150:
                        samples[True].append(p)
    if len(samples[True]) < 20 or len(samples[False]) < 20:
        print(f'photo {key}: too few samples for a colour model ({len(samples[True])} sea, {len(samples[False])} land)')
        continue
    sea_c = kmeans(np.array(samples[True]), 3)
    land_c = kmeans(np.array(samples[False]), 5)
    models[key] = (np.vstack([sea_c, land_c]), np.array([True] * len(sea_c) + [False] * len(land_c)))
    print(f'photo {key}: model from {len(samples[True])} sea and {len(samples[False])} land samples; sea colours {sea_c.astype(int).tolist()}')


def classify(key, p):
    C, is_sea_c = models[key]
    return bool(is_sea_c[int(np.argmin(((C - p) ** 2).sum(1)))])


def photos_for(h):
    """Photos with a colour model whose calibration reaches h, nearest first."""
    cands = sorted((reach(M, h), key, img, M) for key, img, M in photos if key in models)
    near = [c[1:] for c in cands if c[0] < 2.6]
    # A hex a little beyond every photo's anchors borrows the nearest calibration (checked by eye on the sheet).
    return near or [c[1:] for c in cands if c[0] < 4]


# ------------------------------------------------------------------ trace
# Pale lettering printed on the water that the colour model takes for land: (hex, u0, u1, v0, v1) boxes in grid units
# from that hex's middle, read as sea.
LETTERING = {'italy43': [('1606', -0.75, 0.8, 0.1, 0.62)]}.get(GAME, [])


def lettering(x, y):
    for h, u0, u1, v0, v1 in LETTERING:
        cx, cy = gxy(h)
        if u0 <= x - cx <= u1 and v0 <= y - cy <= v1:
            return True
    return False


def trace(h):
    cands = photos_for(h)
    if not cands:
        return None
    cx, cy = gxy(h)
    grid_ = np.full((len(ROWS), len(COLS)), -1, dtype=int)  # -1 outside the hex, 1 land, 0 sea
    for i, r in enumerate(ROWS):
        for j, c in enumerate(COLS):
            u, v = c * STEP, r * STEP
            if not inside_hex(u, v):
                continue
            # The nearest-calibrated photo that shows this point (a hex at a photo's edge borrows from the next).
            if lettering(cx + u, cy + v):
                grid_[i, j] = 0
                continue
            for key, img, M in cands:
                p = px(img, M, cx + u, cy + v)
                if p is not None:
                    grid_[i, j] = 0 if classify(key, p) else 1
                    break
            else:
                continue
    seen = (grid_ >= 0).sum()
    total = sum(1 for r in ROWS for c in COLS if inside_hex(c * STEP, r * STEP))
    if seen < 0.6 * total:
        return None
    # Points no modelled photo shows (past a photo's edge) take the hex's own terrain.
    for i, r in enumerate(ROWS):
        for j, c in enumerate(COLS):
            if grid_[i, j] < 0 and inside_hex(c * STEP, r * STEP):
                grid_[i, j] = 0 if is_sea(h) else 1
    # 3 x 3 majority vote inside the hex.
    out = grid_.copy()
    for i in range(len(ROWS)):
        for j in range(len(COLS)):
            if grid_[i, j] < 0:
                continue
            win = grid_[max(0, i - 1):i + 2, max(0, j - 1):j + 2]
            win = win[win >= 0]
            out[i, j] = 1 if win.mean() > 0.5 else 0
    return out, cands[0][0]


def side_of(u, v):
    """Which of the six sides (index into nb()) is nearest to the hex-local point (u, v)?"""
    # nb() order: N, NE, SE, S, SW, NW for flat-topped hexes; side normals at -90, -30, 30, 90, 150, 210 degrees.
    ang = math.degrees(math.atan2(v, u))
    normals = [-90, -30, 30, 90, 150, 210]
    return int(np.argmin([abs((ang - a + 180) % 360 - 180) for a in normals]))


def components(mask, val):
    """Connected components (4-neighbour) of cells equal to val."""
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for i in range(mask.shape[0]):
        for j in range(mask.shape[1]):
            if mask[i, j] != val or seen[i, j]:
                continue
            stack = [(i, j)]
            seen[i, j] = True
            cells = []
            while stack:
                a, b = stack.pop()
                cells.append((a, b))
                for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    x, y = a + da, b + db
                    if 0 <= x < mask.shape[0] and 0 <= y < mask.shape[1] and not seen[x, y] and mask[x, y] == val:
                        seen[x, y] = True
                        stack.append((x, y))
            comps.append(cells)
    return comps


def clean(h, mask):
    """Drop land that touches no land neighbour (lettering or symbols on the water), sea that touches no sea
    neighbour (pale ground or labels inland), and specks of either."""
    ns = nb(h)
    for val in (1, 0):
        for comp in components(mask, val):
            ok = False
            for a, b in comp:
                u, v = COLS[b] * STEP, ROWS[a] * STEP
                edge = abs(v) > 0.5 - 1.5 * STEP or abs(u) * math.sqrt(3) / 2 + abs(v) / 2 > 0.5 - 1.5 * STEP
                if not edge:
                    continue
                n = ns[side_of(u, v)]
                if val == 1 and (n in H and not is_sea(n)):
                    ok = True
                if val == 0 and (n not in H or is_sea(n)):
                    ok = True
            # A component reaching the middle of a hex of its own kind always stays.
            if any(abs(COLS[b]) <= 1 and abs(ROWS[a]) <= 1 for a, b in comp) and (val == 1) != is_sea(h):
                ok = True
            # A speck of a few cells (a printed symbol's rim, a fleck of colour) is not a coast.
            if len(comp) < 8 and not any(abs(COLS[b]) <= 1 and abs(ROWS[a]) <= 1 for a, b in comp):
                ok = False
            if not ok:
                for a, b in comp:
                    mask[a, b] = 1 - val
    return mask


def encode(mask):
    """Each row of the 19-cell lattice as five hex digits (land = 1, outside the hex = 0)."""
    out = ''
    for row in mask:
        bits = 0
        for j, v in enumerate(row):
            if v == 1:
                bits |= 1 << j
        out += f'{bits:05x}'
    return out


coastal = sorted(h for h, v in H.items() if not v.get('covered') and any((n in H) and is_sea(n) != is_sea(h) for n in nb(h)))
masks = {}
for h in coastal:
    t = trace(h)
    if not t:
        continue
    mask, key = t
    mask = clean(h, mask)
    inside = (mask >= 0).sum()
    land = (mask == 1).sum()
    masks[h] = (mask, land / inside, key)

# Hexsides between two land hexes with water all along them: all-sea (no movement, ZOC or supply across them).
# Land within two lattice steps of the side anywhere along it, its ends included, keeps the side open: where the
# printed coast runs through a hex corner the land hexes still meet there.
def corner(k):
    r = 1 / math.sqrt(3)
    return r * math.cos(math.radians(k)), r * math.sin(math.radians(k))


SIDE_ENDS = [(corner(n - 30), corner(n + 30)) for n in (-90, -30, 30, 90, 150, 210)]


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    t = max(0.0, min(1.0, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    return math.hypot(p[0] - ax - t * (bx - ax), p[1] - ay - t * (by - ay))


def land_near_side(h, n):
    """Is there land in h's mask within two lattice steps of the side h shares with n? None if h is untraced."""
    if h not in masks:
        return None
    mask = masks[h][0]
    a, b = SIDE_ENDS[nb(h).index(n)]
    return any(mask[i, j] == 1 and seg_dist((COLS[j] * STEP, ROWS[i] * STEP), a, b) <= 2 * STEP
               for i in range(mask.shape[0]) for j in range(mask.shape[1]))


# Sides checked by eye on the photos where the coast meets the hex corner (the trace there falls on a photo seam).
KEEP_OPEN = {'salerno43': {'2614-2615'}}.get(GAME, set())
all_sea = []
for h in masks:
    if is_sea(h):
        continue
    for n in nb(h):
        if n < h or n not in H or is_sea(n):
            continue
        k = f'{h}-{n}'
        if SIDES.get(k, {}).get('road') or k in KEEP_OPEN:
            continue
        near = [x for x in (land_near_side(h, n), land_near_side(n, h)) if x is not None]
        if near and not any(near):
            all_sea.append(k)

# A land hex keeps its mask unless it is all land; a sea hex only if it holds some land.
mixed = {h: m for h, m in masks.items() if (m[1] > 0.02 if is_sea(h) else m[1] < 0.98)}
print(f'{GAME}: traced {len(masks)} coastal hexes, {len(mixed)} with both land and sea; '
      f'land hexes under half land: {sorted(h for h, m in mixed.items() if not is_sea(h) and m[1] < 0.5)}; '
      f'sea hexes over a quarter land: {sorted(h for h, m in mixed.items() if is_sea(h) and m[1] > 0.25)}')
print('all-sea hexsides between land hexes:', all_sea)

# Check sheet: the masks drawn over a plain hex grid.
S = 26
xs = [gxy(h)[0] for h in masks]
ys = [gxy(h)[1] for h in masks]
W = int((max(xs) - min(xs) + 2) * S * 2)
Hh = int((max(ys) - min(ys) + 2) * S * 2)
sheet = Image.new('RGB', (W, Hh), (230, 230, 225))
d = ImageDraw.Draw(sheet)
ox, oy = min(xs) - 1, min(ys) - 1
for h, (mask, share, key) in masks.items():
    cx, cy = gxy(h)
    for a, r in enumerate(ROWS):
        for b, c in enumerate(COLS):
            if mask[a, b] < 0:
                continue
            x = (cx + c * STEP - ox) * S * 2
            y = (cy + r * STEP - oy) * S * 2
            d.rectangle([x - S * STEP, y - S * STEP, x + S * STEP, y + S * STEP], fill=(176, 150, 100) if mask[a, b] == 1 else (120, 170, 210))
    d.text(((cx - ox) * S * 2 - 12, (cy - oy) * S * 2 - 6), h, fill=(0, 0, 0) if not is_sea(h) else (20, 20, 120))
for k in all_sea:
    a, b = k.split('-')
    (x1, y1), (x2, y2) = gxy(a), gxy(b)
    d.line([((x1 + x2) / 2 - ox) * S * 2 - 4, ((y1 + y2) / 2 - oy) * S * 2, ((x1 + x2) / 2 - ox) * S * 2 + 4, ((y1 + y2) / 2 - oy) * S * 2], fill=(220, 0, 0), width=3)
out_sheet = os.environ.get('SHEET', f'/tmp/{GAME}-coast-masks.png')
sheet.save(out_sheet)
print('check sheet:', out_sheet)

if WRITE:
    for h, v in H.items():
        v.pop('coast', None)
    for h, (mask, share, key) in mixed.items():
        H[h]['coast'] = encode(mask)
    for k, v in SIDES.items():
        v.pop('allSea', None)
    for k in all_sea:
        SIDES.setdefault(k, {})['allSea'] = True
    for k in [k for k, v in SIDES.items() if not v]:
        del SIDES[k]
    sort = GAME == 'italy43'
    json.dump(M_, open(MAP_PATH, 'w'), indent=1, ensure_ascii=False, sort_keys=sort)
    open(MAP_PATH, 'a').write('\n')
    print('written', MAP_PATH)
