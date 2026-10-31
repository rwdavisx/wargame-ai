"""Draws data/italy43/map.json as a picture for checking it against the photos.

    python3 tools/italy-map/render.py out.png [scale]

Terrain fills the hexes; blue lines are rivers (thick = major), brown lines mountain hexsides, black lines major
roads and grey lines minor ones; red discs are VP hexes; the Gustav Line hexes are outlined in red, the Bernhard
Line hexes in black, and the 8th Army zone is hatched.
"""

import json
import math
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

MAP = pathlib.Path(__file__).parent.parent.parent / 'data' / 'italy43' / 'map.json'
SQ = math.sqrt(3) / 2
FILL = {'sea': (120, 175, 220), 'clear': (238, 236, 226), 'hill': (196, 176, 128), 'marsh': (160, 196, 168)}


def centre(h, s):
    c, r = int(h[:2]), int(h[2:])
    return (c * SQ * s + s, (r + (0.5 if c % 2 == 0 else 0)) * s + s)


def corners(h, s):
    x, y = centre(h, s)
    w = s / math.sqrt(3)
    return [(x + w * math.cos(math.radians(60 * k)), y + w * math.sin(math.radians(60 * k))) for k in range(6)]


def shared_edge(a, b, s):
    pa, pb = corners(a, s), corners(b, s)
    common = [p for p in pa if any(abs(p[0] - q[0]) < 0.5 and abs(p[1] - q[1]) < 0.5 for q in pb)]
    return common if len(common) == 2 else None


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'italy-map.png'
    s = float(sys.argv[2]) if len(sys.argv) > 2 else 36
    m = json.loads(MAP.read_text())
    hexes, sides = m['hexes'], m['hexsides']
    cols = [int(h[:2]) for h in hexes]
    rows = [int(h[2:]) for h in hexes]
    W = int((max(cols) + 2) * SQ * s + 2 * s)
    H = int((max(rows) + 2) * s + 2 * s)
    im = Image.new('RGB', (W, H), (150, 120, 140))
    d = ImageDraw.Draw(im, 'RGBA')
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', max(7, int(s / 4)))
        bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', max(8, int(s / 3.2)))
    except OSError:
        font = bold = ImageFont.load_default()
    for h, v in hexes.items():
        d.polygon(corners(h, s), fill=FILL.get(v['terrain'], (255, 0, 0)), outline=(120, 120, 120))
        if v.get('zone8'):
            x, y = centre(h, s)
            for k in range(-3, 4):
                d.line([(x - s / 3 + k * s / 8, y + s / 3), (x + s / 3 + k * s / 8, y - s / 3)], fill=(40, 120, 40, 90), width=1)
        if v.get('fullMountain'):
            d.polygon(corners(h, s), fill=(110, 90, 60, 120))
    for key, v in sides.items():
        a, b = key.split('-')
        e = shared_edge(a, b, s)
        if not e:
            continue
        if v.get('mountain'):
            d.line(e, fill=(90, 60, 30), width=max(3, int(s / 9)))
        if v.get('lake'):
            d.line(e, fill=(30, 80, 200), width=max(5, int(s / 6)))
        if v.get('river'):
            d.line(e, fill=(20, 40, 120) if v.get('majorRiver') else (40, 110, 230), width=max(4, int(s / 7)) if v.get('majorRiver') else max(2, int(s / 14)))
        if v.get('pass'):
            mx, my = (e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2
            d.ellipse([mx - s / 10, my - s / 10, mx + s / 10, my + s / 10], fill=(255, 255, 255), outline=(0, 0, 0))
        if v.get('road'):
            ca, cb = centre(a, s), centre(b, s)
            d.line([ca, cb], fill=(20, 20, 20) if v['road'] == 'major' else (110, 110, 110), width=max(2, int(s / 12)) if v['road'] == 'major' else 1)
    for h, v in hexes.items():
        x, y = centre(h, s)
        if v.get('gustav'):
            d.polygon(corners(h, s), outline=(200, 0, 0), width=3)
        if v.get('bernhard'):
            d.polygon(corners(h, s), outline=(0, 0, 0), width=2)
        d.text((x - s / 3.2, y - s / 2.2), h, fill=(60, 60, 60), font=font)
        if v.get('city'):
            r = s / 4 if v.get('majorCity') else s / 6
            d.rectangle([x - r, y - r, x + r, y + r], fill=(30, 30, 30))
            d.text((x - s / 2, y + s / 6), v['city'], fill=(0, 0, 0), font=bold)
        elif v.get('town'):
            d.ellipse([x - s / 10, y - s / 10, x + s / 10, y + s / 10], fill=(230, 200, 180), outline=(0, 0, 0))
            d.text((x - s / 2, y + s / 8), v['town'], fill=(0, 0, 0), font=font)
        if v.get('vp'):
            d.ellipse([x + s / 6, y - s / 3, x + s / 6 + s / 4, y - s / 3 + s / 4], fill=(200, 30, 30))
            d.text((x + s / 6 + s / 14, y - s / 3 + s / 40), str(v['vp']), fill=(255, 230, 0), font=font)
    for name, ea in m.get('entryAreas', {}).items():
        for h in ea['hexes']:
            x, y = centre(h, s)
            d.text((x - s / 6, y - s / 8), name, fill=(0, 0, 160), font=bold)
    im.save(out)
    print(out, im.size)


if __name__ == '__main__':
    main()
