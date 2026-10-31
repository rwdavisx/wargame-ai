// The watercolour washes painted by a fragment shader at the sheet's full resolution, where the CPU painter
// (terrain.ts) works at one pixel per map unit and is scaled up. The terrain fields it reads are the CPU's own,
// uploaded as textures; what the shader adds is the hand of the painter at full resolution: the paper's cold-pressed
// tooth lit from the north-west, pigment settling into its hollows and clumping as ultramarine and umber do, brush
// strokes that follow the contours of the hills and the strips of the fields, washes that dried with crisp darker
// edges, crags picked out by the light, shadow pooling in the valleys, and foxing on the bare paper. Returns null
// where WebGL2 is missing, so the CPU painter can do the work instead.
import type { Bounds } from './geom';
import type { NoiseTile } from './noise';

type Rgb = [number, number, number];

export interface WashInput {
  b: Bounds;
  W: number;
  H: number;
  /** Output pixels per map unit. */
  scale: number;
  land: Float32Array;
  coast: Float32Array;
  near: Float32Array;
  wide: Float32Array;
  hill: Float32Array;
  hillEdge: Float32Array;
  mtn: Float32Array;
  mtnCore: Float32Array;
  mtnEdge: Float32Array;
  marsh: Float32Array;
  woods: Float32Array;
  beach: Float32Array;
  town: Float32Array;
  inside: Float32Array;
  paint: Float32Array;
  shade: Float32Array;
  height: Float32Array;
  /** Local relief: height less its wide average (valleys below zero). */
  relief: Float32Array;
  /** The warp into field space (patches.ts), per map unit. */
  fieldDx: Float32Array;
  fieldDy: Float32Array;
  noise: { a: NoiseTile; b: NoiseTile; g: NoiseTile };
  pigments: Record<string, Rgb | Rgb[]>;
}

const VERT = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D tA, tB, tC, tD, tE, nA, nB, nG;
uniform vec2 uField, uOrigin, uOffset, uOut;
uniform float uScale, uTileH;
uniform vec3 uPaper, uFieldLow, uHill, uHillGreen, uHillWarm, uMtn, uMtnCore, uMarsh, uSeaShallow, uSeaDeep, uSand, uWoods,
  uTown, uShadow, uOlive, uVine;
uniform vec3 uCrop[5];
uniform vec3 uPasture[2];
out vec4 outColor;

float NA(vec2 p) { return texture(nA, p / 1024.0).r; }
float NB(vec2 p) { return texture(nB, p / 1024.0).r; }
float NG(vec2 p) { return texture(nG, p / 256.0).r; }
vec4 F(sampler2D t, vec2 p) { return texture(t, (p - uOrigin + 0.5) / uField); }

// The same hash as noise.ts, so the fields fall exactly where patches.ts (and the ink's groves) put them.
float hash(int ix, int iy, int seed) {
  uint h = uint(ix) * 374761393u + uint(iy) * 668265263u + uint(seed) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967295.0;
}

// patches.ts, patchAt: the field at a field-space point. kind: 0 crop, 1 pasture, 2 olive, 3 vine.
void patchAt(vec2 q, out float id, out float kind, out float edge, out vec2 uv) {
  const float E = 170.0;
  float exf = floor(q.x / E);
  float eyf = floor(q.y / E);
  int ex = int(exf);
  int ey = int(eyf);
  float ang = (hash(ex, ey, 21) - 0.5) * 1.6;
  float ca = cos(ang);
  float sa = sin(ang);
  float rowH = 9.0 + hash(ex, ey, 22) * 7.0;
  float ox = q.x - exf * E;
  float oy = q.y - eyf * E;
  float u = ox * ca + oy * sa + exf * 37.0;
  float v = -ox * sa + oy * ca + eyf * 53.0;
  float rowf = floor(v / rowH);
  int row = int(rowf);
  float uu = u + hash(row, ey, 31) * 40.0;
  float width = 16.0 + hash(row, ex, 32) * 24.0;
  float colf = floor(uu / width);
  int col = int(colf);
  float fu = uu / width - colf;
  float fv = v / rowH - rowf;
  id = hash(col, row, 13 + ex * 7 + ey * 131);
  float estEdge = min(min(ox, oy), min(E - ox, E - oy));
  edge = min(min(min(fu, 1.0 - fu) * width, min(fv, 1.0 - fv) * rowH), estEdge);
  float r = hash(col, row, 77 + ex * 3 + ey * 5);
  kind = r < 0.11 ? 2.0 : r < 0.19 ? 3.0 : r < 0.36 ? 1.0 : 0.0;
  uv = vec2(u, v);
}

vec3 glaze(vec3 c, vec3 p, float d) { return c * (1.0 - max(d, 0.0) * (1.0 - p)); }

// Brush strokes. Each cell of a coarse grid lays its strokes along its own direction (the contours of the ground
// there), in a frame centred on the cell; four neighbouring cells are blended, and the blend's contrast restored,
// so the strokes turn with the ground without seams.
float flowAngle(vec2 c) {
  vec2 dx = vec2(2.0, 0.0);
  vec2 dy = vec2(0.0, 2.0);
  float gx = F(tE, c + dx).r - F(tE, c - dx).r;
  float gy = F(tE, c + dy).r - F(tE, c - dy).r;
  float m = length(vec2(gx, gy));
  // Along the contour where the ground slopes; a steady diagonal where it is flat.
  float a = atan(gy, gx) + 1.5708;
  return m > 0.0004 ? a : 0.35;
}
float strokeAt(vec2 p, vec2 c, float ang) {
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 d = p - c;
  vec2 q = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
  return NB(q * vec2(0.075, 0.45) + c * 1.37);
}
float strokes(vec2 p) {
  const float S = 30.0;
  vec2 g = p / S - 0.5;
  vec2 i0 = floor(g);
  vec2 f = g - i0;
  f = f * f * (3.0 - 2.0 * f);
  float acc = 0.0;
  float w2 = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    vec2 c = (i0 + o + 0.5) * S;
    float w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
    acc += (strokeAt(p, c, flowAngle(c)) - 0.5) * w;
    w2 += w * w;
  }
  return 0.5 + acc / sqrt(w2);
}
float band(float v, float a, float b, float c, float d) { return smoothstep(a, b, v) * (1.0 - smoothstep(c, d, v)); }

void main() {
  vec2 px = vec2(uOffset.x + gl_FragCoord.x, uOffset.y + uTileH - gl_FragCoord.y);
  vec2 p = uOrigin + px / uScale;
  vec4 A = F(tA, p);   // land, coast / 1.25, near, wide
  vec4 B = F(tB, p);   // hill, hill edge, mountain, mountain core
  vec4 C = F(tC, p);   // mountain edge, marsh, woods, beach
  vec4 D = F(tD, p);   // town, inside, paint, shade
  vec4 E = F(tE, p);   // height, relief, field warp x, y

  // The paper: cold-pressed, its tooth lit from the north-west; warmer in its stains and toward the sheet's edges.
  float tooth = NG(p * 2.7) * 0.6 + NG(p * 0.85 + 37.0) * 0.4;
  float emboss = (dFdx(tooth) + dFdy(tooth)) * -uScale * 0.9;
  float stain = NA(p * 0.45 + vec2(1500.0, 0.0));
  vec2 edgeDist = min(px, uOut - px) / uScale;
  float border = min(edgeDist.x, edgeDist.y);
  float age = 1.0 - 0.035 * smoothstep(0.5, 0.8, stain) - 0.1 * (1.0 - smoothstep(0.0, 70.0, border));
  vec3 col = uPaper * vec3(age, age, age - 0.015 * stain);

  // Crags for the light to pick out on the mountains (worked out here: derivatives need every pixel to take part).
  float crag = 1.0 - abs(2.0 * NB(p * 1.6 + 2600.0) - 1.0);
  float microShade = (dFdx(crag) + dFdy(crag)) * -uScale * 2.2;

  // Where the painting stops: a little frayed at full resolution.
  float pt = D.b;
  pt = clamp(pt + (NB(p * 1.7 + 77.0) - 0.5) * 0.9 * pt * (1.0 - pt), 0.0, 1.0);
  if (pt > 0.001) {
    float m1 = NA(p * 0.8 + vec2(2000.0, 0.0)) - 0.5;
    float m2 = NB(p * 0.9 + vec2(1200.0, 0.0)) - 0.5;
    // Granulation: pigment settles in the paper's hollows and clumps in places.
    float g = (NG(p * 1.1) - 0.5) + (0.5 - tooth) * 0.9;
    float floc = smoothstep(0.6, 0.82, NG(p * 0.42 + 91.0));
    float cv = A.g * 1.25;
    float l = smoothstep(0.4, 0.6, cv);
    if (l < 0.999) {
      // The sea: deeper offshore, laid in long horizontal strokes, deepest where the colour pooled by the shore,
      // ultramarine granulating and drifting cooler and warmer.
      float depth = smoothstep(0.0, 0.85, 1.0 - A.a);
      float streak = NB(vec2(p.x * 0.16 + 3000.0, p.y * 1.5)) - 0.5;
      float streak2 = NB(vec2(p.x * 0.05 + 900.0, p.y * 0.6)) - 0.5;
      float hug = smoothstep(0.06, 0.46, A.b);
      float dd = (0.66 + 0.3 * m1 + 0.12 * m2 + 0.16 * streak + 0.1 * streak2) * (1.0 + 0.32 * g + 0.1 * floc) + 0.3 * hug;
      vec3 P = mix(uSeaShallow, uSeaDeep, depth);
      P = mix(P, P * vec3(0.95, 1.0, 1.05), smoothstep(0.35, 0.75, NA(p * 0.5 + vec2(700.0, 0.0))));
      // The wash's dried edge, a fine dark line a hair off the shore.
      dd += 0.18 * band(cv, 0.3, 0.37, 0.4, 0.46);
      col = glaze(col, P, (1.0 - l) * dd * pt);
    }
    if (l > 0.001) {
      float strength = pt * (0.55 + 0.45 * smoothstep(0.15, 0.85, D.g));
      float wH = B.r;
      float wM = B.b;
      float wK = C.g * (1.0 - wM);
      float wFarm = (1.0 - wH) * (1.0 - wM) * (1.0 - wK);
      vec3 P = uFieldLow;
      float d = 0.9;
      if (wFarm > 0.02) {
        // The plain's patchwork, each field brushed along its strips, darker where its wash dried at the edge, and
        // here and there a hair of bare paper between two fields.
        float id, kind, fe;
        vec2 fuv;
        patchAt(p + E.ba, id, kind, fe, fuv);
        vec3 tint = kind == 0.0 ? uCrop[min(4, int(id * 5.0))] : kind == 1.0 ? uPasture[min(1, int(id * 2.0))] : kind == 2.0 ? uOlive : uVine;
        P = mix(P, tint, wFarm);
        float fd = 0.78 + 0.32 * fract(id * 7.31);
        fd += 0.22 * (1.0 - smoothstep(0.0, 1.6, fe));
        fd *= 1.0 + 0.16 * (NB(vec2(fuv.x * 0.09, fuv.y * 1.3) + 400.0) - 0.5);
        if (fract(id * 13.7) > 0.45) fd *= 0.2 + 0.8 * smoothstep(0.2, 0.75, fe);
        d = 0.9 + (fd - 0.9) * wFarm;
      }
      // Hills and mountains brushed along their contours (the height, run fast, is the across-contour coordinate).
      float h = E.r;
      float contour = NB(vec2(h * 330.0, (p.x + p.y) * 0.035) + 1900.0) - 0.5;
      if (wH > 0.001) {
        // Wet-in-wet: the hill wash drifts between ochre, olive and a warm sienna.
        vec3 hp = mix(uHill, uHillGreen, smoothstep(0.35, 0.7, NA(p * 0.55 + vec2(3300.0, 0.0))));
        hp = mix(hp, uHillWarm, 0.7 * smoothstep(0.55, 0.8, NA(p * 0.7 + vec2(4100.0, 0.0))));
        P = mix(P, hp, wH);
      }
      if (wK > 0.001) P = mix(P, uMarsh, wK);
      if (wM > 0.001) {
        vec3 mt = mix(uMtn, uMtnCore, B.a);
        // Umber separating: violet in the hollows, warm sienna on the crests.
        mt = mix(mt, mt * vec3(0.96, 0.97, 1.04), smoothstep(0.0, -0.04, E.g));
        mt = mix(mt, mt * vec3(1.05, 1.0, 0.92), smoothstep(0.0, 0.05, E.g));
        P = mix(P, mt, wM);
      }
      // The brush: overlapping strokes along the contours, each a little darker at its dried edge.
      float bs = strokes(p);
      float dab = smoothstep(0.53, 0.57, bs);
      float rim = band(bs, 0.52, 0.55, 0.57, 0.62);
      float brushy = clamp(wH + wM + wK + 0.45 * wFarm, 0.0, 1.0);
      d *= 1.0 + 0.3 * m1 + 0.16 * m2 + (0.16 + 0.45 * wM) * g + 0.18 * wM * floc + 0.1 * (wH + wM) * contour
        + brushy * (0.16 * dab + 0.14 * rim - 0.06);
      // Washes dried with a crisp darker edge: the hill and mountain washes, and along the coast.
      float jag = (NB(p * 1.3 + 50.0) - 0.5) * 0.3;
      d += 0.2 * wH * (1.0 - smoothstep(0.45, 0.85, wH + jag)) * (1.0 - wM);
      d += 0.24 * wM * (1.0 - smoothstep(0.45, 0.85, wM + jag));
      d += 0.24 * band(cv, 0.5, 0.55, 0.58, 0.7);
      // Light: the slope's shade, the crags picked out at full resolution, shadow pooling in the valleys.
      float sh = D.a * 2.0 - 1.0;
      sh = clamp(sh + microShade * wM, -1.0, 1.0);
      float valley = smoothstep(0.0, -0.06, E.g);
      float crest = smoothstep(0.0, 0.07, E.g);
      d *= (1.0 - (0.34 - 0.08 * wM) * max(sh, 0.0) - 0.12 * crest * (wM + wH * 0.5)) * (1.0 - 0.75 * C.a);
      col = glaze(col, P, l * d * strength);
      col = glaze(col, uSand, C.a * 0.75 * strength * (1.0 + 0.3 * g));
      col = glaze(col, uShadow, l * (max(-sh, 0.0) * (0.6 + 0.25 * wM) + 0.22 * valley * (wM + wH * 0.6)) * strength);
      col = glaze(col, uWoods, C.b * (0.42 + 0.2 * m2 + 0.15 * g) * strength);
      col = glaze(col, uTown, D.r * 0.55 * strength);
    }
    // The painting's own ragged edge, a little darker where the wash dried.
    col *= 1.0 - 0.12 * band(pt, 0.15, 0.4, 0.5, 0.9);
  } else {
    // Foxing: the odd brown spot on the bare paper.
    float fox = smoothstep(0.8, 0.86, NA(p * 0.9 + vec2(5000.0, 0.0))) * smoothstep(0.55, 0.75, NG(p * 0.3 + 300.0));
    col = glaze(col, vec3(0.86, 0.76, 0.62), fox * 0.35);
  }
  // The paper's tooth catches the light through the paint.
  col *= 1.0 + clamp(emboss, -1.0, 1.0) * 0.075;
  outColor = vec4(col / 255.0, 1.0);
}`;

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('terrain shader:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

/** Packs four 0-1 fields into one RGBA texture. */
function pack(W: number, H: number, a: Float32Array, b: Float32Array, c: Float32Array, d: Float32Array, k = [1, 1, 1, 1], o = [0, 0, 0, 0]): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  const fs = [a, b, c, d];
  for (let i = 0; i < W * H; i++) {
    for (let j = 0; j < 4; j++) {
      const v = (fs[j][i] * k[j] + o[j]) * 255;
      out[i * 4 + j] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

/** Paints the washes into a new canvas of the sheet's full size, or returns null if the GPU cannot. */
export function paintWashesGL(f: WashInput): HTMLCanvasElement | null {
  try {
    return paint(f);
  } catch (e) {
    console.warn('terrain shader failed, painting on the CPU:', e);
    return null;
  }
}

function paint(f: WashInput): HTMLCanvasElement | null {
  const { W, H, scale } = f;
  const outW = Math.round(W * scale);
  const outH = Math.round(H * scale);
  const glc = document.createElement('canvas');
  const gl = glc.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
  if (W > max || H > max) return null;
  const vs = shader(gl, gl.VERTEX_SHADER, VERT);
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('terrain shader link:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  let unit = 0;
  const texture = (name: string, w: number, h: number, internal: number, format: number, type: number, data: ArrayBufferView, repeat: boolean) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    unit++;
  };
  const rgba = (name: string, data: Uint8Array) => texture(name, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, data, false);
  rgba('tA', pack(W, H, f.land, f.coast, f.near, f.wide, [1, 0.8, 1, 1]));
  rgba('tB', pack(W, H, f.hill, f.hillEdge, f.mtn, f.mtnCore));
  rgba('tC', pack(W, H, f.mtnEdge, f.marsh, f.woods, f.beach));
  rgba('tD', pack(W, H, f.town, f.inside, f.paint, f.shade, [1, 1, 1, 0.5], [0, 0, 0, 0.5]));
  // Height, relief and the field warp need more than 8 bits: a half-float texture, still filtered.
  const e = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    e[i * 4] = f.height[i];
    e[i * 4 + 1] = f.relief[i];
    e[i * 4 + 2] = f.fieldDx[i];
    e[i * 4 + 3] = f.fieldDy[i];
  }
  texture('tE', W, H, gl.RGBA16F, gl.RGBA, gl.FLOAT, e, false);
  const tile = (name: string, t: NoiseTile) => {
    const d = new Uint8Array(t.size * t.size);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, t.data[i] * 255));
    texture(name, t.size, t.size, gl.R8, gl.RED, gl.UNSIGNED_BYTE, d, true);
  };
  tile('nA', f.noise.a);
  tile('nB', f.noise.b);
  tile('nG', f.noise.g);

  const u2 = (n: string, x: number, y: number) => gl.uniform2f(gl.getUniformLocation(prog, n), x, y);
  const u1 = (n: string, x: number) => gl.uniform1f(gl.getUniformLocation(prog, n), x);
  for (const [k, v] of Object.entries(f.pigments)) {
    const flat = (Array.isArray(v[0]) ? (v as Rgb[]).flat() : (v as Rgb)) as number[];
    gl.uniform3fv(gl.getUniformLocation(prog, k), new Float32Array(flat));
  }
  u2('uField', W, H);
  u2('uOrigin', f.b.x, f.b.y);
  u2('uOut', outW, outH);
  u1('uScale', scale);

  // Paint in tiles, each copied into the sheet as it is done.
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;
  const T = Math.min(2048, max);
  glc.width = Math.min(T, outW);
  glc.height = Math.min(T, outH);
  for (let oy = 0; oy < outH; oy += T) {
    for (let ox = 0; ox < outW; ox += T) {
      const tw = Math.min(T, outW - ox);
      const th = Math.min(T, outH - oy);
      // The tile is drawn at the canvas's top left; GL counts rows from the bottom, so the shader turns its rows
      // into the sheet's (top-down) with the canvas's height.
      gl.viewport(0, glc.height - th, tw, th);
      u2('uOffset', ox, oy);
      u1('uTileH', glc.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(glc, 0, 0, tw, th, ox, oy, tw, th);
    }
  }
  if (gl.getError() !== gl.NO_ERROR) return null;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}
