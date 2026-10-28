import sys, json; sys.path.insert(0,'.')
from mappers import *
from PIL import Image, ImageDraw, ImageFont
key=sys.argv[1]; t=json.load(open(sys.argv[2])); out=sys.argv[3]
crop=tuple(map(int,sys.argv[4].split(','))) if len(sys.argv)>4 else None
p,M=mapper(key)
im=Image.open(p).convert('RGB'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
col={'sea':(0,90,255),'clear':(255,255,255),'hill':(255,200,0),'mountain':(255,60,0),'offmap':(200,0,200),'marsh':(0,200,0)}
ab={'sea':'S','clear':'C','hill':'H','mountain':'M','offmap':'X','marsh':'W'}
for h,v in t.items():
    tt=v['t'] if isinstance(v,dict) else v
    cx,cy=M.center(h)
    if not(-20<cx<im.width+20 and -20<cy<im.height+20): continue
    d.polygon(M.corners(h),outline=(255,0,255))
    d.text((cx-8,cy-10),ab.get(tt,'?'),fill=col.get(tt,(255,0,0)),font=font,stroke_width=2,stroke_fill=(0,0,0))
if crop: im=im.crop(crop)
im=im.resize((int(im.width*0.75),int(im.height*0.75))); im.save(out)
