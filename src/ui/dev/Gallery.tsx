// Development view of every unit token: open the app with #gallery.
import { newGame } from '../../engine/game';
import type { UnitState } from '../../engine/types';
import { TokenDefs, UnitToken } from '../render/units';
import { stackMarkers } from '../render/markers';

export default function Gallery() {
  const s = newGame('campaign', 1);
  const units = Object.values(s.units);
  units[3].status = 'disrupted';
  units[5].halfEff = true;
  units[7].outOfSupply = true;
  units[3].stepsLost = 1;
  const cols = 10;
  // The status markers and cues drawn on map counters, one per kind and a crowded stack.
  const marked: { u: UnitState; cue?: 'move' | 'attack'; left?: string }[] = [
    { u: { ...units[0], status: 'disrupted' } },
    { u: { ...units[1], status: 'fullRetreat' } },
    { u: { ...units[2], outOfSupply: true } },
    { u: { ...units[4], outOfSupply: true, isolated: true } },
    { u: { ...units[6], halfEff: true, repl: true } },
    { u: { ...units[8], truck: true, frozenUntil: 9 }, cue: 'move' },
    { u: { ...units[9], status: 'disrupted', halfEff: true, outOfSupply: true, repl: true, truck: true }, cue: 'attack' },
    { u: units[10], cue: 'move', left: '2 MP' },
  ];
  return (
    <div style={{ background: '#2a2f2c', padding: 10 }}>
      <TokenDefs />
      <svg width={cols * 120} height={110} style={{ background: '#3a3f35', display: 'block', marginBottom: 10 }}>
        {marked.map(({ u, cue, left }, i) => (
          <g key={i} transform={`translate(${i * 140 + 70} 55) scale(2)`}>
            <UnitToken unit={u} markers={stackMarkers({ ...s, phase: 'combat', turn: 1 }, [u])} cue={cue} moveLeft={left} />
          </g>
        ))}
      </svg>
      <svg width={cols * 120} height={Math.ceil(units.length / cols) * 100} style={{ background: '#3a3f35' }}>
        {units.map((u, i) => (
          <g key={u.id} transform={`translate(${(i % cols) * 120 + 60} ${Math.floor(i / cols) * 100 + 50}) scale(2)`}>
            <UnitToken unit={u} compact />
          </g>
        ))}
      </svg>
    </div>
  );
}
