import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP } from '../engine/data';
import { hexCorners, hexId, hexToPixel, sharedEdge, type HexId } from '../engine/hex';
import type { GameState, UnitState } from '../engine/types';
import { sideOf } from '../engine/units';
import { Counter } from './Counter';

export const R = 30; // hex circumradius in SVG units
const SQ3 = Math.sqrt(3);

const FILL: Record<string, string> = { clear: '#ece8da', hill: '#cfbb8c', marsh: '#bccfb5', sea: '#8fb7d6' };

export function pixelToHex(x: number, y: number): HexId {
  const q = ((2 / 3) * x) / R;
  const r = ((-1 / 3) * x + (SQ3 / 3) * y) / R;
  let cx = Math.round(q);
  let cz = Math.round(r);
  const cy = Math.round(-q - r);
  const dx = Math.abs(cx - q);
  const dy = Math.abs(cy - (-q - r));
  const dz = Math.abs(cz - r);
  if (dx > dy && dx > dz) cx = -cy - cz;
  else if (dy <= dz) cz = -cx - cy;
  const col = cx;
  const row = cz + (cx - (cx & 1)) / 2;
  if (col < 0 || row < 0) return '0000';
  return hexId(col, row);
}

function polyPoints(id: HexId, r = R): string {
  const p = hexToPixel(id, R);
  return hexCorners(p.x, p.y, r).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** Terrain, hexsides, roads and place names. Re-rendered only when the map changes. */
const StaticMap = memo(function StaticMap({ version, labels }: { version: number; labels: boolean }) {
  void version;
  const hexes = Object.entries(MAP.hexes);
  const sides = Object.entries(MAP.hexsides);
  const sectorEdges: [number, number, number, number][] = [];
  // 8th Army boundary: edges between sector and non-sector land hexes.
  for (const [h, d] of hexes) {
    if (d.terrain === 'sea') continue;
    const c = parseInt(h.slice(0, 2), 10);
    const r = parseInt(h.slice(2), 10);
    const nbs = c % 2 ? [[c + 1, r], [c + 1, r + 1], [c, r + 1]] : [[c + 1, r - 1], [c + 1, r], [c, r + 1]];
    for (const [nc, nr] of nbs) {
      const n = hexId(nc, nr);
      const nd = MAP.hexes[n];
      if (!nd || nd.terrain === 'sea' || !!nd.sector8 === !!d.sector8) continue;
      const e = sharedEdge(h, n, R);
      if (e) sectorEdges.push([e[0][0], e[0][1], e[1][0], e[1][1]]);
    }
  }
  return (
    <g>
      <g>
        {hexes.map(([h, d]) => (
          <polygon key={h} points={polyPoints(h)} fill={FILL[d.terrain]} stroke={d.terrain === 'sea' ? '#7ea8c9' : '#9b9480'} strokeWidth={0.6} />
        ))}
      </g>
      <g>
        {hexes
          .filter(([, d]) => d.terrain === 'marsh')
          .map(([h]) => {
            const p = hexToPixel(h, R);
            return (
              <g key={h} stroke="#5f7a5a" strokeWidth={1}>
                {[-10, 0, 10].map((dx) => (
                  <path key={dx} d={`M${p.x + dx - 5},${p.y + (dx === 0 ? 8 : -2)} h10 M${p.x + dx},${p.y + (dx === 0 ? 8 : -2)} v-5`} />
                ))}
              </g>
            );
          })}
      </g>
      <g>
        {sides.map(([k, s]) => {
          if (!s.mountain) return null;
          const [a, b] = k.split('-');
          const e = sharedEdge(a, b, R);
          if (!e) return null;
          return (
            <line key={k} x1={e[0][0]} y1={e[0][1]} x2={e[1][0]} y2={e[1][1]} stroke="#6a5130" strokeWidth={4.5} strokeLinecap="round" opacity={0.75}
              strokeDasharray={s.pass ? '6 6' : undefined} />
          );
        })}
        {sides.map(([k, s]) => {
          if (!s.pass) return null;
          const [a, b] = k.split('-');
          const e = sharedEdge(a, b, R);
          if (!e) return null;
          const mx = (e[0][0] + e[1][0]) / 2;
          const my = (e[0][1] + e[1][1]) / 2;
          return (
            <text key={'p' + k} x={mx} y={my + 4} fontSize={12} textAnchor="middle" fill="#1d1408" fontWeight={700}>
              )(
            </text>
          );
        })}
      </g>
      <g>
        {sides.map(([k, s]) => {
          if (!s.river) return null;
          const [a, b] = k.split('-');
          const e = sharedEdge(a, b, R);
          if (!e) return null;
          return <line key={k} x1={e[0][0]} y1={e[0][1]} x2={e[1][0]} y2={e[1][1]} stroke="#2f6db5" strokeWidth={3} strokeLinecap="round" />;
        })}
      </g>
      <g>
        {sectorEdges.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a2a12" strokeWidth={1.6} strokeDasharray="5 3" />
        ))}
      </g>
      <g>
        {sides.map(([k, s]) => {
          if (!s.road) return null;
          const [a, b] = k.split('-');
          const pa = hexToPixel(a, R);
          const pb = hexToPixel(b, R);
          return s.road === 'major' ? (
            <line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#4a4a4a" strokeWidth={3.4} strokeLinecap="round" />
          ) : (
            <line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#8a6a35" strokeWidth={1.6} strokeDasharray="4 2.5" />
          );
        })}
      </g>
      <g>
        {hexes.map(([h, d]) => {
          if (!d.city && !d.town && !d.vp && !d.port && !d.airfield && !d.dropZone) return null;
          const p = hexToPixel(h, R);
          return (
            <g key={h}>
              {d.city && (
                <polygon
                  points={`${p.x - 9},${p.y - 4} ${p.x - 3},${p.y - 10} ${p.x + 8},${p.y - 7} ${p.x + 10},${p.y + 4} ${p.x + 2},${p.y + 9} ${p.x - 8},${p.y + 6}`}
                  fill="#5d5d63" stroke="#2b2b2f" strokeWidth={1}
                />
              )}
              {!d.city && d.town && <circle cx={p.x} cy={p.y} r={4} fill="#efe6cf" stroke="#3b3326" strokeWidth={1.2} />}
              {d.vp ? (
                <g>
                  <circle cx={p.x + 14} cy={p.y - 15} r={7} fill="#c0392b" stroke="#fff" strokeWidth={1} />
                  <text x={p.x + 14} y={p.y - 11.5} fontSize={10} textAnchor="middle" fill="#fff" fontWeight={700}>{d.vp}</text>
                </g>
              ) : null}
              {d.port && (
                <text x={p.x - 20} y={p.y + 16} fontSize={11} fill={d.port.restricted ? '#555' : '#0d3b66'}>
                  ⚓{d.port.restricted ? `(${d.port.capacity})` : d.port.major ? `${d.port.capacity}/${d.port.damagedCapacity}` : d.port.capacity}
                </text>
              )}
              {d.airfield && <text x={p.x + 8} y={p.y + 18} fontSize={12}>✈</text>}
              {d.dropZone && <text x={p.x - 6} y={p.y + 20} fontSize={11}>☂</text>}
              {labels && (d.city || d.town) && (
                <text x={p.x} y={p.y + (d.city ? 22 : 15)} fontSize={d.city ? 9.5 : 7.5} textAnchor="middle" fill="#1d1d1d"
                  fontWeight={d.city ? 700 : 400} stroke="#f3efe4" strokeWidth={2.2} paintOrder="stroke">
                  {d.city ?? d.town}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <g>
        {Object.entries(MAP.beaches).map(([name, b]) => {
          const p = hexToPixel(b.hex, R);
          return (
            <text key={name} x={p.x - 34} y={p.y + 4} fontSize={10} textAnchor="end" fill="#0b2c4a" fontWeight={700}>
              {name} ▶
            </text>
          );
        })}
        {Object.entries(MAP.entryAreas).map(([name, ea]) => {
          const pts = ea.hexes.map((h) => hexToPixel(h, R));
          const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
          const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
          const off = ea.side === 'north' ? { dx: 0, dy: -36 } : ea.side === 'east' ? { dx: 46, dy: 0 } : { dx: 0, dy: 44 };
          return (
            <g key={name}>
              <rect x={x + off.dx - 22} y={y + off.dy - 11} width={44} height={20} rx={4}
                fill={ea.side === 'north' ? '#2d5c8a' : ea.side === 'east' ? '#4c7a2e' : '#9b3a2a'} opacity={0.9} />
              <text x={x + off.dx} y={y + off.dy + 4} fontSize={11} textAnchor="middle" fill="#fff" fontWeight={700}>
                {name}{ea.vp ? ` ★${ea.vp}` : ''}
              </text>
            </g>
          );
        })}
      </g>
      {labels && (
        <g>
          {hexes.map(([h, d]) => {
            if (d.terrain === 'sea') return null;
            const p = hexToPixel(h, R);
            return (
              <text key={h} x={p.x} y={p.y - 18} fontSize={6.5} textAnchor="middle" fill="#6b6658">
                {h}
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
});

export interface Highlight {
  color: string;
  label?: string;
}

export interface MapViewProps {
  state: GameState;
  version: number;
  highlights: Map<HexId, Highlight>;
  selectedHex: HexId | null;
  selectedUnitId: string | null;
  attackTarget: HexId | null;
  attackers: Set<string>;
  lastCombatHex: HexId | null;
  onHexClick: (hex: HexId, e: { shift: boolean }) => void;
  onHover: (hex: HexId | null) => void;
  hoverText: string | null;
  banner?: React.ReactNode;
}

const FULL = { x: 16 * 45 - 60, y: -70, w: 31 * 45 + 160, h: 29 * R * SQ3 + 150 };

export function MapView(props: MapViewProps) {
  const { state, highlights, selectedHex, selectedUnitId, attackTarget, attackers, lastCombatHex } = props;
  const [vb, setVb] = useState({ x: 1080, y: 250, w: 900, h: 720 });
  const [labels, setLabels] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const toSvg = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current!;
      const rect = el.getBoundingClientRect();
      const scale = Math.max(vb.w / rect.width, vb.h / rect.height);
      const ox = vb.x + (vb.w - rect.width * scale) / 2;
      const oy = vb.y + (vb.h - rect.height * scale) / 2;
      return { x: ox + (clientX - rect.left) * scale, y: oy + (clientY - rect.top) * scale, scale };
    },
    [vb],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setVb((v) => {
        const w = Math.min(FULL.w * 1.2, Math.max(250, v.w * f));
        const h = (v.h / v.w) * w;
        return { x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toSvg]);

  const zoom = (f: number) =>
    setVb((v) => {
      const w = Math.min(FULL.w * 1.2, Math.max(250, v.w * f));
      const h = (v.h / v.w) * w;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });

  const stacks = useMemo(() => {
    const m = new Map<HexId, UnitState[]>();
    for (const u of Object.values(state.units)) {
      if (u.where.kind !== 'map') continue;
      const list = m.get(u.where.hex) ?? [];
      list.push(u);
      m.set(u.where.hex, list);
    }
    return m;
  }, [state]);

  return (
    <div className={`mapwrap${dragging ? ' dragging' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) > 5) {
              d.moved = true;
              setDragging(true);
              (e.target as Element).setPointerCapture?.(e.pointerId);
            }
            if (d.moved) {
              const { scale } = toSvg(e.clientX, e.clientY);
              setVb((v) => ({ ...v, x: d.vx - dx * scale, y: d.vy - dy * scale }));
              return;
            }
          }
          const p = toSvg(e.clientX, e.clientY);
          const h = pixelToHex(p.x, p.y);
          props.onHover(MAP.hexes[h] ? h : null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          if (d && !d.moved) {
            const p = toSvg(e.clientX, e.clientY);
            const h = pixelToHex(p.x, p.y);
            if (MAP.hexes[h]) props.onHexClick(h, { shift: e.shiftKey });
          }
        }}
        onPointerLeave={() => props.onHover(null)}
      >
        <rect x={FULL.x - 2000} y={FULL.y - 2000} width={FULL.w + 4000} height={FULL.h + 4000} fill="#8fb7d6" />
        <StaticMap version={props.version} labels={labels} />
        <g>
          {[...highlights.entries()].map(([h, hl]) => (
            <g key={h} pointerEvents="none">
              <polygon points={polyPoints(h, R - 2)} fill={hl.color} stroke={hl.color} strokeWidth={1.5} opacity={0.5} />
              {hl.label && (
                <text x={hexToPixel(h, R).x} y={hexToPixel(h, R).y + 24} fontSize={9} textAnchor="middle" fill="#111" fontWeight={700}>
                  {hl.label}
                </text>
              )}
            </g>
          ))}
          {Object.entries(state.control).map(([h, side]) => {
            const d = MAP.hexes[h];
            if (!d?.vp || side !== 'Allied') return null;
            const p = hexToPixel(h, R);
            return <circle key={h} cx={p.x + 14} cy={p.y - 15} r={9} fill="none" stroke="#6f8f3c" strokeWidth={2.5} pointerEvents="none" />;
          })}
          {lastCombatHex && <polygon points={polyPoints(lastCombatHex, R - 1)} fill="none" stroke="#ff8a3d" strokeWidth={3} strokeDasharray="4 3" pointerEvents="none" />}
          {selectedHex && <polygon points={polyPoints(selectedHex, R - 1)} fill="none" stroke="#ffd84a" strokeWidth={3} pointerEvents="none" />}
          {attackTarget && <polygon points={polyPoints(attackTarget, R - 1)} fill="rgba(208,87,74,0.25)" stroke="#d0574a" strokeWidth={3.5} pointerEvents="none" />}
        </g>
        <g pointerEvents="none">
          {[...stacks.entries()].map(([h, list]) => {
            const p = hexToPixel(h, R);
            const sorted = [...list].sort((a, b) => (a.id === selectedUnitId ? 1 : b.id === selectedUnitId ? -1 : 0));
            const top = sorted[sorted.length - 1];
            const allied = sideOf(top) === 'Allied';
            return (
              <g key={h}>
                <Counter
                  unit={top}
                  x={p.x}
                  y={p.y + 1}
                  size={30}
                  count={list.length}
                  selected={top.id === selectedUnitId || list.some((u) => attackers.has(u.id))}
                  dim={state.phase === 'movement' && state.activeSide === sideOf(top) && top.mpSpent !== null}
                />
                {!allied && list.some((u) => u.frozenUntil && state.turn < u.frozenUntil) && (
                  <text x={p.x - 16} y={p.y + 22} fontSize={9} fill="#0d3b66" fontWeight={700}>❄</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="maptools">
        <button title="Zoom in" onClick={() => zoom(1 / 1.3)}>＋</button>
        <button title="Zoom out" onClick={() => zoom(1.3)}>－</button>
        <button title="Whole map" onClick={() => setVb(FULL)}>⤢</button>
        <button title="Toggle labels" onClick={() => setLabels((l) => !l)}>Aa</button>
      </div>
      {props.hoverText && <div className="hover-info">{props.hoverText}</div>}
      {props.banner}
    </div>
  );
}
