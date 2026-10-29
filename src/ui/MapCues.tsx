// Map layers the printed game never had: the map modes' shading (supply, control, ZOC...), rings around
// the selected unit's formation, odds on every target, and the map mode selector with its legend.
import { memo, useMemo, useState } from 'react';
import type { HexId } from '../engine/hex';
import type { GameState, Side, UnitState } from '../engine/types';
import { def, sideOf } from '../engine/units';
import { MAP_MODES, type MapMode, type ModeLayer, type Swatch } from './mapModes';
import { center, polyPoints, R } from './render/geom';
import { formationColour } from './render/units';
import type { LayerKey, OddsCue, OddsTone, QolMapProps } from './qol';

/** Hatch patterns for the map modes (drawn in SVG: no image URLs). */
export function CueDefs() {
  return (
    <>
      <pattern id="mode-hatch-red" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={7} height={7} fill="rgba(239,90,60,0.14)" />
        <rect width={2.2} height={7} fill="rgba(239,90,60,0.5)" />
      </pattern>
      <pattern id="mode-hatch-amber" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width={8} height={8} fill="rgba(242,198,58,0.12)" />
        <rect width={2.4} height={8} fill="rgba(242,198,58,0.5)" />
      </pattern>
    </>
  );
}

/** The map mode's shading (under the map's line work) or its lines and source marks (over it), all under the units. */
export const ModeUnderlay = memo(function ModeUnderlay({ layer, part }: { layer: ModeLayer; part: 'fills' | 'lines' }) {
  if (part === 'fills') {
    return (
      <g pointerEvents="none" className="mode-layer">
        <rect x={-5000} y={-5000} width={10000} height={10000} fill="rgba(10,12,10,0.3)" />
        {layer.fills.map((f, i) => f.d && <path key={i} d={f.d} fill={f.fill} stroke={f.stroke} strokeWidth={f.width} strokeLinejoin="round" />)}
      </g>
    );
  }
  return (
    <g pointerEvents="none" className="mode-layer">
      <g fill="none" strokeLinecap="round">
        {layer.lines.map((l, i) => l.d && <path key={`h${i}`} d={l.d} stroke="rgba(8,10,8,0.7)" strokeWidth={l.width + 2.4} />)}
        {layer.lines.map((l, i) => l.d && <path key={`l${i}`} d={l.d} stroke={l.stroke} strokeWidth={l.width} strokeDasharray={l.dash} />)}
      </g>
      {layer.rings.map((r, i) => (
        <g key={i} transform={`translate(${r.x} ${r.y})`}>
          <path d="M0,-5.5 L5.5,0 L0,5.5 L-5.5,0 Z" fill="rgba(20,18,10,0.8)" stroke={r.stroke} strokeWidth={1.6} />
          <circle r={1.7} fill={r.stroke} />
        </g>
      ))}
    </g>
  );
});

/** Rings in the formation's own colour around the other stacks of the selected unit's formation. */
export const FormationRings = memo(function FormationRings({ state, formation, side, selectedId }: { state: GameState; formation: string; side: Side; selectedId: string | null }) {
  const hexes = useMemo(() => {
    const out = new Set<HexId>();
    const sel = selectedId ? state.units[selectedId] : null;
    for (const u of Object.values(state.units) as UnitState[]) {
      if (u.where.kind !== 'map' || sideOf(u) !== side || def(u.id).formation !== formation) continue;
      if (sel?.where.kind === 'map' && sel.where.hex === u.where.hex) continue;
      out.add(u.where.hex);
    }
    return [...out];
  }, [state, formation, side, selectedId]);
  const colour = formationColour(formation) ?? '#ffffff';
  return (
    <g pointerEvents="none">
      {hexes.map((h) => {
        const [x, y] = center(h);
        return (
          <g key={h} transform={`translate(${x} ${y + 1})`}>
            <rect x={-22.5} y={-22.5} width={45} height={45} rx={5} fill="none" stroke="#0c0d0b" strokeWidth={4} opacity={0.6} />
            <rect x={-22.5} y={-22.5} width={45} height={45} rx={5} fill="none" stroke={colour} strokeWidth={2} strokeDasharray="5 3" />
          </g>
        );
      })}
    </g>
  );
});

const TONE: Record<OddsTone, { fill: string; ink: string }> = {
  auto: { fill: '#7be0a0', ink: '#0d2617' },
  good: { fill: '#f2d78f', ink: '#2a2110' },
  fair: { fill: '#ece6d6', ink: '#1c1c18' },
  poor: { fill: '#8c2a1c', ink: '#fff1ea' },
};

function OddsChip({ hex, cue }: { hex: HexId; cue: OddsCue }) {
  const [x, y] = center(hex);
  const w = cue.label.length * 4.3 + 9;
  const t = TONE[cue.tone];
  return (
    <g transform={`translate(${x} ${y - 24.5})`} pointerEvents="visiblePainted" className="odds-chip">
      <title>{cue.title}</title>
      <rect x={-w / 2} y={-5.6} width={w} height={11.2} rx={5.6} fill={t.fill} stroke="#141210" strokeWidth={0.9} />
      <text y={2.6} textAnchor="middle" fontSize={7.6} fill={t.ink} className="marker-text">{cue.label}</text>
    </g>
  );
}

/** Odds chips, the map mode's labels and the jump-to pulse, drawn above the units. */
export const CueOverlay = memo(function CueOverlay({ qol, attackTarget }: { qol: QolMapProps; attackTarget: HexId | null }) {
  return (
    <g pointerEvents="none">
      {qol.layer?.labels.map((l, i) => {
        const w = l.text.length * 4.2 + 7;
        return (
          <g key={`m${i}`} transform={`translate(${l.x} ${l.y})`}>
            <rect x={-w / 2} y={-5} width={w} height={10} rx={2.5} fill={l.fill} stroke="#141210" strokeWidth={0.8} />
            <text y={2.6} textAnchor="middle" fontSize={7.2} fill={l.ink} className="marker-text">{l.text}</text>
          </g>
        );
      })}
      {qol.cues && [...qol.odds.entries()].map(([h, cue]) => (h === attackTarget ? null : <OddsChip key={h} hex={h} cue={cue} />))}
      {qol.pulse && <polygon key={qol.pulse.n} points={polyPoints(qol.pulse.hex, R - 1)} fill="rgba(255,216,74,0.12)" stroke="#ffd84a" strokeWidth={3.2} className="qol-pulse" />}
    </g>
  );
});

// ------------------------------------------------------------------ map mode selector

/** Small line icons for the modes. */
function ModeIcon({ mode }: { mode: MapMode }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
      {mode === 'normal' && <path d="M10 2.5 L16.5 6.2 V13.8 L10 17.5 L3.5 13.8 V6.2 Z" {...p} />}
      {mode === 'supply' && <><path d="M3.5 7 L10 3.5 L16.5 7 V13.5 L10 17 L3.5 13.5 Z" {...p} /><path d="M3.5 7 L10 10.5 L16.5 7 M10 10.5 V17" {...p} /></>}
      {mode === 'control' && <><path d="M5 17.5 V3" {...p} /><path d="M5 3.5 H15 L12.5 7 L15 10.5 H5" {...p} fill="currentColor" fillOpacity={0.35} /></>}
      {mode === 'zoc' && <><path d="M10 2.5 L16.5 6.2 V13.8 L10 17.5 L3.5 13.8 V6.2 Z" {...p} /><path d="M6 13 L13 6 M8.5 15 L15 8.5 M5 10 L10 5" {...p} strokeWidth={1.2} /></>}
      {mode === 'support' && <><circle cx={10} cy={10} r={6.5} {...p} /><path d="M10 1.5 V5.5 M10 14.5 V18.5 M1.5 10 H5.5 M14.5 10 H18.5" {...p} /><circle cx={10} cy={10} r={1.2} fill="currentColor" /></>}
      {mode === 'terrain' && <path d="M1.5 16.5 L7.5 6.5 L11 12 L13 9 L18.5 16.5 Z" {...p} />}
      {mode === 'stacking' && <><rect x={3} y={8} width={10} height={9} rx={1} {...p} /><path d="M6 5 H16 V14" {...p} /></>}
    </svg>
  );
}

function SwatchIcon({ s }: { s: Swatch }) {
  return (
    <svg width={20} height={16} viewBox="-10 -8 20 16" aria-hidden className="legend-swatch">
      {s.kind === 'hex' && <polygon points="0,-7 6.5,-3.5 6.5,3.5 0,7 -6.5,3.5 -6.5,-3.5" fill={s.fill} stroke={s.stroke ?? 'rgba(255,255,255,0.25)'} strokeWidth={1.4} strokeDasharray={s.dash} />}
      {s.kind === 'line' && <><path d="M-9,0 H9" stroke="rgba(8,10,8,0.8)" strokeWidth={5} /><path d="M-9,0 H9" stroke={s.stroke} strokeWidth={2.6} strokeDasharray={s.dash} /></>}
      {s.kind === 'ring' && <><path d="M0,-6 L6,0 L0,6 L-6,0 Z" fill="rgba(20,18,10,0.75)" stroke={s.stroke} strokeWidth={1.6} /><circle r={1.8} fill={s.stroke} /></>}
    </svg>
  );
}

/** The map-tools button that shows or hides the map bar; the active mode's legend shows beside the tools. */
export function ModeTools({ qol, barOpen, setBarOpen }: { qol: QolMapProps; barOpen: boolean; setBarOpen: (b: boolean) => void }) {
  // The legend folds down to its title so it can stay on screen without hiding the map.
  const [folded, setFolded] = useState(false);
  const cur = MAP_MODES.find((m) => m.key === qol.mode) ?? MAP_MODES[0];
  return (
    <div className="mode-tools">
      <button title={`Map modes and layers (${cur.label})`} className={`mode-btn${barOpen ? ' on' : ''}${qol.mode !== 'normal' ? ' active' : ''}`}
        aria-expanded={barOpen} aria-controls="map-bar" onClick={() => setBarOpen(!barOpen)}>
        <ModeIcon mode={qol.mode} />
      </button>
      {qol.layer && (
        <div className="mode-legend" role="note" aria-label={`${cur.label} legend`}>
          <div className="mode-legend-head">
            <button className="mode-legend-title" onClick={() => setFolded((f) => !f)} aria-expanded={!folded} title={folded ? 'Show the legend' : 'Fold the legend'}>
              <ModeIcon mode={qol.mode} />
              <b>{cur.label}</b>
              <span aria-hidden>{folded ? '▸' : '▾'}</span>
            </button>
            <button className="mode-legend-close" title="Back to the normal map" onClick={() => qol.setMode('normal')}>✕</button>
          </div>
          {!folded && (
            <>
              <ul>
                {qol.layer.legend.map((l) => (
                  <li key={l.label}><SwatchIcon s={l.swatch} /><span>{l.label}</span></li>
                ))}
              </ul>
              {qol.layer.note && <p>{qol.layer.note}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Little icons for the map layers. */
function LayerIcon({ k }: { k: LayerKey }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
      {k === 'showUnits' && <><rect x={3} y={4} width={14} height={12} rx={1.5} {...p} /><rect x={6.5} y={6.5} width={7} height={4.5} {...p} strokeWidth={1.2} /><path d="M6.5 6.5 L13.5 11 M13.5 6.5 L6.5 11" {...p} strokeWidth={1.1} /><path d="M7 13.6 H13" {...p} strokeWidth={1.2} /></>}
      {k === 'showLabels' && <><path d="M3 15 L6.5 5 L10 15 M4.3 11.5 H8.7" {...p} /><path d="M12 9.5 Q14 8 15.8 9.2 V15 M15.8 12 Q12 11.3 12 13.4 Q12.3 15.4 15.8 14" {...p} strokeWidth={1.3} /></>}
      {k === 'showMarkers' && <><path d="M10 3 L11.8 7.4 L16.5 7.7 L12.9 10.7 L14 15.3 L10 12.8 L6 15.3 L7.1 10.7 L3.5 7.7 L8.2 7.4 Z" {...p} /></>}
      {k === 'showGrid' && <path d="M9.7 8.4 L6.3 10.4 L2.9 8.4 L2.9 4.5 L6.3 2.6 L9.7 4.5 Z M17.1 8.4 L13.7 10.4 L10.3 8.4 L10.3 4.5 L13.7 2.6 L17.1 4.5 Z M13.4 14.8 L10.0 16.8 L6.6 14.8 L6.6 10.9 L10.0 9.0 L13.4 10.9 Z" {...p} strokeWidth={1.3} />}
      {k === 'showHexIds' && <><path d="M10 2.5 L16.5 6.2 V13.8 L10 17.5 L3.5 13.8 V6.2 Z" {...p} strokeWidth={1.3} /><text x={10} y={12.6} textAnchor="middle" fontSize={7.2} fontWeight={700} fill="currentColor" stroke="none">27</text></>}
      {k === 'showCues' && <><circle cx={10} cy={10} r={6.5} {...p} /><path d="M7.2 7.4 L10 10 L7.2 12.6 M10.4 7.4 L13.2 10 L10.4 12.6" {...p} strokeWidth={1.4} /></>}
    </svg>
  );
}

/**
 * The map bar, as in grand-strategy games: one button per map mode and switches for the map's layers.
 * On a large screen it sits on the minimap; on a phone it opens above the action bar from the map tools.
 */
export function MapBar({ qol, onClose, minimapH }: { qol: QolMapProps; onClose: () => void; minimapH: number }) {
  const [hot, setHot] = useState<MapMode | null>(null);
  const shown = MAP_MODES.find((m) => m.key === (hot ?? qol.mode)) ?? MAP_MODES[0];
  return (
    <div className="map-bar" id="map-bar" role="toolbar" aria-label="Map modes and layers" style={{ '--mm-h': `${Math.round(minimapH)}px` } as React.CSSProperties}>
      <div className="mb-head">
        <span className="mb-now"><span className="mb-kicker">Map mode</span> <b>{shown.label}</b></span>
        <button className="mb-close" onClick={onClose} title="Hide the map bar">✕</button>
      </div>
      <div className="mb-note">{shown.note}</div>
      <div className="mb-modes" role="radiogroup" aria-label="Map mode" onPointerLeave={() => setHot(null)}>
        {MAP_MODES.map((m) => (
          <button key={m.key} role="radio" aria-checked={qol.mode === m.key} aria-label={m.label} title={`${m.label}: ${m.note}`}
            className={qol.mode === m.key ? 'on' : ''} onPointerEnter={() => setHot(m.key)} onFocus={() => setHot(m.key)} onBlur={() => setHot(null)}
            onClick={() => qol.setMode(m.key)}>
            <ModeIcon mode={m.key} />
            <span>{m.label === 'Zones of control' ? 'ZOC' : m.label === 'Support range' ? 'Support' : m.label}</span>
          </button>
        ))}
      </div>
      <div className="mb-sep">Show</div>
      <div className="mb-layers">
        {qol.layers.map((l) => (
          <button key={l.key} aria-pressed={l.on} className={l.on ? 'on' : ''} title={`${l.label}: ${l.note} (${l.on ? 'shown' : 'hidden'})`} onClick={() => qol.toggleLayer(l.key)}>
            <LayerIcon k={l.key} />
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
