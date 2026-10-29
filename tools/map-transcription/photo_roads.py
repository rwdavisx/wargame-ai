"""Look for road crossings on every hexside in the map photos and list where data/map.json differs.

Usage: python3 photo_roads.py OUT.json
A minor road is drawn as a light core between two black dashed lines, so a crossing needs light
and near-black pixels side by side where the road cuts the hexside. The light rim along the edge
of hill shading has no black dashes, which is what the first transcription mistook for roads.
A major road is a solid grey band.
For each hexside the score is the longest run of positions along the side (37 samples) that show
the pattern inside a thin band across the side.
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from grid import grid_xy
from review import neighbors, HX, SD, get

os.chdir(os.path.dirname(os.path.abspath(__file__)))
from mappers import owner, PHOTOS


def longest(flags):
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def scan(key):
    path, M = get(key)
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    H, W = a.shape[:2]
    mean = a.mean(-1)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    spread = a.max(-1) - a.min(-1)
    light = (mean > 185) & (B - R < 20)
    black = (mean < 85) & (B - R < 15)
    grey = (spread < 28) & (mean > 70) & (mean < 145) & (B - R < 18)
    hl = 0.5 / math.sqrt(3)
    out = {}
    for h in HX:
        for n in neighbors(h):
            if n <= h or n not in HX:
                continue
            if key not in (owner(h), owner(n)):
                continue
            (xa, ya), (xb, yb) = grid_xy(h), grid_xy(n)
            mx, my = (xa + xb) / 2, (ya + yb) / 2
            dx, dy = xb - xa, yb - ya
            L = math.hypot(dx, dy)
            ux, uy = dx / L, dy / L
            vx, vy = -uy, ux
            mf, gf = [], []
            ok = True
            for t in np.linspace(-0.9, 0.9, 37):
                lt = bl = gr = 0
                for s in np.linspace(-0.07, 0.07, 7):
                    x, y = M.to_px(mx + vx * hl * t + ux * s, my + vy * hl * t + uy * s)
                    x, y = int(round(x)), int(round(y))
                    if not (2 <= x < W - 2 and 2 <= y < H - 2):
                        ok = False
                        break
                    win = (slice(y - 2, y + 3), slice(x - 2, x + 3))
                    lt += light[win].sum() >= 3
                    bl += black[win].sum() >= 2
                    gr += grey[win].sum() >= 12
                if not ok:
                    break
                mf.append(lt >= 2 and bl >= 2)
                gf.append(gr >= 3)
            if ok:
                out[f'{h}-{n}'] = {'minor': longest(mf), 'major': longest(gf)}
    return out


if __name__ == '__main__':
    res = {}
    for key in PHOTOS:
        r = scan(key)
        for k, v in r.items():
            res.setdefault(k, {})[key] = v
        print('scanned', key, len(r))
    json.dump(res, open(sys.argv[1], 'w'))
