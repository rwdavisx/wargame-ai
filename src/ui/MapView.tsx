// The battle map: painted terrain, crisp line work, movement and attack
// overlays, unit tokens with move/combat animations, a minimap and camera.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP } from '../engine/data';
import { neighbors, type HexId } from '../engine/hex';
import type { GameState, Side, UnitState } from '../engine/types';
import { def, sideOf } from '../engine/units';
import { center, chainSegments, corners, edge, pixelToHex, polyPoints, R, smoothPath, wiggle, type Pt } from './render/geom';
import type { TerrainImage } from './render/terrain';
import { Insignia, UnitToken } from './render/units';
import { sfx } from './sound';

export { R };

export type HighlightKind = 'move' | 'stop' | 'land' | 'attack' | 'advance' | 'retreat' | 'info';

export interface Highlight {
  color: string;
  label?: string;
  kind?: HighlightKind;
}

const KIND_COLOR: Record<HighlightKind, string> = {
  move: '#59c3e8',
  stop: '#f2b544',
  land: '#6aa8ff',
  attack: '#ef5a3c',
  advance: '#b583ff',
  retreat: '#7be0a0',
  info: '#ffffff',
};

export interface MapSettings {
  showGrid: boolean;
  showLabels: boolean;
  followAi: boolean;
  animSpeed: number;
}

export interface MapViewProps {
  state: GameState;
  terrain: TerrainImage;
  version: number;
  settings: MapSettings;
  highlights: Map<HexId, Highlight>;
  selectedHex: HexId | null;
  selectedUnitId: string | null;
  attackTarget: HexId | null;
  attackers: Set<string>;
  preview: { path: HexId[]; label?: string } | null;
  /** The computer is acting: the camera may follow its moves. */
  aiActive: boolean;
  humanSides: Side[];
  onHexClick: (hex: HexId, e: { shift: boolean }) => void;
  onHover: (hex: HexId | null) => void;
  hoverText: string | null;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ------------------------------------------------------------------ static line work

const StaticOverlay = memo(function StaticOverlay({ version, showGrid, showLabels }: { version: number; showGrid: boolean; showLabels: boolean }) {
  void version;
  const data = useMemo(() => {
    const hexes = Object.entries(MAP.hexes);
    const grid = hexes
      .map(([h]) => {
        const c = corners(h);
        return `M${c.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
      })
      .join('');
    const riverSegs: [Pt, Pt][] = [];
    const majorSegs: [Pt, Pt][] = [];
    const minorSegs: [Pt, Pt][] = [];
    const passes: Pt[] = [];
    for (const [k, s] of Object.entries(MAP.hexsides)) {
      const [a, b] = k.split('-');
      if (s.river) {
        const e = edge(a, b);
        if (e) riverSegs.push(e);
      }
      if (s.road) (s.road === 'major' ? majorSegs : minorSegs).push([center(a), center(b)]);
      if (s.pass) {
        const e = edge(a, b);
        if (e) passes.push([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2]);
      }
    }
    const rivers = chainSegments(riverSegs).map((l, i) => smoothPath(wiggle(l, 3.2, `riv${i}`), 0.8));
    const majors = chainSegments(majorSegs).map((l) => smoothPath(l, 0.55));
    const minors = chainSegments(minorSegs).map((l) => smoothPath(l, 0.55));
    const boundary: [Pt, Pt][] = [];
    for (const [h, d] of hexes) {
      if (d.terrain === 'sea') continue;
      for (const n of neighbors(h)) {
        const nd = MAP.hexes[n];
        if (!nd || nd.terrain === 'sea' || !!nd.sector8 === !!d.sector8 || h > n) continue;
        const e = edge(h, n);
        if (e) boundary.push(e);
      }
    }
    const boundaryPaths = chainSegments(boundary).map((l) => smoothPath(l, 0.3));
    return { grid, rivers, majors, minors, passes, boundaryPaths };
  }, []);
  const places = Object.entries(MAP.hexes).filter(([, d]) => d.city || d.town);
  const seaLabel = (h: string, text: string, size: number) => {
    if (!MAP.hexes[h]) return null;
    const [x, y] = center(h);
    return (
      <text x={x} y={y} className="sea-label" fontSize={size} textAnchor="middle">
        {text}
      </text>
    );
  };
  return (
    <g pointerEvents="none">
      {showGrid && <path d={data.grid} fill="none" stroke="rgba(20,22,14,0.22)" strokeWidth={0.7} />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {data.rivers.map((d, i) => <path key={`rc${i}`} d={d} stroke="#24506e" strokeWidth={4.8} opacity={0.8} />)}
        {data.rivers.map((d, i) => <path key={`rw${i}`} d={d} stroke="#4f9fd0" strokeWidth={3} />)}
        {data.rivers.map((d, i) => <path key={`rh${i}`} d={d} stroke="#a6d6f2" strokeWidth={0.7} opacity={0.8} />)}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {data.minors.map((d, i) => <path key={`mc${i}`} d={d} stroke="rgba(52,40,24,0.65)" strokeWidth={2.6} />)}
        {data.minors.map((d, i) => <path key={`mf${i}`} d={d} stroke="#d4bb8a" strokeWidth={1.3} />)}
        {data.majors.map((d, i) => <path key={`Mc${i}`} d={d} stroke="rgba(38,32,24,0.85)" strokeWidth={4.6} />)}
        {data.majors.map((d, i) => <path key={`Mf${i}`} d={d} stroke="#efe4c6" strokeWidth={2.7} />)}
        {data.majors.map((d, i) => <path key={`Ml${i}`} d={d} stroke="#b9a77d" strokeWidth={0.5} strokeDasharray="3 3" />)}
      </g>
      {data.boundaryPaths.map((d, i) => (
        <path key={`b${i}`} d={d} fill="none" stroke="#f3cf4a" strokeWidth={1.8} strokeDasharray="7 4" opacity={0.75} />
      ))}
      {data.passes.map(([x, y], i) => (
        <g key={`p${i}`} transform={`translate(${x} ${y})`}>
          <circle r={4.6} fill="rgba(25,22,16,0.75)" />
          <path d="M-2.4,-2.6 Q-0.6,0 -2.4,2.6 M2.4,-2.6 Q0.6,0 2.4,2.6" stroke="#f1e6c8" strokeWidth={1} fill="none" />
        </g>
      ))}
      {seaLabel('1913', 'GULF OF SALERNO', 26)}
      {seaLabel('1701', 'BAY OF NAPLES', 15)}
      {seaLabel('1722', 'TYRRHENIAN SEA', 18)}
      {showLabels &&
        places.map(([h, d]) => {
          const [x, y] = center(h);
          return (
            <text key={h} x={x} y={y + (d.city ? 25 : 21)} className={d.city ? 'place-label city' : 'place-label'} textAnchor="middle">
              {d.city ?? d.town}
            </text>
          );
        })}
    </g>
  );
});

// ------------------------------------------------------------------ markers

function Markers({ state }: { state: GameState }) {
  return (
    <g pointerEvents="none">
      {Object.entries(MAP.hexes).map(([h, d]) => {
        if (!d.vp && !d.port && !d.airfield) return null;
        const [x, y] = center(h);
        const holder = state.control[h] ?? 'German';
        return (
          <g key={h}>
            {d.port && (
              <g transform={`translate(${x - 18} ${y + 14})`} opacity={d.port.restricted ? 0.5 : 1}>
                <circle r={5.5} fill="#16324a" stroke="#cfe3f2" strokeWidth={0.7} />
                <path d="M0,-3 L0,2.6 M-2,-1.2 L2,-1.2 M-3,0.8 Q0,4.2 3,0.8" stroke="#e8f2f8" strokeWidth={0.9} fill="none" strokeLinecap="round" />
                <text x={7.5} y={2.5} fontSize={6.5} fontWeight={700} fill="#e8f2f8" className="outlined">{d.port.capacity}</text>
              </g>
            )}
            {d.airfield && (
              <g transform={`translate(${x + 13} ${y + 14})`}>
                <circle r={5} fill="#3b3b3b" stroke="#ddd" strokeWidth={0.6} />
                <path d="M0,-3.4 L0,3 M-3.6,-0.2 L3.6,-0.2 M-1.6,2.6 L1.6,2.6" stroke="#eee" strokeWidth={1} strokeLinecap="round" />
              </g>
            )}
            {d.vp ? (
              <g transform={`translate(${x + 21} ${y - 15})`}>
                <circle r={7} fill="#1a1712" opacity={0.45} cy={1} />
                <circle r={6.4} fill={holder === 'Allied' ? '#516430' : '#4d5559'} stroke="#e4c25a" strokeWidth={1.4} />
                <Insignia nation={holder === 'Allied' ? 'US' : 'GE'} x={0} y={-0.4} r={holder === 'Allied' ? 3.6 : 2.9} />
                <g transform="translate(4.8 4.6)">
                  <circle r={3.6} fill="#e4c25a" stroke="#4a3a12" strokeWidth={0.5} />
                  <text y={2.2} fontSize={5.6} fontWeight={800} textAnchor="middle" fill="#2a2110">{d.vp}</text>
                </g>
              </g>
            ) : null}
          </g>
        );
      })}
      {Object.entries(MAP.beaches).map(([name, b]) => {
        const [x, y] = center(b.hex);
        const color = name === 'Red' ? '#c0392b' : name === 'Blue' ? '#2e6fb5' : name === 'Maiori' || name === 'Vietri' ? '#6b4f9e' : '#c58a1c';
        return (
          <g key={name} transform={`translate(${x - 52} ${y - 6})`}>
            <rect width={36} height={12} rx={3} fill="rgba(10,22,32,0.78)" stroke={color} strokeWidth={1} />
            <rect width={4} height={12} rx={1.5} fill={color} />
            <text x={20} y={8.6} fontSize={6.6} fontWeight={700} textAnchor="middle" fill="#f4efe0" letterSpacing={0.6}>
              {name.toUpperCase()}
            </text>
          </g>
        );
      })}
      {Object.entries(MAP.entryAreas).map(([name, ea]) => {
        const pts = ea.hexes.map((h) => center(h));
        const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const off = ea.side === 'north' ? [0, -40, 180] : ea.side === 'east' ? [46, 0, -90] : [0, 46, 0];
        const owner = state.control[name] ?? 'German';
        const allies = Object.values(state.units).filter((u) => u.where.kind === 'entry' && u.where.area === name);
        return (
          <g key={name} transform={`translate(${x + off[0]} ${y + off[1]})`}>
            <g transform={`rotate(${off[2]})`}>
              <path d="M-16,-6 L0,-14 L16,-6" fill="none" stroke={owner === 'Allied' ? '#9ccc65' : '#cfd8dc'} strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
            </g>
            <rect x={-24} y={-8} width={48} height={16} rx={4} fill="rgba(14,16,14,0.82)" stroke={owner === 'Allied' ? '#7da34a' : '#7b868c'} />
            <text y={3.4} fontSize={8} fontWeight={700} textAnchor="middle" fill="#f4efe0">
              {name}
              {ea.vp ? ` ★${ea.vp}` : ''}
              {allies.length ? ` · ${allies.length}` : ''}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ highlight regions

function Regions({ highlights }: { highlights: Map<HexId, Highlight> }) {
  const groups = useMemo(() => {
    const byKind = new Map<string, { color: string; hexes: HexId[] }>();
    for (const [h, hl] of highlights) {
      const color = hl.kind ? KIND_COLOR[hl.kind] : hl.color;
      const g = byKind.get(color) ?? { color, hexes: [] };
      g.hexes.push(h);
      byKind.set(color, g);
    }
    return [...byKind.values()].map((g) => {
      const set = new Set(g.hexes);
      const segs: string[] = [];
      for (const h of g.hexes) {
        for (const n of neighbors(h)) {
          if (set.has(n)) continue;
          const e = edge(h, n);
          if (e) segs.push(`M${e[0][0].toFixed(1)},${e[0][1].toFixed(1)}L${e[1][0].toFixed(1)},${e[1][1].toFixed(1)}`);
        }
        // Map edge hexes have neighbours that are off the map: outline those sides too.
      }
      return { ...g, outline: segs.join('') };
    });
  }, [highlights]);
  return (
    <g pointerEvents="none">
      {groups.map((g) => (
        <g key={g.color}>
          {g.hexes.map((h) => <polygon key={h} points={polyPoints(h, R - 0.5)} fill={g.color} opacity={0.2} />)}
          <path d={g.outline} stroke={g.color} strokeWidth={2.2} fill="none" strokeLinecap="round" className="region-edge" />
        </g>
      ))}
      {[...highlights.entries()].map(([h, hl]) => {
        if (!hl.label) return null;
        const [x, y] = center(h);
        const color = hl.kind ? KIND_COLOR[hl.kind] : hl.color;
        const w = Math.max(14, hl.label.length * 4.6 + 6);
        return (
          <g key={`l${h}`} transform={`translate(${x} ${y + 21})`}>
            <rect x={-w / 2} y={-5.5} width={w} height={10} rx={5} fill="rgba(10,12,10,0.8)" stroke={color} strokeWidth={0.8} />
            <text y={2.2} fontSize={6.6} fontWeight={700} textAnchor="middle" fill="#fff">{hl.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function Arrow({ from, to, color, curve = 0.18, width = 3, dashed }: { from: Pt; to: Pt; color: string; curve?: number; width?: number; dashed?: boolean }) {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - dy * curve;
  const cy = my + dx * curve;
  const ex = to[0] - (dx / len) * 9;
  const ey = to[1] - (dy / len) * 9;
  return (
    <path d={`M${from[0]},${from[1]} Q${cx},${cy} ${ex},${ey}`} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round"
      markerEnd={`url(#arrowhead-${color.slice(1)})`} strokeDasharray={dashed ? '6 4' : undefined} className={dashed ? 'march' : undefined} />
  );
}

function PathPreview({ preview }: { preview: { path: HexId[]; label?: string } }) {
  const pts = preview.path.map((h) => center(h));
  if (pts.length < 2) return null;
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = end[0] - prev[0];
  const dy = end[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const trimmed: Pt[] = [...pts.slice(0, -1), [end[0] - (dx / len) * 10, end[1] - (dy / len) * 10]];
  return (
    <g pointerEvents="none">
      <path d={smoothPath(trimmed, 0.5)} stroke="rgba(0,0,0,0.55)" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={smoothPath(trimmed, 0.5)} stroke="#fff6d5" strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray="7 5" className="march"
        markerEnd="url(#arrowhead-fff6d5)" />
      {preview.label && (
        <g transform={`translate(${end[0]} ${end[1] - 22})`}>
          <rect x={-16} y={-7} width={32} height={12} rx={6} fill="#fff6d5" stroke="#1a1a1a" strokeWidth={0.8} />
          <text y={2} fontSize={7.4} fontWeight={800} textAnchor="middle" fill="#1a1a1a">{preview.label}</text>
        </g>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ effects

type Effect =
  | { id: number; kind: 'move'; unit: UnitState; pts: Pt[]; ms: number }
  | { id: number; kind: 'boom'; at: Pt; big: boolean; ms: number }
  | { id: number; kind: 'float'; at: Pt; text: string; color: string; ms: number }
  | { id: number; kind: 'shot'; from: Pt; to: Pt; ms: number }
  | { id: number; kind: 'fade'; unit: UnitState; at: Pt; ms: number }
  | { id: number; kind: 'ring'; at: Pt; color: string; ms: number };

function MoveGhost({ e }: { e: Extract<Effect, { kind: 'move' }> }) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.animate) return;
    const frames = e.pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` }));
    el.animate(frames, { duration: e.ms, easing: 'ease-in-out', fill: 'forwards' });
  }, [e]);
  const [x, y] = e.pts[0];
  return (
    <g ref={ref} style={{ transform: `translate(${x}px, ${y}px)` }}>
      <UnitToken unit={e.unit} />
    </g>
  );
}

function EffectView({ e }: { e: Effect }) {
  switch (e.kind) {
    case 'move':
      return <MoveGhost e={e} />;
    case 'boom':
      return (
        <g transform={`translate(${e.at[0]} ${e.at[1]})`} className={e.big ? 'fx-boom big' : 'fx-boom'} style={{ animationDuration: `${e.ms}ms` }}>
          <circle className="fx-flash" r={e.big ? 26 : 18} fill="url(#fx-fire)" />
          <circle className="fx-shock" r={e.big ? 30 : 22} fill="none" stroke="#ffe3a3" strokeWidth={2} />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} className={`fx-smoke s${i}`} cx={(i - 2) * 5} cy={-2} r={7 + i} fill="rgba(60,56,50,0.55)" />
          ))}
        </g>
      );
    case 'float':
      return (
        <g transform={`translate(${e.at[0]} ${e.at[1]})`}>
          <text className="fx-float" fill={e.color} style={{ animationDuration: `${e.ms}ms` }} textAnchor="middle" fontSize={11}>
            {e.text}
          </text>
        </g>
      );
    case 'shot':
      return (
        <line x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]} className="fx-shot" style={{ animationDuration: `${e.ms}ms` }}
          stroke="#ffd27a" strokeWidth={2} strokeLinecap="round" />
      );
    case 'fade':
      return (
        <g transform={`translate(${e.at[0]} ${e.at[1]})`}>
          <g className="fx-fade" style={{ animationDuration: `${e.ms}ms` }}>
            <UnitToken unit={e.unit} />
          </g>
        </g>
      );
    case 'ring':
      return (
        <g transform={`translate(${e.at[0]} ${e.at[1]})`}>
          <circle className="fx-ring" r={20} fill="none" stroke={e.color} strokeWidth={3} style={{ animationDuration: `${e.ms}ms` }} />
        </g>
      );
  }
}

// ------------------------------------------------------------------ the map

export function MapView(props: MapViewProps) {
  const { state, terrain, settings, highlights, selectedHex, selectedUnitId, attackTarget, attackers } = props;
  const b = terrain.bounds;
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<View>(() => {
    const [cx, cy] = center('2711');
    return { x: cx - 520, y: cy - 330, w: 1040, h: 660 };
  });
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverHex, setHoverHex] = useState<HexId | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [animating, setAnimating] = useState<Set<string>>(new Set());
  const seq = useRef(1);
  const prevState = useRef<GameState | null>(null);
  const anim = useRef<number | null>(null);

  const clampView = useCallback(
    (v: View): View => {
      const w = Math.min(b.w * 1.15, Math.max(330, v.w));
      const h = (v.h / v.w) * w;
      const x = Math.min(b.x + b.w - w * 0.35, Math.max(b.x - w * 0.65, v.x));
      const y = Math.min(b.y + b.h - h * 0.35, Math.max(b.y - h * 0.65, v.y));
      return { x, y, w, h };
    },
    [b],
  );

  // Keep the view's aspect ratio equal to the element's.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setVb((v) => {
        const h = (v.w * r.height) / r.width;
        return clampView({ x: v.x, y: v.y + (v.h - h) / 2, w: v.w, h });
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampView]);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current!;
    const rect = el.getBoundingClientRect();
    const v = vbRef.current;
    const scale = v.w / rect.width;
    return { x: v.x + (clientX - rect.left) * scale, y: v.y + (clientY - rect.top) * scale, scale };
  }, []);

  const flyTo = useCallback(
    (target: View, ms = 450) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = vbRef.current;
      const to = clampView(target);
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setVb({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [clampView],
  );

  const centerOn = useCallback((x: number, y: number, ms?: number) => {
    const v = vbRef.current;
    flyTo({ ...v, x: x - v.w / 2, y: y - v.h / 2 }, ms);
  }, [flyTo]);

  const zoomBy = useCallback(
    (f: number, at?: { x: number; y: number }) => {
      setVb((v) => {
        const p = at ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
        const w = Math.min(b.w * 1.15, Math.max(330, v.w * f));
        const h = (v.h / v.w) * w;
        return clampView({ x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h });
      });
    },
    [b, clampView],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomBy(e.deltaY > 0 ? 1.13 : 1 / 1.13, p);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toSvg, zoomBy]);

  // Keyboard camera: arrows/WASD to pan, +/- to zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const v = vbRef.current;
      const step = v.w * 0.12;
      const pan: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], a: [-step, 0], ArrowRight: [step, 0], d: [step, 0], ArrowUp: [0, -step], w: [0, -step], ArrowDown: [0, step], s: [0, step],
      };
      if (pan[e.key]) {
        setVb((cur) => clampView({ ...cur, x: cur.x + pan[e.key][0], y: cur.y + pan[e.key][1] }));
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') zoomBy(1 / 1.2);
      else if (e.key === '-' || e.key === '_') zoomBy(1.2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clampView, zoomBy]);

  // ---------------------------------------------------------------- effects from state changes
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (!prev || prev.scenarioId !== state.scenarioId || state.seq <= prev.seq || state.seq - prev.seq > 3) return;
    const speed = settings.animSpeed;
    const fx: Effect[] = [];
    const moving = new Set<string>();
    let moveSound: 'march' | 'engine' | null = null;
    let boom = 0;
    for (const u of Object.values(state.units)) {
      const p = prev.units[u.id];
      if (!p) continue;
      const pw = p.where;
      const nw = u.where;
      if (pw.kind === 'map' && nw.kind === 'map' && pw.hex !== nw.hex) {
        let path = state.trails?.[u.id] ?? [pw.hex, nw.hex];
        if (path[0] !== pw.hex) path = [pw.hex, ...path];
        if (path[path.length - 1] !== nw.hex) path = [...path, nw.hex];
        const ms = (120 + 170 * (path.length - 1)) * speed;
        fx.push({ id: seq.current++, kind: 'move', unit: u, pts: path.map((h) => center(h)), ms });
        moving.add(u.id);
        moveSound = def(u.id).mech ? 'engine' : moveSound ?? 'march';
      } else if (pw.kind === 'map' && nw.kind !== 'map') {
        const at = center(pw.hex);
        if (nw.kind === 'eliminated' || nw.kind === 'remnantHeld') {
          fx.push({ id: seq.current++, kind: 'fade', unit: p, at, ms: 900 * speed });
          fx.push({ id: seq.current++, kind: 'boom', at, big: true, ms: 1300 * speed });
          fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 14], text: nw.kind === 'eliminated' ? 'DESTROYED' : 'SHATTERED', color: '#ff7a5c', ms: 1700 * speed });
          boom = 2;
        } else {
          fx.push({ id: seq.current++, kind: 'fade', unit: p, at, ms: 700 * speed });
        }
      } else if (pw.kind !== 'map' && nw.kind === 'map') {
        const at = center(nw.hex);
        fx.push({ id: seq.current++, kind: 'ring', at, color: '#9fe3ff', ms: 900 * speed });
        if (pw.kind === 'reserve' || pw.kind === 'followUp' || pw.kind === 'atSea') {
          fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 14], text: 'LANDS', color: '#9fe3ff', ms: 1300 * speed });
        }
        moveSound = moveSound ?? 'march';
      }
      if (nw.kind === 'map' && pw.kind === 'map') {
        const at = center(nw.hex);
        if (u.stepsLost > p.stepsLost) fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 14], text: `−${u.stepsLost - p.stepsLost} STEP`, color: '#ff8a6a', ms: 1500 * speed });
        if (u.status !== p.status) {
          const text = u.status === 'disrupted' ? 'DISRUPTED' : u.status === 'fullRetreat' ? 'FULL RETREAT' : 'RALLIED';
          const color = u.status === 'good' ? '#9be37d' : u.status === 'disrupted' ? '#ffb347' : '#ff6b5a';
          fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 2], text, color, ms: 1500 * speed });
        }
      }
    }
    for (const c of state.combats.slice(prev.combats.length)) {
      const at = center(c.defenderHex);
      fx.push({ id: seq.current++, kind: 'boom', at, big: false, ms: 1000 * speed });
      for (const id of c.attackers) {
        const pu = prev.units[id];
        if (pu?.where.kind === 'map') fx.push({ id: seq.current++, kind: 'shot', from: center(pu.where.hex), to: at, ms: 500 * speed });
      }
      fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 30], text: c.result.replace(/ Adv \d/, ''), color: '#ffe08a', ms: 1800 * speed });
      boom = Math.max(boom, 1);
    }
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (!d.vp) continue;
      const was = prev.control[h] ?? 'German';
      const now = state.control[h] ?? 'German';
      if (was !== now) {
        const at = center(h);
        fx.push({ id: seq.current++, kind: 'float', at: [at[0], at[1] - 34], text: `${now === 'Allied' ? '+' : '−'}${d.vp} VP ${d.city ?? d.town ?? ''}`.trim(), color: now === 'Allied' ? '#b8e986' : '#e0e6ea', ms: 2200 * speed });
        fx.push({ id: seq.current++, kind: 'ring', at, color: '#e4c25a', ms: 1100 * speed });
      }
    }
    if (!fx.length) return;
    if (boom) sfx.boom(boom > 1);
    else if (moveSound === 'engine') sfx.engine();
    else if (moveSound) sfx.march();
    setEffects((e) => [...e, ...fx]);
    if (moving.size) {
      setAnimating((a) => new Set([...a, ...moving]));
    }
    const maxMs = Math.max(...fx.map((f) => f.ms));
    const ids = new Set(fx.map((f) => f.id));
    window.setTimeout(() => {
      setEffects((e) => e.filter((f) => !ids.has(f.id)));
      setAnimating((a) => {
        const n = new Set(a);
        for (const id of moving) n.delete(id);
        return n;
      });
    }, maxMs + 60);
    // Follow the computer's actions when they happen off screen.
    if (props.aiActive && settings.followAi) {
      const first = fx.find((f) => f.kind === 'boom' || f.kind === 'move' || f.kind === 'ring');
      if (first) {
        const at = first.kind === 'move' ? first.pts[first.pts.length - 1] : (first as { at: Pt }).at;
        const v = vbRef.current;
        const mx = v.w * 0.12;
        if (at[0] < v.x + mx || at[0] > v.x + v.w - mx - 380 * (v.w / (svgRef.current?.clientWidth || 1)) || at[1] < v.y + mx || at[1] > v.y + v.h - mx) {
          followed.current = true;
          centerOn(at[0] + v.w * 0.08, at[1], 500);
        }
      }
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the computer's turn, return the camera to where the player left it.
  const savedView = useRef<View | null>(null);
  const followed = useRef(false);
  useEffect(() => {
    if (props.aiActive) {
      if (!savedView.current) savedView.current = vbRef.current;
    } else if (savedView.current) {
      if (followed.current) flyTo(savedView.current, 600);
      savedView.current = null;
      followed.current = false;
    }
  }, [props.aiActive, flyTo]);

  const stacks = useMemo(() => {
    const m = new Map<HexId, UnitState[]>();
    for (const u of Object.values(state.units)) {
      if (u.where.kind !== 'map' || animating.has(u.id)) continue;
      const list = m.get(u.where.hex) ?? [];
      list.push(u);
      m.set(u.where.hex, list);
    }
    return m;
  }, [state, animating]);

  // Attack arrows from the chosen attackers' hexes.
  const attackArrows = useMemo(() => {
    if (!attackTarget) return [];
    const from = new Set<HexId>();
    for (const id of attackers) {
      const u = state.units[id];
      if (u?.where.kind === 'map') from.add(u.where.hex);
    }
    return [...from].map((h) => ({ from: center(h), to: center(attackTarget) }));
  }, [attackTarget, attackers, state]);

  const hoverScreen = useMemo(() => {
    if (!hoverHex || !svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const [x, y] = center(hoverHex);
    const k = rect.width / vb.w;
    return { left: (x - vb.x) * k, top: (y - vb.y) * k };
  }, [hoverHex, vb]);

  const turnSide = state.activeSide;

  return (
    <div className={`mapwrap${dragging ? ' dragging' : ''}`}>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          if (anim.current) cancelAnimationFrame(anim.current);
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
              setVb((v) => clampView({ ...v, x: d.vx - dx * scale, y: d.vy - dy * scale }));
              return;
            }
          }
          const p = toSvg(e.clientX, e.clientY);
          const h = pixelToHex(p.x, p.y);
          const hex = MAP.hexes[h] ? h : null;
          if (hex !== hoverHex) {
            setHoverHex(hex);
            props.onHover(hex);
          }
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
        onPointerLeave={() => {
          setHoverHex(null);
          props.onHover(null);
        }}
      >
        <defs>
          {['fff6d5', 'ef5a3c', 'ffd27a'].map((c) => (
            <marker key={c} id={`arrowhead-${c}`} viewBox="0 0 10 10" refX={3} refY={5} markerWidth={3.2} markerHeight={3.2} orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill={`#${c}`} stroke="#1a1a1a" strokeWidth={0.8} />
            </marker>
          ))}
          <radialGradient id="fx-fire">
            <stop offset="0" stopColor="#fff6c8" />
            <stop offset="0.35" stopColor="#ffb238" />
            <stop offset="0.75" stopColor="#d6421c" stopOpacity={0.7} />
            <stop offset="1" stopColor="#6b1d0c" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="0.6" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <rect x={b.x - 5000} y={b.y - 5000} width={b.w + 10000} height={b.h + 10000} fill="#131614" />
        <image href={terrain.url} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />
        <StaticOverlay version={props.version} showGrid={settings.showGrid} showLabels={settings.showLabels} />
        <Markers state={state} />
        <Regions highlights={highlights} />
        {props.preview && <PathPreview preview={props.preview} />}
        <g pointerEvents="none">
          {attackArrows.map((a, i) => <Arrow key={i} from={a.from} to={a.to} color="#ef5a3c" />)}
          {selectedHex && <polygon points={polyPoints(selectedHex, R - 1.5)} fill="none" stroke="#ffd84a" strokeWidth={2.4} className="sel-hex" />}
          {attackTarget && (
            <g transform={`translate(${center(attackTarget)[0]} ${center(attackTarget)[1]})`}>
              <circle r={23} fill="none" stroke="#ef5a3c" strokeWidth={2.5} className="target-ring" />
              <path d="M-27,0 h8 M19,0 h8 M0,-27 v8 M0,19 v8" stroke="#ef5a3c" strokeWidth={2.4} />
            </g>
          )}
        </g>
        <g pointerEvents="none">
          {[...stacks.entries()].map(([h, list]) => {
            const [x, y] = center(h);
            const sorted = [...list].sort((a, c) => (a.id === selectedUnitId ? 1 : c.id === selectedUnitId ? -1 : 0));
            const top = sorted[sorted.length - 1];
            const mine = sideOf(top) === turnSide;
            const spent = state.phase === 'movement' && mine && (top.stopped || top.mpSpent !== null) && props.humanSides.includes(turnSide);
            return (
              <g key={h} transform={`translate(${x} ${y + 1})`} className="stack">
                <UnitToken
                  unit={top}
                  count={list.length}
                  selected={top.id === selectedUnitId || list.some((u) => attackers.has(u.id))}
                  dim={spent}
                  frozen={list.some((u) => !!u.frozenUntil && state.turn < u.frozenUntil)}
                />
              </g>
            );
          })}
        </g>
        <g pointerEvents="none">
          {effects.map((e) => <EffectView key={e.id} e={e} />)}
        </g>
      </svg>
      <div className="map-vignette" />
      <Minimap terrain={terrain} state={state} view={vb} onJump={(x, y) => centerOn(x, y, 350)} />
      <div className="maptools">
        <button title="Zoom in (+)" onClick={() => zoomBy(1 / 1.3)}>＋</button>
        <button title="Zoom out (−)" onClick={() => zoomBy(1.3)}>－</button>
        <button title="Whole map" onClick={() => flyTo({ x: b.x, y: b.y, w: b.w, h: (b.w * vb.h) / vb.w })}>⤢</button>
        <button title="Back to the beaches" onClick={() => { const [x, y] = center('2711'); centerOn(x + 120, y, 500); }}>⌖</button>
      </div>
      {props.hoverText && hoverScreen && !dragging && (
        <div className="hex-tip" style={{ left: hoverScreen.left + 28, top: hoverScreen.top - 10 }}>
          {props.hoverText.split('\n').map((l, i) => <div key={i} className={i ? 'sub' : 'head'}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ minimap

function Minimap({ terrain, state, view, onJump }: { terrain: TerrainImage; state: GameState; view: View; onJump: (x: number, y: number) => void }) {
  const b = terrain.bounds;
  const W = 200;
  const H = (W * b.h) / b.w;
  const k = W / b.w;
  const dots = useMemo(() => {
    const seen = new Map<HexId, Side>();
    for (const u of Object.values(state.units)) if (u.where.kind === 'map') seen.set(u.where.hex, sideOf(u));
    return [...seen.entries()];
  }, [state]);
  const jump = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onJump(b.x + (e.clientX - r.left) / k, b.y + (e.clientY - r.top) / k);
  };
  return (
    <div className="minimap" style={{ width: W, height: H }} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); jump(e); }}
      onPointerMove={(e) => e.buttons && jump(e)}>
      <img src={terrain.thumb} width={W} height={H} alt="" draggable={false} />
      <svg width={W} height={H} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}>
        {dots.map(([h, side]) => {
          const [x, y] = center(h);
          return <rect key={h} x={x - 11} y={y - 11} width={22} height={22} rx={4} fill={side === 'Allied' ? '#b7d36b' : '#e8eef2'} stroke="#111" strokeWidth={4} />;
        })}
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="rgba(255,255,255,0.08)" stroke="#ffd84a" strokeWidth={8} />
      </svg>
    </div>
  );
}

export function hexLabel(h: HexId): string {
  const d = MAP.hexes[h];
  return d?.city ?? d?.town ?? h;
}
