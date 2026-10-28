// Step losses, remnants and elimination.
import { UNIT_DEFS } from './data';
import type { GameState, UnitState } from './types';
import { def, stepsRemaining, values } from './units';

const POOLS: Record<string, string[]> = {
  US: ['US-REM-A', 'US-REM-B', 'US-REM-C'],
  CW: ['BR-REM-A', 'BR-REM-B', 'BR-REM-C'],
};

function remnantFor(s: GameState, unitId: string): UnitState | null {
  const r = def(unitId).remnant;
  if (!r) return null;
  const ids = POOLS[r] ?? [r];
  for (const id of ids) {
    const rem = s.units[id];
    if (rem && rem.where.kind === 'remnantPool') return rem;
  }
  return null;
}

/** Value of losing one step from this unit (used to pick losses). */
export function stepValue(u: UnitState): number {
  const d = def(u.id);
  const v = values(u);
  if (stepsRemaining(u) <= 1 && !d.remnant) return v.attack + v.defense + (d.elite ? 2 : 0) + (d.tankRating ? 1 : 0) + 1;
  const next = d.steps[Math.min(u.stepsLost + 1, d.steps.length - 1)];
  return v.attack - next.attack + (v.defense - next.defense) + 0.5;
}

export function eliminate(s: GameState, u: UnitState, notes: string[], permanent = false): void {
  const name = def(u.id).name;
  if (u.represents) {
    const orig = s.units[u.represents];
    if (orig) orig.where = { kind: 'eliminated', permanent };
    u.where = { kind: 'remnantPool' };
    u.represents = undefined;
    u.status = 'good';
    u.stepsLost = 0;
    notes.push(`${name} (remnant of ${orig ? def(orig.id).name : '?'}) eliminated`);
    return;
  }
  u.where = { kind: 'eliminated', permanent };
  notes.push(`${name} eliminated`);
}

/** Removes one step from `u`, swapping in a remnant when a 3-step unit takes its second loss. */
export function loseStep(s: GameState, u: UnitState, notes: string[], permanent = false): void {
  if (u.where.kind !== 'map') return;
  const d = def(u.id);
  if (stepsRemaining(u) <= 1) return eliminate(s, u, notes, permanent);
  u.stepsLost += 1;
  if (d.steps.length === 3 && u.stepsLost === 2 && d.remnant) {
    const rem = remnantFor(s, u.id);
    if (rem) {
      rem.where = { ...u.where };
      rem.represents = u.id;
      rem.status = u.status === 'good' ? 'good' : u.status;
      rem.halfEff = u.halfEff;
      rem.outOfSupply = u.outOfSupply;
      rem.isolated = u.isolated;
      rem.attacked = u.attacked;
      rem.stopped = u.stopped;
      rem.retreatedThisPhase = u.retreatedThisPhase;
      u.where = { kind: 'remnantHeld' };
      notes.push(`${d.name} reduced to ${def(rem.id).name}`);
      return;
    }
    return eliminate(s, u, notes, permanent);
  }
  notes.push(`${d.name} reduced`);
}

/**
 * Takes `n` steps from `ids`. 'owner' picks the cheapest step, 'opponent'
 * the most valuable. Parenthesized/non-contributing units go last.
 */
export function takeSteps(s: GameState, ids: string[], n: number, picker: 'owner' | 'opponent', notes: string[], lastResort: string[] = []): void {
  for (let i = 0; i < n; i++) {
    let alive = ids.map((id) => s.units[id]).filter((u) => u && u.where.kind === 'map');
    if (!alive.length) alive = lastResort.map((id) => s.units[id]).filter((u) => u && u.where.kind === 'map');
    if (!alive.length) return;
    alive.sort((a, b) => (picker === 'owner' ? stepValue(a) - stepValue(b) : stepValue(b) - stepValue(a)));
    loseStep(s, alive[0], notes);
  }
}

/** Unit ids currently standing for `id` on the map (itself or its remnant). */
export function liveIdFor(s: GameState, id: string): string | null {
  const u = s.units[id];
  if (!u) return null;
  if (u.where.kind === 'map') return id;
  if (u.where.kind === 'remnantHeld') {
    const rem = Object.values(s.units).find((x) => x.represents === id);
    return rem?.where.kind === 'map' ? rem.id : null;
  }
  return null;
}

export const ALL_UNIT_IDS = Object.keys(UNIT_DEFS);
