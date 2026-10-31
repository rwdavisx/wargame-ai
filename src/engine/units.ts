import { MAP, RULES, UNIT_DEFS } from './data';
import { type HexId } from './hex';
import type { GameState, Side, StepValues, UnitDef, UnitState } from './types';

export const other = (s: Side): Side => (s === 'Allied' ? 'German' : 'Allied');

/** Notes the hexes a unit passed through in the current action, so the UI can animate it. */
export function recordTrail(s: GameState, unitId: string, path: HexId[]): void {
  if (!path.length) return;
  (s.trails ??= {})[unitId] = path;
}

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

export function hexOf(u: UnitState): HexId | null {
  return u.where.kind === 'map' ? u.where.hex : null;
}

export function sideOf(u: UnitState): Side {
  return def(u.id).side;
}

export function isAsu(u: UnitState | string): boolean {
  return !!def(typeof u === 'string' ? u : u.id).asu;
}

export function goodOrder(u: UnitState): boolean {
  return u.status === 'good';
}

export function unitsAt(s: GameState, hex: HexId): UnitState[] {
  const out: UnitState[] = [];
  for (const u of Object.values(s.units)) if (u.where.kind === 'map' && u.where.hex === hex) out.push(u);
  return out;
}

export function friendsAt(s: GameState, hex: HexId, side: Side): UnitState[] {
  return unitsAt(s, hex).filter((u) => sideOf(u) === side);
}

export function liveUnits(s: GameState, side?: Side): UnitState[] {
  return Object.values(s.units).filter((u) => u.where.kind === 'map' && (!side || sideOf(u) === side));
}

/** Map of hex -> side for every hex holding a combat unit. */
export function occupancy(s: GameState): Map<HexId, Side> {
  const m = new Map<HexId, Side>();
  for (const u of Object.values(s.units)) if (u.where.kind === 'map') m.set(u.where.hex, sideOf(u));
  return m;
}

/** Stacking points used by a set of units in one hex. One silhouetted tank stacks free.
 * With the game state, a reduced unit counts the stacking points on its current side. */
export function stackPoints(ids: Iterable<string>, s?: GameState): number {
  let pts = 0;
  let freeTank = false;
  for (const id of ids) {
    const d = def(id);
    const u = s?.units[id];
    if (d.silhouette) {
      if (!freeTank) freeTank = true;
      else pts += 1;
    } else pts += (u && values(u).sp) ?? d.sp;
  }
  return pts;
}

export function canStack(s: GameState, hex: HexId, unitIds: string[]): boolean {
  const ids = new Set(unitsAt(s, hex).map((u) => u.id));
  for (const id of unitIds) ids.add(id);
  return stackPoints(ids, s) <= RULES.stackingLimit;
}

export function isVehicle(id: string): boolean {
  return def(id).vehicle;
}

export function adjacentEnemy(s: GameState, hex: HexId, side: Side, neighborsOf: (h: HexId) => HexId[]): boolean {
  const occ = occupancy(s);
  return neighborsOf(hex).some((n) => occ.get(n) === other(side));
}

export function isLand(hex: HexId): boolean {
  const h = MAP.hexes[hex];
  return !!h && h.terrain !== 'sea';
}

export function nationGroup(id: string): 'US' | 'CW' | 'GE' {
  const n = def(id).nation;
  // The French and the Italians fought under the US Fifth Army (Italy '43).
  return n === 'US' || n === 'FR' || n === 'IT' ? 'US' : n === 'GE' ? 'GE' : 'CW';
}

export function supportNation(id: string): 'US' | 'BR' | 'GE' {
  const g = nationGroup(id);
  return g === 'CW' ? 'BR' : g;
}
