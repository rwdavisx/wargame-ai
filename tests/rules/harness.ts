// Builds exact positions for rule tests: an empty map at a chosen turn and phase, units placed
// where the test wants them, and the die rolls the test wants (consumed before the seeded dice).
import { MAP } from '../../src/engine/data';
import { applyAction, newGame } from '../../src/engine/game';
import { neighbors, type HexId } from '../../src/engine/hex';
import type { Action, GameState, Phase, Side, UnitState } from '../../src/engine/types';

export interface ScenarioOpts {
  scenario?: 'short' | 'campaign';
  turn?: number;
  side?: Side;
  phase?: Phase;
  /** Weather track box (0 = A). */
  weather?: number;
  seed?: number;
  /** Keep the scenario's own set-up instead of clearing every unit off the map. */
  keepUnits?: boolean;
}

/** A game at `turn`/`phase` with every unit set aside (unless keepUnits), the log emptied. */
export function scenario(o: ScenarioOpts = {}): GameState {
  const s = newGame(o.scenario ?? 'short', o.seed ?? 1);
  if (!o.keepUnits) for (const u of Object.values(s.units)) u.where = { kind: 'removed', reason: 'test' };
  s.turn = o.turn ?? 3;
  s.activeSide = o.side ?? 'German';
  s.phase = o.phase ?? 'movement';
  if (o.weather !== undefined) s.weather = o.weather;
  s.log = [];
  s.forcedRolls = [];
  return s;
}

/** Puts unit `id` on `hex`, fresh for the phase, with any state overrides. */
export function place(s: GameState, id: string, hex: HexId, patch: Partial<UnitState> = {}): UnitState {
  const u = s.units[id];
  if (!u) throw new Error(`no unit ${id}`);
  Object.assign(u, {
    where: { kind: 'map', hex }, stepsLost: 0, status: 'good', halfEff: false, repl: false, truck: false, outOfSupply: false,
    isolated: false, fired: false, mpSpent: null, moveMode: null, tacHexes: 0, stopped: false, crossedMountain: false,
    hexesMoved: 0, attacked: false, retreatedThisPhase: false, autoDs: false, frozenUntil: undefined,
  } satisfies Partial<UnitState>, patch);
  if (MAP.hexes[hex]?.vp || MAP.hexes[hex]?.city || MAP.hexes[hex]?.port) s.control[hex] = id.startsWith('GE') ? 'German' : 'Allied';
  return u;
}

/** Queues die rolls (in order) for the next rolls the engine makes. */
export function dice(s: GameState, ...rolls: number[]): void {
  s.forcedRolls = [...(s.forcedRolls ?? []), ...rolls];
}

/** Applies an action (throws IllegalAction when the rules forbid it). */
export const act = (s: GameState, a: Action): void => applyAction(s, a);

/** True if the action is refused by the rules. */
export function refused(s: GameState, a: Action): boolean {
  const c = structuredClone(s);
  try {
    applyAction(c, a);
    return false;
  } catch {
    return true;
  }
}

/** A land hex matching `pred` (deterministic: lowest id first). */
export function findHex(pred: (h: HexId, d: (typeof MAP.hexes)[string]) => boolean): HexId {
  const h = Object.keys(MAP.hexes).sort().find((k) => pred(k, MAP.hexes[k]));
  if (!h) throw new Error('no hex matches');
  return h;
}

/** A clear, featureless hex whose neighbours are all clear land too (no rivers, roads or ridges between). */
export function openGround(): HexId {
  return findHex((h, d) => d.terrain === 'clear' && !d.city && !d.town && !d.vp && !d.port && neighbors(h).length === 6 &&
    neighbors(h).every((n) => {
      const nd = MAP.hexes[n];
      const side = MAP.hexsides[[h, n].sort().join('-')] ?? {};
      return nd && nd.terrain === 'clear' && !nd.city && !nd.town && !side.river && !side.road && !side.mountain && !side.pass;
    }));
}

/** Text of the log since the scenario was built (for checking what the engine reported). */
export const logText = (s: GameState) => s.log.map((l) => l.text).join('\n');

/** A new game whose first die rolls (the Turn 1 invasion rolls, in beach order) are `rolls`. */
export function invasionGame(rolls: number[], scenarioId: 'short' | 'campaign' = 'short', seed = 1): GameState {
  return newGame(scenarioId, seed, {}, rolls);
}

/** `scenario` with no air or naval support markers ready (so neither side commits support by itself) and every
 * port, city, VP hex and Entry Area back under German control, as before the landings. */
export function quiet(o: ScenarioOpts = {}): GameState {
  const s = scenario(o);
  s.support.ready = [];
  for (const k of Object.keys(s.control)) s.control[k] = 'German';
  return s;
}
