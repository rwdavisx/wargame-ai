// Helpers shared by the play UI components.
import type { AttackPlan } from '../engine/combat';
import { neighbors, type HexId } from '../engine/hex';
import { allowedModes } from '../engine/movement';
import type { GameState, MoveMode } from '../engine/types';
import { def, goodOrder, sideOf, unitsAt, values } from '../engine/units';

export type SupportPick = Omit<AttackPlan, 'target' | 'attackers'>;
export const NO_SUPPORT: SupportPick = { air: false, naval: false, battleships: false, asus: [] };

/** Movement mode actually used for `u`: the chosen one if allowed, else tactical. */
export function effectiveMode(s: GameState, unitId: string, wanted: MoveMode): MoveMode | null {
  if (s.phase === 'invasion') return 'tactical';
  const modes = allowedModes(s, s.units[unitId]);
  if (modes.includes(wanted)) return wanted;
  return modes.includes('tactical') ? 'tactical' : (modes[0] ?? null);
}

/** Own units that could take part in an attack on `hex`. */
export function eligibleAttackers(s: GameState, hex: HexId): string[] {
  const side = s.activeSide;
  return neighbors(hex)
    .flatMap((n) => unitsAt(s, n))
    .filter((u) => {
      const d = def(u.id);
      return sideOf(u) === side && !d.asu && d.cat !== 'bh' && !d.variable && !u.attacked && !u.autoDs && goodOrder(u) && !u.truck &&
        values(u).attack > 0;
    })
    .map((u) => u.id);
}
