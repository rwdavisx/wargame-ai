"""Draw data/salerno43/map.json over each photo so the transcription can be checked by eye.

Usage: python3 audit.py OUTDIR [tile]   -> OUTDIR/<photo>_full.jpg and 3x2 tiles per photo.
Letters at hex centres: C clear, H hill, M marsh, S sea. Hexsides: cyan river, magenta
mountain, yellow cross = pass. Roads centre to centre: red major, orange minor.
Squares are cities, circles towns, red numbers VP, P ports.
"""
import sys, json, math, os
sys.path.insert(0, '.')
from mappers import *
from hexsides import neighbors
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
m = json.load(open('../../data/salerno43/map.json'))
HX, SD = m['hexes'], m['hexsides']
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
TC = {'clear': (255, 255, 255), 'hill': (255, 140, 0), 'marsh': (0, 200, 120), 'sea': (0, 90, 255)}

def edge(M, a, b):
    (xa, ya), (xb, yb) = grid_xy(a), grid_xy(b)
    mx, my = (xa + xb) / 2, (ya + yb) / 2
    dx, dy = xb - xa, yb - ya
    L = math.hypot(dx, dy); px, py = -dy / L, dx / L
    h = 0.5 / math.sqrt(3)
    return M.to_px(mx + px * h, my + py * h), M.to_px(mx - px * h, my - py * h)

def near(h, key):
    o = owner(h)
    if o == key: return True
    # also draw hexes one column/row into the neighbouring photo
    return any(owner(n) == key for n in neighbors(h))

for key in PHOTOS:
    path, M = mapper(key)
    im = Image.open(path).convert('RGB')
    d = ImageDraw.Draw(im, 'RGBA')
    hexes = [h for h in HX if near(h, key)]
    for h in hexes:
        d.polygon(M.corners(h), outline=(255, 0, 255, 90))
    for k, v in SD.items():
        a, b = k.split('-')
        if not (near(a, key) or near(b, key)): continue
        p, q = edge(M, a, b)
        if v.get('river'): d.line([p, q], fill=(0, 255, 255, 230), width=7)
        if v.get('mountain'): d.line([p, q], fill=(255, 0, 200, 200), width=5)
        if v.get('pass'):
            cx, cy = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            d.line([(cx - 9, cy - 9), (cx + 9, cy + 9)], fill=(255, 255, 0), width=4)
            d.line([(cx - 9, cy + 9), (cx + 9, cy - 9)], fill=(255, 255, 0), width=4)
        if v.get('road'):
            ca, cb = M.center(a), M.center(b)
            d.line([ca, cb], fill=(255, 0, 0, 220) if v['road'] == 'major' else (255, 170, 0, 220), width=4 if v['road'] == 'major' else 3)
    for h in hexes:
        v = HX[h]; cx, cy = M.center(h)
        t = v['terrain']
        d.text((cx - 7, cy - 12), t[0].upper(), fill=TC[t], font=F, stroke_width=2, stroke_fill=(0, 0, 0))
        d.text((cx - 13, cy + 10), h, fill=(255, 255, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
        if v.get('city'): d.rectangle([cx + 10, cy - 18, cx + 22, cy - 6], outline=(0, 255, 0), width=3)
        elif v.get('town'): d.ellipse([cx + 10, cy - 18, cx + 22, cy - 6], outline=(0, 255, 0), width=3)
        if v.get('vp'): d.text((cx - 26, cy - 22), str(v['vp']), fill=(255, 40, 40), font=F, stroke_width=2, stroke_fill=(255, 255, 255))
        if v.get('port'): d.text((cx + 12, cy), 'P' + str(v['port']['capacity']), fill=(0, 255, 255), font=F, stroke_width=2, stroke_fill=(0, 0, 0))
        if v.get('sector8'): d.text((cx - 24, cy + 2), '8', fill=(200, 255, 0), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(f'{OUT}/{key}_full.jpg', quality=88)
    W, H = im.size
    for i in range(2):
        for j in range(3):
            x0, y0 = i * W // 2, j * H // 3
            im.crop((max(0, x0 - 60), max(0, y0 - 60), min(W, x0 + W // 2 + 60), min(H, y0 + H // 3 + 60))).save(f'{OUT}/{key}_{j}{i}.jpg', quality=88)
print('done')
