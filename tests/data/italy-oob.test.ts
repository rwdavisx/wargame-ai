// Italy '43's counters as transcribed from its four set-up cards (data/italy43/oob.json, built by
// tools/italy-oob/build.py), and the engine's reading of them.
import { afterAll, describe, expect, it } from 'vitest';
import { REMNANT_POOLS, RULES, UNIT_DEFS, loadGameData, scenarioSetup } from '../../src/engine/data';
import { nationGroup } from '../../src/engine/units';
import { SALERNO_DATA } from '../../src/games/salerno43/data';
import oob from '../../data/italy43/oob.json';
import rules from '../../data/italy43/rules.json';

interface Setup {
  start?: { hex?: string; remnant?: boolean; box?: string };
  arrive?: { turn: number; at: string; reduced?: boolean };
  events?: { turn: number; kind: string; at?: string }[];
}
interface Counter {
  id: string;
  side: 'German' | 'Allied';
  sp: number;
  silhouette?: boolean;
  remnant?: string;
  setup: Record<string, Setup>;
}
const units = oob.units as unknown as Counter[];

function placed(card: string) {
  const count: Record<string, number> = {};
  for (const u of units) {
    const s = u.setup[card] ?? {};
    const k = s.start?.hex ? 'map' : s.start?.remnant ? 'remnant' : s.start?.box ?? (s.arrive ? 'arrive' : 'none');
    count[`${u.side} ${k}`] = (count[`${u.side} ${k}`] ?? 0) + 1;
  }
  return count;
}

describe("Italy '43 set-up cards", () => {
  it('places every counter the Campaign Game cards show', () => {
    expect(placed('campaign')).toEqual({
      'German map': 29, 'German arrive': 30, 'German remnant': 5,
      'Allied map': 19, 'Allied arrive': 47, 'Allied remnant': 10,
    });
  });

  it('places every counter the Bernhard Line cards show', () => {
    expect(placed('bernhard')).toEqual({
      // 20 reinforcements, and five withdrawn units that come back on Turns 14 and 19.
      'German map': 30, 'German arrive': 25, 'German remnant': 5, 'German eliminated': 1, 'German permanentlyRemoved': 3,
      'Allied map': 42, 'Allied arrive': 23, 'Allied remnant': 10, 'Allied permanentlyRemoved': 1,
    });
  });

  it('never sets up more than six stacking points in a hex', () => {
    for (const card of ['campaign', 'bernhard']) {
      const sp: Record<string, number> = {};
      const tanks: Record<string, number> = {};
      for (const u of units) {
        const h = u.setup[card]?.start?.hex;
        if (!h) continue;
        // The first silhouetted tank in a hex stacks free (4.3).
        if (u.silhouette) tanks[h] = (tanks[h] ?? 0) + 1;
        sp[h] = (sp[h] ?? 0) + (u.silhouette ? (tanks[h] > 1 ? 1 : 0) : u.sp);
      }
      expect(Object.entries(sp).filter(([, v]) => v > 6), card).toEqual([]);
    }
  });

  it('brings reinforcements on through the map edges and Naples', () => {
    const areas = new Set<string>();
    for (const u of units) for (const s of Object.values(u.setup)) for (const at of [s.arrive?.at, ...(s.events ?? []).map((e) => e.at)]) if (at) areas.add(at);
    expect([...areas].sort()).toEqual(['N1/N2/N3', 'N2', 'N3', 'N4', 'Naples', 'S1', 'S1/S2', 'S2', 'hex:1706']);
  });

  it('gives every 3-step unit a remnant pool that exists', () => {
    const ids = new Set(units.map((u) => u.id));
    for (const u of units) {
      if (!u.remnant) continue;
      const pool = (oob.remnantPools as Record<string, string[]>)[u.remnant] ?? [u.remnant];
      for (const r of pool) expect(ids.has(r), `${u.id} → ${r}`).toBe(true);
    }
  });
});

describe("the engine reading Italy '43's counters", () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));

  it('builds units with a set-up for each scenario', () => {
    // Salerno's map stands in until Italy's is transcribed.
    loadGameData('italy-test', { ...SALERNO_DATA, rules, oob, units: { independentFormations: ['Independent'], tankDestroyers: ['US-601', 'US-636', 'US-645', 'US-776'] } });
    expect(Object.keys(UNIT_DEFS)).toHaveLength(140);
    // A 3-step regiment's last step is a remnant of its own type: 15 PG's 104th becomes the motorized remnant.
    expect(UNIT_DEFS['GE-104'].steps.map((v) => `${v.attack}-${v.defense}-${v.move}`)).toEqual(['6-9-5', '4-7-5', '1-3-5']);
    expect(UNIT_DEFS['GE-104'].steps[2].sp).toBe(2);
    expect(REMNANT_POOLS['GE-INF']).toEqual(['GE-REM-A', 'GE-REM-B', 'GE-REM-C', 'GE-REM-D']);
    expect(UNIT_DEFS['US-601'].tankDestroyer).toBe(true);
    // Seven mountain units, the 1st Special Service Force among them; a remnant loses the ability (19.3, 10.4.1).
    expect(Object.values(UNIT_DEFS).filter((d) => d.mountain).map((d) => d.id).sort()).toEqual(
      ['FR-4-2M', 'FR-4MG-2M', 'FR-5-2M', 'FR-8-2M', 'GE-100', 'GE-85', 'US-1SSF']);
    expect(UNIT_DEFS['FR-4-2M'].infantryType).toBe(true);
    // The French and the Italians are part of the US Fifth Army.
    expect([nationGroup('FR-4-2M'), nationGroup('IT-1Mtr'), nationGroup('BR-22-7A')]).toEqual(['US', 'US', 'CW']);
    // The Italians have no remnants: their 3-step unit has two steps and is then eliminated (10.4.2).
    expect(UNIT_DEFS['IT-1Mtr'].remnant).toBeUndefined();

    // The 504th garrisons Naples in the campaign, and is in the line at the Bernhard start.
    expect(scenarioSetup('campaign')['US-504-82'].start?.hex).toBe('2125');
    expect(scenarioSetup('volturno')['US-504-82'].garrison).toBe('Naples');
    expect(scenarioSetup('bernhard')['US-504-82'].start?.hex).toBe('3210');
    // 26 Pz Div's battalions are away at the Bernhard start and return on Turn 14.
    expect(scenarioSetup('bernhard')['GE-I-9'].arrive).toEqual({ turn: 14, at: 'N3', reduced: true });
  });

  it("reads Italy '43's own tables", () => {
    loadGameData('italy-test', { ...SALERNO_DATA, rules, oob, units: { independentFormations: ['Independent'], tankDestroyers: [] } });
    expect(RULES.stackingLimit).toBe(6);
    expect(RULES.supply).toMatchObject({ overlandHexes: 5, cap: 19 });
    expect(RULES.movement.extendedBonus).toEqual({ mech: 3, nonMech: 2 });
    expect(RULES.rally.cityDrm).toBe(2);
    expect(RULES.dd).toMatchObject({ dice: 2, maxDrm: 2 });
    expect(RULES.combat.crt['3']).toHaveLength(RULES.combat.columns.length);
    expect([RULES.automaticMargin, RULES.automaticAlliedVp]).toEqual([5, 20]);
    expect(RULES.landingPoints.perTurn).toBe(0);
  });
});
