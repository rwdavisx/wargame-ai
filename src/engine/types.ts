import type { HexId } from './hex';

export type Side = 'Allied' | 'German';
export type Nation = 'US' | 'BR' | 'CN' | 'GE';
export type Terrain = 'clear' | 'hill' | 'marsh' | 'sea';
export type ReplPool = 'German' | 'BR' | 'US';
export type ReplType = 'inf' | 'special' | 'armor';
export type Category =
  | 'infantry' | 'garrison' | 'motorized' | 'pg' | 'engineer' | 'bh' | 'airborne' | 'glider'
  | 'ranger' | 'recon' | 'divAsu' | 'corpsAsu' | 'nebelwerfer' | 'tank';

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
  cat: Category;
  formation: string;
  /** Formation used for the Main Assault Force; null for independent units. */
  division: string | null;
  /** Values per step, index 0 = full strength. */
  steps: StepValues[];
  /** Stacking points (the boxed number on the counter). */
  sp: number;
  tankRating?: number;
  /** Tank destroyers: rating is one lower when attacking. */
  tankDestroyer?: boolean;
  /** Silhouetted tank counter (one per hex stacks free). */
  silhouette?: boolean;
  elite?: boolean;
  lowQuality?: boolean;
  mech: boolean;
  vehicle: boolean;
  infantryType: boolean;
  maxAdv: number;
  repl: ReplType | null;
  asu?: 'division' | 'corps';
  asuRange?: number;
  variable?: boolean;
  /** Defense counts only when alone in the hex (ASUs). */
  parenthesized?: boolean;
  /** Remnant pool or unit id used when this 3-step unit loses its second step. */
  remnant?: string;
  isRemnant?: boolean;
  army8?: boolean;
}

export type Where =
  | { kind: 'map'; hex: HexId }
  | { kind: 'reserve' } // Allied Floating Reserve box
  | { kind: 'landing'; beach: string } // Turn 1 assault landing boxes
  | { kind: 'followUp'; corps: string } // Turn 1 follow-up wave
  | { kind: 'pending'; turn: number; at: string }
  | { kind: 'entry'; area: string } // off-map entry area (N1, S2, ...), 'airdrop' or 'hex:XXXX'
  | { kind: 'eliminated'; permanent?: boolean }
  | { kind: 'remnantPool' }
  | { kind: 'remnantHeld' } // 3-step unit represented by a remnant on the map
  | { kind: 'removed'; reason: string };

export type Status = 'good' | 'disrupted' | 'fullRetreat';
export type MoveMode = 'normal' | 'extended' | 'tactical' | 'truck';

export interface UnitState {
  id: string;
  where: Where;
  stepsLost: number;
  status: Status;
  halfEff: boolean;
  repl: boolean;
  truck: boolean;
  outOfSupply: boolean;
  isolated: boolean;
  isolatedSince?: number;
  fired: boolean;
  frozenUntil?: number;
  /** Movement this phase. */
  mpSpent: number | null;
  moveMode: MoveMode | null;
  tacHexes: number;
  stopped: boolean;
  crossedMountain: boolean;
  /** Hexes moved this phase (ASUs moving more than one hex become disrupted). */
  hexesMoved: number;
  attacked: boolean;
  retreatedThisPhase: boolean;
  autoDs: boolean;
  /** For remnants on the map: the unit it stands for. */
  represents?: string;
  /** Turn an airborne unit dropped (it is in supply that turn). */
  droppedTurn?: number;
}

// ---------------------------------------------------------------- state

export type Phase = 'invasion' | 'weather' | 'initial' | 'movement' | 'combat' | 'recovery' | 'supply' | 'victory' | 'gameOver';

export interface LogEntry {
  turn: number;
  side: Side | null;
  phase: Phase;
  text: string;
  kind?: 'combat' | 'move' | 'info' | 'dice' | 'victory';
}

export interface SupportMarkers {
  /** Ready support markers: 'US-air', 'US-naval', 'BR-air', 'BR-naval', 'GE-air'. */
  ready: string[];
  /** Valiant & Warspite uses left (from turn 8). */
  battleships: number;
}

export interface PendingDefense {
  combatId: number;
  hex: HexId;
  defenderSide: Side;
  attackerHexes: HexId[];
  attackers: string[];
  retreat: number;
  advance: number;
  yellow: boolean;
  /** Retreat would eliminate the stack: a failed stand costs a step and may be retried. */
  desperate: boolean;
  supportOptions: string[];
}

export interface PendingAdvance {
  combatId: number;
  vacated: HexId;
  /** Hexes the attackers attacked from (for river/mountain first-hex rules). */
  from: Record<string, HexId>;
  maxByUnit: Record<string, number>;
  limited: boolean;
}

export interface CombatReport {
  id: number;
  turn: number;
  attackerSide: Side;
  defenderHex: HexId;
  attackers: string[];
  maf: string;
  defenders: string[];
  attack: number;
  defense: number;
  baseColumn: string;
  shifts: { reason: string; shift: number }[];
  finalColumn: string;
  roll: number;
  drm: number;
  result: string;
  dd?: { roll: number; drm: number; column: string; result: string };
  notes: string[];
}

export interface GameState {
  scenarioId: string;
  turn: number;
  lastTurn: number;
  phase: Phase;
  activeSide: Side;
  weather: number;
  supplyPoints: Record<Side, number>;
  support: SupportMarkers;
  units: Record<string, UnitState>;
  /** Control of ports, cities and VP hexes (by hex) and of entry areas (by name). */
  control: Record<string, Side>;
  cityBattle: Record<HexId, number>;
  replacements: Record<ReplPool, Record<ReplType, number>>;
  /** Naval transport bookkeeping for the current Allied movement phase. */
  landingPoints: number;
  portUse: Record<HexId, number>;
  /** Ports Allied-controlled at the start of the Allied movement phase. */
  portsAtStart?: HexId[];
  trucksUsed: number;
  pendingDefense: PendingDefense | null;
  pendingAdvance: PendingAdvance | null;
  /** Auto DS advances queued for the end of the combat phase. */
  autoDsQueue: PendingAdvance[];
  combats: CombatReport[];
  log: LogEntry[];
  rng: number;
  winner: Side | 'draw' | null;
  victoryNote?: string;
  northVp: Record<string, boolean>;
  abandoned8th: boolean;
  seq: number;
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'move'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'land'; unitId: string; to: HexId }
  | { type: 'enter'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'changeArea'; unitId: string; area: string }
  | { type: 'fullRetreat'; unitId: string }
  | { type: 'attack'; target: HexId; attackers: string[]; maf?: string; air?: boolean; naval?: boolean; battleships?: boolean; asus?: string[] }
  | { type: 'autoDs'; target: HexId; attackers: string[] }
  | { type: 'defend'; choice: 'retreat' | 'dd'; support?: string | null; battleships?: boolean; prefer?: 'hold' | 'delay' }
  | { type: 'advance'; unitIds: string[]; to?: HexId }
  | { type: 'disengage'; hex: HexId }
  | { type: 'replace'; unitId: string; to?: HexId }
  | { type: 'readyAsu'; unitId: string }
  | { type: 'abandon8th' }
  | { type: 'endPhase' };
