// The hand of the counter painter: card shapes cut a little irregularly, pen lines that wobble and overshoot their
// corners, colour washed in slightly off the lines, watercolour washes darker where the pigment pooled, and the
// paper's grain. Every irregularity comes from a seeded random stream, so a counter looks the same every time.
import { rng } from './geom';

export type Rand = () => number;

/** A seeded stream for one counter (or one part of it). */
export const hand = (seed: string): Rand => rng(`hand:${seed}`);

const f = (n: number) => n.toFixed(2);

/** A card cut by hand: rounded corners of slightly different radii, edges that bow a hair in or out. */
export function cardPath(r: Rand, x: number, y: number, w: number, h: number, rad = 2.4, j = 0.35): string {
  const k = () => (r() - 0.5) * 2 * j;
  const rr = () => rad * (0.75 + r() * 0.5);
  const [a, b, c, d] = [rr(), rr(), rr(), rr()];
  const x1 = x + w;
  const y1 = y + h;
  return [
    `M${f(x + a)},${f(y + k() * 0.5)}`,
    `Q${f(x + w / 2)},${f(y + k())} ${f(x1 - b)},${f(y + k() * 0.5)}`,
    `Q${f(x1 + k() * 0.3)},${f(y + k() * 0.3)} ${f(x1 + k() * 0.5)},${f(y + b)}`,
    `Q${f(x1 + k())},${f(y + h / 2)} ${f(x1 + k() * 0.5)},${f(y1 - c)}`,
    `Q${f(x1 + k() * 0.3)},${f(y1 + k() * 0.3)} ${f(x1 - c)},${f(y1 + k() * 0.5)}`,
    `Q${f(x + w / 2)},${f(y1 + k())} ${f(x + d)},${f(y1 + k() * 0.5)}`,
    `Q${f(x + k() * 0.3)},${f(y1 + k() * 0.3)} ${f(x + k() * 0.5)},${f(y1 - d)}`,
    `Q${f(x + k())},${f(y + h / 2)} ${f(x + k() * 0.5)},${f(y + a)}`,
    `Q${f(x + k() * 0.3)},${f(y + k() * 0.3)} ${f(x + a)},${f(y + k() * 0.5)}Z`,
  ].join(' ');
}

/** A patch of colour laid with a brush: a rectangle with soft, uneven edges. */
export function roughRect(r: Rand, x: number, y: number, w: number, h: number, j = 0.3): string {
  const k = () => (r() - 0.5) * 2 * j;
  const pts: [number, number][] = [
    [x + k(), y + k()], [x + w / 2 + k(), y + k() * 0.6], [x + w + k(), y + k()], [x + w + k() * 0.6, y + h / 2 + k()],
    [x + w + k(), y + h + k()], [x + w / 2 + k(), y + h + k() * 0.6], [x + k(), y + h + k()], [x + k() * 0.6, y + h / 2 + k()],
  ];
  return `M${pts.map(([px, py]) => `${f(px)},${f(py)}`).join(' L')}Z`;
}

/** One pen stroke from (x1, y1) to (x2, y2): a slight bow, ends that overshoot a little, as a hand rules a line. */
export function inkLine(r: Rand, x1: number, y1: number, x2: number, y2: number, wob = 0.35, over = 0.35): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const o1 = over * (0.3 + r());
  const o2 = over * (0.3 + r());
  const bow = (r() - 0.5) * 2 * wob;
  const sx = x1 - ux * o1 + (r() - 0.5) * 0.2;
  const sy = y1 - uy * o1 + (r() - 0.5) * 0.2;
  const ex = x2 + ux * o2 + (r() - 0.5) * 0.2;
  const ey = y2 + uy * o2 + (r() - 0.5) * 0.2;
  return `M${f(sx)},${f(sy)} Q${f((sx + ex) / 2 - uy * bow)},${f((sy + ey) / 2 + ux * bow)} ${f(ex)},${f(ey)}`;
}

/** A box ruled by hand: four strokes that cross at the corners. */
export function inkBox(r: Rand, x: number, y: number, w: number, h: number, wob = 0.25): string {
  return [
    inkLine(r, x, y, x + w, y, wob),
    inkLine(r, x + w, y, x + w, y + h, wob),
    inkLine(r, x + w, y + h, x, y + h, wob),
    inkLine(r, x, y + h, x, y, wob),
  ].join(' ');
}

/** An oval drawn freehand: a stadium shape whose ends do not quite meet. */
export function inkOval(r: Rand, rx: number, ry: number): string {
  const k = () => (r() - 0.5) * 0.35;
  const s = rx - ry;
  return `M${f(-s + k())},${f(-ry + k())} L${f(s + k())},${f(-ry + k())} A${f(ry)},${f(ry)} 0 0 1 ${f(s + k())},${f(ry + k())} L${f(-s + k())},${f(ry + k())} A${f(ry)},${f(ry)} 0 0 1 ${f(-s + 0.25)},${f(-ry - 0.15)}`;
}

/** A circle drawn freehand, a touch out of round. */
export function inkCircle(r: Rand, cx: number, cy: number, rad: number): string {
  const a0 = r() * Math.PI * 2;
  const pts = Array.from({ length: 9 }, (_, i) => {
    const a = a0 + (i / 8) * Math.PI * 2 * 1.04;
    const q = rad * (1 + (r() - 0.5) * 0.08);
    return [cx + Math.cos(a) * q, cy + Math.sin(a) * q];
  });
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[i - 1];
    d += ` Q${f(qx + (px - qx) / 2 + (cx - (qx + px) / 2) * -0.08)},${f(qy + (py - qy) / 2 + (cy - (qy + py) / 2) * -0.08)} ${f(px)},${f(py)}`;
  }
  return d;
}

// ------------------------------------------------------------------ colour

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const hexOf = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** A colour lightened (k > 0, toward warm paper) or darkened (k < 0, toward sepia). */
export function shade(hex: string, k: number): string {
  const c = rgbOf(hex);
  const to = k > 0 ? [250, 244, 226] : [52, 36, 24];
  const t = Math.abs(k);
  return hexOf(c.map((v, i) => v + (to[i] - v) * t));
}

/** The gradient id of a counter colour's watercolour wash (WashDefs defines it). */
export const washId = (hex: string) => `wash-${hex.slice(1).toLowerCase()}`;

/** Washes for the given colours: paler where the brush was wet in the middle, darker toward the edges where the
 * pigment pooled. */
export function WashDefs({ colours }: { colours: string[] }) {
  return (
    <>
      {[...new Set(colours)].map((c) => (
        <radialGradient key={c} id={washId(c)} cx="42%" cy="36%" r="78%">
          <stop offset="0" stopColor={shade(c, 0.16)} />
          <stop offset="0.55" stopColor={c} />
          <stop offset="0.9" stopColor={shade(c, -0.1)} />
          <stop offset="1" stopColor={shade(c, -0.18)} />
        </radialGradient>
      ))}
    </>
  );
}

/** Three tiles of paper grain and brush streaks, one counter wide, for laying over a wash. */
export function GrainDefs() {
  return (
    <>
      {[0, 1, 2].map((v) => {
        const r = rng(`grain${v}`);
        const S = 36;
        const dots = Array.from({ length: 70 }, () => [r() * S, r() * S, 0.12 + r() * 0.26, r() < 0.62]);
        // Blooms: soft blotches where the wash dried paler or darker.
        const blooms = Array.from({ length: 7 }, () => [r() * S, r() * S, 3 + r() * 6, r() < 0.5]);
        // A couple of faint brush marks, at no particular angle.
        const streaks = Array.from({ length: 2 }, () => {
          const y = r() * S;
          const a = (r() - 0.5) * 1.2;
          return `M${f(-4)},${f(y)} q${f(S / 2)},${f(Math.tan(a) * S * 0.5 + (r() - 0.5) * 5)} ${f(S + 8)},${f(Math.tan(a) * S)}`;
        });
        const fibres = Array.from({ length: 5 }, () => {
          const x = r() * S;
          const y = r() * S;
          const a = r() * Math.PI;
          return `M${f(x)},${f(y)} q${f(Math.cos(a + 0.5) * 2)},${f(Math.sin(a + 0.5) * 2)} ${f(Math.cos(a) * 4)},${f(Math.sin(a) * 4)}`;
        });
        return (
          <pattern key={v} id={`grain-${v}`} patternUnits="userSpaceOnUse" width={S} height={S} x={-S / 2} y={-S / 2}>
            {blooms.map(([x, y, rad, dark], i) => (
              <circle key={`b${i}`} cx={f(x as number)} cy={f(y as number)} r={f(rad as number)} fill={dark ? '#3a2814' : '#fff8e6'} fillOpacity={dark ? 0.06 : 0.09} />
            ))}
            {streaks.map((d, i) => <path key={`s${i}`} d={d} stroke="#3a2814" strokeOpacity={0.05} strokeWidth={2.2 + i} fill="none" strokeLinecap="round" />)}
            {fibres.map((d, i) => <path key={`f${i}`} d={d} stroke={i % 2 ? '#fffaf0' : '#2e2012'} strokeOpacity={0.22} strokeWidth={0.18} fill="none" />)}
            {dots.map(([x, y, rad, dark], i) => (
              <circle key={i} cx={f(x as number)} cy={f(y as number)} r={f(rad as number)} fill={dark ? '#2e2012' : '#fffaf0'} fillOpacity={dark ? 0.16 : 0.24} />
            ))}
          </pattern>
        );
      })}
    </>
  );
}

/** Which of the grain tiles a counter uses. */
export const grainOf = (seed: string) => `url(#grain-${Math.floor(rng(`g:${seed}`)() * 3)})`;

/** Sepia ink for the pen work, and the warm paper white for lettering on dark grounds. */
export const INK = '#2b2016';
export const PAPER_WHITE = '#f6efdc';
