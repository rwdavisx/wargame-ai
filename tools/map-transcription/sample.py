import sys, json; sys.path.insert(0,'.')
from mappers import *
from PIL import Image
def _unused(h):
    c,r=int(h[:2]),int(h[2:])
    if c<=21 and r<=12: return '1'
    if 22<=c<=34 and r<=13: return '2'
    if c>=35 and r<=13: return '3'
    if 22<=c<=34 and r>=14: return '5'
    if c>=35 and r>=14: return '6'
    return None
if __name__=="__main__":
  out={}
  cache={}
  for h in all_hexes(16,46,0,28):
      o=owner(h)
      if not o: continue
      if o not in cache:
          p,M=mapper(o); cache[o]=(np.asarray(Image.open(p).convert('RGB')).astype(float),M)
      a,M=cache[o]
      cx,cy=M.center(h)
      if not (0<=cx<a.shape[1] and 0<=cy<a.shape[0]): continue
      # hex radius in px
      c0=M.corners(h); rad=min(math.hypot(x-cx,y-cy) for x,y in c0)*0.8
      ys,xs=np.mgrid[int(cy-rad):int(cy+rad),int(cx-rad):int(cx+rad)]
      m=((xs-cx)**2+(ys-cy)**2<rad*rad)&(xs>=0)&(ys>=0)&(xs<a.shape[1])&(ys<a.shape[0])
      px=a[ys[m],xs[m]]
      out[h]={'photo':o,'px':px.tolist() if False else None,'med':np.median(px,axis=0).round().tolist(),
              'center':[round(cx),round(cy)],'rad':round(rad)}
      # store sampled pixels compactly for later classification
      np.save(f'../out/px_{h}.npy',px.astype(np.uint8)[::3])
  json.dump(out,open('../out/samples.json','w'))
  print(len(out))
