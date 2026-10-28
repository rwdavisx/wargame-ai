import sys, json, glob, os; sys.path.insert(0,'.')
import numpy as np
d=json.load(open('../out/samples.json'))
res={}
for h,v in d.items():
    px=np.load(f'../out/px_{h}.npy').astype(float)
    R,G,B=px[:,0],px[:,1],px[:,2]; L=px.mean(1)
    sea=((B>R+35)&(B>140))|((B>R+22)&(G>R+12)&(L>120))
    purple=(R>G+8)&(B>G+5)&~sea            # off-map brownish-mauve boxes
    green=(G>R+25)&(G>B+25)
    red=(R>G+70)&(R>B+70)
    dark=L<55
    sat=R-B
    mth=100 if v['photo']=='1' else 118
    clear=(sat<15)&(L>130)&~sea&~purple
    mtn=(sat>=15)&(L<mth)&~dark&~sea
    hill=~(sea|purple|green|red|dark|clear|mtn)
    n=len(px)
    f={k:float(x.sum())/n for k,x in dict(sea=sea,purple=purple,green=green,red=red,clear=clear,hill=hill,mtn=mtn).items()}
    land=f['clear']+f['hill']+f['mtn']
    if f['sea']>0.55: t='sea'
    elif f['purple']+f['green']+f['red']>0.5: t='offmap'
    elif land<0.25: t='sea'
    else:
        lf={k:f[k]/land for k in ('clear','hill','mtn')}
        if lf['mtn']>0.45: t='mountain'
        elif lf['clear']>0.5: t='clear'
        else: t='hill'
    res[h]={'t':t,'f':{k:round(x,2) for k,x in f.items()}}
json.dump(res,open('../out/terrain_auto.json','w'),indent=0)
from collections import Counter
print(Counter(r['t'] for r in res.values()))
