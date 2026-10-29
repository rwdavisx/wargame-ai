// A six-sided die drawn as a CSS 3D cube. Each throw tumbles with random
// spins and a couple of bounces, then comes to rest on the face it was told.
import { useEffect, useRef } from 'react';
import { sfx } from '../sound';

/** Pip positions on a 3×3 grid (column, row), per face value. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** Where each face sits on the cube (opposite faces add up to 7). */
const FACE_POS: Record<number, string> = {
  1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)',
};
/** The cube rotation that turns each face towards the viewer. */
const FACE_SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 3: { x: 0, y: -90 }, 4: { x: 0, y: 90 }, 2: { x: -90, y: 0 }, 5: { x: 90, y: 0 },
};
/** Resting pose before the first throw: three faces in view. */
const IDLE = 'rotateZ(0deg) rotateX(-24deg) rotateY(36deg)';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How long a throw takes, in ms, for an animation speed setting (0.5 fast … 1.5 slow). */
export const throwMs = (speed: number) => (reducedMotion() ? 220 : Math.round(1500 * Math.max(0.5, Math.min(1.5, speed || 1))));

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

function Face({ n, tone }: { n: number; tone: string }) {
  return (
    <div className={`die3-face ${tone}`} style={{ transform: `${FACE_POS[n]} translateZ(calc(var(--die) / 2))` }}>
      {PIPS[n].map(([c, r], i) => (
        <i key={i} className={n === 1 ? 'ace' : ''} style={{ gridColumn: c + 1, gridRow: r + 1 }} />
      ))}
    </div>
  );
}

/**
 * The die. Change `throwKey` (with `value` set) to throw it; `onLanded` fires when it comes to rest.
 * With no throw yet it sits in its idle pose, or shows `value` if one is given.
 */
export function Die3D({ value, throwKey, size = 76, speed = 1, tone = 'ivory', onLanded, label }: {
  value: number | null; throwKey: number; size?: number; speed?: number; tone?: 'ivory' | 'red'; onLanded?: () => void; label?: string;
}) {
  const cube = useRef<HTMLDivElement>(null);
  const hop = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => {
    const c = cube.current;
    const h = hop.current;
    const sh = shadow.current;
    if (!c || !h || !sh) return;
    const v = value && value >= 1 && value <= 6 ? value : null;
    if (!v) {
      c.style.transform = IDLE;
      return;
    }
    const end = FACE_SHOW[v];
    const tilt = rnd(-10, 10);
    const rest = `rotateZ(${tilt}deg) rotateX(${end.x}deg) rotateY(${end.y}deg)`;
    if (!throwKey) {
      c.style.transform = rest;
      return;
    }
    const ms = throwMs(speed);
    const timers: number[] = [];
    const anims: Animation[] = [];
    const done = () => {
      c.style.transform = rest;
      landed.current?.();
    };
    if (reducedMotion() || typeof c.animate !== 'function') {
      c.style.transform = rest;
      anims.push(c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: ms }));
      timers.push(window.setTimeout(done, ms));
    } else {
      // Two to three full turns on each axis, decelerating onto the target face.
      const kx = sign() * (2 + Math.floor(Math.random() * 2));
      const ky = sign() * (2 + Math.floor(Math.random() * 2));
      const fx = end.x + 360 * kx;
      const fy = end.y + 360 * ky;
      const spin = (f: number) => `rotateZ(${tilt * (1 - f) + sign() * 40 * (1 - f)}deg) rotateX(${fx * f + rnd(-30, 30) * (1 - f)}deg) rotateY(${fy * f + rnd(-30, 30) * (1 - f)}deg)`;
      anims.push(c.animate([
        { transform: `rotateZ(${rnd(-40, 40)}deg) rotateX(${rnd(-60, 60)}deg) rotateY(${rnd(-60, 60)}deg)` },
        { transform: spin(0.55), offset: 0.35 },
        { transform: spin(0.86), offset: 0.62 },
        { transform: spin(0.97), offset: 0.82 },
        { transform: rest },
      ], { duration: ms, easing: 'cubic-bezier(0.2, 0.55, 0.35, 1)', fill: 'forwards' }));
      // Thrown in from the upper left: lands, bounces twice and settles.
      const dir = sign();
      anims.push(h.animate([
        { transform: `translate(${-70 * dir}%, -170%) scale(0.86)`, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' },
        { transform: `translate(${-26 * dir}%, 0) scale(1)`, offset: 0.3, easing: 'cubic-bezier(0, 0.5, 0.5, 1)' },
        { transform: `translate(${-12 * dir}%, -46%) scale(1)`, offset: 0.46, easing: 'cubic-bezier(0.5, 0, 1, 0.5)' },
        { transform: `translate(${-4 * dir}%, 0) scale(1)`, offset: 0.62, easing: 'cubic-bezier(0, 0.5, 0.5, 1)' },
        { transform: `translate(${-1 * dir}%, -14%) scale(1)`, offset: 0.72, easing: 'cubic-bezier(0.5, 0, 1, 0.5)' },
        { transform: 'translate(0, 0) scale(1)', offset: 0.8 },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: ms, fill: 'forwards' }));
      anims.push(sh.animate([
        { opacity: 0.1, transform: 'scale(0.45)' },
        { opacity: 0.7, transform: 'scale(1)', offset: 0.3 },
        { opacity: 0.35, transform: 'scale(0.7)', offset: 0.46 },
        { opacity: 0.7, transform: 'scale(1)', offset: 0.62 },
        { opacity: 0.55, transform: 'scale(0.9)', offset: 0.72 },
        { opacity: 0.7, transform: 'scale(1)', offset: 0.8 },
        { opacity: 0.7, transform: 'scale(1)' },
      ], { duration: ms, fill: 'forwards' }));
      sfx.dice();
      timers.push(window.setTimeout(() => sfx.dice(), ms * 0.3));
      timers.push(window.setTimeout(() => sfx.click(), ms * 0.62));
      timers.push(window.setTimeout(() => sfx.click(), ms * 0.8));
      timers.push(window.setTimeout(done, ms + 30));
    }
    return () => {
      timers.forEach((t) => clearTimeout(t));
      anims.forEach((a) => a?.cancel());
    };
  }, [throwKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`die3${value ? '' : ' idle'}`} style={{ ['--die' as string]: `${size}px` }} role="img" aria-label={label ?? (value ? `Die showing ${value}` : 'Die')}>
      <div className="die3-shadow" ref={shadow} />
      <div className="die3-hop" ref={hop}>
        <div className="die3-cube" ref={cube} style={{ transform: IDLE }}>
          <div className={`die3-core ${tone}`} />
          <div className={`die3-core ${tone}`} style={{ transform: 'rotateX(90deg)' }} />
          <div className={`die3-core ${tone}`} style={{ transform: 'rotateY(90deg)' }} />
          {[1, 2, 3, 4, 5, 6].map((n) => <Face key={n} n={n} tone={tone} />)}
        </div>
      </div>
    </div>
  );
}

/** A flat die face (for outcome tables). */
export function Pips({ n, size = 22, dim }: { n: number; size?: number; dim?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`pips${dim ? ' dim' : ''}`} aria-hidden>
      <rect x={1} y={1} width={22} height={22} rx={5} />
      {(PIPS[n] ?? []).map(([c, r], i) => <circle key={i} cx={6 + c * 6} cy={6 + r * 6} r={2.1} />)}
    </svg>
  );
}
