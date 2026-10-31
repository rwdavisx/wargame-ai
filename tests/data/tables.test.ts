// Every table in data/salerno43/rules.json (and the unit-type table in data/salerno43/oob.json) checked cell by cell
// against the physical game's player aids. The expected values below were typed in again, by hand,
// from photos of the owner's copies:
//   CRT card ............ Combat Results Table, Determined Defense Table, Isolation Attrition,
//                         Rally Table, Combat Modifiers
//   Tables card ......... Invasion CRT (24.2), Airborne Drop Table (21.6), Disengagement (25.1),
//                         Variable Strength Units (19.3), Landing Point Values (18.4.3), unit types
//   TEC card ............ Terrain Effects Chart (movement costs)
//   Map ................. Weather Track and Weather Table, Turn Record Track (benchmarks,
//                         replacements, turn notes)
//   Set-up cards ........ Campaign Game / Avalanche Scenario at-start and reinforcement cards
//   Rulebook ............ numbers given only in the text (stacking, supply, landing points, ...)
// A failure names the table, the row and the column, the value in the data and the printed value.
import { describe, expect, it } from 'vitest';
import rules from '../../data/salerno43/rules.json';
import oob from '../../data/salerno43/oob.json';
import { RULES } from '../../src/engine/data';

const R = rules as any;
const O = oob as any;

/** Compare cell by cell; returns one line per differing cell. */
function cellDiffs(table: string, got: Record<string, unknown>, want: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
    if (JSON.stringify(got[k]) !== JSON.stringify(want[k]))
      out.push(`${table} [${k}]: data has ${JSON.stringify(got[k])}, the printed table has ${JSON.stringify(want[k])}`);
  }
  return out;
}

describe('Combat Results Table (CRT card)', () => {
  const columns = ['1-3', '1-2', '1-1', '2-1', '3-1', '4-1', '5-1', '6-1', '7-1'];
  // Result / advance (Adv n), then the cell colour: y = orange (-1 on the DD table), r = red (no DD).
  const printed: Record<string, string[]> = {
    1: ['A1', 'A1', 'A1', 'A1', 'EX', 'DR2/2', 'DR2/2y', 'A1/D1/2y', 'D1/3y'],
    2: ['A1', 'A1', 'A1', 'EX', 'Dis', 'DR2/2', 'DRX/2y', 'D1/3y', 'DR4/3r'],
    3: ['A1', 'A1', 'EX', 'Dis', 'DR2/2', 'DRX/2', 'A1/D1/2y', 'DR4/3r', 'DR4/3r'],
    4: ['A1', 'EX', 'Dis', 'A1/DR2/2', 'DR2/2', 'A1/D1/2', 'D1/3y', 'DR4/3r', 'DS/4r'],
    5: ['EX', 'Dis', 'A1/DR2/2', 'DR2/2', 'A1/D1/2', 'D1/3', 'DR4/3r', 'DS/4r', 'DS/4r'],
    6: ['Dis', 'A1/DR2/2', 'DR2/2', 'A1/D1/2', 'D1/3', 'D1/3y', 'DS/4r', 'DS/4r', 'DS/4r'],
  };

  it('has the nine odds columns from 1-3 to 7-1', () => {
    expect(R.combat.columns).toEqual(columns);
    expect(R.combat.ratios).toEqual([0.3334, 0.5, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('matches every cell: result, advance and colour', () => {
    const diffs: string[] = [];
    for (let roll = 1; roll <= 6; roll++)
      columns.forEach((col, i) => {
        const got = R.combat.crt[roll]?.[i];
        if (got !== printed[roll][i]) diffs.push(`roll ${roll}, ${col}: data "${got}", card "${printed[roll][i]}"`);
      });
    expect(diffs).toEqual([]);
  });

  it('gives each result the retreat and advance printed in the key', () => {
    // From the key: retreat length / the advance after combat for mechanized units.
    const key: Record<string, { retreat: number; adv: number }> = {
      DR2: { retreat: 2, adv: 2 }, 'A1/DR2': { retreat: 2, adv: 2 }, DRX: { retreat: 2, adv: 2 }, 'A1/D1': { retreat: 2, adv: 2 },
      D1: { retreat: 3, adv: 3 }, DR4: { retreat: 4, adv: 3 }, DS: { retreat: 4, adv: 4 },
    };
    const diffs: string[] = [];
    for (const row of Object.values(R.combat.crt) as string[][])
      for (const cell of row) {
        const m = /^(.*?)(?:\/(\d))?([yr]?)$/.exec(cell)!;
        const k = key[m[1]];
        if (k && Number(m[2]) !== k.adv) diffs.push(`${cell}: advance ${m[2]}, key says ${k.adv}`);
        if (!k && m[2]) diffs.push(`${cell}: ${m[1]} allows no advance`);
        if ((m[1] === 'DR4' || m[1] === 'DS') && m[3] !== 'r') diffs.push(`${cell}: ${m[1]} never allows a Determined Defense (red)`);
      }
    expect(diffs).toEqual([]);
    for (const r of ['A1', 'EX', 'Dis', 'DR2', 'A1/DR2', 'DRX', 'A1/D1', 'D1', 'DR4', 'DS']) expect(R.combat.results).toHaveProperty([r]);
  });

  it('limits the advance of non-mechanized, out-of-supply and half-effective units as the key says', () => {
    expect(R.combat.nonMechAdvanceCap).toBe(2);
    expect(R.combat.oosAdvanceCap).toBe(2);
    expect(R.combat.halfEffAdvanceCap).toBe(1);
  });

  it('has the combat modifiers of 9.0', () => {
    expect(R.combat.attackerShifts).toEqual({ tank: 1, air: 1, divisionArtillery: 1, corpsOrNaval: 1, elite: 1 });
    expect(R.combat.defenderShifts).toEqual({ tank: -1, air: -1, rain: -1 });
    expect(R.combat.battleshipDrm).toBe(1);
  });
});

describe('Determined Defense Table (CRT card, 11.0)', () => {
  // Rolls 1 to 7 (a modified 7 is possible). "a|b" = the "or" rows where the defender chooses.
  const printed: Record<string, string[]> = {
    Clear: ['-/1', '-/1', '-/-', '-/-', '-/- D|-/1 H', '-/1 H', '1*/1 H'],
    Other: ['-/1', '-/-', '-/-', '-/- D', '-/- D|-/1 H', '1*/1 H', '1/dis H'],
    City: ['-/1', '-/-', '-/- P', '-/- P', '-/- P|-/1 H', '1*/1 H', '1/dis H'],
  };
  for (const col of ['Clear', 'Other', 'City'])
    it(`matches the ${col} column`, () => {
      const got: string[] = R.determinedDefense[col];
      const diffs = printed[col].map((w, i) => (got[i] === w ? '' : `roll ${i + 1}: data "${got[i]}", card "${w}"`)).filter(Boolean);
      expect(got.length).toBe(7);
      expect(diffs).toEqual([]);
    });
  it('has the four die roll modifiers', () => {
    expect(R.determinedDefense.drms).toEqual({ defensiveSupport: 1, eliteLead: 1, lowQualityLead: -1, yellowCell: -1 });
  });
  it('reaches the engine unchanged', () => {
    expect(RULES.dd.table).toEqual(printed);
  });
});

describe('Isolation Attrition and Rally tables (CRT card)', () => {
  it('Isolation Attrition (16.5): 1-4 lose a step, +2 city or corps HQ, +1 Allied in clear weather', () => {
    expect(R.isolation.lossOn).toEqual([1, 2, 3, 4]);
    expect(R.isolation.cityOrCorpsDrm).toBe(2);
    expect(R.isolation.alliedClearWeatherDrm).toBe(1);
    expect(R.isolation.skipFirstTurn).toBe(true); // 16.5: no roll on the first turn a unit is isolated
  });
  it('Rally (13.5): 5-6 recover, +2 BH or city, +1 elite, -1 low quality', () => {
    expect(R.rally).toEqual({ success: [5, 6], bhOrCityDrm: 2, eliteDrm: 1, lowQualityDrm: -1 });
  });
});

describe('Tables card', () => {
  it('Invasion CRT (24.2), every die roll', () => {
    const printed = {
      Rangers: ['1', '2', '2', '2', '2', '2'],
      Uncle: ['-1,1', '-1,1', '1', '1', '1', '2'],
      Other: ['1', '1', '2', '2', '2', '2'],
    };
    const diffs: string[] = [];
    for (const [col, cells] of Object.entries(printed)) diffs.push(...cellDiffs(`Invasion ${col}`, { ...R.invasion[col] }, { ...cells }));
    expect(diffs).toEqual([]);
  });

  it('Airborne Drop Table (21.6), every modified roll from -4 to 6', () => {
    const printed = (roll: number) => (roll <= -2 ? 'eliminated' : roll <= 0 ? 'stepDisrupted' : roll <= 2 ? 'disrupted' : roll <= 4 ? 'halfEff' : 'ok');
    const lookup = (roll: number) => (R.airdrop.table as { max: number; result: string }[]).find((r) => roll <= r.max)?.result;
    const diffs: string[] = [];
    for (let roll = -4; roll <= 6; roll++) if (lookup(roll) !== printed(roll)) diffs.push(`roll ${roll}: data ${lookup(roll)}, card ${printed(roll)}`);
    expect(diffs).toEqual([]);
    expect(R.airdrop.cityMarshMountainDrm).toBe(-2);
    expect(R.airdrop.ezocDrm).toBe(-2);
  });

  it('Disengagement Table (25.1): 1-2 no, 3 yes with a step loss, 4-6 yes; +1 mechanized', () => {
    expect(cellDiffs('Disengagement', R.disengagement.table, { 1: 'no', 2: 'no', 3: 'yesStep', 4: 'yes', 5: 'yes', 6: 'yes' })).toEqual([]);
    expect(R.disengagement.mechDrm).toBe(1);
  });

  it('Variable Strength Units (19.3): defense by die roll', () => {
    expect(R.variableStrength).toEqual([0, 0, 0, 1, 1, 2]);
  });

  it('Landing Point Values (18.4.3): LP cost by stacking points 0-3; 12 LPs a turn', () => {
    expect(R.landingPoints.costBySp).toEqual([1, 1, 2, 3]);
    expect(R.landingPoints.perTurn).toBe(12);
  });

  it('unit type table: maximum advance and replacement type of every category', () => {
    // NA advance = 0 here; replacement symbol: crossed box = inf, plain box = special, oval = armor.
    const printed: Record<string, { maxAdv: number; repl: string | null; mech: boolean }> = {
      infantry: { maxAdv: 2, repl: 'inf', mech: false },
      garrison: { maxAdv: 0, repl: 'inf', mech: false },
      motorized: { maxAdv: 4, repl: 'inf', mech: true },
      pg: { maxAdv: 4, repl: 'inf', mech: true },
      engineer: { maxAdv: 2, repl: 'special', mech: false },
      bh: { maxAdv: 0, repl: null, mech: false },
      airborne: { maxAdv: 2, repl: 'special', mech: false },
      glider: { maxAdv: 2, repl: 'special', mech: false },
      ranger: { maxAdv: 2, repl: 'special', mech: false },
      recon: { maxAdv: 4, repl: 'special', mech: true },
      divAsu: { maxAdv: 0, repl: 'special', mech: true },
      corpsAsu: { maxAdv: 0, repl: 'special', mech: true },
      nebelwerfer: { maxAdv: 0, repl: 'special', mech: true },
      tank: { maxAdv: 4, repl: 'armor', mech: true },
    };
    const diffs: string[] = [];
    for (const [cat, w] of Object.entries(printed)) {
      const g = O.categories[cat];
      if (!g) diffs.push(`${cat}: missing`);
      else for (const k of ['maxAdv', 'repl', 'mech'] as const) if (g[k] !== w[k]) diffs.push(`${cat}.${k}: data ${g[k]}, card ${w[k]}`);
    }
    expect(Object.keys(O.categories).sort()).toEqual(Object.keys(printed).sort());
    expect(diffs).toEqual([]);
  });
});

describe('Terrain Effects Chart (TEC card)', () => {
  it('movement costs: non-mechanized / mechanized', () => {
    expect(R.movement.terrain).toEqual({
      clear: { inf: 1, mech: 1 },
      hill: { inf: 1, mech: 2 },
      marsh: { inf: 2, mech: 4 },
      city: { inf: 1, mech: 1 },
    });
    expect(R.movement.majorRoad).toEqual({ inf: 1, mech: 0.3334 }); // 1/3
    expect(R.movement.minorRoad).toEqual({ inf: 1, mech: 0.5 });
    expect(R.movement.alliedMechRoadIn8thSector).toBe(1); // note 4
    expect(R.movement.pass).toEqual({ inf: 1, mech: 2 }); // +1 / +2
    expect(R.movement.riverInf).toBe(1); // infantry types +1
    expect(R.movement.exitEzoc).toBe(2); // entering +0, exiting +2
  });
  it('turn 1 restrictions from the Turn Record Track', () => {
    expect(R.movement.turn1GermanHalfMaRoundUp).toBe(true);
    expect(R.movement.turn1AlliedTacticalOnly).toBe(true);
  });
});

describe('Weather (map)', () => {
  // Box: name, air units, naval units, Allied supply points (* = +1 if Salerno port open), German supply points.
  const printed = [
    { box: 'A', name: 'Clear', air: ['BR', 'US'], naval: ['BR', 'US'], alliedSupply: 1, alliedPortBonus: true, germanSupply: 1, clear: true },
    { box: 'B', name: 'Clear', air: ['BR', 'US'], naval: ['BR', 'US'], alliedSupply: 1, alliedPortBonus: true, germanSupply: 1, clear: true },
    { box: 'C', name: 'Air Support', air: ['GE'], naval: ['BR', 'US'], alliedSupply: 1, germanSupply: 2 },
    { box: 'D', name: 'Cloudy', air: ['BR'], naval: ['BR', 'US'], alliedSupply: 2, germanSupply: 1 },
    { box: 'E', name: 'Cloudy', air: ['US'], naval: ['BR', 'US'], alliedSupply: 2, germanSupply: 2 },
    { box: 'F', name: 'Rain', air: [], naval: [], alliedSupply: 0, germanSupply: 0, rain: true },
  ];
  it('Weather Track, every box', () => {
    const diffs: string[] = [];
    printed.forEach((w, i) => diffs.push(...cellDiffs(`box ${w.box}`, R.weather.track[i] ?? {}, w)));
    expect(R.weather.track.length).toBe(6);
    expect(diffs).toEqual([]);
  });
  it('Weather Table: 1 = stay, 2-4 = one box, 5-6 = two boxes, F wraps to A', () => {
    expect(cellDiffs('weather roll', R.weather.advanceByRoll, { 1: 0, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2 })).toEqual([]);
    expect(R.weather.wraps).toBe(true);
    expect(R.supply.salernoPortOpenRadius).toBe(2); // the * note: no German units within 2 hexes
  });
});

describe('Turn Record Track (map)', () => {
  it('benchmark numbers, turns 4-22', () => {
    const printed = { 4: 6, 5: 7, 6: 7, 7: 7, 8: 8, 9: 8, 10: 8, 11: 9, 12: 9, 13: 10, 14: 10, 15: 11, 16: 11, 17: 12, 18: 12, 19: 14, 20: 16, 21: 18, 22: 20 };
    expect(cellDiffs('benchmark turn', R.victory.benchmarks, printed)).toEqual([]);
    expect(RULES.automaticMargin).toBe(5);
    expect(RULES.automaticAlliedVp).toBe(20);
  });

  it('replacement markers, every turn', () => {
    // G = German, B = British (tan), U = US (green); i = infantry, a = armor, s = special.
    const printed: Record<number, string> = {
      4: 'Gs', 5: 'Ga Bi Ui', 6: 'Gi Ba Ua', 7: 'Gi', 8: 'Gs', 9: 'Ga Bi Ui', 10: 'Gi Bs Us', 11: 'Gi', 12: 'Gs',
      13: 'Ga Bi Ui', 14: 'Gi Ba Ua', 15: 'Gi', 16: 'Gs', 17: 'Ga Bi Ui', 18: 'Gi Bs Us', 19: 'Gi', 20: 'Gs', 21: 'Ga Bi Ui',
    };
    const side = { G: 'German', B: 'BR', U: 'US' } as const;
    const type = { i: 'inf', a: 'armor', s: 'special' } as const;
    const want: Record<string, unknown> = {};
    for (const [t, s] of Object.entries(printed)) {
      const e: Record<string, Record<string, number>> = {};
      for (const tok of s.split(' ')) e[side[tok[0] as 'G']] = { [type[tok[1] as 'i']]: 1 };
      want[t] = e;
    }
    expect(cellDiffs('replacements turn', R.replacements.schedule, want)).toEqual([]);
  });

  it('turn notes fall on the turns the track prints them', () => {
    expect(Object.keys(R.turnNotes).map(Number)).toEqual([1, 3, 5, 6, 8, 11, 14, 16, 22]);
    expect(R.turnNotes[3]).toMatch(/2202/);
  });
});

describe('numbers given in the rulebook text', () => {
  it('stacking, supply, starting supply points, scenario lengths', () => {
    expect(R.stacking.limit).toBe(6); // 4.1
    expect(R.supply.overlandHexes).toBe(5); // 16.3.2: overland part of a supply line
    expect(R.supply.supplyPointCap).toBe(19); // 22.3.1
    expect(RULES.combat.strengthCap).toBe(20); // 8.4.5: at most 20 strength points
    expect(RULES.combat.autoDsRatio).toBe(10); // 8.6.1: 10-1 or more is an automatic DS
    expect(O.startingSupplyPoints).toEqual({ German: 3, Allied: 0 }); // S1.1
    expect(O.scenarios.short.lastTurn).toBe(8);
    expect(O.scenarios.campaign.lastTurn).toBe(22);
    expect(O.withdrawal).toMatchObject({ turn: 14, side: 'German', defense: 12 }); // S2.2
  });
});

describe('set-up cards', () => {
  // The Floating Reserve is entered as Allied units that become available on turn 2.
  const isFloatingReserve = (u: any) => u.side === 'Allied' && u.arrive?.turn === 2 && u.arrive.at === 'reserve';
  it('brings the printed number of reinforcements on each turn', () => {
    // Counters printed in each turn box of the reinforcement cards (support markers not counted).
    const printed: Record<string, Record<number, number>> = {
      German: { 1: 2, 2: 9, 3: 6, 4: 3, 5: 6, 6: 4, 7: 1, 9: 1, 10: 1, 13: 1 },
      Allied: { 5: 2, 6: 3, 7: 2, 8: 3, 9: 2, 10: 2, 11: 5, 12: 5, 13: 2, 14: 2, 16: 1, 18: 1, 19: 1, 20: 1 },
    };
    for (const side of ['German', 'Allied']) {
      const got: Record<number, number> = {};
      for (const u of O.units)
        if (u.side === side && u.arrive && !isFloatingReserve(u)) got[u.arrive.turn] = (got[u.arrive.turn] ?? 0) + 1;
      expect(cellDiffs(`${side} reinforcements turn`, got, printed[side])).toEqual([]);
    }
  });

  it('puts the twelve printed counters in the Allied Floating Reserve', () => {
    expect(O.units.filter(isFloatingReserve).length).toBe(12);
  });

  it('starts the German units in the printed hexes', () => {
    const printed: Record<string, number> = { 2202: 1, 2905: 1, 2909: 1, 3012: 2, 3014: 1, 2817: 2, 2619: 1, 3213: 1, 2424: 1, 2707: 1, 3203: 1, 1903: 1, 2418: 1 };
    const got: Record<string, number> = {};
    for (const u of O.units) if (u.side === 'German' && u.start?.hex) got[u.start.hex] = (got[u.start.hex] ?? 0) + 1;
    expect(cellDiffs('German at-start hex', got, printed)).toEqual([]);
  });
});
