"""Trace roads on a rulebook map excerpt hex by hex and compare with data/salerno43/map.json.

Usage: python3 road_trace.py NAME OUT.json [MASK.png]
Road pixels: grey (major roads, opened to drop the thin hex grid lines) and tan (minor roads).
Every pixel is given to the hex whose centre is nearest. Where two touching road pixels lie in
different, adjacent hexes the road crosses that hexside; the crossing count is roughly the road
width. A road that only clips a hex corner gives few pixels inside that hex ('inHex').
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
from grid import grid_xy, SQ
from excerpts import fit
from review import neighbors, HX, SD
from measure_excerpt import classes, HIDDEN


def hex_of_pixels(M, W, H):
    A = M.A  # rows: x, y, 1 -> u, v
    L = A[:2, :]
    t = A[2, :]
    Li = np.linalg.inv(L)
    vv, uu = np.mgrid[0:H, 0:W]
    P = np.stack([uu - t[0], vv - t[1]], -1) @ Li  # grid coords
    gx, gy = P[..., 0], P[..., 1]
    best = np.full((H, W), 1e9)
    hid = np.zeros((H, W), dtype=np.int32)
    c0 = np.floor(gx / SQ).astype(int)
    for dc in (-1, 0, 1, 2):
        c = c0 + dc
        off = np.where(c % 2 == 1, 0.5, 0.0)
        r = np.round(gy - off)
        for dr in (-1, 0, 1):
            rr = r + dr
            d = (gx - c * SQ) ** 2 + (gy - rr - off) ** 2
            better = d < best
            best = np.where(better, d, best)
            hid = np.where(better, c * 100 + rr.astype(int), hid)
    return hid


def morph(mask, op, size):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    f = ImageFilter.MinFilter(size) if op == 'erode' else ImageFilter.MaxFilter(size)
    return np.asarray(im.filter(f)) > 127


def main(name, out, maskout=None):
    path, M = fit(name)
    a = np.asarray(Image.open(path).convert('RGB'))
    H, W = a.shape[:2]
    c = classes(a)
    grey = morph(morph(c['grey'], 'erode', 3), 'dilate', 3)
    # minor roads: tan core flanked by black dashes; the light rim along hill edges has no dashes
    black = a.astype(int).mean(-1) < 70
    near_black = morph(black, 'dilate', 9)
    tan = morph(morph(c['tan'] & near_black, 'dilate', 5), 'erode', 3) & morph(c['tan'], 'dilate', 3)
    hid = hex_of_pixels(M, W, H)
    hide = {int(h) for h in HIDDEN.get(name, set())}
    res = {}
    for kind, mask in (('major', grey), ('minor', tan)):
        inhex = {}
        ids, cnt = np.unique(hid[mask], return_counts=True)
        for i, n in zip(ids, cnt):
            inhex[int(i)] = int(n)
        pairs = {}
        for dy, dx in ((0, 1), (1, 0)):
            m1 = mask[:H - dy, :W - dx] & mask[dy:, dx:]
            h1 = hid[:H - dy, :W - dx][m1]
            h2 = hid[dy:, dx:][m1]
            diff = h1 != h2
            for p, q in zip(h1[diff], h2[diff]):
                k = (min(p, q), max(p, q))
                pairs[k] = pairs.get(k, 0) + 1
        for (p, q), n in pairs.items():
            hp, hq = f'{p:04d}', f'{q:04d}'
            if p in hide or q in hide or hq not in neighbors(hp):
                continue
            res.setdefault(f'{hp}-{hq}', {})[kind] = {'cross': n, 'inHex': [inhex.get(p, 0), inhex.get(q, 0)]}
    json.dump(res, open(out, 'w'), indent=0)
    if maskout:
        vis = a.copy() // 3 + 170
        vis[tan] = (255, 140, 0)
        vis[grey] = (200, 0, 0)
        Image.fromarray(vis.astype(np.uint8)).save(maskout)
    # compare
    inside = lambda h: all(0 <= x < W and 0 <= y < H for x, y in M.corners(h))
    print('--- roads seen on the excerpt but not in the data (cross count, pixels in each hex)')
    for k, v in sorted(res.items()):
        a_, b_ = k.split('-')
        if not (inside(a_) and inside(b_)):
            continue
        for kind, s in v.items():
            if s['cross'] >= 4 and SD.get(k, {}).get('road') != kind:
                print(k, kind, s, 'data:', SD.get(k, {}).get('road'))
    print('--- roads in the data not seen on the excerpt')
    for k, v in sorted(SD.items()):
        if 'road' not in v:
            continue
        a_, b_ = k.split('-')
        if not (inside(a_) and inside(b_)) or int(a_) in hide or int(b_) in hide:
            continue
        s = res.get(k, {}).get(v['road'])
        if not s or s['cross'] < 4:
            print(k, v['road'], 'excerpt:', res.get(k))


if __name__ == '__main__':
    main(*sys.argv[1:])
