// Where the enemy can strike next turn, and how much a stack stands to lose there.
// The threat map follows the enemy's real movement (terrain, roads, our zones of control),
// not just distance, so the AI sees a panzer column three valleys away coming.
import { MAP, RULES } from '../engine/data';
import { entryReach } from '../engine/game';
import { neighbors, type HexId } from '../engine/hex';
import { reachable } from '../engine/movement';
import type { GameState, MoveMode, Side, UnitState } from '../engine/types';
import { def, goodOrder, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';
import { expectedOutcome } from './evaluate';

export interface ThreatMap {
  /** Enemy attack strength that could be brought next to each hex next turn. */
  strength: Map<HexId, number>;
  /** Hexes enemy units could move into next turn. */
  reach: Set<HexId>;
}

/** The unit as it will be at the start of its next turn: fresh movement, not stopped. */
function fresh(u: UnitState): UnitState {
  return { ...u, mpSpent: null, moveMode: null, tacHexes: 0, hexesMoved: 0, crossedMountain: false, stopped: false, autoDs: false };
}

/**
 * The threat the enemy of `side` poses to every hex next turn. With `open`, as if none of our units
 * stood in the way: our screens may move off during the turn, and what matters most should not rely on them.
 */
export function threatMap(s0: GameState, side: Side, open = false): ThreatMap {
  const s = open ? { ...s0, units: Object.fromEntries(Object.entries(s0.units).filter(([, u]) => sideOf(u) !== side)) } : s0;
  const strength = new Map<HexId, number>();
  const reach = new Set<HexId>();
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === side) continue;
    const d = def(u.id);
    if (d.asu || d.cat === 'bh' || d.variable || values(u).move <= 0) continue;
    if (u.frozenUntil && s.turn + 1 < u.frozenUntil) continue;
    const att = values(u).attack * (u.outOfSupply ? 0.5 : 1) * (goodOrder(u) ? 1 : u.status === 'disrupted' ? 0.5 : 0);
    if (att <= 0) continue;
    const hexes = new Set<HexId>();
    if (u.where.kind === 'map') {
      const f = fresh(u);
      const modes: MoveMode[] = ['normal', 'tactical'];
      for (const m of modes) for (const h of reachable(s, f, u.where.hex, m).keys()) hexes.add(h);
    } else if (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop')) {
      try {
        for (const h of entryReach(s, u.id, 'normal').keys()) hexes.add(h);
      } catch {
        // not enterable now
      }
    } else continue;
    // Every hex next to where it can stand can be attacked by it.
    const hit = new Set<HexId>();
    for (const h of hexes) {
      reach.add(h);
      for (const n of neighbors(h)) hit.add(n);
    }
    for (const h of hit) strength.set(h, (strength.get(h) ?? 0) + att);
  }
  return { strength, reach };
}

/** Defense of a stack (unit ids) standing in `hex`, as the combat table will see it. */
export function stackDefense(s: GameState, hex: HexId, ids: string[]): number {
  const hd = MAP.hexes[hex];
  const doubles = !!hd.city || hd.terrain === 'hill' || hd.terrain === 'marsh';
  let total = 0;
  let asu = 0;
  let regular = 0;
  for (const id of ids) {
    const u = s.units[id];
    const d = def(id);
    if (!u || u.status === 'fullRetreat') continue;
    if (d.parenthesized || d.asu) {
      asu = Math.max(asu, values(u).defense);
      continue;
    }
    let v = d.variable ? 1.5 : values(u).defense;
    const good = u.status === 'good';
    if (doubles && !d.silhouette && !d.variable && good) v *= 2;
    else if (!good) v = Math.ceil(v / 2);
    total += v;
    regular++;
  }
  if (!regular) total = asu;
  return Math.min(RULES.combat.strengthCap, total);
}

/** VP-like value of a stack: steps, plus the victory points its artillery and beach groups are worth. */
export function stackValue(s: GameState, ids: string[]): number {
  let v = 0;
  for (const id of ids) {
    const u = s.units[id];
    if (!u) continue;
    const d = def(id);
    if (d.asu) v += 3.2; // a lost ASU is a victory point
    else if (d.cat === 'bh') v += 3.2; // so is a lost beach group (and its beachhead)
    else if ((d.cat === 'airborne' || d.cat === 'glider') && d.sp >= 2 && d.side === 'Allied') v += 1.5 + stepsRemaining(u);
    else v += stepsRemaining(u) * (1 + values(u).attack / 8);
  }
  return v;
}

/** Column index (0 = 1-3 ... 8 = 7-1) for an attack ratio; 99 means an automatic overrun (10-1). */
export function ratioColumn(att: number, dfn: number): number {
  if (dfn <= 0) return 99;
  const r = att / dfn;
  if (r >= 10) return 99;
  if (r < 1 / 3) return -1;
  if (r < 0.5) return 0;
  if (r < 1) return 1;
  return Math.min(8, 1 + Math.floor(r + 1e-9));
}

/** Expected loss (in stackValue units) for the stack `ids` at `hex` against `threat` attack strength. */
export function stackRisk(s: GameState, hex: HexId, ids: string[], threat: number, shift = 0): number {
  if (!ids.length || threat <= 0) return 0;
  const dfn = stackDefense(s, hex, ids);
  const raw = ratioColumn(Math.min(RULES.combat.strengthCap * 1.6, threat), dfn);
  // Enemy artillery and air support usually add a column or so.
  const col = raw === 99 ? 99 : Math.min(8, raw + shift);
  if (col < 2) return 0; // below 1-1 the enemy will rarely attack
  const regular = ids.filter((id) => !def(id).asu && !def(id).parenthesized && def(id).cat !== 'bh');
  const asus = ids.length - regular.length - ids.filter((id) => def(id).cat === 'bh').length;
  const bhs = ids.filter((id) => def(id).cat === 'bh').length;
  const regValue = stackValue(s, regular);
  const steps = regular.reduce((a, id) => a + (s.units[id] ? stepsRemaining(s.units[id]) : 0), 0);
  if (col === 99) return (regValue + (asus + bhs) * 3.2) * 0.9;
  const e = expectedOutcome(col, 0, Math.max(1, steps));
  // Points at stake: artillery dies when shattered or left uncovered; beach groups cannot retreat at all.
  let asuLoss = 0;
  let bhLoss = 0;
  for (let roll = 1; roll <= 6; roll++) {
    const raw = RULES.combat.crt[String(roll)][Math.min(8, col)];
    const red = raw.endsWith('r');
    if (raw.startsWith('DS')) {
      asuLoss += asus;
      bhLoss += bhs;
      continue;
    }
    const retreat = /DR|D1/.test(raw);
    const loss = /D1|EX|DRX/.test(raw);
    if (!regular.length && (loss || (retreat && bhs))) asuLoss += asus;
    if (bhs && (retreat || loss)) bhLoss += bhs * (red ? 1 : 0.6); // a stand may save it
  }
  const hd = MAP.hexes[hex];
  const hold = (hd.vp ?? 0) * 2.2 + (Object.values(MAP.beaches).some((b) => b.hex === hex) ? 1 : 0);
  const perStep = regValue / Math.max(1, steps);
  // The enemy picks its fights: weak odds are attacked less often than strong ones, unless points are at stake.
  let likely = col >= 5 ? 1 : col === 4 ? 0.9 : col === 3 ? 0.7 : 0.4;
  if (asus + bhs > 0 && col >= 3) likely = Math.max(likely, 0.9);
  return likely * (e.defLoss * perStep + e.retreat * (0.35 + hold) + (asuLoss + bhLoss) / 6 * 3.2);
}

/** Own units (ids) standing in `hex`. */
export function ownAt(s: GameState, hex: HexId, side: Side): string[] {
  return unitsAt(s, hex).filter((u) => sideOf(u) === side).map((u) => u.id);
}
