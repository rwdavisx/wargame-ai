"""Ground for the painter beyond the grand map's playable hexes (map.json meta.backdrop): every hex inside the map's
frame, and a few rows round it, that the map does not have, as clear, hill or sea from the same elevation data and
rules as the Adriatic extension (extend.py). The painter lays the landscape on to the frame from these; they are not
part of the game. Run after merge.py."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from geo import Dem, hex_xy, plane_to_ll  # noqa: E402
from calibrate import OFFS, hex_stats  # noqa: E402

HERE = os.path.dirname(__file__)
ROOT = __file__.rsplit('/tools/', 1)[0]
PAD = 3


def main():
    dem = Dem(10)
    cal = json.load(open(f'{HERE}/calibration.json'))
    hill_t = cal['report']['p90p10']['threshold']
    path = f'{ROOT}/data/grand43/map.json'
    m = json.load(open(path))
    cols = [int(h[:2]) for h in m['hexes']]
    rows = [int(h[2:]) for h in m['hexes']]
    out = {}
    for c in range(max(0, min(cols) - PAD), max(cols) + PAD + 1):
        for r in range(max(0, min(rows) - PAD), max(rows) + PAD + 1):
            h = f'{c:02d}{r:02d}'
            if h in m['hexes']:
                continue
            x, y = hex_xy(c, r)
            zs = [dem.at(*plane_to_ll(x + dx, y + dy)) for dx, dy in OFFS]
            if sum(1 for z in zs if z <= 0.5) / len(zs) > 0.5:
                out[h] = 's'
            else:
                out[h] = 'h' if hex_stats(dem, c, r)['p90p10'] > hill_t else 'c'
    m['meta']['backdrop'] = ''.join(f'{h}{t}' for h, t in sorted(out.items()))
    json.dump(m, open(path, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(out)} backdrop hexes: {sum(1 for t in out.values() if t == "s")} sea, {sum(1 for t in out.values() if t == "h")} hill')


if __name__ == '__main__':
    main()
