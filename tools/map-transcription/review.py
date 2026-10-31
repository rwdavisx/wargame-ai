"""Draw data/salerno43/map.json over the map photos and the rulebook excerpts for review by eye.

Usage: python3 review.py OUTDIR [name ...]
  names: photo keys from mappers.PHOTOS ('1','2','3','5','6') and excerpt names from
  excerpts.EXCERPTS ('p27', ...). Default: all.
Writes OUTDIR/<name>_full.jpg plus tiles <name>_<row><col>.jpg.

Legend: letter at hex centre = terrain (C clear, H hill, M marsh, S sea); white = hex id.
Hexsides: cyan = river, magenta = mountain, yellow X = pass, lime dashes = 8th Army sector boundary.
Roads are drawn centre to centre: red = major, orange = minor.
Green square = city, green circle = town, red number = VP, 'P<n>' = port capacity,
'A' = airfield, 'B:<name>' = beach, entry area ids in white boxes.
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grid import grid_xy
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(HERE, '../../data/salerno43/map.json')))
HX, SD = m['hexes'], m['hexsides']
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
EXT = os.environ.get('REVIEW_EXT', 'jpg')
SAVE = {'quality': 88} if EXT == 'jpg' else {}
TC = {'clear': (255, 255, 255), 'hill': (255, 140, 0), 'marsh': (0, 200, 120), 'sea': (0, 90, 255)}


def neighbors(h):
    c, r = int(h[:2]), int(h[2:])
    d = [(0, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)] if c % 2 else [(0, -1), (1, -1), (1, 0), (0, 1), (-1, 0), (-1, -1)]
    return [f"{c + dc:02d}{r + dr:02d}" for dc, dr in d]


def edge(M, a, b):
    (xa, ya), (xb, yb) = grid_xy(a), grid_xy(b)
    mx, my = (xa + xb) / 2, (ya + yb) / 2
    dx, dy = xb - xa, yb - ya
    L = math.hypot(dx, dy)
    px, py = -dy / L, dx / L
    h = 0.5 / math.sqrt(3)
    return M.to_px(mx + px * h, my + py * h), M.to_px(mx - px * h, my - py * h)


def get(name):
    if name in ('1', '2', '3', '5', '6'):
        old = os.getcwd()
        os.chdir(HERE)
        try:
            from mappers import mapper
            return mapper(name)
        finally:
            os.chdir(old)
    from excerpts import fit
    return fit(name)


def draw(name, out, tiles=(2, 3)):
    path, M = get(name)
    im = Image.open(path).convert('RGB')
    W, H = im.size
    hexpx = math.dist(M.center('3010'), M.center('3011'))
    k = hexpx / 100.0
    F = ImageFont.truetype(FB, max(10, int(20 * k)))
    f = ImageFont.truetype(FR, max(9, int(12 * k)))
    lw = lambda w: max(1, int(round(w * k)))
    d = ImageDraw.Draw(im, 'RGBA')

    def visible(h):
        x, y = M.center(h)
        return -hexpx < x < W + hexpx and -hexpx < y < H + hexpx

    hexes = [h for h in HX if visible(h)]
    for h in hexes:
        d.polygon(M.corners(h), outline=(255, 0, 255, 110))
    for key, v in SD.items():
        a, b = key.split('-')
        if not (visible(a) or visible(b)):
            continue
        p, q = edge(M, a, b)
        if v.get('river'):
            d.line([p, q], fill=(0, 255, 255, 220), width=lw(7))
        if v.get('mountain'):
            d.line([p, q], fill=(255, 0, 200, 200), width=lw(5))
        if v.get('pass'):
            cx, cy = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            s = 9 * k
            d.line([(cx - s, cy - s), (cx + s, cy + s)], fill=(255, 255, 0), width=lw(4))
            d.line([(cx - s, cy + s), (cx + s, cy - s)], fill=(255, 255, 0), width=lw(4))
        if v.get('road'):
            major = v['road'] == 'major'
            d.line([M.center(a), M.center(b)], fill=(255, 0, 0, 220) if major else (255, 170, 0, 230), width=lw(4 if major else 3))
    # 8th Army sector boundary
    for h in hexes:
        if not HX[h].get('sector8'):
            continue
        for n in neighbors(h):
            if n in HX and HX[n]['terrain'] != 'sea' and not HX[n].get('sector8'):
                p, q = edge(M, h, n)
                d.line([p, q], fill=(160, 255, 0, 255), width=lw(6))
    beach_at = {b['hex']: name_ for name_, b in m['beaches'].items()}
    entry_at = {h: e for e, a in m['entryAreas'].items() for h in a['hexes']}
    for h in hexes:
        v = HX[h]
        cx, cy = M.center(h)
        t = v['terrain']
        d.text((cx - 7 * k, cy - 12 * k), t[0].upper(), fill=TC[t], font=F, stroke_width=2, stroke_fill=(0, 0, 0))
        d.text((cx - 14 * k, cy + 10 * k), h, fill=(255, 255, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
        box = [cx + 10 * k, cy - 18 * k, cx + 22 * k, cy - 6 * k]
        if v.get('city'):
            d.rectangle(box, outline=(0, 255, 0), width=lw(3))
        elif v.get('town'):
            d.ellipse(box, outline=(0, 255, 0), width=lw(3))
        if v.get('vp'):
            d.text((cx - 28 * k, cy - 22 * k), str(v['vp']), fill=(255, 40, 40), font=F, stroke_width=2, stroke_fill=(255, 255, 255))
        if v.get('port'):
            d.text((cx + 12 * k, cy), 'P' + str(v['port']['capacity']), fill=(0, 255, 255), font=F, stroke_width=2, stroke_fill=(0, 0, 0))
        if v.get('airfield'):
            d.text((cx - 30 * k, cy + 2 * k), 'A', fill=(255, 255, 0), font=F, stroke_width=2, stroke_fill=(0, 0, 0))
        if h in beach_at:
            d.text((cx - 30 * k, cy + 24 * k), 'B:' + beach_at[h], fill=(255, 255, 0), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
        if h in entry_at:
            d.text((cx - 10 * k, cy - 30 * k), entry_at[h], fill=(255, 255, 255), font=F, stroke_width=2, stroke_fill=(0, 0, 160))
    im.save(f'{out}/{name}_full.{EXT}', **SAVE)
    cols, rows = tiles
    for i in range(cols):
        for j in range(rows):
            x0, y0 = i * W // cols, j * H // rows
            m_ = int(hexpx * 0.6)
            im.crop((max(0, x0 - m_), max(0, y0 - m_), min(W, x0 + W // cols + m_), min(H, y0 + H // rows + m_))).save(
                f'{out}/{name}_{j}{i}.{EXT}', **SAVE)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    names = sys.argv[2:] or ['1', '2', '3', '5', '6', 'p27']
    for n in names:
        draw(n, out)
        print('drew', n)
