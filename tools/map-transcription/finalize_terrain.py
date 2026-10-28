import json, sys
sys.path.insert(0,'.')
from grid import all_hexes
auto=json.load(open('../out/terrain_auto.json'))
T={h:v['t'] for h,v in auto.items()}
def exists(h):
    c,r=int(h[:2]),int(h[2:])
    if c%2==0 and r==0: return False      # even columns start at row 01
    if c%2==0 and r==28: return False     # even columns end at row 27 (row 28 = entry boxes)
    if c%2==1 and r==28: return False
    return True
# --- West: Sorrento peninsula + Gulf (photo 1) ---
for h in list(T):
    c,r=int(h[:2]),int(h[2:])
    if c<=21: T[h]='sea'
land_w={'1604':'hill','1703':'hill','1704':'hill','1803':'hill','1804':'hill','1903':'hill','1904':'hill',
        '2004':'hill','2005':'hill','2103':'hill','2104':'mountain','2105':'mountain','2100':'clear','2101':'clear',
        '2119':'hill'}
T.update(land_w)
# --- Coastal hexes along the beaches (land strip, centre falls in water) ---
for h in ['2709','2710','2711','2614','2616','2617','2618']: T[h]='clear'
for h in ['2714','2615']: T[h]='marsh'
# --- North edge half hexes (row 00 odd columns) ---
T.update({'2300':'hill','2500':'clear','2700':'clear','2900':'hill','3100':'mountain','3300':'hill',
          '3500':'hill','3700':'hill','3900':'hill','4100':'hill','4300':'hill','4500':'hill'})
# --- South edge ---
T['3727']='offmap'
for h in ['3527','3927']: T[h]='hill'
T['4127']='clear'; T['4027']='hill'
# remove nonexistent
T={h:t for h,t in T.items() if exists(h)}
for h in all_hexes(16,46,0,27):
    if exists(h) and h not in T: T[h]='sea'
json.dump(T,open('../out/terrain.json','w'),indent=0,sort_keys=True)
from collections import Counter; print(Counter(T.values()))
