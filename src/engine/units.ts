import { MAP, RULES, UNIT_DEFS } from './data';
import { neighbors, type HexId } from './hex';
import type { GameState, Side, StepValues, UnitDef, UnitState } from './types';

export const other = (s: Side): Side => (s === 'Allied' ? 'German' : 'Allied');

export function def(id: string): UnitDef {
  const d = UNIT_DEFS[id];
  if (!d) throw new Error(`Unknown unit ${id}`);
  return d;
}

export function stepsRemaining(u: UnitState): number {
  return def(u.id).steps.length - u.stepsLost;
}

export function values(u: UnitState): StepValues {
  const d = def(u.id);
  return d.steps[Math.min(u.stepsLost, d.steps.length - 1)];
}

export function isOnMap(u: UnitState): u is UnitState & { where: { kind: 'map'; hex: HexId } } {
  return u.where.kind === 'map';
}

export function hexOf(u: UnitState): HexId | null {
  return u.where.kind === 'map' ? u.where.hex : null;
}

export function unitsAt(s: GameState, hex: HexId): UnitState[] {
  const out: UnitState[] = [];
  for (const u of Object.values(s.units)) if (u.where.kind === 'map' && u.where.hex === hex) out.push(u);
  return out;
}

export function sideOf(u: UnitState): Side {
  return def(u.id).side;
}

export function isCombatUnit(u: UnitState): boolean {
  return def(u.id).type !== 'asu';
}

/** Map of hex -> side for every occupied hex. */
export function occupancy(s: GameState): Map<HexId, Side> {
  const m = new Map<HexId, Side>();
  for (const u of Object.values(s.units)) if (u.where.kind === 'map') m.set(u.where.hex, sideOf(u));
  return m;
}

/** Hexes in the zone of control of `side`'s units. */
export function zocOf(s: GameState, side: Side): Set<HexId> {
  const z = new Set<HexId>();
  for (const u of Object.values(s.units)) {
    if (u.where.kind !== 'map' || sideOf(u) !== side) continue;
    const d = def(u.id);
    if (d.noZoc || d.type === 'asu') continue;
    for (const n of neighbors(u.where.hex)) {
      const h = MAP.hexes[n];
      if (h && h.terrain !== 'sea') z.add(n);
    }
  }
  return z;
}

export function stackCount(s: GameState, hex: HexId, extra: string[] = []): number {
  let n = 0;
  const ids = new Set(unitsAt(s, hex).map((u) => u.id));
  for (const e of extra) ids.add(e);
  for (const id of ids) if (!def(id).freeStack) n++;
  return n;
}

export function canStack(s: GameState, hex: HexId, unitId: string): boolean {
  if (def(unitId).freeStack) return true;
  const already = unitsAt(s, hex).some((u) => u.id === unitId);
  return already || stackCount(s, hex) + 1 <= RULES.stackingLimit;
}

export function adjacentEnemy(s: GameState, hex: HexId, side: Side): boolean {
  const occ = occupancy(s);
  return neighbors(hex).some((n) => occ.get(n) === other(side));
}

export function liveUnits(s: GameState, side?: Side): UnitState[] {
  return Object.values(s.units).filter((u) => u.where.kind === 'map' && (!side || sideOf(u) === side));
}
