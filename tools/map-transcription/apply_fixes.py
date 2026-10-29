"""Apply a list of map corrections to data/map.json.

Usage: python3 apply_fixes.py FIXES_TXT [FIXES_TXT ...]

One correction per line ('#' starts a comment; keep the evidence there):
  river+ A-B / river- A-B                 add or remove a river hexside
  minor+ A-B / major+ A-B / road- A-B     set or remove the road across a hexside
  mountain+ A-B / mountain- A-B           add or remove a mountain hexside
  pass+ A-B / pass- A-B                   add or remove a mountain pass
  terrain HEX TYPE                        set a hex's terrain
  town HEX NAME / untown HEX              set or remove a town
  landmark HEX NAME                       a named landmark (no effect on play); removes any town
  vp HEX N                                set the VP value (0 removes it)
  sector8+ HEX / sector8- HEX             put a hex in, or take it out of, the 8th Army sector
Every operation is idempotent, so the files can be re-applied.
"""
import sys, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, '../../data/map.json')


def neighbors(h):
    c, r = int(h[:2]), int(h[2:])
    d = [(0, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)] if c % 2 else [(0, -1), (1, -1), (1, 0), (0, 1), (-1, 0), (-1, -1)]
    return [f"{c + dc:02d}{r + dr:02d}" for dc, dr in d]


def main(files):
    m = json.load(open(P))
    HX, SD = m['hexes'], m['hexsides']
    n = 0
    for fn in files:
        for line in open(fn):
            f = line.split('#')[0].split()
            if not f:
                continue
            op = f[0]
            n += 1
            if op in ('river+', 'river-', 'minor+', 'major+', 'road-', 'mountain+', 'mountain-', 'pass+', 'pass-'):
                a, b = f[1].split('-')
                assert b in neighbors(a), f'{a}-{b} are not adjacent'
                assert a in HX and b in HX, f[1]
                k = f'{a}-{b}' if a < b else f'{b}-{a}'
                s = SD.setdefault(k, {})
                kind, sign = op[:-1], op[-1]
                if kind in ('minor', 'major'):
                    s['road'] = kind
                elif kind == 'road':
                    s.pop('road', None)
                elif sign == '+':
                    s[kind] = True
                else:
                    s.pop(kind, None)
            elif op == 'terrain':
                HX[f[1]]['terrain'] = f[2]
            elif op == 'town':
                HX[f[1]]['town'] = ' '.join(f[2:])
                HX[f[1]].pop('landmark', None)
            elif op == 'untown':
                HX[f[1]].pop('town', None)
            elif op == 'landmark':
                HX[f[1]].pop('town', None)
                HX[f[1]]['landmark'] = ' '.join(f[2:])
            elif op in ('sector8+', 'sector8-'):
                if op[-1] == '+':
                    HX[f[1]]['sector8'] = True
                else:
                    HX[f[1]].pop('sector8', None)
            elif op == 'vp':
                v = int(f[2])
                if v:
                    HX[f[1]]['vp'] = v
                else:
                    HX[f[1]].pop('vp', None)
            else:
                raise SystemExit('unknown fix: ' + line)
    m['hexsides'] = {k: v for k, v in sorted(SD.items()) if v}
    json.dump(m, open(P, 'w'), indent=1, sort_keys=True)
    print('applied', n, 'corrections')


if __name__ == '__main__':
    main(sys.argv[1:])
