import type { HexId } from './hex';

export type Side = 'Allied' | 'German';
export type ReplPool = 'German' | 'BR' | 'US';
export type Nation = 'US' | 'BR' | 'CN' | 'GE';
export type Terrain = 'clear' | 'hill' | 'marsh' | 'sea';
export type UnitType =
  | 'inf'
  | 'mech'
  | 'armor'
  | 'recon'
  | 'para'
  | 'commando'
  | 'eng'
  | 'asu';

// ---------------------------------------------------------------- map data

export interface PortInfo {
  capacity: number;
  major?: boolean;
  damagedCapacity?: number;
  restricted?: boolean;
}

export interface HexData {
  terrain: Terrain;
  city?: string;
  town?: string;
  vp?: number;
  port?: PortInfo;
  airfield?: string;
  dropZone?: string;
  sector8?: boolean;
}

export interface HexsideData {
  river?: boolean;
  mountain?: boolean;
  pass?: boolean;
  road?: 'major' | 'minor';
}

export interface EntryArea {
  hexes: HexId[];
  side: 'north' | 'east' | 'south';
  label?: string;
  vp?: number;
}

export interface Beach {
  hex: HexId;
  formation: string;
  unit?: string;
  corps: string;
}

export interface MapData {
  hexes: Record<HexId, HexData>;
  hexsides: Record<string, HexsideData>;
  entryAreas: Record<string, EntryArea>;
  offmapLinks: { from: string; to: string; turns: number; side?: 'GE'; note?: string }[];
  beaches: Record<string, Beach>;
}

// ---------------------------------------------------------------- units

export interface StepValues {
  attack: number;
  defense: number;
  move: number;
}

export interface UnitDef {
  id: string;
  name: string;
  side: Side;
  nation: Nation;
  type: UnitType;
  formation?: string;
  /** Values per remaining step: index 0 = full strength. */
  steps: StepValues[];
  /** Tank rating shown on silhouetted armour counters (armour shift). */
  tankRating?: number;
  /** Outlined counters: do not count for stacking. */
  freeStack?: boolean;
  /** Unit exerts no zone of control. */
  noZoc?: boolean;
  /** Wheeled/tracked unit (rain and marsh effects). */
  vehicle?: boolean;
  /** Artillery support unit: range in hexes. */
  asuRange?: number;
  /** Replacement category used to rebuild this unit. */
  replCategory?: 'inf' | 'armor';
}

export type Where =
  | { kind: 'map'; hex: HexId }
  | { kind: 'reserve' } // Allied floating reserve (offshore)
  | { kind: 'pending'; turn: number; at: string } // future reinforcement
  | { kind: 'entry'; area: string } // available at an off-map entry area
  | { kind: 'transit'; to: string; arrive: number } // off-map movement between entry areas
  | { kind: 'eliminated' }
  | { kind: 'removed'; reason: string }
  | { kind: 'exited'; area: string };

export interface UnitState {
  id: string;
  where: Where;
  stepsLost: number;
  disrupted: boolean;
  /** Movement points spent this movement phase (null = has not moved). */
  mpSpent: number | null;
  strategic: boolean;
  attacked: boolean;
  outOfSupply: boolean;
  /** ASU state: ready to fire or already fired. */
  fired: boolean;
  /** Set-up restriction (e.g. FJ unit frozen until a given turn). */
  frozenUntil?: number;
}

// ---------------------------------------------------------------- state

export type Phase =
  | 'weather'
  | 'initial'
  | 'movement'
  | 'combat'
  | 'recovery'
  | 'supply'
  | 'victory'
  | 'gameOver';

export interface LogEntry {
  turn: number;
  side: Side | null;
  phase: Phase;
  text: string;
  kind?: 'combat' | 'move' | 'info' | 'dice' | 'victory';
}

export interface SupportPool {
  air: string[]; // nations with an air support marker ready (e.g. ['BR','US'])
  naval: string[];
}

export interface PendingAdvance {
  hex: HexId;
  unitIds: string[];
  max: number;
}

export interface CombatReport {
  id: number;
  turn: number;
  attackerSide: Side;
  defenderHex: HexId;
  attackers: string[];
  defenders: string[];
  attack: number;
  defense: number;
  baseColumn: string;
  shifts: { reason: string; shift: number }[];
  finalColumn: string;
  roll: number;
  drm: number;
  result: string;
  notes: string[];
}

export interface GameState {
  scenarioId: string;
  turn: number;
  lastTurn: number;
  phase: Phase;
  activeSide: Side;
  /** Index into the weather track (0 = box A). */
  weather: number;
  supplyPoints: Record<Side, number>;
  support: Record<Side, SupportPool>;
  units: Record<string, UnitState>;
  /** Control of VP hexes and entry areas. */
  control: Record<string, Side>;
  /** Replacement steps available, by pool (German, British/Commonwealth, US). */
  replacements: Record<ReplPool, { inf: number; armor: number; any: number }>;
  pendingAdvance: PendingAdvance | null;
  combats: CombatReport[];
  log: LogEntry[];
  rng: number;
  winner: Side | 'draw' | null;
  victoryNote?: string;
  /** Allied VP from units exited off the north edge (Naples/Benevento). */
  exitVp: number;
  /** Units landed through each port this movement phase (capacity check). */
  landings: Record<HexId, number>;
  seq: number;
}

// ---------------------------------------------------------------- actions

export type MoveMode = 'tactical' | 'strategic';

export type Action =
  | { type: 'move'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'land'; unitId: string; to: HexId }
  | { type: 'enter'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'exitMap'; unitId: string; area: string }
  | { type: 'attack'; target: HexId; attackers: string[]; air?: boolean; naval?: boolean; asus?: string[] }
  | { type: 'advance'; unitIds: string[] }
  | { type: 'replace'; unitId: string }
  | { type: 'readyAsu'; unitId: string }
  | { type: 'endPhase' };
