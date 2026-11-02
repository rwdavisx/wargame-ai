"""The grand map's grid on the ground, and elevation from the public Terrarium tiles (AWS open data, Mapzen/Tilezen:
SRTM and other sources, sea depths below 0).

grid: the Italy '43 fit from fit.py (Salerno's agrees to within a fraction of a hex), with the grand map's row shift.
Tiles are cached outside the repository (CACHE)."""
import io
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import fit as _fit  # noqa: E402  (fitting runs on import and prints; harmless)
from stitch import ROW_SHIFT  # noqa: E402

CACHE = os.environ.get('DEM_CACHE', '/tmp/claude-0/-home-user-wargame-ai/8548fbb5-83de-52aa-88db-9501bd2b1675/scratchpad/dem')
A, B = _fit.a2, _fit.b2
SQ3 = math.sqrt(3)


def hex_xy(c, r):
    """The grand map's hex (c, r) in the Italy fit's plane (grand rows are Italy rows + ROW_SHIFT; even columns down)."""
    ri = r - ROW_SHIFT
    return 1.5 * c, -SQ3 * (ri + (0.5 if c % 2 == 0 else 0))


def plane_to_ll(x, y):
    q = A * (x + 1j * y) + B
    e, n = q.real, q.imag
    lat = 41.0 + n / 110.95
    lon = 14.5 + e / (111.32 * math.cos(math.radians(41.0)))
    return lat, lon


def hex_ll(c, r):
    return plane_to_ll(*hex_xy(c, r))


def ll_to_plane(lat, lon):
    e = (lon - 14.5) * 111.32 * math.cos(math.radians(41.0))
    n = (lat - 41.0) * 110.95
    p = ((e + 1j * n) - B) / A
    return p.real, p.imag


def ll_to_hex(lat, lon):
    """Nearest grand-map hex id to a place."""
    x, y = ll_to_plane(lat, lon)
    c0 = round(x / 1.5)
    best = None
    for c in (c0 - 1, c0, c0 + 1):
        ri = -y / SQ3 - (0.5 if c % 2 == 0 else 0)
        for r in (math.floor(ri) + ROW_SHIFT, math.floor(ri) + 1 + ROW_SHIFT):
            hx, hy = hex_xy(c, r)
            d = (hx - x) ** 2 + (hy - y) ** 2
            if best is None or d < best[0]:
                best = (d, c, r)
    return f'{best[1]:02d}{best[2]:02d}'


# ------------------------------------------------------------------ elevation

def _tile(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    path = f'{CACHE}/{z}_{x}_{y}.png'
    if not os.path.exists(path):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(url, timeout=60).read()
                open(path, 'wb').write(data)
                break
            except Exception as e:  # network hiccup: retry
                if attempt == 3:
                    raise
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    return im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768


class Dem:
    """Elevation (m) at any point, from tiles at zoom z (z 10 is about 120 m a pixel here, z 12 about 30 m)."""

    def __init__(self, z=10):
        self.z = z
        self.tiles = {}

    def px(self, lat, lon):
        n = 2 ** self.z
        x = (lon + 180) / 360 * n * 256
        y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n * 256
        return x, y

    def at_px(self, x, y):
        tx, ty = int(x // 256), int(y // 256)
        key = (tx, ty)
        if key not in self.tiles:
            self.tiles[key] = _tile(self.z, tx, ty)
        t = self.tiles[key]
        return t[int(y) % 256, int(x) % 256]

    def at(self, lat, lon):
        return self.at_px(*self.px(lat, lon))


if __name__ == '__main__':
    d = Dem(10)
    for name, ll in {'Naples (sea level)': (40.85, 14.27), 'Monte Cassino 516m': (41.490, 13.814), 'Maiella (Monte Amaro 2793m)': (42.086, 14.085),
                     'Termoli': (42.000, 14.995), 'Adriatic offshore': (42.2, 15.2)}.items():
        print(f'{name:30s} {d.at(*ll):7.0f} m  hex {ll_to_hex(*ll)}')
