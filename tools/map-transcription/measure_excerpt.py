"""Measure terrain, rivers, roads and mountain cover from a rulebook map excerpt and list
where data/salerno43/map.json disagrees.

Usage: python3 measure_excerpt.py NAME OUT.json
The excerpts are clean digital art, so plain colour classes work:
  sea (light blue), river (darker blue line), grey major road, tan minor road,
  dark mountain shading, hill (olive), clear (pale green).
Counters printed on the excerpt hide the art; hexes listed in HIDDEN[NAME] are skipped.
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from grid import grid_xy
from excerpts import fit
from review import neighbors, HX, SD

HIDDEN = {
    'p27': {'2707', '2905', '2909', '3012', '3112', '3213', '3014', '2817', '2816', '2418', '2619',
            '1605', '1606', '1705', '2607', '2608'},
    'p29': {'2709', '2710', '2810', '2811', '2711', '2712', '2813', '2713', '2909', '3109', '3012', '3013', '3113',
            '3213', '3313', '3114', '3014', '2614', '2615', '2714', '2715', '2815', '2716', '2616', '2617', '2717',
            '2816', '2817', '2915', '2916', '3015', '3016', '2418', '2619', '2621', '2521', '3021', '2919', '2920',
            '2921', '2922', '3121', '3122', '2620', '2720', '2820', '3022', '2513', '2514'},
}


# Brightness that separates dark mountain shading from hill colour (gap in the histogram).
DARK_T = {'p27': 118, 'p29': 128}


def classes(px, dark_t=118):
    px = px.astype(int)
    R, G, B = px[..., 0], px[..., 1], px[..., 2]
    mean = px.mean(-1)
    spread = px.max(-1) - px.min(-1)
    sea = (B > 215) & (B - R > 70)
    river = (B - R > 45) & (B < 205) & (R < 150) & ~sea
    grey = (spread < 20) & (mean > 80) & (mean < 145)
    tan = (R > 200) & (R - B > 50) & (G > 180)
    dark = (mean < dark_t) & (R - B > 15) & ~grey & ~river
    hill = (R - B > 28) & (mean >= dark_t) & (mean < 190) & ~tan
    clear = (mean >= 185) & (R - B < 40) & (G >= R - 5) & ~sea
    return dict(sea=sea, river=river, grey=grey, tan=tan, dark=dark, hill=hill, clear=clear)


def main(name, out):
    path, M = fit(name)
    a = np.asarray(Image.open(path).convert('RGB'))
    Hh, Ww = a.shape[:2]
    hide = HIDDEN.get(name, set())
    dt = DARK_T.get(name, 118)
    _classes = classes
    classes_ = lambda p: _classes(p, dt)

    def px(x, y, r=2):
        x, y = int(round(x)), int(round(y))
        if not (r <= x < Ww - r and r <= y < Hh - r):
            return None
        return a[y - r:y + r + 1, x - r:x + r + 1].reshape(-1, 3)

    def inside(h, margin=0.0):
        cs = M.corners(h)
        return all(margin <= x < Ww - margin and margin <= y < Hh - margin for x, y in cs)

    res = {'terrain': {}, 'sides': {}, 'roads': {}}
    # terrain: twelve patches on a ring 0.22 hex from the centre (avoids the town symbol and label)
    for h in HX:
        if h in hide or not inside(h):
            continue
        x, y = grid_xy(h)
        votes = {}
        for k in range(12):
            ang = math.radians(15 + 30 * k)
            p = px(*M.to_px(x + 0.22 * math.cos(ang), y + 0.22 * math.sin(ang)))
            if p is None:
                continue
            c = classes_(p)
            best = max(('sea', 'clear', 'hill', 'dark'), key=lambda kk: c[kk].sum())
            if c[best].sum() >= len(p) // 2:
                votes[best] = votes.get(best, 0) + 1
        res['terrain'][h] = votes
    # hexsides
    hl = 0.5 / math.sqrt(3)
    for h in HX:
        for n in neighbors(h):
            if n <= h or n not in HX or h in hide or n in hide:
                continue
            if not (inside(h) or inside(n)):
                continue
            (xa, ya), (xb, yb) = grid_xy(h), grid_xy(n)
            mx, my = (xa + xb) / 2, (ya + yb) / 2
            dx, dy = (xb - xa), (yb - ya)
            L = math.hypot(dx, dy)
            ux, uy = dx / L, dy / L          # across the side
            vx, vy = -uy, ux                 # along the side
            # river: blue within 0.14 hex of the side, at each of 15 positions along it
            riv = []
            dk = []
            for t in np.linspace(-0.8, 0.8, 15):
                hit = False
                cnt = 0
                for s in np.linspace(-0.14, 0.14, 8):
                    p = px(*M.to_px(mx + vx * hl * t + ux * s, my + vy * hl * t + uy * s), 1)
                    if p is None:
                        continue
                    cnt += 1
                    if classes_(p)['river'].sum() >= 3:
                        hit = True
                if cnt:
                    riv.append(hit)
                # mountain: dark on both sides of the printed line (±0.06 hex)
                fl = []
                for s in (-0.07, 0.07):
                    p = px(*M.to_px(mx + vx * hl * t + ux * s, my + vy * hl * t + uy * s), 2)
                    if p is None:
                        fl.append(None)
                        continue
                    c = classes_(p)
                    if c['sea'].sum() > 12:
                        fl.append(None)
                        continue
                    fl.append(c['dark'].sum() >= 10)
                if None not in fl:
                    dk.append(all(fl))
            # road: grey (major) or tan (minor) pixels where the road crosses the shared hexside;
            # longest run of positions along the side with road colour in a thin band across it
            grey = []
            tan = []
            for t in np.linspace(-0.9, 0.9, 37):
                g = tn = 0
                for s in np.linspace(-0.05, 0.05, 5):
                    p = px(*M.to_px(mx + vx * hl * t + ux * s, my + vy * hl * t + uy * s), 1)
                    if p is None:
                        continue
                    c = classes_(p)
                    g += c['grey'].sum() >= 5
                    tn += c['tan'].sum() >= 4
                grey.append(g >= 3)
                tan.append(tn >= 2)
            k = f'{h}-{n}'
            res['sides'][k] = {'river': round(sum(riv) / max(1, len(riv)), 2),
                               'mtn': round(sum(dk) / len(dk), 2) if dk else None, 'mtnN': len(dk)}
            res['roads'][k] = {'grey': int(sum(grey)), 'tan': int(sum(tan))}
    json.dump(res, open(out, 'w'))
    report(res)


def report(res):
    T = res['terrain']
    print('--- terrain disagreements (data vs excerpt votes)')
    for h, v in sorted(T.items()):
        if not v:
            continue
        best = max(v, key=v.get)
        d = HX[h]['terrain']
        exp = {'clear': 'clear', 'hill': 'hill', 'dark': 'hill', 'sea': 'sea'}[best]
        if d == 'marsh':
            continue
        if exp != d and v[best] >= 4:
            print(h, d, v)
    print('--- river disagreements')
    for k, s in sorted(res['sides'].items()):
        dr = bool(SD.get(k, {}).get('river'))
        a, b = k.split('-')
        if not dr and any(HX.get(x, {}).get('terrain', 'sea') == 'sea' for x in set(neighbors(a)) & set(neighbors(b)) | {a, b}):
            continue
        if dr and s['river'] < 0.4 or (not dr and s['river'] >= 0.7):
            print(k, 'data', dr, 'excerpt', s['river'])
    print('--- mountain disagreements')
    for k, s in sorted(res['sides'].items()):
        if s['mtn'] is None or s['mtnN'] < 6:
            continue
        dm = bool(SD.get(k, {}).get('mountain'))
        if dm and s['mtn'] < 0.75 or (not dm and s['mtn'] >= 0.95):
            print(k, 'data', dm, 'excerpt', s['mtn'], s['mtnN'], 'pass' if SD.get(k, {}).get('pass') else '')
    print('--- road disagreements')
    for k, s in sorted(res['roads'].items()):
        dr = SD.get(k, {}).get('road')
        a, b = k.split('-')
        if HX[a]['terrain'] == 'sea' or HX[b]['terrain'] == 'sea':
            if dr:
                print(k, 'data', dr, 'touches sea', s)
            continue
        g, t = s['grey'], s['tan']
        seen = 'major' if g >= 2 else ('minor' if t >= 2 else None)
        if seen != dr:
            print(k, 'data', dr, 'excerpt', seen, s)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
