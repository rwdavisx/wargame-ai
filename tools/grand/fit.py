"""Fits each map's hex grid to the ground (a rotation, one scale and a shift, from the towns) and reports how the
Salerno '43 grid falls on the Italy '43 grid: the column and row offsets, and how well they agree."""
import json, math, sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from towns import SALERNO, ITALY

ROOT = __file__.rsplit('/tools/', 1)[0]

def xy(h, odd_down):
    c, r = int(h[:2]), int(h[2:])
    down = (c % 2 == 1) if odd_down else (c % 2 == 0)
    return 1.5 * c, -math.sqrt(3) * (r + (0.5 if down else 0))  # rows count southward

def km(ll):
    return ((ll[1] - 14.5) * 111.32 * math.cos(math.radians(41.0)), (ll[0] - 41.0) * 110.95)

def fit(game, towns, odd_down):
    hexes = json.load(open(f'{ROOT}/data/{game}/map.json'))['hexes']
    at = {(d.get('city') or d.get('town')): h for h, d in hexes.items() if d.get('city') or d.get('town')}
    P, Q, names = [], [], []
    for n, ll in towns.items():
        if n in at:
            P.append(xy(at[n], odd_down)); Q.append(km(ll)); names.append(n)
    P, Q = np.array(P), np.array(Q)
    # Similarity transform as complex numbers: q = a p + b.
    p = P[:, 0] + 1j * P[:, 1]; q = Q[:, 0] + 1j * Q[:, 1]
    A = np.vstack([p, np.ones_like(p)]).T
    (a, b), *_ = np.linalg.lstsq(A, q, rcond=None)
    res = np.abs(A @ np.array([a, b]) - q)
    worst = sorted(zip(res, names), reverse=True)[:5]
    return a, b, res, worst, len(names)

fits = {}
for game, towns, odd in [('salerno43', SALERNO, True), ('italy43', ITALY, False)]:
    a, b, res, worst, n = fit(game, towns, odd)
    fits[game] = (a, b, odd)
    print(f'{game}: {n} towns, km per hex {abs(a) * math.sqrt(3):.2f}, rotation {math.degrees(math.atan2(a.imag, a.real)):.1f} deg, '
          f'rms {math.sqrt((res ** 2).mean()):.2f} km; worst {[(round(float(r), 1), w) for r, w in worst]}')

# Salerno hexes in Italy grid coordinates (fractional column, row).
a1, b1, _ = fits['salerno43']; a2, b2, _ = fits['italy43']
offs = []
for h in json.load(open(f'{ROOT}/data/salerno43/map.json'))['hexes']:
    x, y = xy(h, True)
    g = ((a1 * (x + 1j * y) + b1) - b2) / a2
    c2 = g.real / 1.5
    c = int(h[:2]); r = int(h[2:])
    offs.append((c2 - c, -g.imag / math.sqrt(3) - r))
offs = np.array(offs)
print('Salerno -> Italy grid: column offset mean %.2f sd %.2f; y offset mean %.2f sd %.2f' % (offs[:, 0].mean(), offs[:, 0].std(), offs[:, 1].mean(), offs[:, 1].std()))

def to_italy_grid(ll):
    """Fractional Italy '43 (column, row) of a place."""
    e, n = km(ll)
    g = ((e + 1j * n) - b2) / a2
    c = g.real / 1.5
    y = -g.imag / math.sqrt(3)
    down = round(c) % 2 == 0
    return c, y - (0.5 if down else 0)

if __name__ == '__main__':
    for name, ll in {'Termoli': (42.000, 14.995), 'Ortona': (42.355, 14.403), 'Vasto': (42.112, 14.708), 'Lanciano': (42.230, 14.390),
                     'Foggia': (41.462, 15.545), 'Campobasso': (41.561, 14.656), 'Larino': (41.800, 14.910), 'Pescara': (42.462, 14.214),
                     'Castel di Sangro': (41.784, 14.108), 'Lucera': (41.508, 15.333), 'Manfredonia': (41.629, 15.912), 'San Severo': (41.689, 15.379),
                     'Bari': (41.117, 16.871), 'Potenza': (40.640, 15.806), 'Guardiagrele': (42.190, 14.221), 'Casoli': (42.115, 14.292)}.items():
        c, r = to_italy_grid(ll)
        print(f'{name:18s} col {c:5.1f} row {r:5.1f}')
