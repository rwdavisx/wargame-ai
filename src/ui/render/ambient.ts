// The living layer over the painted map: the sea's swell and the sun glinting on it, ripples running in to the
// shore and the surf breathing on it, cloud shadows drifting over the land with the wind and the thin high cloud
// that casts them, and in bad weather an overcast sky, rain and wet or muddy ground. A WebGL2 fragment shader paints
// it, frame by frame, on a transparent canvas between the painting and the map's line work, so counters, roads and
// names stay crisp on top. It reads the painter's effects field (where land, water and paint are) and the camera.
import { noiseTile } from './noise';
import type { Bounds } from './geom';

/** The way the wind blows (toward the south-east, off the sea): clouds, smoke and dust drift with it. */
export const WIND: [number, number] = [0.82, 0.57];

/** How the sky looks: cloud cover, rain and mud (0 to 1), and how much sun reaches the sea. */
export interface Sky {
  cloud: number;
  rain: number;
  mud: number;
  sun: number;
}

/** The sky for a box of the weather track. */
export function skyOf(box: { name?: string; clear?: boolean; rain?: boolean; mud?: boolean } | undefined): Sky {
  if (!box) return { cloud: 0.2, rain: 0, mud: 0, sun: 1 };
  if (box.rain) return { cloud: 1, rain: 1, mud: box.mud ? 1 : 0, sun: 0 };
  if (box.clear) return { cloud: 0.18, rain: 0, mud: 0, sun: 1 };
  if (/cloud/i.test(box.name ?? '')) return { cloud: 0.68, rain: 0, mud: 0, sun: 0.35 };
  return { cloud: 0.4, rain: 0, mud: 0, sun: 0.7 };
}

const VERT = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D tFx, tN;
uniform vec2 uOrigin, uSize, uOffset, uWind;
uniform float uScale, uH, uT, uCss, uCloud, uRain, uMud, uSun, uStreaks;
out vec4 o;

float N(vec2 p) { return texture(tN, p / 512.0).r; }
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
// Paints colour c at strength a over what is already there (premultiplied).
void over(inout vec4 acc, vec3 c, float a) {
  a = clamp(a, 0.0, 1.0);
  acc.rgb = c * a + acc.rgb * (1.0 - a);
  acc.a = a + acc.a * (1.0 - a);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 p = (px - uOffset) / uScale;
  vec2 rel = (p - uOrigin) / uSize;
  vec3 fx = texture(tFx, rel).rgb;
  // Inside the sheet, faded at its edges.
  vec2 e = min(rel, 1.0 - rel) * uSize;
  float sheet = smoothstep(0.0, 30.0, min(e.x, e.y));
  float land = fx.r;
  float wat = fx.g;
  float paint = fx.b * sheet;
  float sea = (1.0 - smoothstep(0.35, 0.65, land)) * paint;
  vec4 acc = vec4(0.0);

  // Clouds, drifting with the wind: their shadows on the ground, and the thin high cloud offset toward the light.
  vec2 q = p - uWind * uT * 7.0;
  float c = N(q * 0.09) * 0.6 + N(q * 0.21 + 40.0) * 0.28 + N(q * 0.5 + 80.0) * 0.12;
  float thr = mix(0.68, 0.33, uCloud);
  float shadow = smoothstep(thr, thr + 0.14, c);
  vec2 q2 = q + vec2(-24.0, -32.0);
  float c2 = N(q2 * 0.09) * 0.6 + N(q2 * 0.21 + 40.0) * 0.28 + N(q2 * 0.5 + 80.0) * 0.12;
  float wisp = smoothstep(thr + 0.06, thr + 0.32, c2);

  if (sea > 0.01) {
    float open = 1.0 - smoothstep(0.02, 0.2, wat);
    // The swell: long low waves moving with the wind, choppier in bad weather.
    vec2 sw = vec2(dot(p, uWind), dot(p, vec2(-uWind.y, uWind.x)));
    float swell = N(vec2(sw.x * 0.05 - uT * 0.9, sw.y * 0.012)) - 0.5;
    float chop = N(p * 0.22 + uWind * uT * 0.9) - 0.5;
    float v = swell * (0.8 + 0.6 * uRain) + chop * (0.3 + 0.4 * uRain);
    over(acc, vec3(1.0), max(v, 0.0) * 0.1 * sea);
    over(acc, vec3(0.06, 0.14, 0.26), max(-v, 0.0) * 0.09 * sea);
    // The sun glinting where the swell catches it, out of the cloud shadows.
    // Glitter: specks a pixel or two across at any zoom (the pattern is pinned to the sea but scaled to the
    // screen), where two fine patterns sliding across each other are both bright, on the swell's crests.
    float zk = uScale / uCss * 7.0;
    float g1 = N(p * zk + vec2(uT * 23.0, uT * 9.0));
    float g2 = N(p * zk * 0.83 - vec2(uT * 17.0, uT * 21.0) + 91.0);
    float glint = smoothstep(0.78, 0.9, g1 * g2 * 1.55) * smoothstep(0.0, 0.2, v);
    over(acc, vec3(1.0, 0.98, 0.9), glint * 0.55 * uSun * sea * (0.35 + 0.65 * open) * (1.0 - shadow));
    // Ripples running in to the shore along the waterlines, and the surf breathing on it.
    float near = smoothstep(0.02, 0.18, wat) * (1.0 - smoothstep(0.44, 0.5, wat));
    float phase = wat * 70.0 - uT * 1.4 + N(p * 0.05) * 4.0;
    float rip = pow(0.5 + 0.5 * sin(phase), 10.0);
    over(acc, vec3(0.92, 0.97, 1.0), rip * near * 0.18 * sea);
  }
  float shore = smoothstep(0.2, 0.42, land) * (1.0 - smoothstep(0.48, 0.6, land));
  if (shore > 0.0) {
    float breathe = 0.5 + 0.5 * sin(uT * 1.1 + N(p * 0.04 + 300.0) * 9.0);
    float foam = smoothstep(0.35, 0.7, N(p * 0.6 - uWind * uT * 0.5 + 500.0));
    over(acc, vec3(1.0), shore * (0.15 + 0.85 * breathe) * (0.25 + 0.6 * foam) * 0.42 * paint);
  }

  // Shade: the clouds' shadows, deeper and everywhere under an overcast sky; the high cloud catching the light.
  over(acc, vec3(0.06, 0.08, 0.14), (shadow * (0.12 + 0.07 * uCloud) + 0.1 * uRain) * sheet);
  over(acc, vec3(0.97, 0.98, 1.0), wisp * 0.1 * uCloud * sheet);

  if (uRain > 0.0) {
    // Wet ground, darker and cooler; mud browns the land.
    over(acc, vec3(0.1, 0.13, 0.2), 0.08 * uRain * paint);
    over(acc, vec3(0.3, 0.2, 0.1), 0.11 * uMud * smoothstep(0.5, 0.9, land) * paint);
    // Rain: streaks blowing down with the wind, measured in screen pixels so they look the same at any zoom.
    vec2 s = px / uCss;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float sz = 1.0 + fk * 0.7;
      vec2 r = vec2(s.x - s.y * 0.28, s.y) / sz + fk * 37.0;
      float colW = 9.0;
      float col = floor(r.x / colW);
      float a = h1(col + fk * 71.0);
      float b = h1(col * 1.7 + fk * 13.0);
      float y = r.y - uT * (700.0 + 400.0 * a) / sz + a * 1000.0;
      float L = 70.0 + 90.0 * b;
      float seg = fract(y / L);
      float len = 15.0 / L;
      float xin = abs(fract(r.x / colW) - 0.5) * colW;
      float streak = step(seg, len) * (seg / len) * (1.0 - smoothstep(0.25, 0.9, xin));
      over(acc, vec3(0.84, 0.89, 0.95), streak * 0.24 * uRain * uStreaks * (0.55 + 0.25 * fk) * sheet);
    }
  }
  o = acc;
}`;

export interface AmbientView {
  /** Canvas pixels per map unit, and where the map's origin falls on the canvas. */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Canvas pixels per CSS pixel (for the rain's size). */
  css: number;
}

export interface Ambient {
  render(t: number, view: AmbientView, sky: Sky, streaks: boolean): void;
  dispose(): void;
  /** WebGL is running in software (no graphics card to help): the layer should draw smaller and less often. */
  software: boolean;
}

/** Sets up the layer on `canvas`, or returns null where WebGL2 is missing. */
export function createAmbient(canvas: HTMLCanvasElement, effects: HTMLCanvasElement | ImageBitmap, bounds: Bounds): Ambient | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('ambient shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const textures: WebGLTexture[] = [];
  const tex = (unit: number, name: string, setup: () => void, repeat: boolean) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = gl.createTexture()!;
    textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    setup();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  };
  tex(0, 'tFx', () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, effects), false);
  const n = noiseTile(777, 512, 32, 4);
  const nb = new Uint8Array(512 * 512);
  for (let i = 0; i < nb.length; i++) nb[i] = n.data[i] * 255;
  tex(1, 'tN', () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 512, 0, gl.RED, gl.UNSIGNED_BYTE, nb), true);

  const U = (name: string) => gl.getUniformLocation(prog, name);
  const u = {
    origin: U('uOrigin'), size: U('uSize'), offset: U('uOffset'), wind: U('uWind'), scale: U('uScale'), h: U('uH'), t: U('uT'),
    css: U('uCss'), cloud: U('uCloud'), rain: U('uRain'), mud: U('uMud'), sun: U('uSun'), streaks: U('uStreaks'),
  };
  // The effects field covers the painting's bounds at half a pixel per map unit.
  gl.uniform2f(u.origin, bounds.x, bounds.y);
  gl.uniform2f(u.size, effects.width * 2, effects.height * 2);
  gl.uniform2f(u.wind, WIND[0], WIND[1]);

  return {
    software,
    render(t, view, sky, streaks) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.t, t);
      gl.uniform1f(u.scale, view.scale);
      gl.uniform2f(u.offset, view.offsetX, view.offsetY);
      gl.uniform1f(u.h, canvas.height);
      gl.uniform1f(u.css, view.css);
      gl.uniform1f(u.cloud, sky.cloud);
      gl.uniform1f(u.rain, sky.rain);
      gl.uniform1f(u.mud, sky.mud);
      gl.uniform1f(u.sun, sky.sun);
      gl.uniform1f(u.streaks, streaks ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      // The canvas keeps its context (a new layer may be set up on it); its program and data go.
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      for (const t of textures) gl.deleteTexture(t);
    },
  };
}
