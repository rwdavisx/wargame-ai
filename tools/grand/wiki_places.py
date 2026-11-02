"""Positions of the extension's towns from English Wikipedia (its geodata, or the article's coordinates template when
the geodata has none). Cached in places_cache.json; prints the towns it could not place."""
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(__file__)
CACHE = f'{HERE}/places_cache.json'
UA = {'User-Agent': 'wargame-ai-map-research/1.0 (personal, non-commercial)'}


def api(params):
    url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json'})
    for attempt in range(8):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
        except Exception:
            time.sleep(5 + attempt * 10)
    raise RuntimeError(url)


def dms(parts):
    nums = [float(p) for p in parts if re.fullmatch(r'-?\d+(\.\d+)?', p.strip())]
    hemi = [p.strip() for p in parts if p.strip() in ('N', 'S', 'E', 'W')]
    if len(hemi) == 2:
        i = parts.index(hemi[0]) if hemi[0] in parts else None
        lat_nums = [float(p) for p in parts[:parts.index(hemi[0])] if re.fullmatch(r'-?\d+(\.\d+)?', p.strip())]
        lon_nums = [float(p) for p in parts[parts.index(hemi[0]) + 1:parts.index(hemi[1])] if re.fullmatch(r'-?\d+(\.\d+)?', p.strip())]
        f = lambda v: v[0] + (v[1] / 60 if len(v) > 1 else 0) + (v[2] / 3600 if len(v) > 2 else 0)
        return f(lat_nums), f(lon_nums)
    if len(nums) >= 2:
        return nums[0], nums[1]
    return None


def from_wikitext(title):
    d = api({'action': 'parse', 'page': title, 'prop': 'wikitext', 'redirects': 1})
    text = d.get('parse', {}).get('wikitext', {}).get('*', '')
    m = re.search(r'\{\{\s*[Cc]oord\s*\|([^}]*)\}\}', text)
    if m:
        parts = [p for p in m.group(1).split('|') if '=' not in p]
        return dms(parts)
    return None


def locate(names):
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    todo = [n for n in names if n not in cache]
    for i in range(0, len(todo), 10):
        batch = todo[i:i + 10]
        d = api({'action': 'query', 'redirects': 1, 'prop': 'coordinates', 'titles': '|'.join(batch)})
        q = d.get('query', {})
        back = {}
        for r in q.get('normalized', []) + q.get('redirects', []):
            back[r['to']] = back.get(r['from'], r['from'])
        for p in q.get('pages', {}).values():
            orig = back.get(p['title'], p['title'])
            while orig in back:
                orig = back[orig]
            if 'coordinates' in p:
                cache[orig] = [p['coordinates'][0]['lat'], p['coordinates'][0]['lon']]
            elif 'missing' not in p:
                ll = from_wikitext(p['title'])
                if ll:
                    cache[orig] = list(ll)
        time.sleep(3)
        json.dump(cache, open(CACHE, 'w'), indent=0, ensure_ascii=False)
    json.dump(cache, open(CACHE, 'w'), indent=0, ensure_ascii=False)
    missing = [n for n in names if n not in cache]
    return cache, missing


if __name__ == '__main__':
    import sys
    c, miss = locate(sys.argv[1:])
    print(json.dumps({n: c.get(n) for n in sys.argv[1:]}), 'missing', miss)
