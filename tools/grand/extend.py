"""Draws the grand map's Adriatic extension from elevation data, calibrated on the two printed maps.

  terrain       land or sea from the ground's height (sea and lagoons at or below 0 m); hill where the spread of
                heights inside the hex (90th less 10th percentile) is over the threshold that reproduces 92% of the
                printed maps' clear/hill choices (calibrate.py)
  mountain      a hexside is a mountain hexside where mtn.py's model, fitted to the printed maps' mountain hexsides,
                says so, at the threshold that gives the printed maps' own density of them
  rivers        traced from the ground: water runs downhill (pits filled first), and a stream becomes a river once
                its catchment passes MINOR_KM2 (a major river at MAJOR_KM2). Its course is snapped onto the hex
                edges nearest it, so rivers run along hexsides as on the printed maps
Towns, roads and the historical marks come from extend_places.py. Writes data/grand43/extension.json, merged into
the map by merge.py."""
import heapq
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from geo import Dem, SQ3, hex_xy, ll_to_plane, plane_to_ll  # noqa: E402
from calibrate import OFFS, hex_stats  # noqa: E402
import mtn  # noqa: E402

ROOT = __file__.rsplit('/tools/', 1)[0]
HERE = os.path.dirname(__file__)
# The area added: the Adriatic front and its hinterland, north of the Italy '43 map's east half and east of both maps.
COLS = range(30, 67)
ROWS = range(0, 51)
SEA_MARGIN = 3          # sea hexes kept off the new coast
MINOR_KM2 = 90.0        # catchment at which a stream is a river on the map (the Moro, a small river, drains ~80 km2)
MAJOR_KM2 = 900.0       # and a major river (Sangro, Trigno, Biferno, Fortore)


def hid(c, r):
    return f'{c:02d}{r:02d}'


def plane_to_hex(x, y):
    c0 = round(x / 1.5)
    best = None
    for c in (c0 - 1, c0, c0 + 1):
        for r in range(int(-y / SQ3) + 14 - 2, int(-y / SQ3) + 14 + 3):
            hx, hy = hex_xy(c, r)
            d = (hx - x) ** 2 + (hy - y) ** 2
            if best is None or d < best[0]:
                best = (d, c, r)
    return best[1], best[2]


def nbrs(c, r):
    return mtn.nbrs(c, r)


# ------------------------------------------------------------------ the ground as a raster, for the rivers

def raster(dem, lat0, lat1, lon0, lon1):
    x0, y0 = dem.px(lat1, lon0)
    x1, y1 = dem.px(lat0, lon1)
    xs = np.arange(int(x0), int(x1))
    ys = np.arange(int(y0), int(y1))
    z = np.zeros((len(ys), len(xs)))
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            z[j, i] = dem.at_px(x + 0.5, y + 0.5)
    return z, xs, ys


def px_to_ll(dem, x, y):
    n = 2 ** dem.z * 256
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def flow(z):
    """Priority-flood pit filling, D8 directions and accumulated cell counts. Sea (<= 0) drains off."""
    H, W = z.shape
    filled = z.copy()
    done = np.zeros_like(z, dtype=bool)
    pq = []
    for j in range(H):
        for i in range(W):
            if j in (0, H - 1) or i in (0, W - 1) or z[j, i] <= 0:
                heapq.heappush(pq, (z[j, i], j, i))
                done[j, i] = True
    order = []
    while pq:
        e, j, i = heapq.heappop(pq)
        order.append((j, i))
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if not dj and not di:
                    continue
                jj, ii = j + dj, i + di
                if 0 <= jj < H and 0 <= ii < W and not done[jj, ii]:
                    done[jj, ii] = True
                    filled[jj, ii] = max(filled[jj, ii], e + 1e-3)
                    heapq.heappush(pq, (filled[jj, ii], jj, ii))
    # Each cell drains to the neighbour it was reached from in the flood: the steepest way down the filled surface.
    down = np.full((H, W, 2), -1, dtype=np.int32)
    for j, i in order:
        best = None
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if not dj and not di:
                    continue
                jj, ii = j + dj, i + di
                if 0 <= jj < H and 0 <= ii < W and filled[jj, ii] < filled[j, i]:
                    s = (filled[j, i] - filled[jj, ii]) / math.hypot(dj, di)
                    if best is None or s > best[0]:
                        best = (s, jj, ii)
        if best:
            down[j, i] = (best[1], best[2])
    acc = np.ones((H, W))
    for j, i in reversed(order):
        jj, ii = down[j, i]
        if jj >= 0:
            acc[jj, ii] += acc[j, i]
    return filled, down, acc


# ------------------------------------------------------------------ hex-edge graph

def vkey(x, y):
    return (round(2 * x), round(2 * y / SQ3))


def vertices_of(c, r):
    x, y = hex_xy(c, r)
    return [vkey(x + math.cos(math.radians(60 * k)), y + math.sin(math.radians(60 * k))) for k in range(6)]


def vpos(k):
    return k[0] / 2, k[1] * SQ3 / 2


def edge_hexes(v1, v2):
    (x1, y1), (x2, y2) = vpos(v1), vpos(v2)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    px, py = -(y2 - y1), (x2 - x1)
    n = math.hypot(px, py)
    a = plane_to_hex(mx + px / n * SQ3 / 2, my + py / n * SQ3 / 2)
    b = plane_to_hex(mx - px / n * SQ3 / 2, my - py / n * SQ3 / 2)
    return hid(*a), hid(*b)


def side_key(a, b):
    return f'{a}-{b}' if a < b else f'{b}-{a}'


def main():
    dem = Dem(10)
    cal = json.load(open(f'{HERE}/calibration.json'))
    rep = cal['report']
    grand = json.load(open(f'{ROOT}/data/grand43/map.json'))
    old = set(grand['hexes'])
    hill_t = rep['p90p10']['threshold']

    # 1. Hexes: land or sea, clear or hill.
    stats, land, sea = {}, set(), set()
    for c in COLS:
        for r in ROWS:
            h = hid(c, r)
            if h in old:
                continue
            x, y = hex_xy(c, r)
            zs = [dem.at(*plane_to_ll(x + dx, y + dy)) for dx, dy in OFFS]
            wet = sum(1 for z in zs if z <= 0.5) / len(zs)
            if wet > 0.6:
                sea.add(h)
            else:
                land.add(h)
                stats[h] = hex_stats(dem, c, r)
    # Keep only the sea within SEA_MARGIN of the new land (or of the old map's coast).
    keep = set()
    frontier = {h for h in sea if any(hid(*n) in land for n in nbrs(int(h[:2]), int(h[2:])))}
    keep |= frontier
    for _ in range(SEA_MARGIN - 1):
        frontier = {hid(*n) for h in frontier for n in nbrs(int(h[:2]), int(h[2:])) if hid(*n) in sea} - keep
        keep |= frontier
    hexes = {}
    for h in land:
        hexes[h] = {'terrain': 'hill' if stats[h]['p90p10'] > hill_t else 'clear'}
    for h in keep:
        hexes[h] = {'terrain': 'sea'}
    print(f'{len(land)} new land hexes ({sum(1 for h in land if hexes[h]["terrain"] == "hill")} hill), {len(keep)} sea')

    # 2. Mountain hexsides inside the new land, and along its join with the old maps.
    allland = {h for h, d in grand['hexes'].items() if d['terrain'] in ('clear', 'hill')} | land
    for h, d in grand['hexes'].items():
        if h in allland:
            stats.setdefault(h, cal['hexes'].get(h))
    mm = rep['mountainModel']
    sides = {}
    seen = set()
    for h in land:
        c, r = int(h[:2]), int(h[2:])
        for n in nbrs(c, r):
            g = hid(*n)
            if g not in allland or not stats.get(g):
                continue
            k = side_key(h, g)
            if k in seen:
                continue
            seen.add(k)
            f = np.array(mtn.features(dem, stats, (c, r), n))
            p = 1 / (1 + math.exp(-(((f - np.array(mm['mu'])) / np.array(mm['sd'])) @ np.array(mm['w']) + mm['b'])))
            if p >= mm['countThreshold']:
                sides[k] = {'mountain': True}
    print(f'{len(sides)} mountain hexsides')

    # 3. Rivers from the ground, over the new area and a margin.
    lats, lons = [], []
    for h in land:
        la, lo = plane_to_ll(*hex_xy(int(h[:2]), int(h[2:])))
        lats.append(la); lons.append(lo)
    lat0, lat1, lon0, lon1 = min(lats) - 0.25, max(lats) + 0.25, min(lons) - 0.3, max(lons) + 0.2
    z, xs, ys = raster(dem, lat0, lat1, lon0, lon1)
    print('raster', z.shape)
    filled, down, acc = flow(z)
    cell_km2 = (40075 * math.cos(math.radians((lat0 + lat1) / 2)) / (2 ** dem.z * 256)) ** 2
    km2 = acc * cell_km2
    # Walk each river from where its catchment first passes MINOR_KM2 down to the sea, snapping to hex vertices.
    H, W = z.shape
    river_edges = {}
    starts = [(j, i) for j in range(H) for i in range(W) if km2[j, i] >= MINOR_KM2 and z[j, i] > 0 and
              not any(0 <= j + dj < H and 0 <= i + di < W and (down[j + dj, i + di] == (j, i)).all() and km2[j + dj, i + di] >= MINOR_KM2
                      for dj in (-1, 0, 1) for di in (-1, 0, 1) if dj or di)]
    for j, i in starts:
        path = []
        while j >= 0 and z[j, i] > 0:
            path.append((j, i))
            jj, ii = down[j, i]
            if jj < 0:
                break
            j, i = int(jj), int(ii)
        prev = None
        for (pj, pi) in path:
            la, lo = px_to_ll(dem, xs[pi] + 0.5, ys[pj] + 0.5)
            x, y = ll_to_plane(la, lo)
            v = vkey(round(x / 0.5) * 0.5, round(y / (SQ3 / 2)) * (SQ3 / 2))
            # nearest true vertex: search the vertices of the hex the point is in
            c, r = plane_to_hex(x, y)
            v = min(vertices_of(c, r), key=lambda k: (vpos(k)[0] - x) ** 2 + (vpos(k)[1] - y) ** 2)
            if prev and v != prev:
                # step along the shared edge(s): the two vertices are adjacent, or two edges apart around one hex
                for a, b in vertex_steps(prev, v):
                    e = edge_hexes(a, b)
                    k = side_key(*e)
                    major = km2[pj, pi] >= MAJOR_KM2
                    river_edges[k] = river_edges.get(k, False) or major
            prev = v
    n_new = 0
    for k, major in river_edges.items():
        parts = k.split('-')
        if len(parts) != 2 or not all(len(x) == 4 and x.isdigit() for x in parts):
            continue  # off the grid's edge
        a, b = parts
        # Only where the extension is: hexsides with at least one new hex; the printed maps keep their own rivers.
        if a not in hexes and b not in hexes:
            continue
        if hexes.get(a, grand['hexes'].get(a, {})).get('terrain') == 'sea' or hexes.get(b, grand['hexes'].get(b, {})).get('terrain') == 'sea':
            continue
        s = sides.setdefault(k, {})
        s['river'] = True
        if major:
            s['majorRiver'] = True
        n_new += 1
    print(f'{n_new} river hexsides ({sum(1 for k, v in sides.items() if v.get("majorRiver"))} major)')
    json.dump({'hexes': dict(sorted(hexes.items())), 'hexsides': dict(sorted(sides.items())),
               'note': 'Generated by tools/grand/extend.py from elevation data, calibrated on the printed maps.'},
              open(f'{ROOT}/data/grand43/extension.json', 'w'), indent=1)


def vertex_steps(a, b):
    """The hex edges from vertex a to vertex b: one if they are adjacent, else a short path around the hexes between."""
    (ax, ay), (bx, by) = vpos(a), vpos(b)
    if abs(math.hypot(ax - bx, ay - by) - 1) < 1e-6:
        return [(a, b)]
    # Breadth-first over the vertex lattice (each vertex has three neighbours at distance 1).
    from collections import deque
    def vn(v):
        x, y = vpos(v)
        out = []
        for k in range(6):
            nx, ny = x + math.cos(math.radians(60 * k)), y + math.sin(math.radians(60 * k))
            w = vkey(nx, ny)
            px, py = vpos(w)
            if abs(px - nx) < 1e-6 and abs(py - ny) < 1e-6 and is_vertex(w):
                out.append(w)
        return out
    q = deque([a]); prev = {a: None}
    while q:
        v = q.popleft()
        if v == b:
            break
        if len(prev) > 400:
            return []
        for w in vn(v):
            if w not in prev:
                prev[w] = v; q.append(w)
    if b not in prev:
        return []
    steps = []
    v = b
    while prev[v] is not None:
        steps.append((prev[v], v)); v = prev[v]
    return steps[::-1]


def is_vertex(k):
    """Whether a lattice point is a corner of the hex grid (not a hex centre)."""
    x, y = vpos(k)
    c, r = plane_to_hex(x, y)
    return any(v == k for v in vertices_of(c, r))


if __name__ == '__main__':
    main()
