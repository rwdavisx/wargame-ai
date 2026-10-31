// Where the enemy can strike next turn, and how much a stack stands to lose there.
// The threat map follows the enemy's real movement (terrain, roads, our zones of control),
// not just distance, so the AI sees a panzer column three valleys away coming.
import { MAP, RULES } from '../engine/data';
import { entryReach } from '../engine/game';
import { distance, neighbors, type HexId } from '../engine/hex';
import { allowedModes, reachableInto } from '../engine/movement';
import type { GameState, MoveMode, Side, UnitState } from '../engine/types';
import { def, goodOrder, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';
import { expectedOutcome } from './evaluate';

export interface ThreatMap {
  /** Enemy attack strength that could be brought next to each hex next turn. */
  strength: Map<HexId, number>;
  /** Hexes enemy units could move into next turn. */
  reach: Set<HexId>;
  /** Hexes enemy units could walk into next turn by any kind of move, Extended road marches included (which may
   * not enter our zones of control): where an unguarded objective of ours could be taken without a fight. Per enemy
   * unit, and how many enemy units could walk into each hex. */
  walkBy: Map<string, Set<HexId>>;
  walkCount: Map<HexId, number>;
  /** How far (in hexes) each enemy unit could walk: no route of its can matter beyond that. */
  walkRadius: Map<string, number>;
  /** For updating the map after one of our moves: each enemy unit's strike hexes and strength, a fingerprint of
   * the enemy's units, and where ours stood. */
  strikeBy: Map<string, Set<HexId>>;
  att: Map<string, number>;
  enemyKey: string;
  ownAt: Map<string, string>;
}

/** The unit as it will be at the start of its next turn: fresh movement, not stopped. */
export function fresh(u: UnitState): UnitState {
  return { ...u, mpSpent: null, moveMode: null, tacHexes: 0, hexesMoved: 0, crossedMountain: false, stopped: false, autoDs: false };
}

/** The hexes a unit could move into on its next turn and attack from (`strike`), and those it could walk into by any
 * move, an Extended road march included, which cannot attack but can take an empty hex (`walk`). Null: it cannot
 * move or strike. Each kind of move is traced once. */
export function unitReaches(s: GameState, u: UnitState, withWalk = true): { strike: Set<HexId>; walk: Set<HexId> } | null {
  const d = def(u.id);
  if (d.asu || d.cat === 'bh' || d.variable || values(u).move <= 0) return null;
  if (u.frozenUntil && s.turn + 1 < u.frozenUntil) return null;
  const strike = new Set<HexId>();
  const walk = new Set<HexId>();
  if (u.where.kind === 'map') {
    const f = fresh(u);
    const modes: MoveMode[] = withWalk ? allowedModes(s, f).filter((m) => m !== 'truck') : ['normal', 'tactical'];
    reachableInto(s, f, u.where.hex, 'normal', strike);
    reachableInto(s, f, u.where.hex, 'tactical', strike);
    for (const h of strike) walk.add(h);
    for (const m of modes) if (m !== 'normal' && m !== 'tactical') reachableInto(s, f, u.where.hex, m, walk);
  } else if (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop')) {
    try {
      for (const h of entryReach(s, u.id, 'normal').keys()) {
        strike.add(h);
        walk.add(h);
      }
      if (withWalk) for (const h of entryReach(s, u.id, 'extended').keys()) walk.add(h);
    } catch {
      // not enterable now
    }
  } else return null;
  return { strike, walk };
}

/** The hexes a unit could move into and attack from next turn, or with `walk` all it could walk into. */
export function unitReach(s: GameState, u: UnitState, walk = false): Set<HexId> | null {
  const r = unitReaches(s, u, walk);
  return r ? (walk ? r.walk : r.strike) : null;
}

/** A unit's attack strength as a threat: halved out of supply or disrupted, nothing in Full Retreat. */
function threatAtt(u: UnitState): number {
  return values(u).attack * (u.outOfSupply ? 0.5 : 1) * (goodOrder(u) ? 1 : u.status === 'disrupted' ? 0.5 : 0);
}

const placeOf = (u: UnitState) => (u.where.kind === 'map' ? u.where.hex : u.where.kind === 'entry' ? `e:${u.where.area}` : u.where.kind);

/** What the enemy's reach depends on in its own units: where each stands and in what state. */
function enemyKeyOf(s: GameState, side: Side): string {
  let k = `${s.turn}|`;
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === side) continue;
    k += `${u.id}@${placeOf(u)}/${u.status}/${u.stepsLost}/${u.outOfSupply ? 1 : 0}/${u.frozenUntil ?? ''};`;
  }
  return k;
}

function ownPlaces(s: GameState, side: Side): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of Object.values(s.units)) if (sideOf(u) === side) m.set(u.id, `${placeOf(u)}/${u.status}`);
  return m;
}

/** Adds (k = 1) or takes away (k = -1) one enemy unit's part of the totals. */
function account(t: { strength: Map<HexId, number>; walkCount: Map<HexId, number> }, strike: Set<HexId> | undefined, walk: Set<HexId> | undefined, att: number, k: number) {
  if (strike) {
    // Every hex next to where it can stand can be attacked by it.
    const hit = new Set<HexId>();
    for (const h of strike) for (const n of neighbors(h)) hit.add(n);
    for (const h of hit) t.strength.set(h, (t.strength.get(h) ?? 0) + k * att);
  }
  if (walk) for (const h of walk) t.walkCount.set(h, (t.walkCount.get(h) ?? 0) + k);
}

function radiusOf(s: GameState, id: string, walk: Set<HexId>): number {
  const u = s.units[id];
  if (u.where.kind !== 'map') return 99;
  let r = 0;
  for (const h of walk) r = Math.max(r, distance(u.where.hex, h));
  return r;
}

/** Totals from each enemy unit's hexes: from scratch, or from `prev`'s by redoing only the units in `redone`. */
function assemble(base: Omit<ThreatMap, 'strength' | 'reach' | 'walkCount' | 'walkRadius'>, s: GameState, prev?: ThreatMap, redone?: Set<string>): ThreatMap {
  let t: { strength: Map<HexId, number>; walkCount: Map<HexId, number> };
  let walkRadius: Map<string, number>;
  if (prev && redone) {
    t = { strength: new Map(prev.strength), walkCount: new Map(prev.walkCount) };
    walkRadius = new Map(prev.walkRadius);
    for (const id of redone) {
      const a = base.att.get(id) ?? prev.att.get(id) ?? 0;
      account(t, prev.strikeBy.get(id), prev.walkBy.get(id), a, -1);
      account(t, base.strikeBy.get(id), base.walkBy.get(id), a, 1);
      const w = base.walkBy.get(id);
      if (w) walkRadius.set(id, radiusOf(s, id, w));
      else walkRadius.delete(id);
    }
  } else {
    t = { strength: new Map(), walkCount: new Map() };
    walkRadius = new Map();
    for (const [id, strike] of base.strikeBy) account(t, strike, undefined, base.att.get(id)!, 1);
    for (const [id, walk] of base.walkBy) {
      account(t, undefined, walk, 0, 1);
      walkRadius.set(id, radiusOf(s, id, walk));
    }
  }
  const reach = new Set<HexId>();
  for (const strike of base.strikeBy.values()) for (const h of strike) reach.add(h);
  return { ...base, strength: t.strength, reach, walkCount: t.walkCount, walkRadius };
}

/**
 * The threat the enemy of `side` poses to every hex next turn. With `open`, as if none of our units
 * stood in the way: our screens may move off during the turn, and what matters most should not rely on them.
 */
export function threatMap(s0: GameState, side: Side, open = false): ThreatMap {
  const s = open ? { ...s0, units: Object.fromEntries(Object.entries(s0.units).filter(([, u]) => sideOf(u) !== side)) } : s0;
  const strikeBy = new Map<string, Set<HexId>>();
  const walkBy = new Map<string, Set<HexId>>();
  const att = new Map<string, number>();
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === side) continue;
    const a = threatAtt(u);
    if (a <= 0) continue;
    const r = unitReaches(s, u);
    if (!r) continue;
    strikeBy.set(u.id, r.strike);
    att.set(u.id, a);
    walkBy.set(u.id, r.walk);
  }
  return assemble({ strikeBy, walkBy, att, enemyKey: enemyKeyOf(s0, side), ownAt: ownPlaces(s0, side) }, s0);
}

/**
 * The threat map after some of our own units have moved: only the enemy units whose routes pass near
 * where ours left or arrived are traced again (our units bar the way by standing there and by their zones of
 * control). If the enemy's own units have changed, it is drawn afresh.
 */
export function updateThreatMap(prev: ThreatMap, s: GameState, side: Side): ThreatMap {
  if (prev.enemyKey !== enemyKeyOf(s, side)) return threatMap(s, side);
  const now = ownPlaces(s, side);
  const changed = new Set<HexId>();
  const mark = (place: string | undefined) => {
    const hex = place?.split('/')[0];
    if (hex && MAP.hexes[hex]) changed.add(hex);
  };
  for (const [id, p] of now) {
    const was = prev.ownAt.get(id);
    if (was !== p) {
      mark(was);
      mark(p);
    }
  }
  for (const [id, p] of prev.ownAt) if (!now.has(id)) mark(p);
  if (!changed.size) return { ...prev, ownAt: now };
  // Zones of control and bonds reach two hexes from our units. Operational Movement's slow roads reach one more than
  // its radius, for units that move at mechanized rates (vehicles, or infantry that may ride trucks).
  const op = RULES.movement.operationalRadius ?? 0;
  const rings: Set<HexId>[] = [new Set(changed)];
  const all = new Set<HexId>(changed);
  for (let r = 0; r < Math.max(2, op + 1); r++) {
    const next = new Set<HexId>();
    for (const h of rings[r]) for (const n of neighbors(h)) if (!all.has(n)) { all.add(n); next.add(n); }
    rings.push(next);
  }
  const near2 = new Set<HexId>([...rings[0], ...rings[1], ...rings[2]]);
  const touches = (set: Set<HexId> | undefined, region: Set<HexId>) => {
    if (!set) return false;
    for (const h of region) if (set.has(h)) return true;
    return false;
  };
  const strikeBy = new Map(prev.strikeBy);
  const walkBy = new Map(prev.walkBy);
  const redone = new Set<string>();
  for (const id of new Set([...prev.strikeBy.keys(), ...prev.walkBy.keys()])) {
    const u = s.units[id];
    const fast = op > 0 && (def(id).mech || (u.where.kind === 'map' && allowedModes(s, fresh(u)).includes('truck')));
    const region = fast ? all : near2;
    if (!touches(prev.walkBy.get(id), region) && !touches(prev.strikeBy.get(id), region)) continue;
    redone.add(id);
    const r = unitReaches(s, s.units[id]);
    if (!r) {
      strikeBy.delete(id);
      walkBy.delete(id);
      continue;
    }
    strikeBy.set(id, r.strike);
    walkBy.set(id, r.walk);
  }
  return assemble({ strikeBy, walkBy, att: prev.att, enemyKey: prev.enemyKey, ownAt: now }, s, prev, redone);
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
