"""Renders the grand map (printed maps + extension) by terrain, with rivers, mountain hexsides and reference places."""
import json, math, sys, os
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from geo import ll_to_hex
ROOT = __file__.rsplit('/tools/', 1)[0]
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user-wargame-ai/8548fbb5-83de-52aa-88db-9501bd2b1675/scratchpad/net/ax/grand-ext.png'
m = json.load(open(f'{ROOT}/data/grand43/map.json'))
ext = json.load(open(f'{ROOT}/data/grand43/extension.json')) if os.path.exists(f'{ROOT}/data/grand43/extension.json') else {'hexes': {}, 'hexsides': {}}
hexes = {**m['hexes'], **{h: d for h, d in ext['hexes'].items() if h not in m['hexes']}}
sides = {**m['hexsides'], **ext['hexsides']}
S = 9
def ctr(h):
    c, r = int(h[:2]), int(h[2:]); return 20 + 1.5 * S * c, 20 + math.sqrt(3) * S * (r + (0.5 if c % 2 == 0 else 0))
W = int(1.5 * S * 68) + 40; H = int(math.sqrt(3) * S * 72) + 40
im = Image.new('RGB', (W, H), (245, 240, 225)); d = ImageDraw.Draw(im)
col = {'sea': (90, 140, 200), 'clear': (225, 220, 175), 'hill': (175, 145, 95), 'marsh': (120, 170, 150)}
for h, x in hexes.items():
    cx, cy = ctr(h)
    pts = [(cx + S * math.cos(math.radians(60 * k)), cy + S * math.sin(math.radians(60 * k))) for k in range(6)]
    fill = col.get(x['terrain'], (200, 200, 200))
    if h in ext['hexes'] and h not in m['hexes']:
        fill = tuple(int(v * 0.92) for v in fill)
    if x.get('city') or x.get('town'): fill = (190, 80, 70)
    d.polygon(pts, fill=fill, outline=(140, 140, 140))
for k, v in sides.items():
    a, b = k.split('-')
    if a not in hexes or b not in hexes: continue
    (x1, y1), (x2, y2) = ctr(a), ctr(b); mx, my = (x1 + x2) / 2, (y1 + y2) / 2; dx, dy = (y2 - y1) / 2, -(x2 - x1) / 2
    n = math.hypot(dx, dy); dx, dy = dx / n * S * 0.58, dy / n * S * 0.58
    if v.get('mountain'): d.line([(mx - dx, my - dy), (mx + dx, my + dy)], fill=(90, 50, 20), width=2)
    if v.get('river'): d.line([(mx - dx, my - dy), (mx + dx, my + dy)], fill=(0, 0, 140) if v.get('majorRiver') else (40, 90, 230), width=3 if v.get('majorRiver') else 2)
for k, v in sides.items():
    if not v.get('road'): continue
    a, b = k.split('-')
    if a not in hexes or b not in hexes: continue
    d.line([ctr(a), ctr(b)], fill=(230, 110, 20) if v['road'] == 'major' else (250, 230, 120), width=3 if v['road'] == 'major' else 2)
places = {'Ortona': (42.355, 14.403), 'Pescara': (42.462, 14.214), 'Lanciano': (42.230, 14.390), 'Vasto': (42.112, 14.708), 'Termoli': (42.000, 14.995),
          'Foggia': (41.462, 15.545), 'Lucera': (41.508, 15.333), 'Campobasso': (41.561, 14.656), 'Larino': (41.800, 14.910), 'Castel di Sangro': (41.784, 14.108),
          'Sangro mouth': (42.230, 14.560), 'Trigno mouth': (42.065, 14.795), 'Biferno mouth': (41.975, 15.030), 'Fortore mouth': (41.920, 15.300), 'Orsogna': (42.218, 14.281),
          'San Severo': (41.689, 15.379), 'Isernia': (41.593, 14.233), 'Benevento': (41.130, 14.782), 'Naples': (40.852, 14.268)}
try:
    f = ImageFont.load_default()
except Exception:
    f = None
for n, ll in places.items():
    h = ll_to_hex(*ll); cx, cy = ctr(h)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], outline=(200, 0, 0), width=2); d.text((cx + 6, cy - 6), n, fill=(120, 0, 0), font=f)
im.save(OUT); print(OUT, im.size)
