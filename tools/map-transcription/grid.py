"""Hex grid calibration helpers for the map photos.

Grid units: flat-topped hexes in vertical columns, hex height (flat-to-flat) = 1.
Column c, row r -> x = c*0.866, y = r + (0.5 if c odd else 0).
Hex labels sit near the top of the hex; LABEL_DY is the label's offset from centre.
"""
import json, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

LABEL_DY = -0.32
SQ = math.sqrt(3) / 2

def grid_xy(hexid, label=False):
    c, r = int(hexid[:2]), int(hexid[2:])
    x = c * SQ
    y = r + (0.5 if c % 2 else 0)
    if label:
        y += LABEL_DY
    return x, y

def fit_h(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    H = vt[-1].reshape(3, 3)
    return H / H[2, 2]

def apply_h(H, x, y):
    p = H @ np.array([x, y, 1.0])
    return p[0] / p[2], p[1] / p[2]

def calib(points):
    """points: {hexid: [px, py]} label pixel positions."""
    src = [grid_xy(h, label=True) for h in points]
    dst = list(points.values())
    H = fit_h(src, dst)
    res = []
    for h, (u, v) in points.items():
        pu, pv = apply_h(H, *grid_xy(h, label=True))
        res.append((h, round(pu - u, 1), round(pv - v, 1)))
    return H, res

def hex_corners(H, hexid):
    x, y = grid_xy(hexid)
    w = 1 / math.sqrt(3)  # circumradius when height = 1
    pts = []
    for k in range(6):
        a = math.radians(60 * k)
        pts.append(apply_h(H, x + w * math.cos(a), y + w * math.sin(a)))
    return pts

def overlay(img_path, H, hexes, out, crop=None, scale=1.0):
    im = Image.open(img_path).convert('RGB')
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    except Exception:
        font = ImageFont.load_default()
    W, Ht = im.size
    for h in hexes:
        cx, cy = apply_h(H, *grid_xy(h))
        if not (-50 < cx < W + 50 and -50 < cy < Ht + 50):
            continue
        d.polygon(hex_corners(H, h), outline=(255, 0, 255))
        d.text((cx - 16, cy + 5), h, fill=(255, 0, 255), font=font)
    if crop:
        im = im.crop(crop)
    if scale != 1.0:
        im = im.resize((int(im.width * scale), int(im.height * scale)))
    im.save(out)

def all_hexes(c0=16, c1=46, r0=0, r1=29):
    return [f"{c:02d}{r:02d}" for c in range(c0, c1 + 1) for r in range(r0, r1 + 1)]

def fit_hw(src, dst, w):
    A = []
    for (x, y), (u, v), wi in zip(src, dst, w):
        s = math.sqrt(wi)
        A.append([s*x, s*y, s, 0, 0, 0, -s*u*x, -s*u*y, -s*u])
        A.append([0, 0, 0, s*x, s*y, s, -s*v*x, -s*v*y, -s*v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    H = vt[-1].reshape(3, 3)
    return H / H[2, 2]

class Mapper:
    """Locally weighted homography: robust to paper curvature in photos."""
    def __init__(self, points, sigma=3.0):
        self.hexes = list(points)
        self.src = [grid_xy(h, label=True) for h in points]
        self.dst = [points[h] for h in points]
        self.sigma = sigma
        self.cache = {}
    def H_at(self, x, y):
        key = (round(x, 1), round(y, 1))
        if key not in self.cache:
            w = [math.exp(-((sx-x)**2 + (sy-y)**2) / (2*self.sigma**2)) + 1e-3 for sx, sy in self.src]
            self.cache[key] = fit_hw(self.src, self.dst, w)
        return self.cache[key]
    def to_px(self, x, y):
        return apply_h(self.H_at(x, y), x, y)
    def center(self, hexid):
        return self.to_px(*grid_xy(hexid))
    def corners(self, hexid):
        x, y = grid_xy(hexid)
        H = self.H_at(x, y)
        w = 1 / math.sqrt(3)
        return [apply_h(H, x + w*math.cos(math.radians(60*k)), y + w*math.sin(math.radians(60*k))) for k in range(6)]
    def residuals(self):
        out = []
        for h, (u, v) in zip(self.hexes, self.dst):
            pu, pv = self.to_px(*grid_xy(h, label=True))
            out.append((h, round(pu-u, 1), round(pv-v, 1)))
        return out

def overlay_m(img_path, M, hexes, out, scale=0.75):
    im = Image.open(img_path).convert('RGB')
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    W, Ht = im.size
    for h in hexes:
        cx, cy = M.center(h)
        if not (-50 < cx < W + 50 and -50 < cy < Ht + 50):
            continue
        d.polygon(M.corners(h), outline=(255, 0, 255))
        d.text((cx - 16, cy + 5), h, fill=(255, 0, 255), font=font)
    im = im.resize((int(im.width * scale), int(im.height * scale)))
    im.save(out)
