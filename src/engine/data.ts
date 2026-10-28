import mapJson from '../../data/map.json';
import rulesJson from '../../data/rules.json';
import oobJson from '../../data/oob.json';
import type { MapData, Side, StepValues, UnitDef, UnitType } from './types';

export const MAP = mapJson as unknown as MapData;

type Valued<T> = T | { value: T };
const val = <T,>(v: Valued<T>): T =>
  v !== null && typeof v === 'object' && 'value' in (v as object) ? (v as { value: T }).value : (v as T);

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
  germanAirDrm?: number;
}

export interface Rules {
  turnOrder: Side[];
  stackingLimit: number;
  movement: {
    terrainCost: Record<string, number>;
    vehicleTerrainCost: Record<string, number>;
    riverCost: number;
    vehicleRiverCost: number;
    mountainCost: number;
    passCost: number;
    vehicleMountainProhibited: boolean;
    majorRoadCost: number;
    minorRoadCost: number;
    eighthArmyRoadCost: number;
    exitZocCost: number;
    strategicMultiplier: number;
    rainVehicleExtra: number;
    turn1GermanMaFactor: number;
    turn1AlliedTacticalOnly: boolean;
  };
  combat: {
    columns: string[];
    ratios: number[];
    crt: Record<string, string[]>;
    resultKey: Record<string, string>;
    terrainShift: Record<string, number>;
    allAcrossRiverShift: number;
    allAcrossMountainShift: number;
    allAcrossPassShift: number;
    armorShift: number;
    airShift: number;
    navalShift: number;
    navalRange: number;
    asuShiftEach: number;
    asuMaxPerSide: number;
    rainShift: number;
    outOfSupplyAttackFactor: number;
    disruptedDefenseFactor: number;
    retreatIntoZocLosesStep: boolean;
    advanceMax: number;
  };
  recovery: { rallyRollNeeded: number; autoRallyIfNotAdjacentToEnemy: boolean };
  supply: {
    overlandHexes: number;
    isolationLossOn: number;
    alliedClearWeatherDrm: number;
    supplyPointCap: number;
    salernoPortOpenRadius: number;
  };
  weather: { track: WeatherBox[]; advanceByRoll: Record<string, number>; wraps: boolean };
  benchmarks: Record<number, number>;
  suddenDeathBelowBenchmark: boolean;
  drawMargin: number;
  replacementSchedule: Record<number, Partial<Record<'German' | 'BR' | 'US', Partial<Record<'inf' | 'armor' | 'any', number>>>>>;
  turnNotes: Record<number, string>;
}

function buildRules(): Rules {
  const r = rulesJson as any;
  const m = r.movement;
  const c = r.combat;
  const s = r.supply;
  const benchmarks: Record<number, number> = {};
  for (const [k, v] of Object.entries(r.victory.benchmarks)) {
    if (/^\d+$/.test(k)) benchmarks[Number(k)] = v as number;
  }
  const replacementSchedule: Rules['replacementSchedule'] = {};
  for (const [k, v] of Object.entries(r.replacements.schedule)) replacementSchedule[Number(k)] = v as any;
  const turnNotes: Record<number, string> = {};
  for (const [k, v] of Object.entries(r.turnNotes)) turnNotes[Number(k)] = v as string;
  return {
    turnOrder: r.turnOrder,
    stackingLimit: r.stackingLimit,
    movement: {
      ...m,
      eighthArmyRoadCost: val(m.eighthArmyRoadCost),
      turn1GermanMaFactor: val(m.turn1GermanMaFactor),
      turn1AlliedTacticalOnly: val(m.turn1AlliedTacticalOnly),
    },
    combat: { ...c, rainShift: val(c.rainShift) },
    recovery: r.recovery,
    supply: {
      overlandHexes: s.overlandHexes,
      isolationLossOn: s.isolationLossOn,
      alliedClearWeatherDrm: val(s.alliedClearWeatherDrm),
      supplyPointCap: val(s.supplyPointCap),
      salernoPortOpenRadius: val(s.salernoPortOpenRadius),
    },
    weather: r.weather,
    benchmarks,
    suddenDeathBelowBenchmark: r.victory.suddenDeathBelowBenchmark,
    drawMargin: r.victory.drawMargin ?? 0,
    replacementSchedule,
    turnNotes,
  };
}

export const RULES = buildRules();

export interface UnitSetup {
  start?: { hex?: string; beach?: string; reserve?: boolean };
  arrive?: { turn: number; at: string };
  frozenUntil?: number;
  removeOnTurn?: number;
}

function buildUnits(): { defs: Record<string, UnitDef>; setup: Record<string, UnitSetup> } {
  const o = oobJson as any;
  const defs: Record<string, UnitDef> = {};
  const setup: Record<string, UnitSetup> = {};
  for (const u of o.units) {
    const t = o.templates[u.template] ?? {};
    const steps: StepValues[] = (u.steps ?? t.steps).map(([attack, defense, move]: number[]) => ({ attack, defense, move }));
    defs[u.id] = {
      id: u.id,
      name: u.name,
      side: u.side,
      nation: u.nation,
      type: (u.type ?? t.type) as UnitType,
      formation: u.formation,
      steps,
      tankRating: u.tankRating ?? t.tankRating,
      freeStack: u.freeStack ?? t.freeStack,
      noZoc: u.noZoc ?? t.noZoc,
      vehicle: u.vehicle ?? t.vehicle,
      asuRange: u.asuRange ?? t.asuRange,
      replCategory: u.replCategory ?? t.replCategory,
    };
    setup[u.id] = { start: u.start, arrive: u.arrive, frozenUntil: u.frozenUntil, removeOnTurn: u.removeOnTurn };
  }
  return { defs, setup };
}

const built = buildUnits();
export const UNIT_DEFS = built.defs;
export const UNIT_SETUP = built.setup;
export const SCENARIOS = (oobJson as any).scenarios as Record<string, { name: string; lastTurn: number; description: string }>;
