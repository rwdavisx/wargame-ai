import sys, json; sys.path.insert(0,'.')
from mappers import *

from PIL import Image

def neighbors(h):
    c,r=int(h[:2]),int(h[2:])
    odd=c%2==1
    # flat-topped, odd columns shifted down
    if odd: d=[(0,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0)]
    else:   d=[(0,-1),(1,-1),(1,0),(0,1),(-1,0),(-1,-1)]
    return [f"{c+dc:02d}{r+dr:02d}" for dc,dr in d]

def shared_edge(M,a,b):
    ca=M.corners(a); cb=M.corners(b)
    pairs=[(p,q) for p in ca for q in cb if math.hypot(p[0]-q[0],p[1]-q[1])<6]
    pts=[p for p,_ in pairs]
    return pts[:2] if len(pts)>=2 else None

def edge_stats(outfile):
    cache={}
    res={}
    for h in all_hexes(16,46,0,28):
        for n in neighbors(h):
            if n<=h or not (16<=int(n[:2])<=46 and 0<=int(n[2:])<=28): continue
            o=owner(h) or owner(n)
            if not o: continue
            if o not in cache:
                p,M=mapper(o); cache[o]=(np.asarray(Image.open(p).convert('RGB')).astype(int),M)
            a,M=cache[o]
            e=shared_edge(M,h,n)
            if not e: continue
            (x0,y0),(x1,y1)=e
            L=math.hypot(x1-x0,y1-y0); nx,ny=-(y1-y0)/L,(x1-x0)/L
            vals=[]
            for t in np.linspace(0.12,0.88,24):
                best=0
                for s in range(-7,8,2):
                    x=int(x0+(x1-x0)*t+nx*s); y=int(y0+(y1-y0)*t+ny*s)
                    if 0<=x<a.shape[1] and 0<=y<a.shape[0]:
                        R,G,B=a[y,x]
                        if 18<=B-R<=60 and B<190 and G<170 and G>R+5: best=1
                vals.append(best)
            res[f"{h}-{n}"]=round(sum(vals)/len(vals),2)
    json.dump(res,open(outfile,'w'))
    return res
if __name__=='__main__':
    r=edge_stats('../out/edges_blue.json')
    print(len(r), sum(1 for v in r.values() if v>0.5))
