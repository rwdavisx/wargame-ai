"""Learns how the two printed maps turn the ground into terrain, so the Adriatic extension is drawn the same way.

For every printed hex: elevation statistics from a lattice of points inside it (mean, relief, roughness). Then the
threshold on each statistic that best reproduces the designers' clear/hill split, and, for hexsides, the measure
that best picks out their mountain hexsides (how far the ground between two hexes rises above both). Writes
calibration.json; prints how well each rule matches the printed maps."""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from geo import Dem, hex_xy, plane_to_ll  # noqa: E402

ROOT = __file__.rsplit('/tools/', 1)[0]
OFFS = [(0, 0)] + [(rr * math.cos(t), rr * math.sin(t)) for rr in (0.35, 0.65, 0.9) for t in np.linspace(0, 2 * math.pi, 12, endpoint=False)]


def hex_stats(dem, c, r):
    x, y = hex_xy(c, r)
    z = np.array([dem.at(*plane_to_ll(x + dx, y + dy)) for dx, dy in OFFS])
    return {'mean': float(z.mean()), 'relief': float(z.max() - z.min()), 'sd': float(z.std()), 'p90p10': float(np.percentile(z, 90) - np.percentile(z, 10)),
            'max': float(z.max()), 'min': float(z.min())}


def edge_stats(dem, a, b):
    """How the ground between two hexes compares with them: the highest point along the line joining their
    centres, around the shared edge, minus the higher of the two hexes' typical (median) ground."""
    (ax, ay), (bx, by) = hex_xy(*a), hex_xy(*b)
    line = [dem.at(*plane_to_ll(ax + (bx - ax) * t, ay + (by - ay) * t)) for t in np.linspace(0.3, 0.7, 9)]
    # Also sideways along the edge itself, so a ridge crossing the edge obliquely is caught.
    mx, my = (ax + bx) / 2, (ay + by) / 2
    px, py = -(by - ay), (bx - ax)
    n = math.hypot(px, py)
    along = [dem.at(*plane_to_ll(mx + px / n * s, my + py / n * s)) for s in np.linspace(-0.45, 0.45, 7)]
    za = np.median([dem.at(*plane_to_ll(ax + dx * 0.6, ay + dy * 0.6)) for dx, dy in OFFS[:13]])
    zb = np.median([dem.at(*plane_to_ll(bx + dx * 0.6, by + dy * 0.6)) for dx, dy in OFFS[:13]])
    ridge = max(line) - max(za, zb)
    return {'ridge': float(ridge), 'crest': float(np.median(along) - max(za, zb)), 'drop': float(abs(za - zb)), 'top': float(max(line))}


def best_threshold(values, labels):
    """Threshold t on values (positive above t) with the best accuracy, and that accuracy."""
    order = np.argsort(values)
    v, l = np.array(values)[order], np.array(labels)[order]
    pos_total = l.sum()
    best = (0, -1)
    below_pos = 0
    for i in range(len(v)):
        below_pos += l[i]
        # threshold just above v[i]: everything up to i predicted negative
        correct = (i + 1 - below_pos) + (pos_total - below_pos)
        if correct > best[1]:
            best = ((v[i] + (v[i + 1] if i + 1 < len(v) else v[i])) / 2, correct)
    return best[0], best[1] / len(v)


def main():
    dem = Dem(10)
    m = json.load(open(f'{ROOT}/data/grand43/map.json'))
    land = {h: d for h, d in m['hexes'].items() if d['terrain'] in ('clear', 'hill')}
    hs = {}
    for i, (h, d) in enumerate(land.items()):
        hs[h] = hex_stats(dem, int(h[:2]), int(h[2:]))
    labels = [1 if land[h]['terrain'] == 'hill' else 0 for h in hs]
    report = {}
    for k in ('mean', 'relief', 'sd', 'p90p10', 'max'):
        t, acc = best_threshold([hs[h][k] for h in hs], labels)
        report[k] = {'threshold': t, 'accuracy': acc}
        print(f'hill if {k:7s} > {t:7.1f}: {acc:.1%} of {len(hs)} printed land hexes')
    # Two-feature rule: relief and mean, a small logistic regression.
    X = np.array([[hs[h]['relief'], hs[h]['mean'], hs[h]['sd']] for h in hs])
    y = np.array(labels)
    mu, sd = X.mean(0), X.std(0)
    Xn = (X - mu) / sd
    w = np.zeros(3); b0 = 0.0
    for _ in range(4000):
        p = 1 / (1 + np.exp(-(Xn @ w + b0)))
        g = p - y
        w -= 0.1 * Xn.T @ g / len(y); b0 -= 0.1 * g.mean()
    acc = ((1 / (1 + np.exp(-(Xn @ w + b0))) > 0.5) == y).mean()
    print(f'logistic (relief, mean, sd): {acc:.1%}')
    report['logistic'] = {'mu': mu.tolist(), 'sd': sd.tolist(), 'w': w.tolist(), 'b': b0, 'accuracy': float(acc)}

    # Mountain hexsides: every land-land hexside of the printed maps.
    def nbrs(c, r):
        down = c % 2 == 0
        d = [(0, -1), (0, 1), (-1, 0 if down else -1), (-1, 1 if down else 0), (1, 0 if down else -1), (1, 1 if down else 0)]
        return [(c + dc, r + dr) for dc, dr in d]
    es, el = [], []
    seen = set()
    for h in land:
        c, r = int(h[:2]), int(h[2:])
        for n in nbrs(c, r):
            g = f'{n[0]:02d}{n[1]:02d}'
            if g not in land:
                continue
            k = tuple(sorted((h, g)))
            if k in seen:
                continue
            seen.add(k)
            side = m['hexsides'].get(f'{k[0]}-{k[1]}', {})
            es.append(edge_stats(dem, (c, r), n))
            el.append(1 if side.get('mountain') else 0)
    print(f'{sum(el)} mountain hexsides of {len(el)} land hexsides')
    for k in ('ridge', 'crest', 'drop', 'top'):
        t, acc = best_threshold([e[k] for e in es], el)
        # Precision/recall at that threshold (mountain sides are rare, so accuracy alone flatters).
        pred = np.array([e[k] > t for e in es]); yl = np.array(el)
        tp = (pred & (yl == 1)).sum(); prec = tp / max(1, pred.sum()); rec = tp / max(1, yl.sum())
        report[f'side_{k}'] = {'threshold': t, 'accuracy': acc, 'precision': float(prec), 'recall': float(rec)}
        print(f'mountain if {k:6s} > {t:7.1f}: accuracy {acc:.1%}, precision {prec:.0%}, recall {rec:.0%}')
    json.dump({'hexes': hs, 'report': report}, open(f'{os.path.dirname(__file__)}/calibration.json', 'w'))


if __name__ == '__main__':
    main()
