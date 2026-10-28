import sys, json; sys.path.insert(0,'.')
from hexsides import *
T=json.load(open('../out/terrain.json'))
LAND={'clear','hill','mountain','marsh'}
def is_major(p):
    R,G,B=p; L=(R+G+B)/3
    return abs(R-B)<14 and abs(R-G)<12 and 55<=L<=118
def is_minor(p):
    R,G,B=p; L=(R+G+B)/3
    return 12<=R-B<=75 and L>172 and G<=R+3
def runs(flags):
    out=[];start=None
    for i,f in enumerate(flags+[False]):
        if f and start is None: start=i
        if not f and start is not None: out.append((start,i-1)); start=None
    return out
def crossing(a,x0,y0,x1,y1,fn,off):
    L=math.hypot(x1-x0,y1-y0); nx,ny=-(y1-y0)/L,(x1-x0)/L; n=int(L)
    res=[]
    for d in (-off,off):
        flags=[]
        for i in range(n):
            t=0.06+0.88*i/n
            x=int(x0+(x1-x0)*t+nx*d); y=int(y0+(y1-y0)*t+ny*d)
            ok=False
            if 0<=x<a.shape[1] and 0<=y<a.shape[0]:
                # widen 1px across
                ok=fn(a[y,x]) 
            flags.append(ok)
        rr=[(s,e) for s,e in runs(flags) if 2<=e-s+1<=int(0.45*n)]
        res.append([(s+e)/2 for s,e in rr])
    best=None
    for p in res[0]:
        for q in res[1]:
            if abs(p-q)<0.22*n: best=1
    return best is not None
cache={}; out={'major':[], 'minor':[]}
for h in all_hexes(16,46,0,27):
    if T.get(h) not in LAND: continue
    for nb in neighbors(h):
        if nb<=h or T.get(nb) not in LAND: continue
        o=owner(h) or owner(nb)
        if o not in cache:
            p,M=mapper(o); cache[o]=(np.asarray(Image.open(p).convert('RGB')).astype(int),M)
        a,M=cache[o]
        e=shared_edge(M,h,nb)
        if not e: continue
        (x0,y0),(x1,y1)=e
        if crossing(a,x0,y0,x1,y1,is_major,10): out['major'].append(f'{h}-{nb}')
        elif crossing(a,x0,y0,x1,y1,is_minor,10): out['minor'].append(f'{h}-{nb}')
json.dump(out,open('../out/roads_auto.json','w'))
print(len(out['major']),len(out['minor']))
