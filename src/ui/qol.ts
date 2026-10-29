// Quality-of-life helpers for the play screen: odds on every target, units still able to act,
// movement left, stacking readouts and the map modes (see mapModes.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RULES } from '../engine/data';
import { columnLabel, computeOdds, validateAttackers } from '../engine/combat';
import type { HexId } from '../engine/hex';
import { cannotMove, movementAllowance } from '../engine/movement';
import type { GameState, Side, UnitState } from '../engine/types';
import { def, nationGroup, sideOf, stackPoints, unitsAt } from '../engine/units';
import { eligibleAttackers } from './play';
import { MAP_MODES, modeLayer, type MapMode, type ModeLayer } from './mapModes';
import type { Settings } from './storage';

// ------------------------------------------------------------------ odds on targets

export type OddsTone = 'auto' | 'good' | 'fair' | 'poor';

export interface OddsCue {
  label: string;
  tone: OddsTone;
  title: string;
}

/** Own units that could attack `hex` right now, each checked on its own (river, mountain, replacement rules). */
function attackersFor(s: GameState, hex: HexId): string[] {
  let ids = eligibleAttackers(s, hex);
  // On the invasion turn only Commandos with an advance left may attack (Salerno).
  if (s.phase === 'invasion') ids = ids.filter((id) => def(id).formation === 'Commando Bde' && s.units[id].tacHexes === 1 && !s.units[id].stopped);
  return ids.filter((id) => !validateAttackers(s, hex, [id]));
}

/** US and Commonwealth units, and 5th and 8th Army units, attack separately: the groups that may combine. */
function attackGroups(ids: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const k = `${nationGroup(id) === 'US' ? 'US' : 'CW'}|${def(id).army8 ? 8 : 5}`;
    groups.set(k, [...(groups.get(k) ?? []), id]);
  }
  return [...groups.values()];
}

/** The best odds every eligible attacker together can get on `hex` (before air, naval and artillery support). */
export function bestOdds(s: GameState, hex: HexId): { cue: OddsCue | null; attackers: string[] } {
  const ids = attackersFor(s, hex);
  if (!ids.length) return { cue: null, attackers: [] };
  const overrun = s.phase === 'movement';
  let best: ReturnType<typeof computeOdds> | null = null;
  let bestIds: string[] = [];
  for (const group of attackGroups(ids)) {
    const o = computeOdds(s, { target: hex, attackers: group }, { autoDs: overrun });
    if (!o.ok) continue;
    const score = (o.autoDs ? 100 : 0) + o.finalIndex;
    const prev = best ? (best.autoDs ? 100 : 0) + best.finalIndex : -1;
    if (score > prev) {
      best = o;
      bestIds = group;
    }
  }
  const n = bestIds.length;
  const units = `${n} unit${n === 1 ? '' : 's'}`;
  if (overrun) {
    // In the movement phase only an Auto DS (overrun) is possible: mark just the hexes where it is.
    return best?.autoDs ? { cue: { label: 'OVERRUN', tone: 'auto', title: `Overrun possible: Auto DS with ${units} (${best.attack} vs ${best.defense}).` }, attackers: ids } : { cue: null, attackers: ids };
  }
  if (!best) return { cue: { label: '<1-3', tone: 'poor', title: 'Odds below 1-3: not enough strength next to this hex.' }, attackers: ids };
  // A variable-strength defender (coastal garrison) is rolled at resolution: mark the odds as uncertain.
  const label = best.autoDs ? 'AUTO DS' : `${columnLabel(best.finalIndex)}${best.defenseNote ? '?' : ''}`;
  const tone: OddsTone = best.autoDs ? 'auto' : best.finalIndex >= 4 ? 'good' : best.finalIndex >= 3 ? 'fair' : 'poor';
  const shifts = best.shifts.length ? `; ${best.shifts.map((x) => `${x.reason} ${x.shift > 0 ? '+' : ''}${x.shift}`).join(', ')}` : '';
  return {
    cue: {
      label, tone,
      title: `Best odds with ${units}: ${best.attack} vs ${best.defense}${best.defenseNote ? ` (defense ${best.defenseNote}, rolled when attacked)` : ''}${shifts}.` +
        (s.phase === 'combat' ? ' Air, naval and artillery support can add more.' : ''),
    },
    attackers: ids,
  };
}

// ------------------------------------------------------------------ movement and stacking

/** What is left of a unit's move this phase ("2 MP", "1 HEX"), for units that have started moving but not finished. */
export function moveLeft(s: GameState, u: UnitState): string | null {
  if (s.phase !== 'movement' && s.phase !== 'invasion') return null;
  if (u.where.kind !== 'map' || sideOf(u) !== s.activeSide || u.stopped || cannotMove(s, u)) return null;
  if (u.mpSpent === null && u.moveMode === null) return null;
  if (u.moveMode === 'tactical' || s.phase === 'invasion') {
    const left = RULES.movement.tacticalHexes - u.tacHexes;
    return left > 0 ? `${left} HEX` : null;
  }
  const left = movementAllowance(s, u, u.moveMode ?? 'normal') - (u.mpSpent ?? 0);
  return left > 0 ? `${+left.toFixed(1)} MP` : null;
}

/** Stacking points in `hex` (with `adding` moved in) against the limit, e.g. "5/6 SP". */
export function stackText(s: GameState, hex: HexId, adding: string[] = []): string {
  const ids = new Set(unitsAt(s, hex).filter((u) => !adding.length || sideOf(u) === sideOf(s.units[adding[0]])).map((u) => u.id));
  for (const id of adding) ids.add(id);
  return `${stackPoints(ids, s)}/${RULES.stackingLimit} SP`;
}

/** Plain-language flags for a unit, for tooltips. */
export function unitFlags(s: GameState, u: UnitState): string[] {
  const f: string[] = [];
  if (u.status === 'disrupted') f.push('disrupted');
  if (u.status === 'fullRetreat') f.push('Full Retreat');
  if (u.halfEff) f.push('½ Eff');
  if (u.isolated) f.push('isolated');
  else if (u.outOfSupply) f.push('out of supply');
  if (u.repl) f.push('replacement');
  if (u.truck) f.push('on trucks');
  if (def(u.id).asu) f.push(u.fired ? 'fired' : 'ready to fire');
  if (u.attacked && sideOf(u) === s.activeSide && s.phase === 'combat') f.push('has attacked');
  if (u.frozenUntil && s.turn < u.frozenUntil) f.push(`frozen until day ${u.frozenUntil}`);
  const left = moveLeft(s, u);
  if (left) f.push(`${left} left`);
  return f;
}

// ------------------------------------------------------------------ map plumbing

export interface QolMapProps {
  /** Show the ready / can-attack cues, odds and movement left. */
  cues: boolean;
  /** Hexes holding units that can still act, and what they can do. */
  ready: Map<HexId, 'move' | 'attack'>;
  odds: Map<HexId, OddsCue>;
  moveLeft: Map<string, string>;
  /** The selected unit's formation: other units of it are ringed. */
  formation: string | null;
  formationSide: Side | null;
  mode: MapMode;
  setMode: (m: MapMode) => void;
  /** The active map mode's shading, labels and legend. */
  layer: ModeLayer | null;
  toggleCues: () => void;
  viewer: Side;
  /** Briefly ring this hex (after jumping to it from the recap). */
  pulse: { hex: HexId; n: number } | null;
}

interface QolInput {
  game: GameState;
  humanTurn: boolean;
  humanSides: Side[];
  settings: Settings;
  setSettings: (s: Settings) => void;
  /** Unmoved units with somewhere to go (the Next unit list). */
  readyUnits: UnitState[];
  /** Hexes highlighted as attack targets. */
  targets: HexId[];
  selected: UnitState | null;
}

/** Everything the map needs for the cues and the map mode, memoised so panning never recomputes it. */
export function useQol({ game, humanTurn, humanSides, settings, setSettings, readyUnits, targets, selected }: QolInput): { map: QolMapProps; pulse: (h: HexId) => void } {
  const cues = settings.showCues !== false;
  const mode: MapMode = MAP_MODES.some((m) => m.key === settings.mapMode) ? settings.mapMode as MapMode : 'normal';
  // The side whose view the map modes take: the human's side (or the side to move in hot-seat games).
  const viewer: Side = humanSides.length === 1 ? humanSides[0] : game.activeSide;

  const targetsKey = targets.join(',');
  const attack = useMemo(() => {
    const odds = new Map<HexId, OddsCue>();
    const attackers = new Set<string>();
    if (!humanTurn || !cues || game.pendingAdvance || game.pendingDefense || game.breakthrough || game.retreatQueue?.length) return { odds, attackers };
    if (!['combat', 'movement', 'invasion'].includes(game.phase)) return { odds, attackers };
    for (const h of targets) {
      const r = bestOdds(game, h);
      if (r.cue) odds.set(h, r.cue);
      // In the movement phase the "can attack" cue would only clutter the ready-to-move cue.
      if (game.phase !== 'movement') for (const id of r.attackers) attackers.add(id);
    }
    return { odds, attackers };
  }, [game, targetsKey, humanTurn, cues]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = useMemo(() => {
    const m = new Map<HexId, 'move' | 'attack'>();
    if (!humanTurn || !cues) return m;
    for (const u of readyUnits) if (u.where.kind === 'map') m.set(u.where.hex, 'move');
    for (const id of attack.attackers) {
      const u = game.units[id];
      if (u.where.kind === 'map' && !m.has(u.where.hex)) m.set(u.where.hex, 'attack');
    }
    return m;
  }, [readyUnits, attack, humanTurn, cues, game.units]);

  const left = useMemo(() => {
    const m = new Map<string, string>();
    if (!humanTurn || !cues) return m;
    for (const u of Object.values(game.units)) {
      const l = moveLeft(game, u);
      if (l) m.set(u.id, l);
    }
    return m;
  }, [game, humanTurn, cues]);

  // Recomputed only when the game or the mode changes, never while panning.
  const layer = useMemo(() => modeLayer(game, mode, viewer), [game, mode, viewer]);

  const settingsRef = useRef({ settings, setSettings });
  settingsRef.current = { settings, setSettings };
  const setMode = useCallback((m: MapMode) => {
    const { settings: st, setSettings: set } = settingsRef.current;
    set({ ...st, mapMode: m });
  }, []);
  const toggleCues = useCallback(() => {
    const { settings: s, setSettings: set } = settingsRef.current;
    set({ ...s, showCues: s.showCues === false });
  }, []);

  // M cycles through the map modes, Shift+M backwards (no other shortcut uses M).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'm' && e.key !== 'M')) return;
      const st = settingsRef.current.settings;
      const i = Math.max(0, MAP_MODES.findIndex((m) => m.key === st.mapMode));
      const n = MAP_MODES.length;
      setMode(MAP_MODES[(i + (e.shiftKey ? n - 1 : 1)) % n].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode]);

  const [pulse, setPulse] = useState<{ hex: HexId; n: number } | null>(null);
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(null), 2400);
    return () => clearTimeout(t);
  }, [pulse]);
  const doPulse = useCallback((hex: HexId) => setPulse((p) => ({ hex, n: (p?.n ?? 0) + 1 })), []);

  const formation = selected && selected.where.kind === 'map' && def(selected.id).division ? def(selected.id).formation : null;
  const map = useMemo<QolMapProps>(() => ({
    cues, ready, odds: attack.odds, moveLeft: left, formation, formationSide: selected ? sideOf(selected) : null,
    mode, setMode, layer, toggleCues, viewer, pulse,
  }), [cues, ready, attack.odds, left, formation, selected, mode, setMode, layer, toggleCues, viewer, pulse]);
  return { map, pulse: doPulse };
}
