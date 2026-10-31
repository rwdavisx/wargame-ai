"""How much of each coastal hex does the painted map show as the other element (land hex painted as sea, sea hex
painted as land)? Uses only our own render, whose sea colour is unambiguous.
Usage: python3 tools/map-art/coast_paint.py <game> <folder with terrain-dump output>"""
import json
import os
import sys
import numpy as np
from PIL import Image
GAME = sys.argv[1]
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCR = sys.argv[2] if len(sys.argv) > 2 else '.'
EVEN_DOWN = GAME == 'italy43'
m = json.load(open(f'{REPO}/data/{GAME}/map.json'))
H = m['hexes']
def nb(h):
    c, r = int(h[:2]), int(h[2:])
    down = (c % 2 == 0) if EVEN_DOWN else (c % 2 == 1)
    d = [(0, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)] if down else [(0, -1), (1, -1), (1, 0), (0, 1), (-1, 0), (-1, -1)]
    return [f'{c + dc:02d}{r + dr:02d}' for dc, dr in d]
def centre(h):
    c, r = int(h[:2]), int(h[2:])
    shifted = (c % 2 == 0) if EVEN_DOWN else (c % 2 == 1)
    return 45 * c, 30 * 3 ** 0.5 * (r + (0.5 if shifted else 0))
img = np.asarray(Image.open(f'{SCR}/{GAME}.png').convert('RGB')).astype(int)
meta = json.load(open(f'{SCR}/{GAME}.json')); B, S = meta['bounds'], meta['scale']
def sea_at(x, y):
    px, py = int((x - B['x']) * S), int((y - B['y']) * S)
    r, g, b = img[py, px]
    return b - r > 30
offs = [(dx, dy) for dx in np.linspace(-24, 24, 9) for dy in np.linspace(-22, 22, 9) if abs(dy) + abs(dx) * 0.58 < 26]
core = [(dx, dy) for dx, dy in offs if dx * dx + dy * dy <= 13 * 13]
rows = []
for h, v in H.items():
    if not any(n in H and (H[n]['terrain'] == 'sea') != (v['terrain'] == 'sea') for n in nb(h)):
        continue
    land = v['terrain'] != 'sea'
    cx, cy = centre(h)
    wrong = sum(1 for dx, dy in offs if sea_at(cx + dx, cy + dy) == land)
    wcore = sum(1 for dx, dy in core if sea_at(cx + dx, cy + dy) == land)
    rows.append((h, v['terrain'], wrong / len(offs), wcore / len(core), v.get('town') or v.get('city') or ''))
land_rows = [r for r in rows if r[1] != 'sea']
print(f'{GAME}: {len(land_rows)} coastal land hexes; mean share painted as sea {np.mean([r[2] for r in land_rows]):.0%}; '
      f'hexes whose middle is painted sea: {[r[0] for r in land_rows if r[3] > 0.3]}')
print('land hexes most painted as sea:', [(r[0], r[4], f'{r[2]:.0%}', f'core {r[3]:.0%}') for r in sorted(land_rows, key=lambda r: -r[2])[:14]])
sea_rows = [r for r in rows if r[1] == 'sea']
print('sea hexes most painted as land:', [(r[0], f'{r[2]:.0%}', f'core {r[3]:.0%}') for r in sorted(sea_rows, key=lambda r: -r[2])[:8]])
