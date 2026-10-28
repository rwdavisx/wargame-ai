// Unit tokens: a coloured plate per army, an illustration of the unit type,
// national insignia, the strength strip and status badges.
import { memo } from 'react';
import type { Category, Nation, UnitState } from '../../engine/types';
import { def, stepsRemaining, values } from '../../engine/units';

const INK = 'rgba(18,18,14,0.88)';
const RIM = 'rgba(255,248,225,0.32)';
const WHEEL = 'rgba(255,248,225,0.26)';

export type ArtKind =
  | 'infantry' | 'garrison' | 'halftrack' | 'tank' | 'recon' | 'artillery' | 'rocket' | 'para' | 'glider' | 'commando' | 'engineer' | 'beach';

export function artFor(cat: Category, formation: string): ArtKind {
  switch (cat) {
    case 'infantry':
      return formation === 'Commando Bde' ? 'commando' : 'infantry';
    case 'garrison':
      return 'garrison';
    case 'motorized':
    case 'pg':
      return 'halftrack';
    case 'tank':
      return 'tank';
    case 'recon':
      return 'recon';
    case 'divAsu':
    case 'corpsAsu':
      return 'artillery';
    case 'nebelwerfer':
      return 'rocket';
    case 'airborne':
      return 'para';
    case 'glider':
      return 'glider';
    case 'ranger':
      return 'commando';
    case 'engineer':
      return 'engineer';
    case 'bh':
      return 'beach';
  }
}

// ------------------------------------------------------------------ figures

function Helmet({ nation, x, y }: { nation: Nation; x: number; y: number }) {
  if (nation === 'GE') {
    // Stahlhelm with its flared skirt.
    return <path d={`M${x - 2.6},${y + 0.6} Q${x - 2.4},${y - 2.4} ${x},${y - 2.5} Q${x + 2.4},${y - 2.4} ${x + 2.5},${y + 0.2} L${x + 3.2},${y + 1.1} L${x - 3.1},${y + 1.2} Z`} fill={INK} />;
  }
  if (nation === 'US') return <path d={`M${x - 2.7},${y + 0.7} Q${x - 2.6},${y - 2.6} ${x},${y - 2.6} Q${x + 2.6},${y - 2.6} ${x + 2.7},${y + 0.7} Z`} fill={INK} />;
  // Brodie helmet: a wide shallow bowl.
  return (
    <g fill={INK}>
      <ellipse cx={x} cy={y + 0.5} rx={3.8} ry={0.8} />
      <path d={`M${x - 2.2},${y + 0.4} Q${x},${y - 2.6} ${x + 2.2},${y + 0.4} Z`} />
    </g>
  );
}

/** A marching soldier with a slung rifle, about 9 units tall. */
function Soldier({ nation, x, y = 0, beret, scale = 1 }: { nation: Nation; x: number; y?: number; beret?: boolean; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} stroke={INK} strokeLinecap="round" fill="none">
      {beret ? <ellipse cx={0.4} cy={-6.4} rx={2.4} ry={1} fill={INK} stroke="none" transform="rotate(-12 0.4 -6.4)" /> : <Helmet nation={nation} x={0} y={-6} />}
      <circle cx={0} cy={-4.4} r={1.35} fill={INK} stroke="none" />
      <path d="M-1.8,-2.8 L1.9,-2.8 L2.3,2.3 L-2.2,2.3 Z" fill={INK} stroke="none" />
      <path d="M-1.2,2 L-3.2,7.6 M1.1,2 L2.6,7.6" strokeWidth={1.7} />
      <path d="M-1.6,-2.2 L-3.3,1.6 M1.7,-2.2 L3.2,1" strokeWidth={1.1} />
      <path d="M-3.8,2.8 L4.6,-6.4" strokeWidth={0.95} />
    </g>
  );
}

function Tank({ nation }: { nation: Nation }) {
  const german = nation === 'GE';
  return (
    <g>
      <rect x={-13.5} y={1.5} width={27} height={6.4} rx={3.2} fill={INK} />
      {[-9.5, -5, -0.5, 4, 8.5].map((x) => <circle key={x} cx={x} cy={4.7} r={1.7} fill={WHEEL} />)}
      <path d="M-13.5,2 L-11.5,-2.2 L11,-2.2 L14,2 Z" fill={INK} />
      {german ? (
        <>
          <path d="M-7,-2.2 L-6,-7.4 L4.2,-7.4 L5.6,-2.2 Z" fill={INK} />
          <rect x={4.6} y={-6.2} width={11} height={1.3} fill={INK} />
          <rect x={14.6} y={-6.7} width={2} height={2.3} fill={INK} />
        </>
      ) : (
        <>
          <path d="M-6.5,-2.2 Q-6.5,-7.8 -0.5,-7.8 Q5.5,-7.8 5.5,-2.2 Z" fill={INK} />
          <rect x={4.5} y={-5.9} width={9} height={1.4} fill={INK} />
        </>
      )}
      <path d="M-11.5,-2.2 L11,-2.2" stroke={RIM} strokeWidth={0.5} />
    </g>
  );
}

function Halftrack({ nation }: { nation: Nation }) {
  return (
    <g>
      <rect x={-13} y={1.6} width={16} height={5.6} rx={2.8} fill={INK} />
      {[-9.8, -5.6, -1.4].map((x) => <circle key={x} cx={x} cy={4.4} r={1.5} fill={WHEEL} />)}
      <path d="M-14,1.8 L-13,-3.4 L4,-3.4 L7.5,-1 L13.5,-0.6 L14,1.8 Z" fill={INK} />
      <circle cx={9.6} cy={4.2} r={3} fill={INK} />
      <circle cx={9.6} cy={4.2} r={1.2} fill={WHEEL} />
      <Helmet nation={nation} x={-8.5} y={-4.3} />
      <Helmet nation={nation} x={-3} y={-4.3} />
      <path d="M-13,-3.4 L4,-3.4" stroke={RIM} strokeWidth={0.5} />
    </g>
  );
}

function ArmouredCar() {
  return (
    <g>
      <path d="M-13,2 L-11,-3.2 L9,-3.2 L13.5,0 L13.5,2 Z" fill={INK} />
      <rect x={-4} y={-7} width={7.5} height={4} rx={1} fill={INK} />
      <rect x={3} y={-5.8} width={8} height={1.1} fill={INK} />
      {[-9, -3.5, 3.5, 9].map((x) => (
        <g key={x}>
          <circle cx={x} cy={4.4} r={2.8} fill={INK} />
          <circle cx={x} cy={4.4} r={1.1} fill={WHEEL} />
        </g>
      ))}
    </g>
  );
}

function Gun() {
  return (
    <g>
      <path d="M-1,-1.5 L14,-7.2 L14.5,-5.8 L-0.4,0.4 Z" fill={INK} />
      <path d="M-4,-4 L1.5,-4.5 L2.5,2 L-3.5,2.5 Z" fill={INK} />
      <path d="M-1,3 L-13.5,7.4" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={-0.5} cy={3.6} r={4.3} fill={INK} />
      <circle cx={-0.5} cy={3.6} r={2.6} fill="none" stroke={WHEEL} strokeWidth={0.6} />
      {[0, 60, 120].map((a) => (
        <line key={a} x1={-0.5} y1={1} x2={-0.5} y2={6.2} stroke={WHEEL} strokeWidth={0.5} transform={`rotate(${a} -0.5 3.6)`} />
      ))}
    </g>
  );
}

function Rockets() {
  return (
    <g>
      <g transform="rotate(-22 0 -1)">
        {[0, 1, 2].map((r) =>
          [0, 1].map((c) => <rect key={`${r}${c}`} x={-7 + c * 0.6} y={-6 + r * 2.6 + c * 1.3} width={14} height={2.2} rx={1} fill={INK} />),
        )}
      </g>
      <path d="M-2,3 L-12,6.5" stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={2} cy={4.4} r={3} fill={INK} />
      <circle cx={2} cy={4.4} r={1.2} fill={WHEEL} />
    </g>
  );
}

function Parachute({ nation }: { nation: Nation }) {
  return (
    <g>
      <path d="M-11,-2.5 Q-11,-9.5 0,-9.5 Q11,-9.5 11,-2.5 Q8.2,-4 5.5,-2.5 Q2.7,-4 0,-2.5 Q-2.7,-4 -5.5,-2.5 Q-8.2,-4 -11,-2.5 Z" fill={INK} />
      <path d="M-11,-2.5 L-1,4 M11,-2.5 L1,4 M-5.5,-2.5 L-0.6,4 M5.5,-2.5 L0.6,4" stroke={INK} strokeWidth={0.45} />
      <Soldier nation={nation} x={0} y={5} scale={0.62} />
    </g>
  );
}

function Glider() {
  return (
    <g fill={INK}>
      <path d="M-14,0.5 Q-12,-2 -6,-2 L10,-1.4 L14,-4.6 L15,-4.4 L13.5,0.8 L-6,1.8 Q-12,2 -14,0.5 Z" />
      <path d="M-4,-1.6 L6,-1.6 L1.5,-8.4 L-0.5,-8.4 Z" />
      <path d="M-3,1.4 L7,1.4 L3,6.5 L1,6.5 Z" opacity={0.7} />
    </g>
  );
}

function Bridge() {
  return (
    <g>
      <path d="M-14,4.5 Q-10,3 -6,4.5 T2,4.5 T10,4.5 T14,4.5" stroke="rgba(170,210,235,0.75)" strokeWidth={1} fill="none" />
      <rect x={-14} y={-1.6} width={28} height={2.2} fill={INK} />
      <path d="M-12,0.6 Q-6,-6.5 0,0.6 Q6,-6.5 12,0.6" stroke={INK} strokeWidth={1.3} fill="none" />
      {[-9, -6, -3, 3, 6, 9].map((x) => <line key={x} x1={x} y1={0.5} x2={x} y2={-3.2 + Math.abs(x) * 0.12} stroke={INK} strokeWidth={0.6} />)}
      <path d="M-12,0.6 L-12,4 M12,0.6 L12,4 M0,0.6 L0,4" stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

function Beach() {
  return (
    <g>
      <path d="M-14,5.5 Q-9,3.5 -4,5.5 T6,5.5 T14,5.5" stroke="rgba(170,210,235,0.8)" strokeWidth={1.1} fill="none" />
      <g stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round">
        <circle cx={-6} cy={-6.5} r={1.4} />
        <path d="M-6,-5 L-6,3 M-9,-3 L-3,-3 M-10.5,0.5 Q-6,4.5 -1.5,0.5" />
      </g>
      {[[2, 0], [7, 0], [4.5, -4.2], [9.5, -4.2]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <rect x={x - 2.2} y={y - 2} width={4.4} height={4} fill={INK} />
          <path d={`M${x - 2.2},${y} L${x + 2.2},${y}`} stroke={RIM} strokeWidth={0.4} />
        </g>
      ))}
    </g>
  );
}

function Sandbags({ nation }: { nation: Nation }) {
  return (
    <g>
      <Soldier nation={nation} x={-1} y={-1} />
      {[-10.5, -5.5, -0.5, 4.5, 9.5].map((x) => <ellipse key={x} cx={x} cy={4.6} rx={2.8} ry={2} fill={INK} stroke={RIM} strokeWidth={0.4} />)}
      {[-8, -3, 2, 7].map((x) => <ellipse key={x} cx={x} cy={1.4} rx={2.8} ry={1.8} fill={INK} stroke={RIM} strokeWidth={0.4} />)}
    </g>
  );
}

export function UnitArt({ kind, nation }: { kind: ArtKind; nation: Nation }) {
  switch (kind) {
    case 'infantry':
      return (
        <g>
          <Soldier nation={nation} x={-8.5} scale={0.9} />
          <Soldier nation={nation} x={0} />
          <Soldier nation={nation} x={8.5} scale={0.9} />
        </g>
      );
    case 'garrison':
      return <Sandbags nation={nation} />;
    case 'halftrack':
      return <Halftrack nation={nation} />;
    case 'tank':
      return <Tank nation={nation} />;
    case 'recon':
      return <ArmouredCar />;
    case 'artillery':
      return <Gun />;
    case 'rocket':
      return <Rockets />;
    case 'para':
      return <Parachute nation={nation} />;
    case 'glider':
      return <Glider />;
    case 'commando':
      return (
        <g>
          <Soldier nation={nation} x={-5} beret />
          <Soldier nation={nation} x={5} beret />
        </g>
      );
    case 'engineer':
      return <Bridge />;
    case 'beach':
      return <Beach />;
  }
}

// ------------------------------------------------------------------ insignia

export function Insignia({ nation, x, y, r = 3.6 }: { nation: Nation; x: number; y: number; r?: number }) {
  if (nation === 'US') {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.36 : r * 0.82;
      return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
    }).join(' ');
    return (
      <g>
        <circle cx={x} cy={y} r={r} fill="#203260" stroke="#f4f1e8" strokeWidth={0.55} />
        <polygon points={pts} fill="#f4f1e8" />
      </g>
    );
  }
  if (nation === 'GE') {
    const a = r * 0.95;
    const t = r * 0.32;
    const cross = `M${x - t},${y - a} h${2 * t} v${a - t} h${a - t} v${2 * t} h${-(a - t)} v${a - t} h${-2 * t} v${-(a - t)} h${-(a - t)} v${-2 * t} h${a - t} Z`;
    return (
      <g>
        <path d={cross} fill="#f4f1e8" transform={`translate(${x} ${y}) scale(1.28) translate(${-x} ${-y})`} />
        <path d={cross} fill="#111" />
      </g>
    );
  }
  if (nation === 'CN') {
    return (
      <g>
        <circle cx={x} cy={y} r={r} fill="#b3261e" stroke="#f4f1e8" strokeWidth={0.55} />
        <path d={`M${x},${y - r * 0.7} L${x + r * 0.25},${y - r * 0.2} L${x + r * 0.62},${y - r * 0.35} L${x + r * 0.42},${y + r * 0.12} L${x + r * 0.15},${y + r * 0.1} L${x + r * 0.1},${y + r * 0.7} L${x - r * 0.1},${y + r * 0.7} L${x - r * 0.15},${y + r * 0.1} L${x - r * 0.42},${y + r * 0.12} L${x - r * 0.62},${y - r * 0.35} L${x - r * 0.25},${y - r * 0.2} Z`} fill="#f4f1e8" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#22327a" />
      <circle cx={x} cy={y} r={r * 0.66} fill="#f4f1e8" />
      <circle cx={x} cy={y} r={r * 0.36} fill="#c8102e" />
    </g>
  );
}

// ------------------------------------------------------------------ tokens

const PLATE: Record<string, [string, string]> = {
  US: ['#7c8744', '#4c5626'],
  BR: ['#b19c68', '#7a6741'],
  CN: ['#ab9363', '#78623e'],
  GE: ['#89939a', '#555e64'],
  GEarmor: ['#6c757b', '#3c4347'],
};

/** Gradient definitions used by every token (render once per document). */
export function TokenDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {Object.entries(PLATE).map(([k, [a, b]]) => (
          <linearGradient key={k} id={`plate-${k}`} x1={0} y1={0} x2={0} y2={1}>
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
        <linearGradient id="plate-shine" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <filter id="token-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx={1.2} dy={2.2} stdDeviation={1.4} floodColor="#000" floodOpacity={0.55} />
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={2.2} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="desat">
          <feColorMatrix type="saturate" values="0.35" />
        </filter>
      </defs>
    </svg>
  );
}

export const TOKEN_W = 38;
export const TOKEN_H = 32;

function plateKey(nation: Nation, cat: Category): string {
  if (nation === 'GE') return cat === 'tank' || cat === 'recon' ? 'GEarmor' : 'GE';
  return nation;
}

interface Badge {
  text: string;
  fill: string;
  title: string;
}

function badgesFor(u: UnitState, frozen: boolean): Badge[] {
  const out: Badge[] = [];
  if (u.status === 'disrupted') out.push({ text: 'D', fill: '#d9822b', title: 'Disrupted' });
  if (u.status === 'fullRetreat') out.push({ text: 'FR', fill: '#c0392b', title: 'Full Retreat' });
  if (u.halfEff) out.push({ text: '½', fill: '#c9a227', title: '½ Effective' });
  if (u.isolated) out.push({ text: 'ISO', fill: '#7d1f1a', title: 'Isolated' });
  else if (u.outOfSupply) out.push({ text: 'OOS', fill: '#a8322a', title: 'Out of supply' });
  if (u.repl) out.push({ text: 'R', fill: '#2f6aa3', title: 'Received a replacement' });
  if (u.truck) out.push({ text: 'T', fill: '#5b6770', title: 'On trucks' });
  if (frozen) out.push({ text: '❄', fill: '#2f6aa3', title: 'Frozen in place' });
  return out;
}

export interface TokenProps {
  unit: UnitState;
  /** Units in the same hex (draws the stack behind and a count). */
  count?: number;
  selected?: boolean;
  dim?: boolean;
  frozen?: boolean;
  /** Smaller variant without badges, for lists. */
  compact?: boolean;
}

/** A unit token centred on (0, 0). */
export const UnitToken = memo(function UnitToken({ unit, count = 1, selected, dim, frozen, compact }: TokenProps) {
  const d = def(unit.id);
  const v = values(unit);
  const w = TOKEN_W;
  const h = TOKEN_H;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const plate = `url(#plate-${plateKey(d.nation, d.cat)})`;
  const total = d.steps.length;
  const left = stepsRemaining(unit);
  const fired = !!d.asu && unit.fired;
  const strip = d.asu ? `ART · R${d.asuRange}` : d.cat === 'bh' ? `BEACH ${v.defense}` : `${v.attack}-${v.defense}-${v.move}`;
  const badges = compact ? [] : badgesFor(unit, !!frozen);
  return (
    <g opacity={dim ? 0.72 : 1}>
      {count > 2 && <rect x={x0 + 5} y={y0 - 5} width={w} height={h} rx={4} fill={plate} stroke="#141414" strokeWidth={0.7} filter="url(#token-shadow)" />}
      {count > 1 && <rect x={x0 + 2.5} y={y0 - 2.5} width={w} height={h} rx={4} fill={plate} stroke="#141414" strokeWidth={0.7} filter="url(#token-shadow)" />}
      {selected && <rect x={x0 - 3} y={y0 - 3} width={w + 6} height={h + 6} rx={6} fill="none" stroke="#ffd84a" strokeWidth={2.4} className="token-select" filter="url(#glow)" />}
      <g filter={fired || dim ? 'url(#desat)' : undefined}>
        <rect x={x0} y={y0} width={w} height={h} rx={4} fill={plate} stroke="#141414" strokeWidth={0.8} filter={compact ? undefined : 'url(#token-shadow)'} />
        <rect x={x0 + 0.6} y={y0 + 0.6} width={w - 1.2} height={h / 2} rx={3.5} fill="url(#plate-shine)" />
        {d.army8 && <rect x={x0 + 0.5} y={y0 + 0.5} width={w - 1} height={3} rx={1.5} fill="#e3c13b" />}
        <g transform={`translate(0 ${y0 + 13})`}>
          <UnitArt kind={artFor(d.cat, d.formation)} nation={d.nation} />
        </g>
        <rect x={x0 + 0.8} y={y0 + h - 9.6} width={w - 1.6} height={8.8} rx={2.4} fill="rgba(8,8,6,0.62)" />
        <text x={0} y={y0 + h - 2.9} textAnchor="middle" fontSize={7.4} fontWeight={700} fill="#f4efe0" className="token-num">
          {strip}
        </text>
        {d.elite && <text x={x0 + 3.2} y={y0 + h - 3} fontSize={6} fill="#f2c94c">★</text>}
        {d.tankRating ? (
          <g>
            <rect x={x0 + w - 8.2} y={y0 + h - 8.8} width={7.4} height={7.4} rx={1.5} fill={d.tankDestroyer ? '#e3c13b' : '#f4efe0'} />
            <text x={x0 + w - 4.5} y={y0 + h - 2.9} textAnchor="middle" fontSize={6.4} fontWeight={800} fill={d.tankDestroyer ? '#a8322a' : '#1a1a1a'}>
              {d.tankRating}
            </text>
          </g>
        ) : null}
        {total > 1 &&
          Array.from({ length: total }, (_, i) => (
            <circle key={i} cx={x0 + 4 + i * 4} cy={y0 + 4.4} r={1.45} fill={i < left ? '#f4efe0' : 'rgba(0,0,0,0.45)'} stroke="rgba(0,0,0,0.5)" strokeWidth={0.4} />
          ))}
        <Insignia nation={d.nation} x={x0 + w - 5} y={y0 + 5.2} r={3.3} />
        {fired && (
          <g transform={`rotate(-20)`}>
            <rect x={-15} y={-4.5} width={30} height={7} fill="rgba(120,20,16,0.85)" />
            <text x={0} y={1} textAnchor="middle" fontSize={5.6} fontWeight={800} fill="#f4efe0" letterSpacing={1}>FIRED</text>
          </g>
        )}
      </g>
      {count > 1 && (
        <g>
          <circle cx={x0 - 1} cy={y0 - 1} r={5.2} fill="#151515" stroke="#e8dcb8" strokeWidth={0.8} />
          <text x={x0 - 1} y={y0 + 1.6} textAnchor="middle" fontSize={7} fontWeight={800} fill="#f4efe0">{count}</text>
        </g>
      )}
      {badges.map((b, i) => (
        <g key={b.text} transform={`translate(${x0 + w + 1} ${y0 + 2 + i * 9.5})`}>
          <title>{b.title}</title>
          <rect x={-5.5} y={-4.2} width={b.text.length > 1 ? 13 : 9} height={8.4} rx={4.2} fill={b.fill} stroke="#111" strokeWidth={0.6} />
          <text x={b.text.length > 1 ? 1 : -1} y={2.2} textAnchor="middle" fontSize={6} fontWeight={800} fill="#fff">{b.text}</text>
        </g>
      ))}
    </g>
  );
});

/** A token in its own little SVG, for panels and lists. */
export function TokenIcon({ unit, size = 38 }: { unit: UnitState; size?: number }) {
  return (
    <svg width={size} height={(size * TOKEN_H) / TOKEN_W} viewBox={`${-TOKEN_W / 2 - 1} ${-TOKEN_H / 2 - 1} ${TOKEN_W + 2} ${TOKEN_H + 2}`} className="token-icon">
      <UnitToken unit={unit} compact />
    </svg>
  );
}
