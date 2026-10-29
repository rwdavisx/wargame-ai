// Development view of every unit token: open the app with #gallery.
import { newGame } from '../../engine/game';
import { TokenDefs, UnitToken } from '../render/units';

export default function Gallery() {
  const s = newGame('campaign', 1);
  const units = Object.values(s.units);
  units[3].status = 'disrupted';
  units[5].halfEff = true;
  units[7].outOfSupply = true;
  units[3].stepsLost = 1;
  const cols = 10;
  return (
    <div style={{ background: '#2a2f2c', padding: 10 }}>
      <TokenDefs />
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
