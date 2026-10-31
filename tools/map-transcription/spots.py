"""Contact sheets of map spots for review by eye: for each spot, the photo (left, with a faint grid
and hex ids) beside the same crop with data/salerno43/map.json drawn over it (right; legend in review.py).

Usage: python3 spots.py SPOTS_TXT OUTDIR [PREFIX]
SPOTS_TXT has one spot per line:  label | target [| photo]
  target = HEX, A-B (a hexside: marked at its midpoint) or A-B-C (a vertex shared by three hexes)
  photo  = '1'..'6' or 'p27'/'p29' (default: the owner photo of the first hex; see mappers.owner)
Writes OUTDIR/PREFIX_NN.png sheets of three spots each.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import review
from grid import grid_xy

HERE = os.path.dirname(os.path.abspath(__file__))
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
_cache = {}


def source(name):
    if name not in _cache:
        path, M = review.get(name)
        tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'spots_overlay_{name}')
        os.makedirs(tmp, exist_ok=True)
        review.draw(name, tmp, tiles=(1, 1))
        _cache[name] = (Image.open(path).convert('RGB'), Image.open(f'{tmp}/{name}_full.jpg').convert('RGB'), M)
    return _cache[name]


def target_point(M, t):
    ids = t.split('-')
    xs = [grid_xy(h) for h in ids]
    x = sum(p[0] for p in xs) / len(xs)
    y = sum(p[1] for p in xs) / len(xs)
    return M.to_px(x, y)


def tile(label, t, photo, size=480):
    old = os.getcwd()
    os.chdir(HERE)
    try:
        if not photo:
            from mappers import owner
            photo = owner(t.split('-')[0]) or '5'
        raw, ov, M = source(photo)
    finally:
        os.chdir(old)
    hp = math.dist(M.center('3010'), M.center('3011'))
    cx, cy = target_point(M, t)
    r = hp * 1.6
    box = (int(cx - r), int(cy - r), int(cx + r), int(cy + r))
    a = raw.crop(box).resize((size, size))
    b = ov.crop(box).resize((size, size))
    s = size / (2 * r)
    d = ImageDraw.Draw(a, 'RGBA')
    F = ImageFont.truetype(FB, max(11, int(hp * s / 7)))
    for h in review.HX:
        x, y = M.center(h)
        if abs(x - cx) < r + hp and abs(y - cy) < r + hp:
            d.polygon([((u - box[0]) * s, (v - box[1]) * s) for u, v in M.corners(h)], outline=(255, 0, 255, 120))
            d.text(((x - box[0]) * s - hp * s / 6, (y - box[1]) * s + hp * s / 8), h, fill=(255, 0, 255, 200), font=F)
    for im in (a, b):
        dd = ImageDraw.Draw(im)
        m = size / 2
        dd.ellipse([m - 14, m - 14, m + 14, m + 14], outline=(255, 255, 0), width=3)
    out = Image.new('RGB', (size * 2 + 6, size + 30), (20, 20, 20))
    out.paste(a, (0, 30))
    out.paste(b, (size + 6, 30))
    ImageDraw.Draw(out).text((8, 4), f'{label}   [{t}, photo {photo}]', fill=(255, 255, 255), font=ImageFont.truetype(FB, 18))
    return out


def main(spec, outdir, prefix='spots'):
    os.makedirs(outdir, exist_ok=True)
    spots = []
    for line in open(spec):
        line = line.split('#')[0].strip()
        if line:
            parts = [p.strip() for p in line.split('|')]
            spots.append((parts[0], parts[1], parts[2] if len(parts) > 2 else None))
    for i in range(0, len(spots), 3):
        tiles = [tile(*sp) for sp in spots[i:i + 3]]
        w, h = tiles[0].size
        sheet = Image.new('RGB', (w, h * len(tiles)), (0, 0, 0))
        for j, t in enumerate(tiles):
            sheet.paste(t, (0, j * h))
        p = os.path.join(outdir, f'{prefix}_{i // 3 + 1:02d}.png')
        sheet.save(p)
        print(p)


if __name__ == '__main__':
    main(*sys.argv[1:])
