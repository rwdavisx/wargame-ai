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
  /** Stacking points printed on this side of the counter, when it differs from the front. */
  sp?: number;
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
  | { kind: 'atSea'; port: HexId; since: number } // 2-turn naval transfer to a small port
  | { kind: 'entry'; area: string } // off-map entry area (N1, S2, ...), 'airdrop' or 'hex:XXXX'
  | { kind: 'eliminated'; permanent?: boolean }
  | { kind: 'remnantPool' }
  | { kind: 'remnantHeld' } // 3-step unit represented by a remnant on the map
  | { kind: 'removed'; reason: string };

export type Status = 'good' | 'disrupted' | 'fullRetreat';
export type MoveMode = 'normal' | 'extended' | 'tactical' | 'truck' | 'truckExtended';

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
  /** Turn the unit came ashore by naval transport (ASUs may then support only if they stay put). */
  landedTurn?: number;
  /** Optional recon rule used this combat phase: no Determined Defense. */
  reconSaved?: boolean;
  /** Turn an airborne unit dropped (it is in supply that turn). */
  droppedTurn?: number;
}

// ---------------------------------------------------------------- state

export type Phase = 'invasion' | 'weather' | 'initial' | 'movement' | 'combat' | 'recovery' | 'supply' | 'victory' | 'gameOver';

export type LogKind =
  | 'phase' | 'move' | 'combat' | 'loss' | 'retreat' | 'supply' | 'reinforcement' | 'landing' | 'airdrop' | 'victory' | 'weather' | 'dice' | 'info';

export interface LogEntry {
  turn: number;
  /** The side whose turn it is (null in the weather and victory phases). */
  side: Side | null;
  phase: Phase;
  /** One or two plain-English sentences. */
  text: string;
  kind?: LogKind;
  /** Whose action or loss this is, when it is not the side whose turn it is. */
  actor?: Side;
  /** The hex the entry is about (the UI can jump there). */
  hex?: HexId;
  /** A short technical line: strengths, column shifts, die rolls and table results. */
  detail?: string;
  /** Combat results, captures, eliminations and victory: shown prominently. */
  important?: boolean;
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
  /** The attack earned two or more hexes: one stack may form a Breakthrough Group. */
  btAllowed?: boolean;
  /** Some unit has already advanced (a Breakthrough Group must go first). */
  started?: boolean;
}

export interface Breakthrough {
  /** The attack that earned the advance. */
  combatId: number;
  vacated: HexId;
  units: string[];
  hex: HexId;
  /** Hexes of the advance allowance left. */
  left: number;
  /** The group is no longer in its starting position (no "changing direction" cost due). */
  committed: boolean;
  /** Entered a hill by road: the next hex must also be by road or the group stops. */
  hillRoad: boolean;
  /** A breakthrough combat awaiting the defender's decision. */
  pendingCombat: number | null;
  /** After a successful breakthrough combat: the vacated hex may be entered for free. */
  freeHex: HexId | null;
  /** DR4/DS: the group may keep going after the free advance. */
  mayContinue: boolean;
  /** The original advance for the units outside the group. */
  rest: PendingAdvance | null;
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
  breakthrough?: boolean;
  phase?: Phase;
  notes: string[];
}

/** Optional rules (25.2, 25.3). */
export interface GameOptions {
  recon?: boolean;
  limitedPortSupply?: boolean;
  /** 25.1 Disengagement (optional rule; on unless switched off, as in games saved before it was optional). */
  disengagement?: boolean;
  /** Sides whose player picks retreat destinations (human players). */
  /** S1.4 tournament start: skip the invasion; the Allies start ashore and play begins with the German player turn. */
  optionalStart?: boolean;
  chooseRetreats?: Side[];
  /** When each side commits its air support to defense: automatically, whenever possible, or never. */
  defensiveAir?: Partial<Record<Side, 'auto' | 'always' | 'never'>>;
}

export interface RetreatChoice {
  side: Side;
  units: string[];
  from: HexId;
  distance: number;
  /** Index of the option applied by default. */
  current: number;
  options: { end: HexId; path: HexId[]; intoArea?: string; halfEff: string[] }[];
  prevHalfEff: Record<string, boolean>;
  prevControl: Record<HexId, Side | null>;
}

export interface GameState {
  scenarioId: string;
  options?: GameOptions;
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
  /** Each port or beachhead either ships units out or receives them in a turn, not both. */
  portMode?: Record<HexId, 'in' | 'out'>;
  /** Landing points used this turn for port/beachhead to port/beachhead moves (max 3). */
  navalLp?: number;
  /** Ports Allied-controlled at the start of the Allied movement phase. */
  portsAtStart?: HexId[];
  trucksUsed: number;
  pendingDefense: PendingDefense | null;
  pendingAdvance: PendingAdvance | null;
  breakthrough?: Breakthrough | null;
  /** Paths units took during the last action (for animation; not part of the rules). */
  trails?: Record<string, HexId[]>;
  /** Retreats whose destination the owning player still has to confirm. */
  retreatQueue?: RetreatChoice[];
  /** Auto DS advances queued for the end of the combat phase. */
  autoDsQueue: PendingAdvance[];
  combats: CombatReport[];
  log: LogEntry[];
  rng: number;
  /** Test hook: die rolls to use before the seeded generator (never set in play). */
  forcedRolls?: number[];
  winner: Side | 'draw' | null;
  victoryNote?: string;
  northVp: Record<string, boolean>;
  abandoned8th: boolean;
  /** Declared this German turn; takes effect in the German Supply Phase. */
  abandon8thDeclared?: boolean;
  seq: number;
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'move'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'land'; unitId: string; to: HexId }
  | { type: 'naval'; unitId: string; to: HexId | 'reserve' }
  | { type: 'enter'; unitId: string; to: HexId; mode?: MoveMode }
  | { type: 'changeArea'; unitId: string; area: string }
  | { type: 'fullRetreat'; unitId: string }
  | { type: 'attack'; target: HexId; attackers: string[]; maf?: string; attach?: string; air?: boolean; naval?: boolean; battleships?: boolean; asus?: string[] }
  | { type: 'autoDs'; target: HexId; attackers: string[] }
  | { type: 'defend'; choice: 'retreat' | 'dd'; support?: string | null; battleships?: boolean; prefer?: 'hold' | 'delay'; delay?: number; lead?: string }
  | { type: 'advance'; unitIds: string[]; to?: HexId }
  | { type: 'btStart'; unitIds: string[]; form: 'stack' | 'vacated' }
  | { type: 'btMove'; to: HexId }
  | { type: 'btAttack'; target: HexId }
  | { type: 'btDrop'; unitIds: string[] }
  | { type: 'btEnd' }
  | { type: 'retreatChoice'; index: number }
  | { type: 'disengage'; hex: HexId }
  | { type: 'replace'; unitId: string; to?: HexId }
  | { type: 'readyAsu'; unitId: string }
  | { type: 'abandon8th' }
  | { type: 'endPhase' };
