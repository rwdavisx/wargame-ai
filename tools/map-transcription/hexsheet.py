"""Compact review sheets: one small photo crop per hex with that hex outlined in yellow, so a
town circle, port, VP circle or other symbol can be checked to sit inside the hex the data says.

Usage: python3 hexsheet.py SPOTS_TXT OUTDIR PREFIX
SPOTS_TXT: one 'label | HEX [| photo]' per line (photo as in spots.py). 12 tiles (4 x 3) per sheet.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import review

HERE = os.path.dirname(os.path.abspath(__file__))
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
_src = {}


def get(photo):
    if photo not in _src:
        path, M = review.get(photo)
        _src[photo] = (Image.open(path).convert('RGB'), M)
    return _src[photo]


def tile(label, h, photo, size=330):
    old = os.getcwd()
    os.chdir(HERE)
    try:
        if not photo:
            from mappers import owner
            photo = owner(h) or '5'
        im, M = get(photo)
    finally:
        os.chdir(old)
    hp = math.dist(M.center('3010'), M.center('3011'))
    cx, cy = M.center(h)
    r = hp * 1.25
    box = (int(cx - r), int(cy - r), int(cx + r), int(cy + r))
    s = size / (2 * r)
    a = im.crop(box).resize((size, size))
    d = ImageDraw.Draw(a, 'RGBA')
    d.polygon([((u - box[0]) * s, (v - box[1]) * s) for u, v in M.corners(h)], outline=(255, 230, 0, 255), width=3)
    out = Image.new('RGB', (size, size + 24), (20, 20, 20))
    out.paste(a, (0, 24))
    ImageDraw.Draw(out).text((4, 3), f'{label} [{photo}]', fill=(255, 255, 255), font=ImageFont.truetype(FB, 14))
    return out


def main(spec, outdir, prefix):
    os.makedirs(outdir, exist_ok=True)
    spots = []
    for line in open(spec):
        line = line.split('#')[0].strip()
        if line:
            p = [x.strip() for x in line.split('|')]
            spots.append((p[0], p[1], p[2] if len(p) > 2 else None))
    for i in range(0, len(spots), 12):
        tiles = [tile(*sp) for sp in spots[i:i + 12]]
        w, h = tiles[0].size
        sheet = Image.new('RGB', (w * 4 + 9, h * 3 + 6), (0, 0, 0))
        for j, t in enumerate(tiles):
            sheet.paste(t, ((j % 4) * (w + 3), (j // 4) * (h + 3)))
        p = os.path.join(outdir, f'{prefix}_{i // 12 + 1:02d}.png')
        sheet.save(p)
        print(p)


if __name__ == '__main__':
    main(*sys.argv[1:])
