"""Draws the grand map's Adriatic extension from elevation data, calibrated on the two printed maps.

  terrain       land or sea from the ground's height (sea and lagoons at or below 0 m); hill where the spread of
                heights inside the hex (90th less 10th percentile) is over the threshold that reproduces 92% of the
                printed maps' clear/hill choices (calibrate.py)
  mountain      a hexside is a mountain hexside where mtn.py's model, fitted to the printed maps' mountain hexsides,
                says so, at the threshold that gives the printed maps' own density of them
  rivers        traced from the ground: water runs downhill (pits filled first), and a stream becomes a river once
                its catchment passes MINOR_KM2 (a major river at MAJOR_KM2). Its course is snapped onto the hex
                edges nearest it, so rivers run along hexsides as on the printed maps. COURSES adds the rivers the
                history makes matter whatever their size (the Moro), and the Sangro below the Aventino as major
  valleys       a river's own hexsides, and the hexsides along its course (between two hexes on the same bank), are
                never mountain hexsides: the printed maps keep their valleys open (14 exceptions in 782)
  lakes         sea cut off from the open sea (the Pontine plain lies below sea level) is marsh
Towns, roads and the historical marks come from extend_places.py. Writes data/grand43/parts/extension.json, merged into
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
# The areas added, as (columns, rows): the Adriatic front and its hinterland, north of the Italy '43 map's east half and
# east of both maps; Apulia and Basilicata south of it (Potenza, Melfi, Cerignola: the Eighth Army's approach); and
# Lazio north of the Italy '43 map (Littoria, Frosinone, Sora: the roads to Rome).
REGIONS = [(range(30, 67), range(0, 51)), (range(47, 67), range(51, 70)), (range(5, 30), range(0, 15))]
SEA_MARGIN = 3          # sea hexes kept off the new coast
# Catchments at which a stream is a river on the map, and a major river. MINOR_KM2 gives the drawn sectors about the
# printed maps' density of rivers (some 30 river hexsides per 100 land hexes). MAJOR_KM2 follows the printed maps' own
# rivers rather than a density: Italy '43 draws the Volturno major below the Calore (some 5,000 km² there) but the
# Calore at Benevento (3,000 km²), the upper Volturno and the Liri above the Gari minor, so no river of the drawn
# sectors is major by size alone (the Pescara has 3,200 km² at its mouth, the Ofanto 2,800, the Sangro 1,500).
MINOR_KM2 = 220.0
MAJOR_KM2 = 3500.0
# Rivers the history makes matter whatever their size, as a point on the course (followed downhill to the sea) and
# whether the river is major from there. The printed maps make the Gari major for its battle; the Sangro below the
# Aventino was the Eighth Army's set-piece crossing of November 1943, in spate that swept its bridges away. The Moro
# (75 km²) was the Canadians' first river line in December.
COURSES = [
    ('Sangro', (42.145, 14.400), True),
    ('Moro', (42.267, 14.335), False),
    # The upper Liri, small on the ground because the Fucino's water reaches it through a tunnel, down the Valle
    # Roveto from Capistrello to Sora.
    ('Liri', (41.957, 13.394), False),
]
PASS_SHARE = 3          # per cent of the mountain hexsides that are passes


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
    grand = json.load(open(f'{ROOT}/data/grand43/parts/stitched.json'))
    old = set(grand['hexes'])
    hill_t = rep['p90p10']['threshold']

    # 1. Hexes: land or sea, clear or hill.
    stats, land, sea = {}, set(), set()
    cells = sorted({(c, r) for cols, rows in REGIONS for c in cols for r in rows})
    for c, r in cells:
        if True:
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
    # Sea cut off from the open sea is low ground behind the coast (the Pontine plain lies below sea level): marsh.
    old_sea = {h for h, d in grand['hexes'].items() if d['terrain'] == 'sea'}
    every = land | keep | old
    wet = keep | old_sea
    reached = {h for h in wet if any(hid(*n) not in every for n in nbrs(int(h[:2]), int(h[2:])))}
    frontier = list(reached)
    while frontier:
        h = frontier.pop()
        for n in nbrs(int(h[:2]), int(h[2:])):
            g = hid(*n)
            if g in wet and g not in reached:
                reached.add(g)
                frontier.append(g)
    for h in keep:
        hexes[h] = {'terrain': 'sea' if h in reached else 'marsh'}
    print('inland sea made marsh:', sorted(keep - reached))
    print(f'{len(land)} new land hexes ({sum(1 for h in land if hexes[h]["terrain"] == "hill")} hill), {len(keep)} sea')

    # 2. Mountain hexsides inside the new land, and along its join with the old maps.
    allland = {h for h, d in grand['hexes'].items() if d['terrain'] in ('clear', 'hill')} | land
    for h, d in grand['hexes'].items():
        if h in allland:
            stats.setdefault(h, cal['hexes'].get(h))
    mm = rep['mountainModel']
    sides = {}
    seen = set()
    crest = {}
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
                crest[k] = f[4]
    print(f'{len(sides)} mountain hexsides from the model')

    # 3. Rivers from the ground, over each new area and a margin.
    river_edges = {}
    for cols, rows in REGIONS:
        here = [h for h in land if int(h[:2]) in cols and int(h[2:]) in rows]
        if here:
            trace_rivers(dem, here, river_edges)
    finish(hexes, sides, grand, river_edges, crest)


def trace_rivers(dem, land, river_edges):
    lats, lons = [], []
    for h in land:
        la, lo = plane_to_ll(*hex_xy(int(h[:2]), int(h[2:])))
        lats.append(la); lons.append(lo)
    lat0, lat1, lon0, lon1 = min(lats) - 0.3, max(lats) + 0.3, min(lons) - 0.35, max(lons) + 0.3
    z, xs, ys = raster(dem, lat0, lat1, lon0, lon1)
    print('raster', z.shape)
    filled, down, acc = flow(z)
    cell_km2 = (40075 * math.cos(math.radians((lat0 + lat1) / 2)) / (2 ** dem.z * 256)) ** 2
    km2 = acc * cell_km2
    # Walk each river from where its catchment first passes MINOR_KM2 down to the sea, snapping to hex vertices.
    H, W = z.shape
    starts = [(j, i) for j in range(H) for i in range(W) if km2[j, i] >= MINOR_KM2 and z[j, i] > 0 and
              not any(0 <= j + dj < H and 0 <= i + di < W and (down[j + dj, i + di] == (j, i)).all() and km2[j + dj, i + di] >= MINOR_KM2
                      for dj in (-1, 0, 1) for di in (-1, 0, 1) if dj or di)]
    def walk(j, i):
        path = []
        while j >= 0 and z[j, i] > 0:
            path.append((j, i))
            jj, ii = down[j, i]
            if jj < 0:
                break
            j, i = int(jj), int(ii)
        return path

    for j, i in starts:
        snap(dem, xs, ys, walk(j, i), lambda pj, pi: km2[pj, pi] >= MAJOR_KM2, river_edges)
    # The rivers the history names, from the point given (moved onto the strongest flow within half a kilometre).
    for name, (la, lo), major in COURSES:
        x, y = dem.px(la, lo)
        i0, j0 = int(x) - int(xs[0]), int(y) - int(ys[0])
        if not (4 <= j0 < H - 4 and 4 <= i0 < W - 4):
            continue
        _, j, i = max((acc[j, i], j, i) for j in range(j0 - 4, j0 + 5) for i in range(i0 - 4, i0 + 5))
        path = walk(j, i)
        snap(dem, xs, ys, path, (lambda pj, pi: True) if major else (lambda pj, pi: km2[pj, pi] >= MAJOR_KM2), river_edges)
        print(f'{name}: {len(path)} cells to the sea, {km2[path[-1]]:.0f} km² at the mouth')


def snap(dem, xs, ys, path, is_major, river_edges):
    """Lays a course (raster cells, downstream) onto the hex edges nearest it."""
    prev = None
    for (pj, pi) in path:
        la, lo = px_to_ll(dem, xs[pi] + 0.5, ys[pj] + 0.5)
        x, y = ll_to_plane(la, lo)
        # nearest true vertex: search the vertices of the hex the point is in
        c, r = plane_to_hex(x, y)
        v = min(vertices_of(c, r), key=lambda k: (vpos(k)[0] - x) ** 2 + (vpos(k)[1] - y) ** 2)
        if prev and v != prev:
            # step along the shared edge(s): the two vertices are adjacent, or two edges apart around one hex
            for a, b in vertex_steps(prev, v):
                k = side_key(*edge_hexes(a, b))
                river_edges[k] = river_edges.get(k, False) or bool(is_major(pj, pi))
        prev = v


def finish(hexes, sides, grand, river_edges, crest):
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
        # Along a printed map's edge the printed river stands: a traced course does not run beside a printed hex
        # that already has its river (it would draw the river twice round it).
        printed = [x for x in (a, b) if x in grand['hexes']]
        if printed and sum(1 for kk, vv in grand['hexsides'].items() if vv.get('river') and printed[0] in kk.split('-')) >= 2:
            continue
        s = sides.setdefault(k, {})
        s['river'] = True
        if major:
            s['majorRiver'] = True
        n_new += 1
    print(f'{n_new} river hexsides ({sum(1 for k, v in sides.items() if v.get("majorRiver"))} major)')
    # Valleys stay open: no mountain hexside on a river, nor across its valley floor (where the river turns at a hex
    # corner, the hexside between the two hexes on the same bank).
    every = {**grand['hexes'], **hexes}
    rivers = {k for k, v in {**grand['hexsides'], **sides}.items() if v.get('river') and all(x in every for x in k.split('-'))}
    at_vertex = {}
    for k in rivers:
        a, b = k.split('-')
        for v in set(vertices_of(int(a[:2]), int(a[2:]))) & set(vertices_of(int(b[:2]), int(b[2:]))):
            at_vertex.setdefault(v, set()).add(k)
    opened = 0
    for v, ks in at_vertex.items():
        around = sorted({h for k in ks for h in k.split('-')})
        if len(ks) != 2 or len(around) != 3:
            continue
        a, b, c = around
        for k in {side_key(a, b), side_key(a, c), side_key(b, c)} - ks:
            if sides.get(k, {}).pop('mountain', None):
                opened += 1
    for k in rivers:
        if sides.get(k, {}).pop('mountain', None):
            opened += 1
    for k in list(sides):
        if not sides[k].get('mountain'):
            sides[k].pop('pass', None)
            if not sides[k]:
                del sides[k]
    # Passes: the lowest saddles across the ranges (the printed maps mark about one mountain hexside in thirty as a
    # pass, never one a road takes).
    mtns = {k: crest[k] for k, v in sides.items() if v.get('mountain') and k in crest}
    for k in sorted(mtns, key=mtns.get)[:max(1, len(mtns) * PASS_SHARE // 100)]:
        sides[k]['pass'] = True
    print(f'{opened} mountain hexsides opened along rivers; {len(mtns)} mountain hexsides, '
          f'{sum(1 for v in sides.values() if v.get("pass"))} passes')
    json.dump({'hexes': dict(sorted(hexes.items())), 'hexsides': dict(sorted(sides.items())),
               'note': 'Generated by tools/grand/extend.py from elevation data, calibrated on the printed maps.'},
              open(f'{ROOT}/data/grand43/parts/extension.json', 'w'), indent=1)


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
