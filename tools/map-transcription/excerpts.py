"""Map excerpts printed in the living rules (PDF), used as a second, sharper reference.

The rulebook's example diagrams are cut from the digital map art, so the grid is a plain
affine image of the hex grid (no paper curvature). Extract them with
    pdfimages -png -p -f 4 -l 31 SalernoRules-LR_Aug2022.pdf im
and point EXCERPT_DIR at the output folder.

EXCERPTS maps a short name to (file, {hexid: [px, py] of the printed hex number}).
fit(name) returns a Mapper-compatible object (center/corners/to_px) for the excerpt.
"""
import math, os
import numpy as np
from grid import grid_xy

EXCERPT_DIR = os.environ.get('EXCERPT_DIR', '/tmp/claude-0/-home-user-wargame-ai/8548fbb5-83de-52aa-88db-9501bd2b1675/scratchpad/pdfimg')

EXCERPTS = {
    # Page 27, "At start position of units": columns 19-38, rows 0-20.
    'p27': ('im-027-057.png', {
        '2605': (1138, 33), '2806': (1303, 137), '2706': (1215, 193), '3006': (1477, 139),
        '2807': (1301, 239), '2907': (1393, 292), '3008': (1480, 345),
        '2517': (1033, 1315), '2717': (1215, 1317), '2718': (1215, 1419), '2419': (947, 1468),
        '2620': (1125, 1571), '2319': (858, 1519),
        '3417': (1839, 1261), '3617': (2012, 1263), '3518': (1922, 1413), '3719': (2101, 1519), '3418': (1835, 1362),
    }),
    # Page 29, "The situation after all German units have moved": columns 21-38, rows 9-23.
    'p29': ('im-029-061.png', {
        '2709': (877, 26), '2810': (990, 87), '3010': (1218, 91), '2910': (1107, 154), '3011': (1220, 227),
        '2911': (1106, 289), '2812': (991, 353), '2912': (1106, 426),
        '3517': (1808, 1093), '3418': (1692, 1160), '3618': (1925, 1165), '3518': (1808, 1228), '3419': (1692, 1296),
        '3619': (1925, 1302), '3519': (1808, 1362), '3420': (1693, 1431), '3620': (1925, 1435), '3717': (2042, 1096),
        '3818': (2161, 1165), '3718': (2042, 1232),
        '2219': (290, 1302), '2119': (173, 1367), '2319': (407, 1367), '2220': (290, 1438), '2420': (523, 1438),
        '2320': (407, 1500), '2520': (640, 1498), '2221': (290, 1571), '2421': (523, 1571), '2321': (407, 1636),
        '2521': (640, 1632), '2222': (290, 1707), '2422': (523, 1704),
    }),
}


class Affine:
    def __init__(self, points):
        src = np.array([grid_xy(h, label=True) + (1.0,) for h in points])
        dst = np.array(list(points.values()), float)
        self.A, *_ = np.linalg.lstsq(src, dst, rcond=None)
        self.points = points

    def to_px(self, x, y):
        u, v = np.array([x, y, 1.0]) @ self.A
        return float(u), float(v)

    def center(self, h):
        return self.to_px(*grid_xy(h))

    def corners(self, h):
        x, y = grid_xy(h)
        w = 1 / math.sqrt(3)
        return [self.to_px(x + w * math.cos(math.radians(60 * k)), y + w * math.sin(math.radians(60 * k))) for k in range(6)]

    def residuals(self):
        out = []
        for h, (u, v) in self.points.items():
            pu, pv = self.to_px(*grid_xy(h, label=True))
            out.append((h, round(pu - u, 1), round(pv - v, 1)))
        return out


def fit(name):
    f, pts = EXCERPTS[name]
    return os.path.join(EXCERPT_DIR, f), Affine(pts)


if __name__ == '__main__':
    for n in EXCERPTS:
        p, M = fit(n)
        print(n, M.residuals())
