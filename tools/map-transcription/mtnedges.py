import sys, json; sys.path.insert(0,'.')
from hexsides import *
T=json.load(open('../out/terrain.json'))
LAND={'clear','hill','mountain','marsh'}
cache={}; res={}
for h in all_hexes(16,46,0,27):
    if T.get(h) not in LAND: continue
    for n in neighbors(h):
        if n<=h or T.get(n) not in LAND: continue
        o=owner(h) or owner(n)
        if o not in cache:
            p,M=mapper(o); cache[o]=(np.asarray(Image.open(p).convert('RGB')).astype(int),M)
        a,M=cache[o]
        e=shared_edge(M,h,n)
        if not e: continue
        (x0,y0),(x1,y1)=e
        L=math.hypot(x1-x0,y1-y0); nx,ny=-(y1-y0)/L,(x1-x0)/L
        mth=100 if o=='1' else 118
        cnt=0; tot=0
        for t in np.linspace(0.1,0.9,17):
            for s in (-10,-5,0,5,10):
                x=int(x0+(x1-x0)*t+nx*s); y=int(y0+(y1-y0)*t+ny*s)
                if 0<=x<a.shape[1] and 0<=y<a.shape[0]:
                    R,G,B=a[y,x]; Lm=(R+G+B)/3
                    tot+=1
                    if R-B>=15 and 55<=Lm<mth: cnt+=1
        res[f"{h}-{n}"]=round(cnt/max(tot,1),2)
json.dump(res,open('../out/edges_dark.json','w'))
print(sum(1 for v in res.values() if v>=0.5), len(res))
