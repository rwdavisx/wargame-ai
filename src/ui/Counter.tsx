import { memo } from 'react';
import { def, stepsRemaining, values } from '../engine/units';
import type { Category, UnitState } from '../engine/types';

const SYMBOL: Record<Category, string> = {
  infantry: 'inf', garrison: 'inf', bh: 'bh', motorized: 'mech', pg: 'mech', engineer: 'eng', airborne: 'para', glider: 'para',
  ranger: 'commando', recon: 'recon', divAsu: 'asu', corpsAsu: 'asu', nebelwerfer: 'asu', tank: 'armor',
};

const FILL: Record<string, string> = { US: '#7d8f4c', BR: '#cdb07a', CN: '#cdb07a', GE: '#9aa3a8' };
const TEXT: Record<string, string> = { US: '#14180c', BR: '#22190a', CN: '#22190a', GE: '#121518' };

/** Generic NATO-style unit symbol inside a w x h box at (x, y). */
function Symbol({ type, x, y, w, h }: { type: string; x: number; y: number; w: number; h: number }) {
  const st = { stroke: '#111', strokeWidth: 1, fill: 'none' } as const;
  const box = <rect x={x} y={y} width={w} height={h} {...st} fill="rgba(255,255,255,0.35)" />;
  const cross = (
    <>
      <line x1={x} y1={y} x2={x + w} y2={y + h} {...st} />
      <line x1={x} y1={y + h} x2={x + w} y2={y} {...st} />
    </>
  );
  const oval = <rect x={x + w * 0.18} y={y + h * 0.22} width={w * 0.64} height={h * 0.56} rx={h * 0.28} {...st} />;
  switch (type) {
    case 'inf':
      return <>{box}{cross}</>;
    case 'mech':
      return <>{box}{cross}{oval}</>;
    case 'armor':
      return <>{box}{oval}</>;
    case 'recon':
      return <>{box}<line x1={x} y1={y + h} x2={x + w} y2={y} {...st} /></>;
    case 'para':
      return (
        <>
          {box}
          {cross}
          <path d={`M${x + w * 0.25},${y + h * 0.75} q${w * 0.125},-${h * 0.3} ${w * 0.25},0 q${w * 0.125},-${h * 0.3} ${w * 0.25},0`} {...st} />
        </>
      );
    case 'commando':
      return <>{box}{cross}<text x={x + w / 2} y={y + h * 0.82} fontSize={h * 0.7} textAnchor="middle" fill="#111">C</text></>;
    case 'eng':
      return <>{box}<path d={`M${x + w * 0.2},${y + h * 0.7} v-${h * 0.35} h${w * 0.6} v${h * 0.35} M${x + w / 2},${y + h * 0.35} v${h * 0.35}`} {...st} /></>;
    case 'asu':
      return <>{box}<circle cx={x + w / 2} cy={y + h / 2} r={h * 0.18} fill="#111" /></>;
    case 'bh':
      return <>{box}<path d={`M${x},${y + h * 0.7} q${w / 4},-${h * 0.25} ${w / 2},0 t${w / 2},0`} {...st} /></>;
    default:
      return box;
  }
}

export interface CounterProps {
  unit: UnitState;
  x: number;
  y: number;
  size: number;
  selected?: boolean;
  dim?: boolean;
  count?: number;
}

export const Counter = memo(function Counter({ unit, x, y, size, selected, dim, count }: CounterProps) {
  const d = def(unit.id);
  const v = values(unit);
  const reduced = unit.stepsLost > 0;
  const fill = FILL[d.nation];
  const text = TEXT[d.nation];
  const half = size / 2;
  const label = d.asu ? `R${d.asuRange}` : `${v.attack}-${v.defense}-${v.move}`;
  const symbol = d.cat === 'infantry' && d.formation === 'Commando Bde' ? 'commando' : SYMBOL[d.cat];
  const mark = unit.status === 'disrupted' ? 'D' : unit.status === 'fullRetreat' ? 'FR' : unit.halfEff ? '½' : '';
  return (
    <g transform={`translate(${x - half},${y - half})`} opacity={dim ? 0.55 : 1}>
      {count && count > 1 ? (
        <rect x={3} y={-3} width={size} height={size} rx={2} fill={fill} stroke="#222" strokeWidth={0.8} />
      ) : null}
      <rect
        width={size}
        height={size}
        rx={2}
        fill={fill}
        stroke={selected ? '#ffd84a' : '#222'}
        strokeWidth={selected ? 2.4 : 0.8}
        strokeDasharray={d.silhouette || d.sp === 0 ? '2 1.5' : undefined}
      />
      {d.nation === 'CN' && <rect width={size} height={3} fill="#b3261e" />}
      {reduced && <rect y={size - 3} width={size} height={3} fill="#c0392b" />}
      <Symbol type={symbol} x={size * 0.24} y={size * 0.12} w={size * 0.52} h={size * 0.34} />
      <text x={half} y={size * 0.82} fontSize={size * 0.27} textAnchor="middle" fill={text} fontWeight={600}>
        {label}
      </text>
      {mark && (
        <text x={size - 2} y={size * 0.3} fontSize={size * 0.28} textAnchor="end" fill="#b3261e" fontWeight={700}>
          {mark}
        </text>
      )}
      {unit.outOfSupply && (
        <text x={2} y={size * 0.3} fontSize={size * 0.26} fill="#b3261e" fontWeight={700}>
          ⊘
        </text>
      )}
      {d.asu && unit.fired && <line x1={2} y1={size - 2} x2={size - 2} y2={2} stroke="#b3261e" strokeWidth={2} />}
      {count && count > 1 ? (
        <g>
          <circle cx={size} cy={0} r={size * 0.2} fill="#111" />
          <text x={size} y={size * 0.08} fontSize={size * 0.24} textAnchor="middle" fill="#fff">
            {count}
          </text>
        </g>
      ) : null}
      <title>{`${d.name} (${d.formation}) ${label}${stepsRemaining(unit) < d.steps.length ? ' reduced' : ''}${unit.status !== 'good' ? ` ${unit.status}` : ''}${unit.halfEff ? ' ½ effective' : ''}`}</title>
    </g>
  );
});
