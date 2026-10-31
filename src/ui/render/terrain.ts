// Paints the map as a watercolour on laid paper, in the manner of the old hand-made survey maps, keeping the
// printed map's colours for its terrain: a patchwork of tinted fields on the plain, ochre and olive hill country,
// umber mountains with ridges and violet shadows, sage marsh, and a sea that deepens offshore. Each wash is a glaze
// that multiplies the paper's colour, mottled wet-in-wet, granulating in the paper's tooth and pooling darker where
// it dried at its edge; the painting runs a little past the map's edge and stops raggedly on bare paper. Where the
// browser has WebGL2 the washes are painted by a fragment shader at full resolution (gpu.ts), which adds the paper's
// tooth, brush strokes along the contours and crisp dried edges; otherwise this file paints them itself. The pen
// work (ink.ts) is laid over it: the coast and its waterlines, hachures, woods, groves, marsh, villages, a compass
// rose and the sheet's frame. Everything is derived from map.json, so edits made in the map editor show up after a
// re-render. Every field is read through the organic warp (noise.ts), so edges wander across the hex lines as a
// map artist would draw them, while each hex keeps its own terrain at its middle. Rivers, roads and names are drawn
// on top in SVG, bent by the same warp.
import { GAME_ID, MAP } from '../../engine/data';
import { distance, hexCorners, hexId, neighbors, parseHex, sideKey } from '../../engine/hex';
import type { HexData } from '../../engine/types';
import { COAST_COLS, COAST_ROWS, COAST_STEP, decodeCoast, landSpot } from './coast';
import { R as HEX_R, center, corners, edge, mapBounds, rng, type Bounds } from './geom';
import { paintWashesGL } from './gpu';
import { drawInk, paperTexture, type InkFields } from './ink';
import { noiseTile, tileAt, warp } from './noise';
import { patchAt, type FieldKind } from './patches';

/** The painted map, kept as pixels in memory rather than as a URL: sandboxed hosts and app web views
 * may block blob: or data: images, but drawing one canvas onto another always works. */
export interface TerrainImage {
  image: HTMLCanvasElement | ImageBitmap;
  /** About 1600 px wide, for menu backdrops. */
  medium: HTMLCanvasElement;
  /** About 480 px wide, for the minimap. */
  small: HTMLCanvasElement;
  bounds: Bounds;
  /** For the animated layer (ambient.ts): land, the water field and the painted area in red, green and blue, at
   * half a pixel per map unit over the same bounds. Missing if the browser could not keep it. */
  effects?: HTMLCanvasElement | ImageBitmap;
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

/** A traced coastal hex's land, clipped to its outline (coast.ts). The trace's cells are a tiny image scaled up
 * smoothly, so the shore runs between the cells' middles as a smooth line rather than stepping round them. */
function maskPath(ctx: CanvasRenderingContext2D, h: string, code: string) {
  const m = decodeCoast(code);
  const cells = makeCanvas(COAST_COLS, COAST_ROWS);
  const cctx = cells.getContext('2d')!;
  const px = cctx.createImageData(COAST_COLS, COAST_ROWS);
  for (let i = 0; i < m.length; i++) {
    px.data[i * 4] = px.data[i * 4 + 1] = px.data[i * 4 + 2] = 255;
    px.data[i * 4 + 3] = m[i] ? 255 : 0;
  }
  cctx.putImageData(px, 0, 0);
  const [cx, cy] = center(h);
  const k = COAST_STEP;
  ctx.save();
  hexPath(ctx, h, 1);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Cell (i, j) is centred at (j - 9, i - 8) steps from the hex's middle.
  ctx.drawImage(cells, cx - 9.5 * k, cy - 8.5 * k, COAST_COLS * k, COAST_ROWS * k);
  ctx.restore();
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

/** A pigment: the colour a full-strength wash of it leaves on this paper, as a fraction of the paper's colour. */
const PAPER: Rgb = [246, 239, 221];
const pig = (c: Rgb): Rgb => [c[0] / PAPER[0], c[1] / PAPER[1], c[2] / PAPER[2]];
// The plain's ground, and its fields: wheat, green corn, fallow and stubble; pasture; the ground of the olive groves
// and the vineyards.
const FIELD_LOW = pig([214, 212, 172]);
const FIELD_TINTS: Record<FieldKind, Rgb[]> = {
  crop: [pig([226, 214, 160]), pig([200, 210, 158]), pig([216, 198, 150]), pig([228, 220, 176]), pig([208, 212, 170])],
  pasture: [pig([186, 204, 148]), pig([196, 210, 160])],
  olive: [pig([206, 204, 164])],
  vine: [pig([214, 198, 160])],
};
const HILL = pig([200, 186, 134]);
/** The hills' greener stretches, where the wash was mixed with more sap green. */
const HILL_GREEN = pig([178, 184, 132]);
/** And its warmer stretches, a touch of sienna. */
const HILL_WARM = pig([206, 174, 122]);
const MOUNTAIN = pig([170, 142, 104]);
const MOUNTAIN_CORE = pig([126, 100, 76]);
const MARSH = pig([176, 196, 172]);
const SEA_SHALLOW = pig([150, 192, 208]);
const SEA_DEEP = pig([86, 130, 172]);
const SAND = pig([238, 224, 182]);
const WOODS = pig([146, 168, 104]);
const TOWN = pig([204, 186, 162]);
/** A cool violet-grey for the shadowed slopes. */
const SHADOW = pig([150, 146, 170]);

// ------------------------------------------------------------------ main

const RENDER_VERSION = 12;

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

interface Cached {
  blob: Blob;
  effects?: Blob;
}

async function cacheGet(key: string): Promise<Cached | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const r = db.transaction('img').objectStore('img').get(key);
      r.onsuccess = () => res((r.result as Cached) ?? null);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

async function cachePut(key: string, value: Cached): Promise<void> {
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

function finish(image: HTMLCanvasElement | ImageBitmap, bounds: Bounds, effects?: HTMLCanvasElement | ImageBitmap): TerrainImage {
  return { image, bounds, effects, medium: copyAt(image, image.width, image.height, 1600), small: copyAt(image, image.width, image.height, 480) };
}

/** The painted map, from the browser cache when the map has not changed. */
export async function renderTerrain(onProgress?: (fraction: number, label: string) => void): Promise<TerrainImage> {
  const key = mapHash();
  const cached = await cacheGet(key);
  if (cached && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(cached.blob);
      const fx = cached.effects ? await createImageBitmap(cached.effects).catch(() => undefined) : undefined;
      onProgress?.(1, 'Ready');
      return finish(bmp, mapBounds(90), fx);
    } catch {
      /* unreadable cache entry: paint again */
    }
  }
  const result = await paintTerrain(onProgress);
  // Cache a compressed copy so the next start is instant; skip quietly if the browser cannot.
  try {
    const blob = await new Promise<Blob | null>((res) => result.canvas.toBlob(res, 'image/jpeg', 0.9));
    // The effects field must stay exact: PNG.
    const effects = await new Promise<Blob | null>((res) => result.effects.toBlob(res, 'image/png'));
    if (blob) await cachePut(key, { blob, effects: effects ?? undefined });
  } catch {
    /* no cache */
  }
  return finish(result.canvas, result.bounds, result.effects);
}

async function paintTerrain(onProgress?: (fraction: number, label: string) => void): Promise<{ canvas: HTMLCanvasElement; bounds: Bounds; effects: HTMLCanvasElement }> {
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
  // Past the top and left edges there are no hex ids to borrow: copies of the edge hexes carry the land on there,
  // so the painting does not take the edge for a coast.
  const ghosts: { x: number; y: number; terrain: HexData['terrain'] }[] = [];
  const top = new Map<number, string>();
  for (const h of real) {
    const { c, r } = parseHex(h);
    const t = top.get(c);
    if (t === undefined || parseHex(t).r > r) top.set(c, h);
  }
  for (const h of top.values()) {
    const [x, y] = center(h);
    for (let k = 1; k <= 3; k++) if (parseHex(h).r - k < 0) ghosts.push({ x, y: y - k * HEX_R * Math.sqrt(3), terrain: MAP.hexes[h].terrain });
  }
  for (const h of real) {
    const { c } = parseHex(h);
    const [x, y] = center(h);
    for (let k = 1; k <= 2; k++) if (c < 2 && c - 2 * k < 0) ghosts.push({ x: x - k * 3 * HEX_R, y, terrain: MAP.hexes[h].terrain });
  }
  const ghostPath = (ctx: CanvasRenderingContext2D, g: { x: number; y: number }, grow: number) => {
    const pts = hexCorners(g.x, g.y, HEX_R + grow);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  await report(0.02, 'Surveying the coast');

  // Land is laid down a little fuller than its hexes, so the wandering coastline spends its wander in the sea
  // hexes rather than eating into the land ones (a narrow strip like the Sorrento peninsula keeps its coast).
  // A coastal hex traced from the printed map is drawn from its mask instead: its slivers of beach, headland and
  // bay are where the printed map has them, whatever its terrain says for the rules.
  const traced = hexes.filter(([, d]) => d.coast);
  const land0 = rasterize(b, (ctx) => {
    // An untraced shore hex is playable land that the printed map shows as water along a strip of coast: it stays
    // sea here and gets its strip from its land neighbours.
    for (const [h, d] of extended) if (d.terrain !== 'sea' && !d.shore && !d.coast) (hexPath(ctx, h, 6), ctx.fill());
    for (const g of ghosts) if (g.terrain !== 'sea') (ghostPath(ctx, g, 6), ctx.fill());
    ctx.globalCompositeOperation = 'destination-out';
    for (const [h] of traced) (hexPath(ctx, h, 0.5), ctx.fill());
    ctx.globalCompositeOperation = 'source-over';
    for (const [h, d] of traced) maskPath(ctx, h, d.coast!);
  });
  // The middle of every untraced land hex, which is never painted as sea.
  const landCore0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) if (d.terrain !== 'sea' && !d.shore && !d.coast) (hexPath(ctx, h, -8), ctx.fill());
  });
  // Where the coast is traced, it wanders less: the trace is already the printed map's own line.
  const traced0 = rasterize(b, (ctx) => {
    for (const [h] of traced) (hexPath(ctx, h, 1), ctx.fill());
  });
  const inside0 = rasterize(b, (ctx) => {
    for (const [h] of hexes) (hexPath(ctx, h, 1), ctx.fill());
  });
  const hill0 = rasterize(b, (ctx) => {
    for (const [h, d] of extended) if (d.terrain === 'hill') (hexPath(ctx, h, 1), ctx.fill());
    for (const g of ghosts) if (g.terrain === 'hill') (ghostPath(ctx, g, 1), ctx.fill());
  });
  const marsh0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) if (d.terrain === 'marsh') (hexPath(ctx, h, -4), ctx.fill());
  });
  const town0 = rasterize(b, (ctx) => {
    for (const [h, d] of hexes) {
      if (!d.city && !d.town) continue;
      const [x, y] = landSpot(h);
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
  const landFine = blur(land0, W, H, 4);
  const landCore = blur(landCore0, W, H, 4);
  const tracedW = blur(traced0, W, H, 8);
  const landNear = blur(land0, W, H, 10);
  const landWide = blur(land0, W, H, 60);
  const inside = blur(inside0, W, H, 18);
  // How far the painting runs: a little past the map's last hexes, then bare paper.
  const fringe = blur(inside0, W, H, 56);
  // The sea's wash runs on further out than the land's.
  const seaFringe = blur(inside0, W, H, 120);
  const hill = blur(hill0, W, H, 13);
  const marsh = blur(marsh0, W, H, 10);
  const ridge = blur(ridge0, W, H, 10);
  const town = blur(town0, W, H, 3);
  // Noise, worked out once: broad (64 px lattice) and fine (16 px) fractal tiles, and a grain for granulation.
  const NA = noiseTile(11, 1024, 64, 5);
  const NB = noiseTile(12, 1024, 16, 3);
  const NG = noiseTile(14, 256, 2, 2);
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
  /** The warp's displacement at pixel (x, y), times `amount`, left in sdx and sdy (no allocation per pixel). */
  let sdx = 0;
  let sdy = 0;
  const shift = (x: number, y: number, amount: number): void => {
    const fx = clamp(x, 0, W - 1) / G;
    const fy = clamp(y, 0, H - 1) / G;
    const ix = fx | 0;
    const iy = fy | 0;
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * gw + ix;
    const a = (1 - tx) * (1 - ty);
    const c = tx * (1 - ty);
    const d = (1 - tx) * ty;
    const e = tx * ty;
    sdx = (wdx[i] * a + wdx[i + 1] * c + wdx[i + gw] * d + wdx[i + gw + 1] * e) * amount;
    sdy = (wdy[i] * a + wdy[i + 1] * c + wdy[i + gw] * d + wdy[i + gw + 1] * e) * amount;
  };
  /** Field space (patches.ts) at map point (x, y): the plane bent a little more, so fields wander too. */
  const fieldAt = (x: number, y: number): [number, number] => {
    shift(x - b.x, y - b.y, 2.2);
    return [x + sdx, y + sdy];
  };

  const N = W * H;
  const height = new Float32Array(N);
  const landF = new Float32Array(N);
  const coast = new Float32Array(N);
  const hillW = new Float32Array(N);
  const hillEdge = new Float32Array(N);
  const mtnW = new Float32Array(N);
  const mtnCore = new Float32Array(N);
  const mtnEdge = new Float32Array(N);
  const marshW = new Float32Array(N);
  const nearW = new Float32Array(N);
  const woods = new Float32Array(N);
  const beach = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + b.x;
      const wy = y + b.y;
      shift(x, y, 1.25);
      const sx = x - sdx;
      const sy = y - sdy;
      const n = tileAt(NA, wx * 1.07, wy * 1.07);
      const n2 = tileAt(NB, wx * 0.73 + 500, wy * 0.73);
      // The coast takes a gentler share of the warp than the inland edges, and never reaches a land hex's middle;
      // a traced coast keeps close to its trace, softened only enough to lose the cells' corners.
      const tw = tracedW[i];
      const free = 1 - 0.8 * tw;
      shift(x, y, 0.7 * free);
      const cdx = sdx;
      const cdy = sdy;
      let lb = sample(landB, x - cdx, y - cdy);
      if (tw > 0.001) lb += (sample(landFine, x - cdx, y - cdy) - lb) * tw;
      const cv = Math.max(lb + (n - 0.5) * 0.42 * free, landCore[i] * 0.85);
      coast[i] = cv;
      const l = smooth(0.4, 0.6, cv);
      landF[i] = l;
      nearW[i] = sample(landNear, sx, sy);
      // Hill country: an edge that wanders, with the pigment pooling just inside it.
      const hraw = sample(hill, sx, sy);
      const hv = hraw < 0.18 || hraw > 0.8 ? hraw : hraw + (tileAt(NA, wx * 1.5 + 200, wy * 1.5) - 0.5) * 0.36;
      hillW[i] = smooth(0.42, 0.56, hv);
      hillEdge[i] = smooth(0.46, 0.53, hv) * (1 - smooth(0.55, 0.7, hv));
      // Mountains: irregular masses with a darker core that comes and goes.
      const mraw = sample(ridge, sx, sy);
      const mv = mraw < 0.02 ? mraw : mraw + (tileAt(NB, wx * 0.62 + 700, wy * 0.62) - 0.5) * 0.44;
      mtnW[i] = smooth(0.25, 0.38, mv);
      mtnEdge[i] = smooth(0.3, 0.36, mv) * (1 - smooth(0.38, 0.52, mv));
      mtnCore[i] = mtnW[i] > 0 ? smooth(0.42, 0.95, mv + (tileAt(NB, wx * 1.2 + 900, wy * 1.2) - 0.5) * 0.3) : 0;
      const kraw = sample(marsh, sx, sy);
      marshW[i] = kraw < 0.02 ? 0 : smooth(0.3, 0.62, kraw + (tileAt(NA, wx * 2.1 + 400, wy * 2.1) - 0.5) * 0.55);
      const roll = hillW[i] > 0 ? tileAt(NA, wx * 1.9 + 600, wy * 1.9) : 0.5;
      const crag = mv > 0.02 ? tileAt(NB, wx * 2 + 300, wy * 2) : 0.5;
      // Mountains get ridges and valleys (ridged noise: sharp crests, rounded valleys), hills a gentler roll.
      let ridges = 0;
      if (mv > 0.02 || hillW[i] > 0.02) {
        const r1 = 1 - Math.abs(2 * tileAt(NB, wx * 0.66 + 1700, wy * 0.66) - 1);
        const r2 = 1 - Math.abs(2 * tileAt(NB, wx * 1.4 + 2100, wy * 1.4) - 1);
        ridges = clamp(mv) * (0.26 * r1 * r1 + 0.09 * r2 * r2) + hillW[i] * (1 - mtnW[i]) * 0.05 * r1;
      }
      // The hills rise gently from the plain (a wider ramp than their wash's edge), so their foot casts no hard line.
      const hillRise = smooth(0.12, 0.85, hraw);
      height[i] = l * (0.05 + hillRise * (0.08 + 0.17 * roll) + clamp(mv) * (0.3 + 0.32 * n + 0.14 * crag * mtnW[i]) + ridges + (n2 - 0.5) * 0.03 - marshW[i] * 0.04);
      // Woods: on the hills and the lower mountain slopes, the odd copse on the plain.
      if (l > 0.5) {
        const wn = tileAt(NA, wx * 1.4 + 800, wy * 1.4) * 0.7 + tileAt(NB, wx * 1.3 + 100, wy * 1.3) * 0.3;
        const where = clamp(hillW[i] * 0.85 + mtnW[i] * (1 - mtnCore[i]) * 0.7 + 0.1) * (1 - marshW[i]) * (1 - clamp(town[i] * 3));
        woods[i] = smooth(0.53, 0.66, wn) * where * l;
      }
      // Beaches on the low coast, wider in some bays than others.
      const sand = 0.12 + 0.2 * tileAt(NA, wx * 1.2 + 1300, wy * 1.2);
      beach[i] = smooth(sand, 0.52, 1 - nearW[i]) * (1 - hillW[i]) * (1 - mtnW[i]) * l;
    }
    if (y % 200 === 0) await report(0.3 + (0.2 * y) / H, 'Raising the mountains');
  }

  // Light from the north-west, high: each slope's shade against flat ground.
  const heightS = blur(height, W, H, 2.5);
  const shade = new Float32Array(N);
  {
    const lx = -0.5;
    const ly = -0.62;
    const lz = 0.6;
    const ln = Math.hypot(lx, ly, lz);
    const K = 22;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = (heightS[i + 1] - heightS[i - 1]) * K;
        const gy = (heightS[i + W] - heightS[i - W]) * K;
        const lam = (-gx * lx - gy * ly + lz) / (ln * Math.hypot(gx, gy, 1));
        shade[i] = clamp((lam - lz / ln) * 2.6, -1, 1);
      }
    }
  }
  // Local relief: valleys below their surroundings, crests above.
  const heightW = blur(heightS, W, H, 16);
  const relief = new Float32Array(N);
  for (let i = 0; i < N; i++) relief[i] = heightS[i] - heightW[i];
  // Where the painting runs (a little past the map's edge, the sea further), how far out to sea, and field space.
  const paint = new Float32Array(N);
  const open = new Float32Array(N);
  const fieldDx = new Float32Array(N);
  const fieldDy = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + b.x;
      const wy = y + b.y;
      const pv = fringe[i] + (tileAt(NA, wx * 1.5 + 2500, wy * 1.5) - 0.5) * 0.14 + (tileAt(NB, wx * 1.2, wy * 1.2 + 4000) - 0.5) * 0.06;
      paint[i] = Math.max(smooth(0.06, 0.13, pv), (1 - landF[i]) * smooth(0.05, 0.12, seaFringe[i] + (pv - fringe[i]) * 0.8));
      open[i] = 1 - smooth(0.03, 0.2, landWide[i]);
      shift(x, y, 2.2);
      fieldDx[i] = sdx;
      fieldDy[i] = sdy;
    }
  }
  await report(0.52, 'Laying the washes');

  // The washes: by the GPU's shader at full resolution where it can, else by the CPU below and scaled up.
  let out = paintWashesGL({
    b, W, H, scale: SCALE, land: landF, coast, near: nearW, wide: landWide, hill: hillW, hillEdge, mtn: mtnW, mtnCore, mtnEdge,
    marsh: marshW, woods, beach, town, inside, paint, shade, height: heightS, relief, fieldDx, fieldDy, noise: { a: NA, b: NB, g: NG },
    pigments: {
      uPaper: PAPER, uFieldLow: FIELD_LOW, uHill: HILL, uHillGreen: HILL_GREEN, uHillWarm: HILL_WARM, uMtn: MOUNTAIN, uMtnCore: MOUNTAIN_CORE, uMarsh: MARSH,
      uSeaShallow: SEA_SHALLOW, uSeaDeep: SEA_DEEP, uSand: SAND, uWoods: WOODS, uTown: TOWN, uShadow: SHADOW,
      uOlive: FIELD_TINTS.olive[0], uVine: FIELD_TINTS.vine[0], uCrop: FIELD_TINTS.crop, uPasture: FIELD_TINTS.pasture,
    },
  });
  if (!out) out = await paintWashesCPU();

  // ---------------------------------------------------------------- the watercolour (CPU)
  // Each wash is a glaze: it multiplies the paper's colour, so washes laid over one another deepen like real
  // pigment. Its strength wanders (wet-in-wet blooms), its pigment granulates in the paper's tooth, and it pools
  // darker where it dried at its edge.
  async function paintWashesCPU(): Promise<HTMLCanvasElement> {
    const img = new ImageData(W, H);
    const px = img.data;
    let R = 0;
    let Gc = 0;
    let B = 0;
    const glaze = (p: Rgb, d: number) => {
      if (d <= 0) return;
      R *= 1 - d * (1 - p[0]);
      Gc *= 1 - d * (1 - p[1]);
      B *= 1 - d * (1 - p[2]);
    };
    // The pigment being mixed for the current pixel, kept in three numbers.
    let P0 = 0;
    let P1 = 0;
    let P2 = 0;
    const setP = (p: Rgb) => {
      P0 = p[0];
      P1 = p[1];
      P2 = p[2];
    };
    const mixP = (p: Rgb, t: number) => {
      P0 += (p[0] - P0) * t;
      P1 += (p[1] - P1) * t;
      P2 += (p[2] - P2) * t;
    };
    /** Mix toward a blend of two pigments: a + (c - a) * s, by t. */
    const mixP2 = (a: Rgb, c: Rgb, s: number, t: number) => {
      P0 += (a[0] + (c[0] - a[0]) * s - P0) * t;
      P1 += (a[1] + (c[1] - a[1]) * s - P1) * t;
      P2 += (a[2] + (c[2] - a[2]) * s - P2) * t;
    };
    const glazeP = (d: number) => {
      if (d <= 0) return;
      R *= 1 - d * (1 - P0);
      Gc *= 1 - d * (1 - P1);
      B *= 1 - d * (1 - P2);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const wx = x + b.x;
        const wy = y + b.y;
        // The paper, a shade warmer in its stains and toward the sheet's edges.
        const stain = tileAt(NA, wx * 0.45 + 1500, wy * 0.45);
        const border = Math.min(x, y, W - 1 - x, H - 1 - y);
        const age = 1 - 0.035 * smooth(0.5, 0.8, stain) - 0.1 * (1 - smooth(0, 70, border));
        R = PAPER[0] * age;
        Gc = PAPER[1] * age;
        B = PAPER[2] * (age - 0.015 * stain);
        const pt = paint[i];
        if (pt > 0.001) {
          // Land past the map's edge is painted fainter; the sea runs on at full strength to the painting's edge.
          const strength = pt * (0.55 + 0.45 * smooth(0.15, 0.85, inside[i]));
          const m1 = tileAt(NA, wx * 0.8 + 2000, wy * 0.8) - 0.5;
          const m2 = tileAt(NB, wx * 0.9 + 1200, wy * 0.9) - 0.5;
          const g = tileAt(NG, wx, wy) - 0.5;
          const l = landF[i];
          if (l < 0.999) {
            // The sea: deeper offshore, in long horizontal strokes, deepest just off the shore where the colour pooled.
            const depth = smooth(0.0, 0.85, 1 - landWide[i]);
            const streak = tileAt(NB, wx * 0.16 + 3000, wy * 1.5) - 0.5;
            const hug = smooth(0.06, 0.46, nearW[i]);
            const d = (0.66 + 0.3 * m1 + 0.12 * m2 + 0.16 * streak) * (1 + 0.4 * g) + 0.3 * hug;
            setP(SEA_SHALLOW);
            mixP(SEA_DEEP, depth);
            glazeP((1 - l) * d * pt);
          }
          if (l > 0.001) {
            const wH = hillW[i];
            const wM = mtnW[i];
            const wK = marshW[i] * (1 - wM);
            const wFarm = (1 - wH) * (1 - wM) * (1 - wK);
            setP(FIELD_LOW);
            let d = 0.9;
            if (wFarm > 0.02) {
              // The plain's patchwork: each field its own tint and strength, darker where its wash dried at the edge,
              // and here and there a hair of bare paper between two fields.
              const f = patchAt(wx + fieldDx[i], wy + fieldDy[i]);
              const tints = FIELD_TINTS[f.kind];
              mixP(tints[Math.floor(f.id * tints.length)], wFarm);
              let fd = 0.78 + 0.32 * (f.id * 7.31 - Math.floor(f.id * 7.31));
              fd += 0.2 * (1 - smooth(0, 2.4, f.edge));
              if ((f.id * 13.7) % 1 > 0.45) fd *= 0.25 + 0.75 * smooth(0.25, 0.95, f.edge);
              d = 0.9 + (fd - 0.9) * wFarm;
            }
            if (wH > 0.001) mixP2(HILL, HILL_GREEN, smooth(0.35, 0.7, tileAt(NA, wx * 0.55 + 3300, wy * 0.55)), wH);
            if (wK > 0.001) mixP(MARSH, wK);
            if (wM > 0.001) mixP2(MOUNTAIN, MOUNTAIN_CORE, mtnCore[i], wM);
            d *= 1 + 0.34 * m1 + 0.18 * m2 + g * (0.16 + 0.4 * wM);
            // Pigment pooled at the edges of the hill and mountain washes, and along the coast.
            const cv = coast[i];
            d += 0.15 * hillEdge[i] * (1 - wM) + 0.22 * mtnEdge[i] + 0.22 * smooth(0.5, 0.58, cv) * (1 - smooth(0.62, 0.8, cv));
            // Sunlit slopes are left paler; beaches take their own pale sand.
            const sh = shade[i];
            d *= (1 - (0.34 - 0.08 * wM) * clamp(sh)) * (1 - 0.75 * beach[i]);
            glazeP(l * d * strength);
            glaze(SAND, beach[i] * 0.75 * strength);
            glaze(SHADOW, l * clamp(-sh) * (0.6 + 0.3 * wM) * strength);
            glaze(WOODS, woods[i] * (0.42 + 0.2 * m2) * strength);
            glaze(TOWN, town[i] * 0.55 * strength);
          }
          // The painting's own ragged edge, a little darker where the wash dried.
          const pool = smooth(0.15, 0.45, pt) * (1 - smooth(0.5, 0.95, pt));
          R *= 1 - 0.1 * pool;
          Gc *= 1 - 0.1 * pool;
          B *= 1 - 0.1 * pool;
        }
        const o = i * 4;
        px[o] = R;
        px[o + 1] = Gc;
        px[o + 2] = B;
        px[o + 3] = 255;
      }
      if (y % 150 === 0) await report(0.52 + (0.25 * y) / H, 'Laying the washes');
    }
    const base = makeCanvas(W, H);
    base.getContext('2d')!.putImageData(img, 0, 0);
    const sheet = makeCanvas(W * SCALE, H * SCALE);
    const sctx = sheet.getContext('2d')!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(base, 0, 0, W * SCALE, H * SCALE);
    return sheet;
  }
  const gpu = !!out;
  const ctx = out.getContext('2d')!;
  await report(0.8, 'Inking the coast');

  // The land field blurred wide: its contours below one half run out to sea parallel to the coast.
  const water = blur(landF, W, H, 14);

  // The pen work, in map units.
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, -b.x * SCALE, -b.y * SCALE);
  const fields: InkFields = {
    b, W, H, land: landF, coast, water, height: heightS, shade, hill: hillW, mtn: mtnW, marsh: marshW,
    woods, town, beach, open, paint, fieldAt,
  };
  let f0 = 0.8;
  await drawInk(ctx, fields, async (label) => {
    f0 += 0.05;
    await report(f0, label);
  });
  ctx.restore();
  // The shader's paper already has its tooth; the overlay then only adds a little grain to the ink.
  paperTexture(ctx, out.width, out.height, gpu ? 0.14 : 0.3);

  await report(1, 'Ready');
  // A small map for the animated layer: land, water field and painted area, half a pixel per map unit.
  const effects = makeCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
  {
    const ectx = effects.getContext('2d')!;
    const im = ectx.createImageData(effects.width, effects.height);
    for (let y = 0; y < effects.height; y++) {
      for (let x = 0; x < effects.width; x++) {
        const i = Math.min(H - 1, y * 2 + 1) * W + Math.min(W - 1, x * 2 + 1);
        const o = (y * effects.width + x) * 4;
        im.data[o] = landF[i] * 255;
        im.data[o + 1] = Math.min(1, water[i]) * 255;
        im.data[o + 2] = paint[i] * 255;
        im.data[o + 3] = 255;
      }
    }
    ectx.putImageData(im, 0, 0);
  }
  return { canvas: out, bounds: b, effects };
}
