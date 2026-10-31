// Unit counters in the style of the printed game, painted by hand: a card cut a little irregularly and set down at a
// slight angle, washed in the nation's colour over the paper's grain, with the NATO unit-type box ruled in sepia ink
// and coloured in the division's colour slightly off the lines, the size marker, unit ID, stacking points and the
// strength line lettered by hand.
import { memo } from 'react';
import type { Nation, UnitState } from '../../engine/types';
import { def, isElite, stepsRemaining, values } from '../../engine/units';
import type { UnitDef } from '../../engine/types';
import { CounterMarkers, MoveLeftTab, ReadyCue, unitMarkers, type Marker } from './markers';
import { cardPath, grainOf, GrainDefs, hand, INK, inkBox, inkCircle, inkLine, inkOval, PAPER_WHITE, roughRect, shade, WashDefs, washId, type Rand } from './handdrawn';

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

/** The colour a formation's counters carry in their unit-type box (null for corps and independent units). */
export function formationColour(formation: string): string | null {
  return DIVISION_FILL[formation] ?? null;
}

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
  'GE-KGDor': 'Dör/16Pz', 'BR-Greys': 'RySct', 'BR-KDG': '1 KDG', 'BR-11H': '11H/7A', 'BR-5H': '5H/46', 'BR-2-5Q': '2/6Q/56', 'BR-7OB': '7OB/56',
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
  if (d.size) return d.size;
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

type Symbol = 'infantry' | 'motorized' | 'mechanized' | 'armor' | 'antitank' | 'armorRecon' | 'airborne' | 'commando' | 'engineer' | 'artillery' | 'rocket' | 'garrison' | 'beach' | 'mountain';

function symbolFor(d: UnitDef): Symbol {
  if (MECHANIZED.has(d.id) || d.kind === 'mechanized') return 'mechanized';
  if (d.kind === 'mountain') return 'mountain'; // the French remnants print the mountain symbol
  switch (d.cat) {
    case 'tank': return d.tankDestroyer ? 'antitank' : 'armor';
    case 'recon': return 'armorRecon';
    case 'motorized': return 'motorized';
    case 'pg': return 'motorized';
    case 'airborne':
    case 'glider': return 'airborne';
    case 'ranger': return 'commando';
    case 'mountain': return 'mountain';
    case 'engineer': return 'engineer';
    case 'divAsu':
    case 'corpsAsu':
    case 'heavyHowitzer': return 'artillery';
    case 'nebelwerfer': return 'rocket';
    case 'garrison': return 'garrison';
    case 'bh': return 'beach';
    default: return 'infantry';
  }
}

/** The NATO unit-type box, centred on (0, 0): coloured in with the brush, a hair off the lines, then ruled and
 * drawn in with the pen. */
function NatoBox({ d, w, h, r }: { d: UnitDef; w: number; h: number; r: Rand }) {
  const fill = boxFill(d);
  const ink = inkOn(fill) === '#ffffff' ? PAPER_WHITE : INK;
  const x = -w / 2;
  const y = -h / 2;
  const sym = symbolFor(d);
  const sw = 0.8;
  const pen = (path: string, width = sw, colour = ink) => <path d={path} stroke={colour} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  const cross = pen(`${inkLine(r, x, y, x + w, y + h, 0.3, 0)} ${inkLine(r, x + w, y, x, y + h, 0.3, 0)}`);
  const oval = (rx: number, ry: number) => pen(inkOval(r, rx, ry));
  let body: React.ReactNode = null;
  switch (sym) {
    case 'infantry': body = cross; break;
    case 'mountain': body = <>{cross}<path d={`M${-w * 0.16},${y + h} L0,${y + h * 0.68} L${w * 0.16},${y + h} Z`} fill={ink} /></>; break;
    case 'commando': body = <>{cross}<path d={`M${x + w * 0.22},${y + h} L0,${y + h * 0.55} L${x + w * 0.78},${y + h}`} fill={ink} opacity={0.9} /></>; break;
    case 'motorized': body = <>{cross}<circle cx={-w * 0.22} cy={y + h + 1.5} r={1} fill={INK} /><circle cx={w * 0.22} cy={y + h + 1.5} r={1} fill={INK} /></>; break;
    case 'mechanized': body = <>{cross}{oval(w * 0.3, h * 0.27)}</>; break;
    case 'armor': body = oval(w * 0.36, h * 0.3); break;
    case 'antitank': body = <>{oval(w * 0.36, h * 0.3)}{pen(`${inkLine(r, -w * 0.2, h * 0.18, 0, -h * 0.22, 0.15, 0.1)} ${inkLine(r, 0, -h * 0.22, w * 0.2, h * 0.18, 0.15, 0.1)}`)}</>; break;
    case 'armorRecon': body = <>{oval(w * 0.34, h * 0.28)}{pen(inkLine(r, x, y + h, x + w, y, 0.3, 0))}</>; break;
    case 'airborne': body = <>{cross}{pen(`M${-w * 0.3},${y + h * 0.3} Q${-w * 0.15},${y + h * 0.05} 0,${y + h * 0.3} Q${w * 0.15},${y + h * 0.05} ${w * 0.3},${y + h * 0.3}`)}</>; break;
    case 'engineer': body = pen(`M${-w * 0.3},${h * 0.18} V${-h * 0.15} H${w * 0.3} V${h * 0.18} M0,${-h * 0.15} V${h * 0.18}`); break;
    case 'artillery': body = <path d={inkCircle(r, 0, 0, h * 0.17)} fill={ink} stroke={ink} strokeWidth={0.5} />; break;
    case 'rocket': body = pen(`M0,${h * 0.32} V${-h * 0.25} M${-w * 0.13},${-h * 0.05} L0,${-h * 0.3} L${w * 0.13},${-h * 0.05}`); break;
    case 'garrison': body = <text y={h * 0.3} textAnchor="middle" fontSize={h * 0.82} fill={ink} className="token-letter">G</text>; break;
    case 'beach': body = <text y={h * 0.3} textAnchor="middle" fontSize={h * 0.72} fill={PAPER_WHITE} className="token-letter">BH</text>; break;
  }
  return (
    <g>
      <path d={roughRect(r, x + 0.25 + (r() - 0.5) * 0.5, y + 0.2 + (r() - 0.5) * 0.4, w - 0.2, h - 0.15, 0.3)} fill={`url(#${washId(fill)})`} />
      <path d={roughRect(r, x, y, w, h, 0.2)} fill={grainOf(d.id + 'box')} />
      {body}
      {pen(inkBox(r, x, y, w, h), 0.85, INK)}
    </g>
  );
}

/** Every colour a counter or its unit-type box is washed in. */
const WASHES = ['#aebfcd', '#98aec0', '#c9ccca', '#9da564', '#c9a06c', '#d2c49b', '#4b8ad6', '#ffffff', '#e8cf52', '#d6322b', '#f6f3ea', ...Object.values(DIVISION_FILL)];

// ------------------------------------------------------------------ tokens

/** A counter's shadow on the map, painted rather than filtered (an SVG filter on every counter makes the map slow to
 * draw): the card's shape set down a little below and to the right, soft at its edge. */
function CardShadow({ d }: { d: string }) {
  return (
    <path d={d} transform="translate(1.3 2.2)" fill="#1e140a" fillOpacity={0.3} stroke="#1e140a" strokeOpacity={0.14} strokeWidth={2.6} strokeLinejoin="round" pointerEvents="none" />
  );
}

/** Shared definitions used by every counter (render once per document). */
export function TokenDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <WashDefs colours={WASHES} />
        <GrainDefs />
        <filter id="desat">
          <feColorMatrix type="saturate" values="0.35" />
        </filter>
      </defs>
    </svg>
  );
}

export const TOKEN_W = 36;
export const TOKEN_H = 36;

export interface TokenProps {
  unit: UnitState;
  /** Units in the same hex (draws the stack behind and a count). */
  count?: number;
  selected?: boolean;
  dim?: boolean;
  frozen?: boolean;
  /** Smaller variant without badges, for lists. */
  compact?: boolean;
  /** Status markers for the whole stack (defaults to this unit's own). */
  markers?: Marker[];
  /** The stack can still move or attack this phase. */
  cue?: 'move' | 'attack' | null;
  /** Movement left this phase, e.g. "2 MP". */
  moveLeft?: string | null;
}

/** The strength line along the bottom: attack (with tank rating), defense (red box when elite), movement. */
function StrengthLine({ d, u, y }: { d: UnitDef; u: UnitState; y: number }) {
  const v = values(u);
  const ink = INK;
  const fs = 9.6;
  // Each figure set down by hand: a degree or two off upright, a hair off the line.
  const r = hand(`${d.id}:n`);
  const tilt = (t: string) => Array.from(t, () => ((r() - 0.5) * 7).toFixed(1)).join(' ');
  const lift = (t: string) => Array.from(t, (_, i) => (i ? ((r() - 0.5) * 0.5).toFixed(2) : '0')).join(' ');
  if (d.asu) {
    const t = `S (${v.defense}) ${v.move}`;
    return (
      <text x={0} y={y} textAnchor="middle" fontSize={fs - 0.6} fontWeight={700} fill={ink} stroke={ink} strokeWidth={0.12} className="token-num" rotate={tilt(t)}>
        {t}
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
    <g className="token-num" fontWeight={700} fill={ink} stroke={ink} strokeWidth={0.12}>
      <text x={xa} y={y} fontSize={fs} rotate={tilt(a)} dy={lift(a)}>{a}</text>
      {d.tankRating ? (
        <g>
          {d.tankDestroyer && <path d={roughRect(r, xa + a.length * cw - 0.2, y - fs * 0.92, sup + 0.6, fs * 0.5, 0.15)} fill="#e9bb3a" stroke="none" />}
          <text x={xa + a.length * cw} y={y - fs * 0.45} fontSize={fs * 0.55} fill={d.tankDestroyer ? '#b3261e' : ink}>{d.tankRating}</text>
        </g>
      ) : null}
      <text x={xd1} y={y} fontSize={fs}>-</text>
      {isElite(u) && <path d={roughRect(r, xd - 0.7, y - fs * 0.8, def_.length * cw + 1.4, fs * 0.9, 0.22)} fill={`url(#${washId('#d6322b')})`} stroke="none" />}
      <text x={xd} y={y} fontSize={fs} fill={isElite(u) ? PAPER_WHITE : ink} stroke={isElite(u) ? PAPER_WHITE : ink} rotate={tilt(def_)}>{def_}</text>
      <text x={xd2} y={y} fontSize={fs}>-</text>
      <text x={xm} y={y} fontSize={fs} rotate={tilt(m)}>{m}</text>
    </g>
  );
}

/** A unit counter centred on (0, 0). */
export const UnitToken = memo(function UnitToken({ unit, count = 1, selected, dim, frozen, compact, markers, cue, moveLeft }: TokenProps) {
  const d = def(unit.id);
  const w = TOKEN_W;
  const h = TOKEN_H;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const bg = counterColour(d);
  const wash = `url(#${washId(bg)})`;
  const fired = !!d.asu && unit.fired;
  const reduced = unit.stepsLost > 0 && d.steps.length > 1;
  const remnant = d.isRemnant;
  const badges = compact ? [] : markers ?? unitMarkers(unit, !!frozen);
  const size = sizeMark(d);
  const id = shortId(d);
  const bw = 15.5;
  const bh = 10.5;
  const by = y0 + 15.5; // box centre
  const r = hand(unit.id);
  const card = cardPath(r, x0, y0, w, h);
  // Set down by hand on the map: a degree or so off square (square in lists), the counters under it more so.
  const tilt = compact ? 0 : (r() - 0.5) * 3.4;
  const under = (k: number) => {
    const ru = hand(`${unit.id}:under${k}`);
    return { d: cardPath(ru, x0, y0, w, h), rot: (ru() - 0.5) * 7 };
  };
  const u1 = count > 1 ? under(1) : null;
  const u2 = count > 2 ? under(2) : null;
  const undercard = (u: { d: string; rot: number }, dx: number, dy: number) => (
    <g transform={`translate(${dx} ${dy}) rotate(${u.rot.toFixed(2)})`}>
      <CardShadow d={u.d} />
      <path d={u.d} fill={wash} />
      <path d={u.d} fill="none" stroke={shade(bg, -0.35)} strokeOpacity={0.5} strokeWidth={1.1} />
      <path d={u.d} fill="none" stroke={INK} strokeOpacity={0.75} strokeWidth={0.5} />
    </g>
  );
  return (
    <g opacity={dim ? 0.72 : 1}>
      {u2 && undercard(u2, 4.6, -4.4)}
      {u1 && undercard(u1, 2.3, -2.2)}
      {selected && (
        <g className="token-select">
          <rect x={x0 - 3} y={y0 - 3} width={w + 6} height={h + 6} rx={4} fill="none" stroke="#ffd84a" strokeOpacity={0.3} strokeWidth={6} />
          <rect x={x0 - 3} y={y0 - 3} width={w + 6} height={h + 6} rx={4} fill="none" stroke="#ffd84a" strokeWidth={2.4} />
        </g>
      )}
      <g transform={tilt ? `rotate(${tilt.toFixed(2)})` : undefined}>
        <g filter={fired || dim ? 'url(#desat)' : undefined}>
          {/* The card: the nation's wash over the paper's grain. */}
          {!compact && <CardShadow d={card} />}
          <path d={card} fill={wash} />
          <path d={card} fill={grainOf(unit.id)} />
          {d.army8 && <path d={roughRect(r, x0 + 0.7, y0 + 0.7, w - 1.4, 7.1, 0.3)} fill={`url(#${washId('#e8cf52')})`} />}
          {/* The printed reverse side: a thin pale stripe on a 3-step unit's middle step, a wide one on a last step; Remnants carry a band. */}
          {reduced && (
            <path d={roughRect(r, x0 + 0.7, y0 + (d.army8 ? 7.9 : 1), w - 1.4, stepsRemaining(unit) > 1 ? 2.6 : 8, 0.25)} fill="#f6f1e0" opacity={0.88} />
          )}
          {remnant && <path d={roughRect(r, x0 + 0.7, by - 3.2, w - 1.4, 6.4, 0.25)} fill="#f6f1e0" opacity={0.85} />}
          {/* The wash dried darker at the card's edge; then the pen. */}
          <path d={card} fill="none" stroke={shade(bg, -0.35)} strokeOpacity={0.5} strokeWidth={1.3} />
          <path d={card} fill="none" stroke={INK} strokeOpacity={0.85} strokeWidth={0.55} />
          {size && <text x={0} y={y0 + 7.6} textAnchor="middle" fontSize={6.2} fill={INK} className="token-letter" letterSpacing={0.2}>{size}</text>}
          {remnant && <text x={0} y={y0 + 7.6} textAnchor="middle" fontSize={5.6} fill={INK} className="token-letter">REM</text>}
          <text transform={`translate(${x0 + 5.3} ${by}) rotate(-90)`} textAnchor="middle" fontSize={id.length > 8 ? 4.6 : 5.3} fill={INK} className="token-letter">
            {id}
          </text>
          <g transform={`translate(${-0.8} ${by})`}>
            <NatoBox d={d} w={bw} h={bh} r={hand(`${unit.id}:box`)} />
          </g>
          {d.asu && d.asuRange ? (
            <g transform={`translate(${-bw / 2 - 4.2} ${by - 3.2})`}>
              <path d={inkCircle(r, 0, 0, 2.8)} fill={PAPER_WHITE} stroke={INK} strokeWidth={0.55} />
              <text y={1.6} textAnchor="middle" fontSize={4.4} fontWeight={700} fill={INK} className="token-num">{d.asuRange}</text>
            </g>
          ) : null}
          <g transform={`translate(${bw / 2 + 3.4} ${by})`}>
            <path d={roughRect(r, -2.7, -3.4, 5.4, 6.8, 0.25)} fill={INK} />
            <text y={2.3} textAnchor="middle" fontSize={5.8} fontWeight={700} fill={PAPER_WHITE} className="token-num">{reduced ? values(unit).sp ?? d.sp : d.sp}</text>
          </g>
          {d.asu && <text x={-0.8} y={by + bh / 2 + 4.6} textAnchor="middle" fontSize={4.4} fill={INK} className="token-letter">{ASU_LABEL[d.id] ?? d.name.replace(/ ASU$/, '')}</text>}
          <StrengthLine d={d} u={unit} y={y0 + h - 3.2} />
          {fired && (
            <g transform="rotate(-20)" pointerEvents="visiblePainted">
              <title>Fired: this artillery has supported an attack and must be readied again</title>
              <path d={roughRect(r, -15, -4.5, 30, 7, 0.35)} fill={`url(#${washId('#d6322b')})`} opacity={0.94} />
              <text x={0} y={1} textAnchor="middle" fontSize={5.6} fontWeight={700} fill={PAPER_WHITE} letterSpacing={1} className="token-num">FIRED</text>
            </g>
          )}
        </g>
      </g>
      {count > 1 && (
        <g>
          <path d={inkCircle(hand(`${unit.id}:count`), x0 - 1, y0 - 1, 5.2)} fill={INK} stroke="#e8dcb8" strokeWidth={0.7} />
          <text x={x0 - 1} y={y0 + 1.6} textAnchor="middle" fontSize={7} fontWeight={700} fill={PAPER_WHITE} className="token-num">{count}</text>
        </g>
      )}
      {badges.length > 0 && <CounterMarkers markers={badges} x={x0 + w} y={y0} />}
      {!compact && moveLeft && <MoveLeftTab text={moveLeft} y={y0 + h - 1} />}
      {!compact && cue && <ReadyCue kind={cue} x={x0 + w + 0.5} y={y0 - 0.5} />}
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
