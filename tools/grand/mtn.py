"""Mountain hexsides: a small logistic model on several measures of the ground at the edge, fitted to the printed
maps' mountain hexsides. Writes the model into calibration.json (key mountainModel)."""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from geo import Dem, hex_xy, plane_to_ll
from calibrate import OFFS, edge_stats
ROOT = __file__.rsplit('/tools/', 1)[0]

def nbrs(c, r):
    down = c % 2 == 0
    d = [(0, -1), (0, 1), (-1, 0 if down else -1), (-1, 1 if down else 0), (1, 0 if down else -1), (1, 1 if down else 0)]
    return [(c + dc, r + dr) for dc, dr in d]

def features(dem, cal, a, b):
    e = edge_stats(dem, a, b)
    ha, hb = cal[f'{a[0]:02d}{a[1]:02d}'], cal[f'{b[0]:02d}{b[1]:02d}']
    return [e['top'], min(ha['mean'], hb['mean']), max(ha['max'], hb['max']), ha['p90p10'] + hb['p90p10'], e['ridge'], e['drop'], min(ha['max'], hb['max'])]

def fit(X, y, steps=6000, lr=0.2, pos_weight=1.0):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Xn = (X - mu) / sd
    w = np.zeros(X.shape[1]); b = 0.0
    sw = np.where(y == 1, pos_weight, 1.0)
    for _ in range(steps):
        p = 1 / (1 + np.exp(-(Xn @ w + b)))
        g = (p - y) * sw
        w -= lr * Xn.T @ g / len(y); b -= lr * g.mean()
    return mu, sd, w, b

if __name__ == '__main__':
    dem = Dem(10)
    m = json.load(open(f'{ROOT}/data/grand43/parts/stitched.json'))
    cal = json.load(open('calibration.json'))
    land = {h for h, d in m['hexes'].items() if d['terrain'] in ('clear', 'hill')}
    X, y, seen = [], [], set()
    for h in land:
        c, r = int(h[:2]), int(h[2:])
        for n in nbrs(c, r):
            g = f'{n[0]:02d}{n[1]:02d}'
            if g not in land: continue
            k = tuple(sorted((h, g)))
            if k in seen: continue
            seen.add(k)
            X.append(features(dem, cal['hexes'], (c, r), n)); y.append(1 if m['hexsides'].get(f'{k[0]}-{k[1]}', {}).get('mountain') else 0)
    X, y = np.array(X), np.array(y)
    best = None
    for pw in (1.0, 1.5, 2.0, 3.0):
        mu, sd, w, b = fit(X, y, pos_weight=pw)
        p = 1 / (1 + np.exp(-(((X - mu) / sd) @ w + b)))
        for t in np.linspace(0.2, 0.8, 25):
            pred = p > t
            tp = (pred & (y == 1)).sum(); prec = tp / max(1, pred.sum()); rec = tp / max(1, y.sum())
            f1 = 2 * prec * rec / max(1e-9, prec + rec)
            if best is None or f1 > best[0]:
                best = (f1, prec, rec, (pred == y).mean(), pw, t, mu.tolist(), sd.tolist(), w.tolist(), b, int(pred.sum()))
    f1, prec, rec, acc, pw, t, mu, sd, w, b, npred = best
    print(f'mountain model: F1 {f1:.2f}, precision {prec:.0%}, recall {rec:.0%}, accuracy {acc:.1%}, predicts {npred} vs {y.sum()} printed')
    cal['report']['mountainModel'] = {'mu': mu, 'sd': sd, 'w': w, 'b': b, 'threshold': t, 'f1': f1, 'precision': prec, 'recall': rec,
                                      'features': ['top', 'minMean', 'maxMax', 'sumP90p10', 'ridge', 'drop', 'minMax']}
    json.dump(cal, open('calibration.json', 'w'))
