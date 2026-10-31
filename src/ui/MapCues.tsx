// Map layers the printed game never had: the map modes' shading (supply, control, ZOC...), rings around
// the selected unit's formation, odds on every target, and the map mode selector with its legend.
import { memo, useMemo, useState } from 'react';
import { Ico } from './icons';
import { Medal } from './chrome';
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

/** The icon for each map mode and each layer. */
export const MODE_ICON: Record<MapMode, string> = {
  normal: 'map', supply: 'supply', control: 'flag', threat: 'warning', zoc: 'zoc', support: 'artillery', terrain: 'mountain', stacking: 'layers',
};
const LAYER_ICON: Record<LayerKey, string> = { showUnits: 'army', showLabels: 'labels', showMarkers: 'tag', showGrid: 'hex', showHexIds: 'hash', showCues: 'target' };

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
      <Medal icon={MODE_ICON[qol.mode]} label="Map modes" tip={[cur.label]} active={barOpen} pos="right" onClick={() => setBarOpen(!barOpen)}
        className={qol.mode !== 'normal' ? 'mode-on' : undefined} />
      {qol.layer && (
        <div className="mode-legend gilt" role="note" aria-label={`${cur.label} legend`}>
          <div className="mode-legend-head">
            <button className="mode-legend-title" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
              <Ico name={MODE_ICON[qol.mode]} size={16} /><b>{cur.label}</b><Ico name={folded ? 'chevronDown' : 'chevronUp'} size={14} />
            </button>
            <button className="mode-legend-close" aria-label="Back to the normal map" onClick={() => qol.setMode('normal')}><Ico name="close" size={14} /></button>
          </div>
          {!folded && (
            <ul>
              {qol.layer.legend.map((l) => (
                <li key={l.label}><SwatchIcon s={l.swatch} /><span>{l.label}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The map bar, as in grand-strategy games: one medallion per map mode and switches for the map's layers, docked on
 * the minimap. The mode's name and what it shows are in the tooltips.
 */
export function MapBar({ qol, onClose, minimapH }: { qol: QolMapProps; onClose: () => void; minimapH: number }) {
  const cur = MAP_MODES.find((m) => m.key === qol.mode) ?? MAP_MODES[0];
  return (
    <div className="map-bar gilt" id="map-bar" role="toolbar" aria-label="Map modes and layers" style={{ '--mm-h': `${Math.round(minimapH)}px` } as React.CSSProperties}>
      <div className="mb-head">
        <span className="mb-now">{cur.label}</span>
        <button className="mb-close" aria-label="Hide the map bar" onClick={onClose}><Ico name="chevronDown" size={14} /></button>
      </div>
      <div className="mb-modes" role="group" aria-label="Map mode">
        {MAP_MODES.map((m) => (
          <Medal key={m.key} icon={MODE_ICON[m.key]} label={m.label} tip={[m.note]} size="sm" active={qol.mode === m.key} onClick={() => qol.setMode(m.key)} />
        ))}
      </div>
      <div className="mb-layers" role="group" aria-label="Show">
        {qol.layers.map((l) => (
          <Medal key={l.key} icon={LAYER_ICON[l.key]} label={l.label} tip={[l.note, l.on ? 'Shown' : 'Hidden']} size="sm" className={l.on ? 'lit' : 'dim'}
            onClick={() => qol.toggleLayer(l.key)} />
        ))}
      </div>
    </div>
  );
}
