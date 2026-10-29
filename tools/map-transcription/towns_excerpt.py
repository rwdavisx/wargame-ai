"""Find town circles (light disc with a black ring) and red VP discs on a rulebook excerpt and
compare their hexes with data/map.json.

Usage: python3 towns_excerpt.py NAME
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from excerpts import fit
from road_trace import hex_of_pixels
from review import HX
from measure_excerpt import HIDDEN


def ring_score(dark, light, r_out, r_in):
    H, W = dark.shape
    score = np.zeros((H, W))
    angs = np.linspace(0, 2 * math.pi, 16, endpoint=False)
    for t in angs:
        dx, dy = int(round(r_out * math.cos(t))), int(round(r_out * math.sin(t)))
        score += np.roll(np.roll(dark, -dy, 0), -dx, 1)
    inner = np.zeros((H, W))
    pts = [(0, 0)] + [(int(round(r_in * math.cos(t))), int(round(r_in * math.sin(t)))) for t in angs[::2]]
    for dx, dy in pts:
        inner += np.roll(np.roll(light, -dy, 0), -dx, 1)
    return score / 16, inner / len(pts)


def peaks(mask_score, min_sep):
    ys, xs = np.nonzero(mask_score)
    vals = mask_score[ys, xs]
    order = np.argsort(-vals)
    out = []
    for i in order:
        x, y = xs[i], ys[i]
        if all((x - u) ** 2 + (y - v) ** 2 > min_sep ** 2 for u, v in out):
            out.append((x, y))
    return out


def main(name):
    path, M = fit(name)
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    H, W = a.shape[:2]
    k = math.dist(M.center('3010'), M.center('3011')) / 102.0
    mean = a.mean(-1)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    dark = mean < 90
    light = (mean > 185) & (R - B > 25) & (R - B < 80)
    ro, ri = 8.5 * k, 3.5 * k
    s, inn = ring_score(dark, light, ro, ri)
    town = np.where((s >= 0.8) & (inn >= 0.8), s + inn, 0)
    red = (R > 180) & (G < 80) & (B < 80)
    hid = hex_of_pixels(M, W, H)
    hide = HIDDEN.get(name, set())
    found = {}
    for x, y in peaks(town, 12 * k):
        h = f'{hid[y, x]:04d}'
        found.setdefault(h, []).append((int(x), int(y)))
    # red VP discs: big blobs of red
    vp = {}
    ys, xs = np.nonzero(red)
    if len(xs):
        hs = hid[ys, xs]
        for h, n in zip(*np.unique(hs, return_counts=True)):
            if n > 120 * k * k:
                vp[f'{h:04d}'] = int(n)
    inside = lambda h: all(5 <= x < W - 5 and 5 <= y < H - 5 for x, y in M.corners(h))
    print('--- town circles on the excerpt')
    for h in sorted(found):
        d = HX.get(h, {})
        tag = d.get('town') or d.get('city') or ('port' if d.get('port') else '')
        print(h, found[h], '->', tag or 'NO TOWN IN DATA', '(hidden)' if h in hide else '')
    print('--- data towns with no circle found')
    for h, d in sorted(HX.items()):
        if d.get('town') and h not in found and inside(h):
            print(h, d['town'], '(hidden by counter)' if h in hide else '')
    print('--- red VP discs (pixels) vs data vp')
    for h in sorted(set(vp) | {h for h, d in HX.items() if d.get('vp') and inside(h)}):
        print(h, vp.get(h, 0), 'data vp', HX.get(h, {}).get('vp'), '(hidden)' if h in hide else '')


if __name__ == '__main__':
    main(sys.argv[1])
