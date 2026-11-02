"""The game's own VP pace from AI-against-AI campaigns: the median Allied VP at the end of each turn over the runs'
logs (scripts/grand.ts with NOAUTO=1, one log per game, given as arguments). Writes pace_ai.json for build_oob.py."""
import json
import os
import re
import statistics
import sys


def main(paths):
    by_turn = {}
    for p in paths:
        for line in open(p):
            m = re.match(r'T(\d+) VP (-?\d+) ', line)
            if m:
                by_turn.setdefault(int(m.group(1)), []).append(int(m.group(2)))
    med = {t: statistics.median(v) for t, v in sorted(by_turn.items()) if len(v) >= max(2, len(paths) // 2)}
    json.dump({'_note': f'Median Allied VP by turn over {len(paths)} AI-against-AI campaigns (elite against elite).', 'median': med},
              open(f'{os.path.dirname(__file__)}/pace_ai.json', 'w'), indent=0)
    print(med)


if __name__ == '__main__':
    main(sys.argv[1:])
