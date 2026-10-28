import sys, json; sys.path.insert(0,'.')
from mappers import *
from PIL import Image, ImageDraw, ImageFont
key=sys.argv[1]; out=sys.argv[2]; crop=tuple(map(int,sys.argv[3].split(','))); sc=float(sys.argv[4]) if len(sys.argv)>4 else 1.0
p,M=mapper(key)
im=Image.open(p).convert('RGB'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',16)
for h in all_hexes(16,46,0,28):
    cx,cy=M.center(h)
    if not(crop[0]-80<cx<crop[2]+80 and crop[1]-80<cy<crop[3]+80): continue
    d.polygon(M.corners(h),outline=(255,0,255))
    d.text((cx-20,cy+18),h,fill=(255,0,255),font=font,stroke_width=1,stroke_fill=(255,255,255))
im=im.crop(crop); im=im.resize((int(im.width*sc),int(im.height*sc))); im.save(out)
