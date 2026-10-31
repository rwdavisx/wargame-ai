// Paints the map as a picture in the manner of the printed maps: pale lowland with a muted field patchwork,
// khaki hill country with a pale rim where it meets the plain, airbrushed umber mountain masses, sage marsh with
// reeds, beaches, a sea that deepens away from the coast, woods and village rooftops. Everything is derived from
// map.json, so edits made in the map editor show up after a re-render. Every field is read through the organic
// warp (noise.ts), so edges wander across the hex lines as a map artist would draw them, while each hex keeps its
// own terrain at its middle. Crisp line work (rivers, roads, labels) is drawn on top in SVG, bent by the same warp.
import { GAME_ID, MAP } from '../../engine/data';
import { distance, hexId, neighbors, parseHex, sideKey } from '../../engine/hex';
import type { HexData } from '../../engine/types';
import { center, corners, edge, mapBounds, rng, type Bounds } from './geom';
import { fbm, hash, vnoise, warp } from './noise';

/** The painted map, kept as pixels in memory rather than as a URL: sandboxed hosts and app web views
 * may block blob: or data: images, but drawing one canvas onto another always works. */
export interface TerrainImage {
  image: HTMLCanvasElement | ImageBitmap;
  /** About 1600 px wide, for menu backdrops. */
  medium: HTMLCanvasElement;
  /** About 480 px wide, for the minimap. */
  small: HTMLCanvasElement;
  bounds: Bounds;
}

/** Final pixels per map unit: a little less on phones, which have less memory for large images. */
const SCALE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2;

type Rgb = [number, number, number];

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ fields

function rasterize(b: Bounds, draw: (ctx: CanvasRenderingContext2D) => void): Float32Array {
  const c = makeCanvas(b.w, b.h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(-b.x, -b.y);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  draw(ctx);
  const data = ctx.getImageData(0, 0, b.w, b.h).data;
  const out = new Float32Array(b.w * b.h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255;
  return out;
}

function hexPath(ctx: CanvasRenderingContext2D, h: string, grow = 0.6) {
  const pts = corners(h, 30 + grow);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Three box blurs approximate a Gaussian. */
function blur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const a = Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius / 1.7));
  for (let pass = 0; pass < 3; pass++) {
    boxH(a, tmp, w, h, r);
    boxV(tmp, a, w, h, r);
  }
  return a;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const n = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / n;
      acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Farmland on the plains, muted toward the printed map's pale lowland: wheat, stubble, pasture, orchards.
const FIELDS: Rgb[] = [
  [204, 204, 176], [212, 208, 180], [196, 200, 168], [208, 204, 172], [190, 198, 164], [200, 200, 174], [196, 204, 174], [216, 212, 188],
];

// ------------------------------------------------------------------ main

const RENDER_VERSION = 6;

function mapHash(): string {
  const s = JSON.stringify([RENDER_VERSION, SCALE, MAP.hexes, MAP.hexsides]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${GAME_ID}:${(h >>> 0).toString(36)}`;
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const req = indexedDB.open('s43-terrain', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('img');
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

async function cacheGet(key: string): Promise<{ blob: Blob } | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const r = db.transaction('img').objectStore('img').get(key);
      r.onsuccess = () => res((r.result as { blob: Blob }) ?? null);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

async function cachePut(key: string, value: { blob: Blob }): Promise<void> {
  const db = await idb();
  if (!db) return;
  try {
    // One painted map per game: replace this game's older pictures, keep the other games'.
    const tx = db.transaction('img', 'readwrite');
    const store = tx.objectStore('img');
    const game = key.split(':')[0];
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const k of keys.result) if (String(k).split(':')[0] === game || !String(k).includes(':')) store.delete(k);
      store.put(value, key);
    };
  } catch {
    /* storage unavailable */
  }
}

/** A scaled copy, for the minimap and the menu backdrops. */
function copyAt(src: CanvasImageSource, w: number, h: number, width: number): HTMLCanvasElement {
  const c = makeCanvas(width, Math.round((width * h) / w));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function finish(image: HTMLCanvasElement | ImageBitmap, bounds: Bounds): TerrainImage {
  return { image, bounds, medium: copyAt(image, image.width, image.height, 1600), small: copyAt(image, image.width, image.height, 480) };
}

/** The painted map, from the browser cache when the map has not changed. */
export async function renderTerrain(onProgress?: (fraction: number, label: string) => void): Promise<TerrainImage> {
  const key = mapHash();
  const cached = await cacheGet(key);
  if (cached && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(cached.blob);
      onProgress?.(1, 'Ready');
      return finish(bmp, mapBounds(90));
    } catch {
      /* unreadable cache entry: paint again */
    }
  }
  const result = await paintTerrain(onProgress);
  // Cache a compressed copy so the next start is instant; skip quietly if the browser cannot.
  try {
    const blob = await new Promise<Blob | null>((res) => result.canvas.toBlob(res, 'image/jpeg', 0.9));
    if (blob) await cachePut(key, { blob });
  } catch {
    /* no cache */
  }
  return finish(result.canvas, result.bounds);
}

async function paintTerrain(onProgress?: (fraction: number, label: string) => void): Promise<{ canvas: HTMLCanvasElement; bounds: Bounds }> {
  const report = async (f: number, label: string) => {
    onProgress?.(f, label);
    await tick();
  };
  const b = mapBounds(90);
  const W = b.w;
  const H = b.h;
  const hexes = Object.entries(MAP.hexes);
  // Hexes just beyond the map edge borrow the terrain of the nearest map hex, so the land runs on past the frame.
  const real = Object.keys(MAP.hexes);
  const edgeHexes = real.filter((h) => neighbors(h).some((n) => !MAP.hexes[n]));
  const extended: [string, HexData][] = [...hexes];
  const cols = real.map((h) => parseHex(h).c);
  const rows = real.map((h) => parseHex(h).r);
  for (let c = Math.max(0, Math.min(...cols) - 3); c <= Math.max(...cols) + 3; c++) {
    for (let r = Math.max(0, Math.min(...rows) - 3); r <= Math.max(...rows) + 3; r++) {
      const id = hexId(c, r);
      if (MAP.hexes[id]) continue;
      let best = edgeHexes[0];
      let bd = Infinity;
      for (const e of edgeHexes) {
        const d = distance(id, e);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (bd <= 4) extended.push([id, { terrain: MAP.hexes[best].terrain }]);
    }
  }
  await report(0.02, 'Surveying the coast');

  // Land is laid down a little fuller than its hexes, so the wandering coastline spends its wander in the sea
  // hexes rather than eating into the land ones (a narrow strip like the Sorrento peninsula keeps its coast).
  const land0 = rasterize(b, (ctx) => {
    for (const [h, d] of extended) if (d.terrain !== 'sea') (hexPath(ctx, h, 6), ctx.fill());
  });
  // The middle of every land hex, which is never painted as sea.
  const landCore0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) if (d.terrain !== 'sea') (hexPath(ctx, h, -8), ctx.fill());
  });
  const inside0 = rasterize(b, (ctx) => {
    for (const [h] of hexes) (hexPath(ctx, h, 1), ctx.fill());
  });
  const hill0 = rasterize(b, (ctx) => {
    for (const [h, d] of extended) if (d.terrain === 'hill') (hexPath(ctx, h, 1), ctx.fill());
  });
  const marsh0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) if (d.terrain === 'marsh') (hexPath(ctx, h, -4), ctx.fill());
  });
  const town0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) {
      if (!d.city && !d.town) continue;
      const [x, y] = center(h);
      ctx.beginPath();
      ctx.arc(x, y, d.city ? 15 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const ridge0 = rasterize(b, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Each mountain hexside lays down a mass of its own: a stroke of varying weight along it and a blob or two
    // beside it, so the ranges come out as irregular masses rather than ruled lines.
    const r = rng('massif');
    for (const [k, s] of Object.entries(MAP.hexsides)) {
      if (!s.mountain) continue;
      const [a, c] = k.split('-');
      const e = edge(a, c);
      if (!e) continue;
      ctx.lineWidth = 9 + r() * 15;
      ctx.beginPath();
      ctx.moveTo(e[0][0], e[0][1]);
      ctx.lineTo(e[1][0], e[1][1]);
      ctx.stroke();
      for (let k2 = r() < 0.55 ? 2 : 1; k2 > 0; k2--) {
        const t = 0.15 + r() * 0.7;
        const mx = e[0][0] + (e[1][0] - e[0][0]) * t + (r() - 0.5) * 14;
        const my = e[0][1] + (e[1][1] - e[0][1]) * t + (r() - 0.5) * 14;
        ctx.beginPath();
        ctx.arc(mx, my, 6 + r() * 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Full mountain hexes: every land side is a mountain hexside (2.2.2).
    for (const [h, d] of hexes) {
      if (d.terrain === 'sea') continue;
      const ns = neighbors(h).filter((n) => MAP.hexes[n] && MAP.hexes[n].terrain !== 'sea');
      if (d.fullMountain || (ns.length && ns.every((n) => MAP.hexsides[sideKey(h, n)]?.mountain))) (hexPath(ctx, h, -3), ctx.fill());
    }
  });
  await report(0.15, 'Measuring the heights');

  const landB = blur(land0, W, H, 11);
  const landCore = blur(landCore0, W, H, 4);
  const landNear = blur(land0, W, H, 10);
  const landWide = blur(land0, W, H, 60);
  const inside = blur(inside0, W, H, 18);
  const hill = blur(hill0, W, H, 13);
  const marsh = blur(marsh0, W, H, 10);
  const ridge = blur(ridge0, W, H, 10);
  const town = blur(town0, W, H, 3);
  await report(0.3, 'Raising the mountains');

  // Every field is read through the organic warp: the pixel at p shows what belongs at about p - (warp(p) - p),
  // which bends the edges of hills, mountains, marsh and coast across the hex lines the same way the rivers and
  // roads are bent.
  const sample = (f: Float32Array, x: number, y: number): number => {
    const fx = clamp(x, 0, W - 1.001);
    const fy = clamp(y, 0, H - 1.001);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * W + ix;
    return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + W] * (1 - tx) + f[i + W + 1] * tx) * ty;
  };
  // The warp is smooth, so it is computed on a coarse grid and interpolated.
  const G = 4;
  const gw = Math.ceil(W / G) + 2;
  const gh = Math.ceil(H / G) + 2;
  const wdx = new Float32Array(gw * gh);
  const wdy = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const [qx, qy] = warp(b.x + gx * G, b.y + gy * G);
      wdx[gy * gw + gx] = qx - (b.x + gx * G);
      wdy[gy * gw + gx] = qy - (b.y + gy * G);
    }
  }
  /** The warp's displacement at pixel (x, y), times `amount`. */
  const shift = (x: number, y: number, amount: number): [number, number] => {
    const fx = x / G;
    const fy = y / G;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * gw + ix;
    const lerp = (f: Float32Array) => (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + gw] * (1 - tx) + f[i + gw + 1] * tx) * ty;
    return [lerp(wdx) * amount, lerp(wdy) * amount];
  };
  const height = new Float32Array(W * H);
  const landF = new Float32Array(W * H);
  const coast = new Float32Array(W * H);
  const hillW = new Float32Array(W * H);
  const hillRim = new Float32Array(W * H);
  const mtnW = new Float32Array(W * H);
  const mtnCore = new Float32Array(W * H);
  const marshW = new Float32Array(W * H);
  const nearW = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + b.x;
      const wy = y + b.y;
      const [ddx, ddy] = shift(x, y, 1.25);
      const sx = x - ddx;
      const sy = y - ddy;
      const n = fbm(wx / 60, wy / 60, 1, 4);
      const n2 = fbm(wx / 22, wy / 22, 7, 2);
      // The coast takes a gentler share of the warp than the inland edges, and never reaches a land hex's middle.
      const [cdx, cdy] = shift(x, y, 0.7);
      const cv = Math.max(sample(landB, x - cdx, y - cdy) + (n - 0.5) * 0.42, landCore[i] * 0.85);
      coast[i] = cv;
      const l = smooth(0.4, 0.6, cv);
      landF[i] = l;
      nearW[i] = sample(landNear, sx, sy);
      // Hill country: an edge that wanders, and a pale rim on the plain side where it meets the lowland.
      // (The noise is only worked out where it can change the outcome: near an edge, or inside the feature.)
      const hraw = sample(hill, sx, sy);
      const hv = hraw < 0.18 || hraw > 0.8 ? hraw : hraw + (fbm(wx / 42, wy / 42, 63, 3) - 0.5) * 0.36;
      hillW[i] = smooth(0.42, 0.56, hv);
      hillRim[i] = smooth(0.35, 0.43, hv) * (1 - smooth(0.43, 0.48, hv));
      // Mountains: irregular airbrushed masses with a darker core that comes and goes.
      const mraw = sample(ridge, sx, sy);
      const mv = mraw < 0.02 ? mraw : mraw + (fbm(wx / 26, wy / 26, 61, 3) - 0.5) * 0.44;
      mtnW[i] = smooth(0.25, 0.38, mv);
      mtnCore[i] = mtnW[i] > 0 ? smooth(0.42, 0.95, mv + (fbm(wx / 13, wy / 13, 67, 2) - 0.5) * 0.3) : 0;
      const kraw = sample(marsh, sx, sy);
      marshW[i] = kraw < 0.02 ? 0 : smooth(0.3, 0.62, kraw + (fbm(wx / 30, wy / 30, 69, 3) - 0.5) * 0.55);
      const roll = hillW[i] > 0 ? fbm(wx / 34, wy / 34, 13, 3) : 0.5;
      const crag = mv > 0.02 ? fbm(wx / 8, wy / 8, 17, 3) : 0.5;
      height[i] = l * (0.05 + hillW[i] * (0.08 + 0.14 * roll) + clamp(mv) * (0.34 + 0.4 * n + 0.2 * crag * mtnW[i]) + (n2 - 0.5) * 0.03 - marshW[i] * 0.04);
    }
    if (y % 200 === 0) await report(0.3 + (0.25 * y) / H, 'Raising the mountains');
  }

  const img = new ImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + b.x;
      const wy = y + b.y;
      const l = landF[i];
      let c: Rgb = [0, 0, 0];
      if (l < 0.999) {
        // Sea: the printed map's light blue near the shore, deepening offshore, with a broken surf line.
        const depth = smooth(0.0, 0.85, 1 - landWide[i]);
        c = mix([136, 184, 208], [58, 108, 156], depth);
        const wave = vnoise(wx / 9, wy / 26, 5) * 0.6 + vnoise(wx / 40, wy / 90, 6) * 0.4;
        c = mix(c, [c[0] * 1.1, c[1] * 1.08, c[2] * 1.05], wave * 0.6);
        const foam = smooth(0.32, 0.4, coast[i]) * (1 - smooth(0.4, 0.45, coast[i])) * (0.5 + 0.5 * wave);
        c = mix(c, [236, 242, 238], foam * 0.75);
      }
      if (l > 0.001) {
        const n = vnoise(wx / 28, wy / 28, 3) * 0.6 + vnoise(wx / 7, wy / 7, 4) * 0.4;
        const gx = height[Math.min(i + 1, W * H - 1)] - height[Math.max(i - 1, 0)];
        const gy = height[Math.min(i + W, W * H - 1)] - height[Math.max(i - W, 0)];
        const shade = clamp(1 + (gx + gy) * 9, 0.64, 1.16);
        const wMtn = mtnW[i];
        const wHill = hillW[i] * (1 - wMtn);
        const wMarsh = marshW[i] * (1 - wMtn);
        const wFarm = (1 - wHill) * (1 - wMtn) * (1 - wMarsh);
        let col: Rgb = [204, 204, 176];
        if (wFarm > 0.02) {
          // A muted patchwork of strip fields; each estate (a block of land) has its own orientation and the
          // blocks are warped too, so the field pattern does not line up with the hexes either.
          const [fdx, fdy] = shift(x, y, 2.2);
          const qx = wx + fdx;
          const qy = wy + fdy;
          const ex = Math.floor(qx / 170);
          const ey = Math.floor(qy / 170);
          const ang = (hash(ex, ey, 21) - 0.5) * 1.6;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const ox = qx - ex * 170;
          const oy = qy - ey * 170;
          const u = ox * ca + oy * sa + ex * 37;
          const v = -ox * sa + oy * ca + ey * 53;
          const row = Math.floor(v / 10);
          const uu = u + hash(row, 0, 31) * 40;
          const width = 18 + hash(row, 1, 32) * 16;
          const colIdx = Math.floor(uu / width);
          const fu = uu / width - colIdx;
          const fv = v / 10 - row;
          let farm = FIELDS[Math.floor(hash(colIdx, row, 13) * FIELDS.length)];
          farm = mix(farm, [farm[0] * 0.93, farm[1] * 0.95, farm[2] * 0.9], n);
          const hedge = Math.max(1 - smooth(0.0, 0.07, Math.min(fu, 1 - fu)), 1 - smooth(0.0, 0.12, Math.min(fv, 1 - fv)));
          farm = mix(farm, [160, 164, 128], hedge * 0.3);
          col = farm;
        }
        // Hills in the printed map's khaki; mountains in umber, darker in their cores and craggy at close range.
        const hillCol = mix([156, 144, 104], [138, 126, 90], n);
        const crag = vnoise(wx / 5, wy / 5, 19);
        let mtnCol = mix([124, 110, 82], [86, 74, 54], mtnCore[i]);
        mtnCol = mix(mtnCol, [mtnCol[0] * 0.88, mtnCol[1] * 0.88, mtnCol[2] * 0.88], crag * 0.35);
        // Marsh: sage with clumps of reeds and short dark dashes, as printed.
        let marshCol: Rgb = mix([158, 172, 150], [140, 158, 138], n);
        if (vnoise(wx / 3.4, wy / 3.4, 71) > 0.8) marshCol = [92, 132, 120];
        else if (((wy / 5) % 1) < 0.16 && vnoise(wx / 6, wy / 2, 73) > 0.62) marshCol = [112, 122, 100];
        col = mix(col, hillCol, wHill);
        col = mix(col, marshCol, wMarsh);
        col = mix(col, mtnCol, wMtn);
        // The pale rim where hill country meets the plain.
        col = mix(col, [226, 224, 204], hillRim[i] * (1 - wMtn) * 0.6);
        // Beaches on the low coast, wider in some bays than others.
        const sand = 0.12 + 0.2 * vnoise(wx / 55, wy / 55, 79);
        const beach = smooth(sand, 0.52, 1 - nearW[i]) * (1 - hillW[i]) * (1 - wMtn);
        col = mix(col, [226, 212, 172], beach);
        // Built-up ground around towns.
        col = mix(col, [188, 176, 152], town[i] * 0.7);
        col = [col[0] * shade, col[1] * shade, col[2] * shade];
        c = mix(c, col, l);
      }
      // Beyond the map edge: dimmed and desaturated.
      const inMap = smooth(0.15, 0.85, inside[i]);
      if (inMap < 1) {
        const g = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.3;
        c = mix([g + 8, g + 11, g + 14], c, inMap);
      }
      const o = i * 4;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
    if (y % 150 === 0) await report(0.55 + (0.25 * y) / H, 'Painting the fields');
  }
  const base = makeCanvas(W, H);
  base.getContext('2d')!.putImageData(img, 0, 0);

  const out = makeCanvas(W * SCALE, H * SCALE);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, W * SCALE, H * SCALE);
  await report(0.82, 'Planting the woods');

  // Fine grain so close zooms do not look smeared.
  const grain = makeCanvas(160, 160);
  const gctx = grain.getContext('2d')!;
  const gimg = gctx.createImageData(160, 160);
  const r0 = rng('grain');
  for (let i = 0; i < gimg.data.length; i += 4) {
    const v = 110 + r0() * 40;
    gimg.data[i] = gimg.data[i + 1] = gimg.data[i + 2] = v;
    gimg.data[i + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = ctx.createPattern(grain, 'repeat')!;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.restore();

  drawTrees(ctx, b, W, landF, hillW, mtnW, marshW, town, height, inside);
  await report(0.9, 'Building the villages');
  drawTowns(ctx, b);
  await report(0.95, 'Printing the map');

  await report(1, 'Ready');
  return { canvas: out, bounds: b };
}

function drawTrees(ctx: CanvasRenderingContext2D, b: Bounds, W: number, land: Float32Array, hill: Float32Array, ridge: Float32Array,
  marsh: Float32Array, town: Float32Array, height: Float32Array, inside: Float32Array) {
  const r = rng('trees');
  const step = 5.5;
  for (let y = b.y + 2; y < b.y + b.h - 2; y += step) {
    for (let x = b.x + 2; x < b.x + b.w - 2; x += step) {
      const tx = x + (r() - 0.5) * step * 1.4;
      const ty = y + (r() - 0.5) * step * 1.4;
      const i = Math.floor(ty - b.y) * W + Math.floor(tx - b.x);
      if (i < 0 || i >= land.length || land[i] < 0.8 || town[i] > 0.15 || marsh[i] > 0.3 || inside[i] < 0.6) continue;
      const high = smooth(0.5, 0.9, height[i]);
      const woods = smooth(0.42, 0.68, vnoise(tx / 45, ty / 45, 41) * 0.7 + vnoise(tx / 12, ty / 12, 42) * 0.3);
      // Woods in the hill country and on the lower slopes of the mountains; only the odd tree on the plain.
      const density = (hill[i] * 0.3 + ridge[i] * 0.14 * (1 - high)) * woods + 0.004;
      if (r() > density) continue;
      const s = SCALE;
      const rad = (1.5 + r() * 1.3) * s;
      const px = (tx - b.x) * s;
      const py = (ty - b.y) * s;
      ctx.fillStyle = 'rgba(20,24,10,0.32)';
      ctx.beginPath();
      ctx.ellipse(px + 1.3 * s, py + 1.1 * s, rad * 1.05, rad * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = 70 + Math.floor(r() * 24);
      ctx.fillStyle = `rgb(${g - 6},${g + 6},${g - 26})`;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(170,190,110,0.35)`;
      ctx.beginPath();
      ctx.arc(px - rad * 0.3, py - rad * 0.35, rad * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const ROOFS = ['#b05c3e', '#c47850', '#a5523a', '#d6c8aa', '#968f86', '#bf6a46'];

function drawTowns(ctx: CanvasRenderingContext2D, b: Bounds) {
  const s = SCALE;
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (d.airfield) {
      const [x, y] = center(h);
      ctx.save();
      ctx.translate((x - b.x) * s, (y - b.y) * s);
      ctx.rotate(-0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-15 * s + 1.5, -2.2 * s + 1.5, 30 * s, 4.4 * s);
      ctx.fillStyle = '#b9b3a3';
      ctx.fillRect(-15 * s, -2.2 * s, 30 * s, 4.4 * s);
      ctx.strokeStyle = '#f2efe6';
      ctx.setLineDash([2 * s, 2 * s]);
      ctx.lineWidth = 0.5 * s;
      ctx.beginPath();
      ctx.moveTo(-13 * s, 0);
      ctx.lineTo(13 * s, 0);
      ctx.stroke();
      ctx.restore();
    }
    if (!d.city && !d.town) continue;
    const [cx, cy] = center(h);
    const r = rng(h);
    const n = d.city ? 34 : 10;
    const radius = d.city ? 15 : 7;
    const angle = r() * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * radius;
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist * 0.9;
      const w = (2.2 + r() * 3) * s;
      const hgt = (1.8 + r() * 2.2) * s;
      ctx.save();
      ctx.translate((x - b.x) * s, (y - b.y) * s);
      ctx.rotate(angle + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.2);
      ctx.fillStyle = 'rgba(30,24,18,0.35)';
      ctx.fillRect(-w / 2 + 0.9 * s, -hgt / 2 + 0.9 * s, w, hgt);
      ctx.fillStyle = ROOFS[Math.floor(r() * ROOFS.length)];
      ctx.fillRect(-w / 2, -hgt / 2, w, hgt);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-w / 2, 0, w, hgt / 2);
      ctx.restore();
    }
    if (d.city) {
      // A church or castle tower as a landmark.
      const [x, y] = [cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 6];
      ctx.fillStyle = 'rgba(30,24,18,0.4)';
      ctx.fillRect((x - b.x) * s - 2 * s + 1.5 * s, (y - b.y) * s - 2 * s + 1.5 * s, 4 * s, 4 * s);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect((x - b.x) * s - 2 * s, (y - b.y) * s - 2 * s, 4 * s, 4 * s);
      ctx.fillStyle = '#8c5a3c';
      ctx.fillRect((x - b.x) * s - 1 * s, (y - b.y) * s - 1 * s, 2 * s, 2 * s);
    }
  }
}

