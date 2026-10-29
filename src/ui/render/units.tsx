// Unit counters in the style of the printed game: a nation-coloured counter with a NATO unit-type box
// in the division's colour, the size marker, unit ID, stacking points and the strength line.
import { memo } from 'react';
import type { Nation, UnitState } from '../../engine/types';
import { def, stepsRemaining, values } from '../../engine/units';
import type { UnitDef } from '../../engine/types';

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

// ------------------------------------------------------------------ counter colours

/** Counter background by army (and a few formations printed in their own colours). */
function counterColour(d: UnitDef): string {
  if (d.nation === 'GE') return d.formation === 'HG' ? '#aebfcd' : d.formation === '1 FJ' ? '#98aec0' : '#c9ccca';
  if (d.nation === 'US') return '#9da564';
  if (d.nation === 'CN') return '#c9a06c';
  return '#d2c49b';
}

/** Fill of the unit-type box: the division's colour, white for corps and independent units. */
const DIVISION_FILL: Record<string, string> = {
  '36 Inf Div': '#f1e6a2', '45 Inf Div': '#a9c8e6', '34 Inf Div': '#f2b45c', '3 Inf Div': '#6f8a55', '82 Abn Div': '#df4b3d', "Darby's Rangers": '#3c70c4',
  '46 Div': '#f3ecd3', '56 Div': '#8b8a62', '7 Armd Div': '#e2553f', 'Commando Bde': '#3c70c4', '5 Div': '#8193d6', '1 CN Div': '#efe2bf',
  '16 Pz': '#5b6064', '29 PG': '#5f9ddb', '26 Pz': '#e8c94a', '15 PG': '#6dab4a', '3 PG': '#dd5a50', '1 FJ': '#3f74b8',
};

function boxFill(d: UnitDef): string {
  if (d.cat === 'bh') return '#4b8ad6';
  if (d.cat === 'garrison' || d.formation === 'Remnant') return '#ffffff';
  return DIVISION_FILL[d.formation] ?? '#ffffff';
}

/** Dark symbol on light boxes, white on dark ones. */
function inkOn(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l < 0.55 ? '#ffffff' : '#1c1c18';
}

// ------------------------------------------------------------------ labels

const DIV_TAG: Record<string, string> = {
  '36 Inf Div': '36', '45 Inf Div': '45', '34 Inf Div': '34', '3 Inf Div': '3', '82 Abn Div': '82', '46 Div': '46', '56 Div': '56', '7 Armd Div': '7A',
  '5 Div': '5', '1 CN Div': '1CN', '16 Pz': '16Pz', '29 PG': '29PG', '26 Pz': '26Pz', '15 PG': '15PG', '3 PG': '3PG', HG: 'HG', '1 FJ': '1FJ',
};
const SHORT: Record<string, string> = {
  'GE-KGDor': 'Dör/16Pz', 'BR-Greys': 'RySct', 'BR-KDG': '1 KDG', 'BR-11H': '11H/7A', 'BR-5H': '5H/46', 'BR-2-5Q': '2/5Q/56', 'BR-7OB': '7OB/56',
  'BR-41Cdo': '41 Cdo', 'BR-2Cdo': '2 Cdo', 'GE-HGAA': 'HG/HG', 'GE-26AA': '26/26Pz', 'GE-29AA': '129/29PG', 'GE-71NW': '71', 'US-3-531': '3/531',
  'US-2-509': '2/509', 'US-100': '100/34', 'GE-REM129': '129/15PG', 'BR-REM-22': '22/7A', 'US-REM-82': '82', 'GE-826': '8/26Pz', 'BR-22': '22/7A',
  'GE-HGI': 'HG I+II', 'GE-HGIII': 'HG III', 'BR-40RTR': '40 RTR', 'BR-5RTR': '5 RTR', 'CN-11': '11 CN', 'CN-14': '14 CN',
};
/** Formation names printed under the artillery box. */
const ASU_LABEL: Record<string, string> = { 'GE-76Pz': '76 Pz Corps', 'GE-14Pz': '14 Pz Corps', 'GE-71NW': '71 NW', 'BR-7AArt': '7 Armd Div' };

/** The unit's identification as printed up the left side of the counter. */
function shortId(d: UnitDef): string {
  if (SHORT[d.id]) return SHORT[d.id];
  if (d.asu) return '';
  if (d.cat === 'garrison' || d.formation === 'Remnant') return d.name.slice(-1);
  if (d.cat === 'bh') return d.name.split(' ')[0];
  let base = d.name.replace(' (-)', '').replace(/ (RCT|Bde|Inf Rgt|Rgt|Tank Bn|TD Bn|Inf Bn|Bn|PIR|GIR|PIB|PG|Pz Abt|Pz|Abt|Gds Bde|Cdn Bde|Tank Rgt)$/, '');
  base = base.replace(/ Gds$/, 'G').replace(/ Cdn$/, '').replace(/ (PG|Pz|FJ|HG)$/, '');
  const tag = DIV_TAG[d.formation];
  if (tag && !base.endsWith(`/${tag}`)) base = `${base}/${tag}`;
  return base;
}

/** Unit size marker: II battalion, III regiment, X brigade, XXX corps; (-) when a part is detached. */
function sizeMark(d: UnitDef): string {
  const minus = d.name.includes('(-)') ? '(-)' : '';
  if (d.cat === 'corpsAsu') return 'XXX';
  if (d.cat === 'divAsu') return d.nation === 'BR' || d.nation === 'CN' ? '[X]' : '[III]';
  if (d.cat === 'garrison' || d.isRemnant) return '';
  if (d.cat === 'bh') return 'II';
  if (d.cat === 'nebelwerfer') return 'III';
  if (/^KG /.test(d.name)) return 'KG';
  if (/\bBde\b/.test(d.name)) return `X${minus}`;
  if (/\b(RCT|Rgt|PIR|GIR)\b/.test(d.name)) return `III${minus}`;
  if (d.id === 'GE-826') return 'I';
  return `II${minus}`;
}

// ------------------------------------------------------------------ NATO symbols

const MECHANIZED = new Set(['GE-II64', 'GE-I9', 'GE-I2HG', 'BR-22']);

type Symbol = 'infantry' | 'motorized' | 'mechanized' | 'armor' | 'antitank' | 'armorRecon' | 'airborne' | 'commando' | 'engineer' | 'artillery' | 'rocket' | 'garrison' | 'beach';

function symbolFor(d: UnitDef): Symbol {
  if (MECHANIZED.has(d.id)) return 'mechanized';
  switch (d.cat) {
    case 'tank': return d.tankDestroyer ? 'antitank' : 'armor';
    case 'recon': return 'armorRecon';
    case 'motorized': return 'motorized';
    case 'pg': return 'motorized';
    case 'airborne':
    case 'glider': return 'airborne';
    case 'ranger': return 'commando';
    case 'engineer': return 'engineer';
    case 'divAsu':
    case 'corpsAsu': return 'artillery';
    case 'nebelwerfer': return 'rocket';
    case 'garrison': return 'garrison';
    case 'bh': return 'beach';
    default: return 'infantry';
  }
}

/** The NATO unit-type box, centred on (0, 0). */
function NatoBox({ d, w, h }: { d: UnitDef; w: number; h: number }) {
  const fill = boxFill(d);
  const ink = inkOn(fill);
  const x = -w / 2;
  const y = -h / 2;
  const sym = symbolFor(d);
  const sw = 0.85;
  const cross = <path d={`M${x},${y} L${x + w},${y + h} M${x + w},${y} L${x},${y + h}`} stroke={ink} strokeWidth={sw} />;
  const oval = (rx: number, ry: number) => <rect x={-rx} y={-ry} width={rx * 2} height={ry * 2} rx={ry} fill="none" stroke={ink} strokeWidth={sw} />;
  let body: React.ReactNode = null;
  switch (sym) {
    case 'infantry': body = cross; break;
    case 'commando': body = <>{cross}<path d={`M${x + w * 0.22},${y + h} L0,${y + h * 0.55} L${x + w * 0.78},${y + h}`} fill={ink} opacity={0.9} /></>; break;
    case 'motorized': body = <>{cross}<circle cx={-w * 0.22} cy={y + h + 1.5} r={1} fill="#1c1c18" /><circle cx={w * 0.22} cy={y + h + 1.5} r={1} fill="#1c1c18" /></>; break;
    case 'mechanized': body = <>{cross}{oval(w * 0.3, h * 0.27)}</>; break;
    case 'armor': body = oval(w * 0.36, h * 0.3); break;
    case 'antitank': body = <>{oval(w * 0.36, h * 0.3)}<path d={`M${-w * 0.2},${h * 0.18} L0,${-h * 0.22} L${w * 0.2},${h * 0.18}`} fill="none" stroke={ink} strokeWidth={sw} /></>; break;
    case 'armorRecon': body = <>{oval(w * 0.34, h * 0.28)}<path d={`M${x},${y + h} L${x + w},${y}`} stroke={ink} strokeWidth={sw} /></>; break;
    case 'airborne': body = <>{cross}<path d={`M${-w * 0.3},${y + h * 0.3} Q${-w * 0.15},${y + h * 0.05} 0,${y + h * 0.3} Q${w * 0.15},${y + h * 0.05} ${w * 0.3},${y + h * 0.3}`} fill="none" stroke={ink} strokeWidth={sw} /></>; break;
    case 'engineer': body = <path d={`M${-w * 0.3},${h * 0.18} V${-h * 0.15} H${w * 0.3} V${h * 0.18} M0,${-h * 0.15} V${h * 0.18}`} fill="none" stroke={ink} strokeWidth={sw} />; break;
    case 'artillery': body = <circle r={h * 0.18} fill={ink} />; break;
    case 'rocket': body = <path d={`M0,${h * 0.32} V${-h * 0.25} M${-w * 0.13},${-h * 0.05} L0,${-h * 0.3} L${w * 0.13},${-h * 0.05}`} fill="none" stroke={ink} strokeWidth={sw} />; break;
    case 'garrison': body = <text y={h * 0.3} textAnchor="middle" fontSize={h * 0.82} fontWeight={800} fill={ink} className="token-num">G</text>; break;
    case 'beach': body = <text y={h * 0.3} textAnchor="middle" fontSize={h * 0.72} fontWeight={800} fill="#ffffff" className="token-num">BH</text>; break;
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#1c1c18" strokeWidth={0.9} />
      {body}
    </g>
  );
}

// ------------------------------------------------------------------ tokens

/** Shared definitions used by every counter (render once per document). */
export function TokenDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="counter-shine" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0" stopColor="#fff" stopOpacity={0.22} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.12} />
        </linearGradient>
        <filter id="token-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx={1.2} dy={2.2} stdDeviation={1.3} floodColor="#000" floodOpacity={0.55} />
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

export const TOKEN_W = 36;
export const TOKEN_H = 36;

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

/** The strength line along the bottom: attack (with tank rating), defense (red box when elite), movement. */
function StrengthLine({ d, u, y }: { d: UnitDef; u: UnitState; y: number }) {
  const v = values(u);
  const ink = '#1c1c18';
  const fs = 9.6;
  if (d.asu) {
    return (
      <text x={0} y={y} textAnchor="middle" fontSize={fs - 0.6} fontWeight={800} fill={ink} className="token-num">
        S ({v.defense}) {v.move}
      </text>
    );
  }
  const def_ = d.cat === 'garrison' && d.variable ? '?' : `${v.defense}${d.cat === 'bh' ? '+' : ''}`;
  const a = String(v.attack);
  const m = String(v.move);
  // Lay the three numbers out by hand so the defense can sit in its red elite box.
  const cw = fs * 0.56;
  const sup = d.tankRating ? fs * 0.42 : 0;
  const parts = [a.length * cw + sup, cw * 0.55, def_.length * cw, cw * 0.55, m.length * cw];
  const total = parts.reduce((s, n) => s + n, 0);
  let x = -total / 2;
  const xa = x;
  x += parts[0];
  const xd1 = x;
  x += parts[1];
  const xd = x;
  x += parts[2];
  const xd2 = x;
  x += parts[3];
  const xm = x;
  return (
    <g className="token-num" fontWeight={800} fill={ink}>
      <text x={xa} y={y} fontSize={fs}>{a}</text>
      {d.tankRating ? (
        <g>
          {d.tankDestroyer && <rect x={xa + a.length * cw - 0.2} y={y - fs * 0.92} width={sup + 0.6} height={fs * 0.5} fill="#f1c232" />}
          <text x={xa + a.length * cw} y={y - fs * 0.45} fontSize={fs * 0.55} fill={d.tankDestroyer ? '#b3261e' : ink}>{d.tankRating}</text>
        </g>
      ) : null}
      <text x={xd1} y={y} fontSize={fs}>-</text>
      {d.elite && <rect x={xd - 0.6} y={y - fs * 0.78} width={def_.length * cw + 1.2} height={fs * 0.86} rx={0.6} fill="#d6322b" />}
      <text x={xd} y={y} fontSize={fs} fill={d.elite ? '#ffffff' : ink}>{def_}</text>
      <text x={xd2} y={y} fontSize={fs}>-</text>
      <text x={xm} y={y} fontSize={fs}>{m}</text>
    </g>
  );
}

/** A unit counter centred on (0, 0). */
export const UnitToken = memo(function UnitToken({ unit, count = 1, selected, dim, frozen, compact }: TokenProps) {
  const d = def(unit.id);
  const w = TOKEN_W;
  const h = TOKEN_H;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const bg = counterColour(d);
  const fired = !!d.asu && unit.fired;
  const reduced = unit.stepsLost > 0 && d.steps.length > 1;
  const remnant = d.isRemnant;
  const badges = compact ? [] : badgesFor(unit, !!frozen);
  const size = sizeMark(d);
  const id = shortId(d);
  const ink = '#1c1c18';
  const bw = 15.5;
  const bh = 10.5;
  const by = y0 + 15.5; // box centre
  return (
    <g opacity={dim ? 0.72 : 1}>
      {count > 2 && <rect x={x0 + 4.5} y={y0 - 4.5} width={w} height={h} rx={2.2} fill={bg} stroke="#141414" strokeWidth={0.7} filter="url(#token-shadow)" />}
      {count > 1 && <rect x={x0 + 2.2} y={y0 - 2.2} width={w} height={h} rx={2.2} fill={bg} stroke="#141414" strokeWidth={0.7} filter="url(#token-shadow)" />}
      {selected && <rect x={x0 - 3} y={y0 - 3} width={w + 6} height={h + 6} rx={4} fill="none" stroke="#ffd84a" strokeWidth={2.4} className="token-select" filter="url(#glow)" />}
      <g filter={fired || dim ? 'url(#desat)' : undefined}>
        <rect x={x0} y={y0} width={w} height={h} rx={2.2} fill={bg} stroke="#141414" strokeWidth={0.8} filter={compact ? undefined : 'url(#token-shadow)'} />
        {d.army8 && <rect x={x0 + 0.4} y={y0 + 0.4} width={w - 0.8} height={7.5} rx={1.8} fill="#e8cf52" />}
        {/* The printed reverse side: a thin white stripe on a 3-step unit's middle step, a wide one on a last step; Remnants carry a band. */}
        {reduced && (
          <rect x={x0 + 0.4} y={y0 + (d.army8 ? 7.9 : 0.8)} width={w - 0.8} height={stepsRemaining(unit) > 1 ? 2.6 : 8.2} fill="#f6f3ea" opacity={0.9} />
        )}
        {remnant && <rect x={x0 + 0.4} y={by - 3.2} width={w - 0.8} height={6.4} fill="#f6f3ea" opacity={0.85} />}
        <rect x={x0} y={y0} width={w} height={h} rx={2.2} fill="url(#counter-shine)" />
        {size && <text x={0} y={y0 + 7.6} textAnchor="middle" fontSize={5.4} fontWeight={700} fill={ink} className="token-num" letterSpacing={0.3}>{size}</text>}
        {remnant && <text x={0} y={y0 + 7.6} textAnchor="middle" fontSize={5.2} fontWeight={700} fill={ink} className="token-num">REM</text>}
        <text transform={`translate(${x0 + 5.2} ${by}) rotate(-90)`} textAnchor="middle" fontSize={id.length > 8 ? 4 : 4.7} fontWeight={700} fill={ink} className="token-num">
          {id}
        </text>
        <g transform={`translate(${-0.8} ${by})`}>
          <NatoBox d={d} w={bw} h={bh} />
        </g>
        {d.asu && d.asuRange ? (
          <g transform={`translate(${-bw / 2 - 4.2} ${by - 3.2})`}>
            <circle r={2.8} fill="#ffffff" stroke={ink} strokeWidth={0.6} />
            <text y={1.6} textAnchor="middle" fontSize={4.4} fontWeight={800} fill={ink} className="token-num">{d.asuRange}</text>
          </g>
        ) : null}
        <g transform={`translate(${bw / 2 + 3.4} ${by})`}>
          <rect x={-2.7} y={-3.4} width={5.4} height={6.8} rx={0.8} fill="#141414" />
          <text y={2.3} textAnchor="middle" fontSize={5.8} fontWeight={800} fill="#ffffff" className="token-num">{reduced ? values(unit).sp ?? d.sp : d.sp}</text>
        </g>
        {d.asu && <text x={-0.8} y={by + bh / 2 + 4.6} textAnchor="middle" fontSize={3.9} fontWeight={700} fill={ink} className="token-num">{ASU_LABEL[d.id] ?? d.name.replace(/ ASU$/, '')}</text>}
        <StrengthLine d={d} u={unit} y={y0 + h - 3.2} />
        {fired && (
          <g transform="rotate(-20)">
            <rect x={-15} y={-4.5} width={30} height={7} fill="rgba(140,24,18,0.9)" />
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

/** A counter in its own little SVG, for panels and lists. */
export function TokenIcon({ unit, size = 38 }: { unit: UnitState; size?: number }) {
  return (
    <svg width={size} height={(size * TOKEN_H) / TOKEN_W} viewBox={`${-TOKEN_W / 2 - 1} ${-TOKEN_H / 2 - 1} ${TOKEN_W + 2} ${TOKEN_H + 2}`} className="token-icon">
      <UnitToken unit={unit} compact />
    </svg>
  );
}
