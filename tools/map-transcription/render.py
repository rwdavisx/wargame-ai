import sys, json, math; sys.path.insert(0,'.')
from PIL import Image, ImageDraw, ImageFont
from grid import grid_xy
t=json.load(open(sys.argv[1]))
S=40
col={'sea':(120,180,225),'clear':(235,235,225),'hill':(190,170,120),'mountain':(115,100,70),'offmap':(150,110,150),'marsh':(160,200,160)}
im=Image.new('RGB',(int(47*0.866*S)+40,int(30*S)+40),'white'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',9)
for h,v in t.items():
    tt=v['t'] if isinstance(v,dict) else v
    x,y=grid_xy(h); x=(x-15*0.866)*S+20; y=y*S+20
    w=S/math.sqrt(3)
    d.polygon([(x+w*math.cos(math.radians(60*k)),y+w*math.sin(math.radians(60*k))) for k in range(6)],fill=col.get(tt,(255,0,0)),outline=(80,80,80))
    d.text((x-11,y-14),h,fill=(0,0,0),font=font)
im.save(sys.argv[2])
