// The game the engine is playing: its map, tables and counters. The engine is one system for several games of
// the series; `loadGameData` swaps in another game's data (the game registry, src/games, does this), and every
// module reads these bindings at the time it needs them.
import type { GameData } from '../games/types';
import { SALERNO_DATA } from '../games/salerno43/data';
import type { Category, MapData, StepValues, UnitDef } from './types';

type Valued<T> = T | { value: T };
const val = <T,>(v: Valued<T>): T =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object) ? (v as { value: T }).value : (v as T);

export interface WeatherBox {
  box: string;
  name: string;
  air: string[];
  naval: string[];
  alliedSupply: number;
  alliedPortBonus?: boolean;
  germanSupply: number;
  clear?: boolean;
  rain?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildRules(r: any) {
  return {
  turnOrder: r.turnOrder as ['German', 'Allied'],
  stackingLimit: val<number>(r.stacking.limit ?? r.stacking),
  movement: {
    terrain: r.movement.terrain as Record<string, { inf: number; mech: number }>,
    majorRoad: r.movement.majorRoad as { inf: number; mech: number },
    minorRoad: r.movement.minorRoad as { inf: number; mech: number },
    alliedMechRoadIn8thSector: r.movement.alliedMechRoadIn8thSector as number,
    pass: r.movement.pass as { inf: number; mech: number },
    riverInf: r.movement.riverInf as number,
    exitEzoc: r.movement.exitEzoc as number,
    extendedBonus: 3,
    tacticalHexes: 2,
  },
  combat: {
    columns: r.combat.columns as string[],
    ratios: r.combat.ratios as number[],
    crt: r.combat.crt as Record<string, string[]>,
    results: r.combat.results as Record<string, string>,
    strengthCap: 20,
    autoDsRatio: 10,
    nonMechAdvanceCap: r.combat.nonMechAdvanceCap as number,
    oosAdvanceCap: r.combat.oosAdvanceCap as number,
    halfEffAdvanceCap: r.combat.halfEffAdvanceCap as number,
    navalRange: 2,
  },
  dd: {
    table: { Clear: r.determinedDefense.Clear, Other: r.determinedDefense.Other, City: r.determinedDefense.City } as Record<string, string[]>,
    drms: r.determinedDefense.drms as Record<string, number>,
  },
  isolation: {
    lossOn: r.isolation.lossOn as number[],
    cityOrCorpsDrm: r.isolation.cityOrCorpsDrm as number,
    alliedClearWeatherDrm: r.isolation.alliedClearWeatherDrm as number,
  },
  supply: { overlandHexes: val<number>(r.supply.overlandHexes), cap: 19, salernoPortOpenRadius: r.supply.salernoPortOpenRadius as number },
  rally: r.rally as { success: number[]; bhOrCityDrm: number; eliteDrm: number; lowQualityDrm: number },
  invasion: r.invasion as Record<'Rangers' | 'Uncle' | 'Other', string[]>,
  airdrop: r.airdrop as { table: { max: number; result: string }[]; cityMarshMountainDrm: number; ezocDrm: number },
  disengagement: r.disengagement as { table: Record<string, string>; mechDrm: number },
  variableStrength: r.variableStrength as number[],
  landingPoints: r.landingPoints as { costBySp: number[]; perTurn: number },
  weather: r.weather as { track: WeatherBox[]; advanceByRoll: Record<string, number>; wraps: boolean },
  benchmarks: Object.fromEntries(Object.entries(r.victory.benchmarks).map(([k, v]) => [Number(k), v as number])) as Record<number, number>,
  automaticMargin: 5,
  automaticAlliedVp: 20,
  replacementSchedule: Object.fromEntries(Object.entries(r.replacements.schedule).map(([k, v]) => [Number(k), v])) as Record<
    number,
    Partial<Record<'German' | 'BR' | 'US', Partial<Record<'inf' | 'armor' | 'special', number>>>>
  >,
  turnNotes: Object.fromEntries(Object.entries(r.turnNotes).map(([k, v]) => [Number(k), v as string])) as Record<number, string>,
  };
}
export type Rules = ReturnType<typeof buildRules>;

// ------------------------------------------------------------------ units

// Units that double on defense in hills, marsh and cities and may cross mountain hexsides.
const INFANTRY_TYPES = new Set(['infantry', 'airborne', 'glider', 'engineer', 'ranger', 'pg', 'motorized']);

export interface UnitSetup {
  start?: { hex?: string; beach?: string; followUp?: string; remnant?: boolean };
  /** `reduced`: the unit enters with its first step already lost (shown on its reduced side on the set-up card). */
  arrive?: { turn: number; at: string; reduced?: boolean };
  frozenUntil?: number;
}

/** `back` in oob.json: the counter's reduced side as "a-d-m", or "none" for a one-step unit.
 * `backSp` gives the stacking points printed on the back when they differ from the front. */
function parseBack(back: unknown, backSp: unknown): StepValues | 'none' | null {
  if (back === 'none') return 'none';
  if (typeof back !== 'string') return null;
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(back.trim());
  if (!m) throw new Error(`Bad counter back "${back}" in oob.json (use "a-d-m" or "none").`);
  const v: StepValues = { attack: Number(m[1]), defense: Number(m[2]), move: Number(m[3]) };
  if (typeof backSp === 'number') v.sp = backSp;
  return v;
}

/** Values of the Remnant that stands in for a 3-step unit's last step. */
function remnantValues(o: any, remnant: string, fallback: StepValues): StepValues {
  const pool: Record<string, string> = { US: 'US-REM-A', CW: 'BR-REM-A' };
  const r = (o.units as { id: string; a: number; d: number; m: number }[]).find((x) => x.id === (pool[remnant] ?? remnant));
  return r ? { attack: r.a, defense: r.d, move: r.m, sp: 1 } : fallback;
}

function buildUnits(o: any, notes: GameData['units']) {
  const INDEPENDENT = new Set(notes.independentFormations);
  const TANK_DESTROYERS = new Set(notes.tankDestroyers);
  const NO_DIVISION = new Set(notes.noDivision ?? []);
  const defs: Record<string, UnitDef> = {};
  const setup: Record<string, UnitSetup> = {};
  for (const u of o.units) {
    const cat = o.categories[u.cat] as { mech: boolean; maxAdv: number; repl: string | null; asu?: string; variable?: boolean };
    const tank = u.cat === 'tank';
    const silhouette = tank && u.sp <= 1;
    const isAsu = !!cat.asu;
    const steps: StepValues[] = [{ attack: u.a, defense: u.d, move: u.m }];
    const army8 = typeof u.arrive?.at === 'string' && /^S[123]$/.test(u.arrive.at) && u.side === 'Allied';
    const back = parseBack(u.back, u.backSp);
    if (back === 'none') {
      // A one-step counter.
    } else if (back) {
      // The reduced side of the counter, then the Remnant for 3-step units (the 3 stacking-point
      // regiments and brigades; a "(-)" unit's back is its last step).
      steps.push(back);
      if (u.remnant && u.sp >= 3 && !army8) steps.push(remnantValues(o, u.remnant, back));
    } else {
      // Counter back not entered yet: a reduced step is the full unit less one battalion (-2/-2).
      const nSteps = isAsu || u.cat === 'bh' || u.cat === 'garrison' || silhouette || u.start?.remnant ? 1 : Math.max(1, Math.min(3, u.sp));
      for (let i = 1; i < nSteps; i++) {
        const prev = steps[i - 1];
        steps.push({ attack: Math.max(1, prev.attack - 2), defense: Math.max(1, prev.defense - 2), move: u.m });
      }
    }
    defs[u.id] = {
      id: u.id,
      name: u.name,
      side: u.side,
      nation: u.nation,
      cat: u.cat as Category,
      formation: u.formation,
      division: INDEPENDENT.has(u.formation) || NO_DIVISION.has(u.id) || u.cat === 'bh' ? null : u.formation,
      steps,
      sp: u.sp,
      tankRating: u.tr,
      tankDestroyer: TANK_DESTROYERS.has(u.id),
      silhouette,
      elite: !!u.elite,
      lowQuality: !!u.lowQuality,
      mech: cat.mech,
      vehicle: tank || u.cat === 'recon' || isAsu,
      infantryType: INFANTRY_TYPES.has(u.cat),
      maxAdv: cat.maxAdv,
      repl: (cat.repl as UnitDef['repl']) ?? null,
      asu: isAsu ? (u.cat === 'nebelwerfer' ? 'corps' : (cat.asu as 'division' | 'corps')) : undefined,
      asuRange: u.range,
      variable: !!cat.variable,
      parenthesized: isAsu,
      remnant: army8 ? undefined : u.remnant,
      isRemnant: !!u.start?.remnant,
      army8,
    };
    setup[u.id] = { start: u.start, arrive: u.arrive, frozenUntil: u.frozenUntil };
  }
  return { defs, setup };
}

export let GAME_ID = '';
export let MAP: MapData;
export let RULES: Rules;
export let UNIT_DEFS: Record<string, UnitDef>;
export let UNIT_SETUP: Record<string, UnitSetup>;
export let SCENARIOS: Record<string, { name: string; lastTurn: number; description: string }>;
export let STARTING_SP: { German: number; Allied: number };
export let WITHDRAWAL: { turn: number; side: 'German'; defense: number; prefer: string };
/** S1.4 tournament start: Allied assault units already ashore, and German units gone before play begins. */
export let OPTIONAL_START: { hexes: Record<string, string>; eliminated: string[]; alliedControl: string[] };
export let BATTLESHIPS_TURN: number;

const listeners = new Set<() => void>();
/** Run `fn` whenever another game's data is loaded (to drop caches built from the old map or counters). */
export function onGameData(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Make `id`'s map, tables and counters the ones the engine plays. */
export function loadGameData(id: string, d: GameData): void {
  const o = d.oob as any;
  const built = buildUnits(o, d.units);
  GAME_ID = id;
  MAP = d.map as MapData;
  RULES = buildRules(d.rules);
  UNIT_DEFS = built.defs;
  UNIT_SETUP = built.setup;
  SCENARIOS = o.scenarios;
  STARTING_SP = o.startingSupplyPoints;
  WITHDRAWAL = o.withdrawal;
  OPTIONAL_START = o.optionalStart;
  BATTLESHIPS_TURN = o.support?.battleshipsTurn ?? Infinity;
  for (const f of [...listeners]) f();
}

loadGameData('salerno43', SALERNO_DATA);
