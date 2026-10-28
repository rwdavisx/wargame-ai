import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
crop = tuple(map(int, sys.argv[3].split(','))) if len(sys.argv) > 3 else None
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.75
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
for x in range(0, im.width, 50):
    d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if x % 100 == 0 else (255, 160, 160), width=1)
for y in range(0, im.height, 50):
    d.line([(0, y), (im.width, y)], fill=(255, 0, 0) if y % 100 == 0 else (255, 160, 160), width=1)
for x in range(0, im.width, 100):
    for y in range(0, im.height, 200):
        d.text((x + 2, y + 2), f"{x},{y}", fill=(200, 0, 0), font=font)
if crop:
    im = im.crop(crop)
im = im.resize((int(im.width * scale), int(im.height * scale)))
im.save(out)
