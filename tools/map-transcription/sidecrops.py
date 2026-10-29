"""Contact sheet of raw/overlay crop pairs around listed hexes or hexsides.

Usage: python3 sidecrops.py SOURCE OVERLAY_DIR OUT.png ITEM [ITEM ...]
  SOURCE: photo key or excerpt name; OVERLAY_DIR holds <SOURCE>_full.jpg from review.py.
  ITEM: a hex id '2707' or a hexside '2707-2708'.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
from review import get

src, ovdir, out, *items = sys.argv[1:]
path, M = get(src)
raw = Image.open(path).convert('RGB')
ov = Image.open(os.path.join(ovdir, f'{src}_full.jpg')).convert('RGB')
hexpx = math.dist(M.center('3010'), M.center('3011'))
R = int(hexpx * float(os.environ.get("CROP_R", "1.3")))
S = int(os.environ.get("CROP_S", "300"))
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
PH = os.environ.get('PHOTO')
if PH:
    from mappers import owner
    phot = {}
tiles = []
for it in items:
    hs = it.split('-')
    pts = [M.center(h) for h in hs]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    box = (int(cx - R), int(cy - R), int(cx + R), int(cy + R))
    panels = [raw.crop(box), ov.crop(box)]
    if PH:
        key = owner(hs[0]) if PH == 'auto' else PH
        if key not in phot:
            pp, PM = get(key)
            phot[key] = (Image.open(os.path.join(ovdir, f'{key}_full.jpg')).convert('RGB'), PM)
        pim, PM = phot[key]
        pts2 = [PM.center(h) for h in hs]
        qx = sum(p[0] for p in pts2) / len(pts2); qy = sum(p[1] for p in pts2) / len(pts2)
        R2 = R * math.dist(PM.center('3010'), PM.center('3011')) / hexpx
        panels.append(pim.crop((int(qx - R2), int(qy - R2), int(qx + R2), int(qy + R2))))
    t = Image.new('RGB', (len(panels) * (S + 6), S + 22), 'white')
    for i_, p_ in enumerate(panels):
        t.paste(p_.resize((S, S)), (i_ * (S + 6), 22))
    d = ImageDraw.Draw(t)
    d.text((4, 2), it, fill=(200, 0, 0), font=F)
    tiles.append(t)
cols = int(os.environ.get("CROP_COLS", "3"))
rows = (len(tiles) + cols - 1) // cols
TW = tiles[0].width + 10
sheet = Image.new('RGB', (cols * TW, rows * (S + 32)), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * TW, (i // cols) * (S + 32)))
sheet.save(out)
print(out, len(tiles))
