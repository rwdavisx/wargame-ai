// Fortifications (Italy '43, 18.0): markers the German player builds, one step a turn, in his Initial Phase. A fort
// is placed on its "under construction" side and later completed; a completed Level 1 fort can be upgraded to Level 2
// the same way. Only completed forts have any effect.
import { MAP, SCENARIOS, scenarioMarkers } from './data';
import { neighbors, type HexId } from './hex';
import { supplyChecker } from './supply';
import type { GameState, Side } from './types';
import { sideOf, unitsAt } from './units';
import { zocOf } from './zoc';

export interface Fort {
  level: 1 | 2;
  /** Under construction: no effect yet. */
  building?: boolean;
  /** A completed Level 1 fort with a Level 2 under construction on top. */
  upgrading?: boolean;
}

export type FortOp = 'start' | 'complete' | 'upgrade' | 'completeUpgrade';

/** Counters in the mix (18.1.3): eight Level 1 forts and the Level 2s the set-up gives (four). */
function counters(s: GameState): { 1: number; 2: number } {
  return { 1: 8, 2: scenarioMarkers(s.scenarioId).fortificationPool?.['2'] ?? 4 };
}

/** Whether the scenario plays with fortifications at all (Across the Volturno does not, S1). */
export function fortsInPlay(s: GameState): boolean {
  return !!s.forts && !(SCENARIOS[s.scenarioId] as { noFortifications?: boolean }).noFortifications;
}

/** The level of a completed fort in `hex`, or 0. */
export function fortLevel(s: GameState, hex: HexId): number {
  const f = s.forts?.[hex];
  return f && !f.building ? f.level : 0;
}

/** Remove the fort in `hex` when an enemy (Allied) unit enters it (18.2.3). */
export function razeFort(s: GameState, hex: HexId, side: Side): boolean {
  if (side !== 'Allied' || !s.forts?.[hex]) return false;
  delete s.forts[hex];
  return true;
}

function inUse(s: GameState): { 1: number; 2: number; started1: number } {
  let l1 = 0;
  let l2 = 0;
  for (const f of Object.values(s.forts ?? {})) {
    if (f.level === 1) l1 += 1;
    if (f.level === 2 || f.upgrading) l2 += 1;
  }
  // A Level 2 under construction still sits on its Level 1 marker; a completed Level 2 frees it (18.1.2).
  return { 1: l1, 2: l2, started1: l1 + Object.values(s.forts ?? {}).filter((f) => f.level === 2).length };
}

/** Hexes on or behind (north of) the Gustav Line, where Level 2 forts may go (18.1.3). */
function onOrBehindGustav(hex: HexId): boolean {
  if (MAP.hexes[hex]?.gustav) return true;
  const rowsByCol = new Map<number, number>();
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (!d.gustav) continue;
    const c = Number(h.slice(0, 2));
    rowsByCol.set(c, Math.max(rowsByCol.get(c) ?? 0, Number(h.slice(2))));
  }
  if (!rowsByCol.size) return false;
  const c = Number(hex.slice(0, 2));
  const nearest = [...rowsByCol.keys()].reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
  return Number(hex.slice(2)) <= rowsByCol.get(nearest)!;
}

/** The building steps the German player may take this phase (18.1). */
export function fortOptions(s: GameState): { hex: HexId; op: FortOp }[] {
  if (!fortsInPlay(s) || s.activeSide !== 'German' || s.phase !== 'initial' || s.fortBuiltTurn === s.turn) return [];
  const sc = supplyChecker(s, 'German');
  const ezoc = zocOf(s, 'Allied');
  const ok = (h: HexId) =>
    sc.inSupply(h) && !s.cityBattle[h] && !unitsAt(s, h).some((u) => sideOf(u) === 'Allied') &&
    (!ezoc.has(h) || unitsAt(s, h).some((u) => sideOf(u) === 'German'));
  const used = inUse(s);
  const max = counters(s);
  const out: { hex: HexId; op: FortOp }[] = [];
  for (const [h, f] of Object.entries(s.forts ?? {})) {
    if (!ok(h)) continue;
    if (f.building && f.level === 1 && used.started1 >= max[1]) out.push({ hex: h, op: 'complete' });
    if (f.upgrading) out.push({ hex: h, op: 'completeUpgrade' });
    if (!f.building && !f.upgrading && f.level === 1 && used[2] < max[2] && onOrBehindGustav(h)) out.push({ hex: h, op: 'upgrade' });
  }
  if (used[1] < max[1]) {
    for (const [h, d] of Object.entries(MAP.hexes)) {
      if (d.terrain === 'sea' || s.forts?.[h] || !ok(h)) continue;
      out.push({ hex: h, op: 'start' });
    }
  }
  return out;
}

/** An enemy unit next to the hex slows the work: a roll of 1 or 2 wastes the turn's step (18.1.4). */
export function buildNeedsRoll(s: GameState, hex: HexId): boolean {
  return neighbors(hex).some((n) => unitsAt(s, n).some((u) => sideOf(u) === 'Allied'));
}

/** Apply one building step (already checked against fortOptions). */
export function applyFortStep(s: GameState, hex: HexId, op: FortOp): void {
  s.forts ??= {};
  if (op === 'start') s.forts[hex] = { level: 1, building: true };
  else if (op === 'complete') s.forts[hex] = { level: 1 };
  else if (op === 'upgrade') s.forts[hex] = { level: 1, upgrading: true };
  else s.forts[hex] = { level: 2 };
}

/** The forts a scenario starts with (the Bernhard Line card). */
export function startingForts(scenarioId: string): Record<HexId, Fort> {
  const out: Record<HexId, Fort> = {};
  for (const f of scenarioMarkers(scenarioId).fortifications ?? []) out[f.hex] = f.building ? { level: f.level as 1 | 2, building: true } : { level: f.level as 1 | 2 };
  return out;
}
