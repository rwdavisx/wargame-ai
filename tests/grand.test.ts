import { afterAll, describe, expect, it } from 'vitest';
import { loadGameData, MAP, RULES, SCENARIOS, UNIT_DEFS, scenarioSetup } from '../src/engine/data';
import { actingSide, applyAction, entryReach, landingHexes, navalDestinations, newGame } from '../src/engine/game';
import { fortOptions } from '../src/engine/forts';
import { usablePorts } from '../src/engine/supply';
import { isLand, sideOf, stackPoints, unitsAt } from '../src/engine/units';
import type { Action, GameState, Side } from '../src/engine/types';
import { createHeuristicAi } from '../src/ai/heuristic';
import { GRAND_DATA } from '../src/games/grand43/data';
import { ITALY_DATA } from '../src/games/italy43/data';
import { SALERNO_DATA } from '../src/games/salerno43/data';

// The grand campaign: Italy '43's rules with Salerno '43's landings, on the two maps joined and carried across to
// the Adriatic.
describe('grand campaign', () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));

  it('has its three scenarios and a sound set-up for each', () => {
    loadGameData('grand43', GRAND_DATA);
    expect(Object.keys(SCENARIOS).sort()).toEqual(['campaign', 'race', 'winter']);
    expect(RULES.landings).toBe(true);
    expect(RULES.invasionGame).toBe(false);
    for (const sc of Object.keys(SCENARIOS)) {
      const setup = scenarioSetup(sc);
      for (const [id, st] of Object.entries(setup)) {
        if (st.start?.hex) expect(isLand(st.start.hex), `${sc}: ${id} starts at sea in ${st.start.hex}`).toBe(true);
        for (const at of [st.arrive?.at, ...(st.events ?? []).map((e) => e.at)]) {
          if (!at || at === 'Naples' || at === 'reserve' || at.startsWith('airdrop')) continue;
          if (at.startsWith('hex:')) expect(isLand(at.slice(4))).toBe(true);
          else for (const a of at.split('/')) expect(MAP.entryAreas[a], `${sc}: ${id} arrives at unknown area ${a}`).toBeTruthy();
        }
      }
      const s = newGame(sc, 3);
      // Stacking and no hex shared with the enemy.
      for (const h of new Set(Object.values(s.units).flatMap((u) => (u.where.kind === 'map' ? [u.where.hex] : [])))) {
        const here = unitsAt(s, h);
        expect(new Set(here.map((u) => sideOf(u))).size, `${sc}: both sides in ${h}`).toBe(1);
        expect(stackPoints(here.map((u) => u.id), s), `${sc}: overstacked ${h}`).toBeLessThanOrEqual(RULES.stackingLimit);
      }
    }
  });

  it('opens with the landings and plays its first turns without an illegal action', () => {
    loadGameData('grand43', GRAND_DATA);
    const s: GameState = newGame('race', 5);
    expect(s.phase).not.toBe('initial');
    expect(Object.values(s.units).some((u) => u.where.kind === 'map' && sideOf(u) === 'Allied')).toBe(true);
    const ai: Record<Side, ReturnType<typeof createHeuristicAi>> = { Allied: createHeuristicAi('veteran'), German: createHeuristicAi('veteran') };
    for (let k = 0; k < 20000 && s.phase !== 'gameOver' && s.turn <= 3; k++) applyAction(s, ai[actingSide(s)].nextAction(s) as Action);
    expect(s.turn).toBeGreaterThan(3);
  }, 120000);

  it('starts the Winter Line with both armies in the line and the entry areas the Allies have reached', () => {
    loadGameData('grand43', GRAND_DATA);
    const s = newGame('winter', 9);
    expect(s.turn).toBe(35);
    for (const a of Object.keys(RULES.entryOpens)) expect(s.control[a]).toBe('Allied');
    const onMap = (side: Side) => Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side).length;
    expect(onMap('Allied')).toBeGreaterThan(60);
    expect(onMap('German')).toBeGreaterThan(40);
  });

  it('brings reinforcements due in Naples by sea while the Germans hold it', () => {
    loadGameData('grand43', GRAND_DATA);
    const s = newGame('campaign', 4);
    const id = Object.keys(UNIT_DEFS).find((u) => scenarioSetup('campaign')[u]?.arrive?.at === 'Naples')!;
    s.units[id].where = { kind: 'pending', turn: 2, at: 'Naples' };
    for (let k = 0; k < 5000 && !(s.turn === 2 && s.activeSide === 'Allied' && s.phase === 'movement'); k++) applyAction(s, { type: 'endPhase' } as Action);
    expect(s.units[id].where.kind).toBe('reserve');
  });
});

/** Where a rebuilt unit came back: itself, or the Remnant standing in for it (20.3.4). */
function cameBack(s: GameState, id: string) {
  return Object.values(s.units).find((u) => u.represents === id)?.where ?? s.units[id].where;
}

/** A grand campaign position with no German unit on the map, at `phase` of `side`'s turn `turn`. */
function emptied(turn: number, side: Side, phase: GameState['phase']): GameState {
  loadGameData('grand43', GRAND_DATA);
  const s = newGame('campaign', 7);
  for (const u of Object.values(s.units)) if (sideOf(u) === 'German' && u.where.kind === 'map') u.where = { kind: 'removed', reason: 'test' };
  s.turn = turn;
  s.activeSide = side;
  s.phase = phase;
  return s;
}

describe('grand campaign rules where the two games meet', () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));

  it('brings rebuilt German units back at the north entry areas, from where they can enter', () => {
    const s = emptied(30, 'German', 'initial');
    s.units['GE-I-115'].where = { kind: 'eliminated' };
    s.replacements.German.inf = 1;
    applyAction(s, { type: 'replace', unitId: 'GE-I-115' });
    const w = cameBack(s, 'GE-I-115');
    expect(w.kind).toBe('entry');
    expect((w as { area: string }).area.split('/').every((a) => MAP.entryAreas[a]?.side === 'north')).toBe(true);
    s.phase = 'movement';
    s.units['GE-I-115'].repl = false;
    expect(entryReach(s, 'GE-I-115', 'normal').size).toBeGreaterThan(0);
  });

  it('brings rebuilt Eighth Army units back at the entry areas the Allies hold, the Fifth Army\'s in the Floating Reserve', () => {
    const s = emptied(30, 'Allied', 'initial');
    for (const a of Object.keys(RULES.entryOpens)) s.control[a] = 'Allied';
    for (const id of ['BR-17', 'BR-139-46']) s.units[id].where = { kind: 'eliminated' };
    s.replacements.BR.inf = 2;
    applyAction(s, { type: 'replace', unitId: 'BR-17' });
    applyAction(s, { type: 'replace', unitId: 'BR-139-46' });
    const w = cameBack(s, 'BR-17');
    expect(w.kind).toBe('entry');
    expect((w as { area: string }).area.split('/').every((a) => s.control[a] === 'Allied' && MAP.entryAreas[a].side !== 'north')).toBe(true);
    expect(cameBack(s, 'BR-139-46').kind).toBe('reserve');
  });

  it('keeps the Floating Reserve and naval moves on their own coast', () => {
    const s = emptied(30, 'Allied', 'movement');
    for (const h of ['5922', '5506', '2749']) s.control[h] = 'Allied';
    s.portsAtStart = usablePorts(s);
    expect(s.portsAtStart).toEqual(expect.arrayContaining(['5922', '5506', '2749']));
    s.units['BR-139-46'].where = { kind: 'reserve' };
    const land = landingHexes(s, 'BR-139-46');
    expect(land).toContain('2749');
    expect(land).not.toContain('5922');
    expect(land).not.toContain('5506');
    s.units['BR-5Recce'].where = { kind: 'map', hex: '5922' };
    const fromTermoli = navalDestinations(s, 'BR-5Recce').map((d) => d.to);
    expect(fromTermoli).toContain('5506');
    expect(fromTermoli).not.toContain('2749');
    expect(fromTermoli).not.toContain('reserve');
    s.units['BR-5Recce'].where = { kind: 'map', hex: '2749' };
    const fromSalerno = navalDestinations(s, 'BR-5Recce').map((d) => d.to);
    expect(fromSalerno).toContain('reserve');
    expect(fromSalerno).not.toContain('5922');
  });

  it('lets any Allied unit use the roads from Bari once they are Allied', () => {
    const s = emptied(20, 'Allied', 'movement');
    for (const a of Object.keys(RULES.entryOpens)) s.control[a] = 'Allied';
    s.units['BR-17'].where = { kind: 'entry', area: 'A4' };
    applyAction(s, { type: 'changeArea', unitId: 'BR-17', area: 'A5' });
    expect(s.units['BR-17'].where).toEqual({ kind: 'entry', area: 'A5' });
  });

  it('has no 8th Army sector to abandon', () => {
    const s = emptied(20, 'German', 'initial');
    expect(() => applyAction(s, { type: 'abandon8th' })).toThrow();
  });

  it('starts the fortifications on Italy \'43\'s first turn, not in September', () => {
    const s = emptied(22, 'German', 'initial');
    expect(fortOptions(s)).toEqual([]);
    s.turn = 23;
    expect(fortOptions(s).length).toBeGreaterThan(0);
  });
});

describe('rebuilt units in Italy \'43', () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));
  it('brings the Allies back at their entry areas: the game has no Floating Reserve', () => {
    loadGameData('italy43', ITALY_DATA);
    const s = newGame('campaign', 5);
    s.activeSide = 'Allied';
    s.phase = 'initial';
    s.units['BR-139-46'].where = { kind: 'eliminated' };
    s.replacements.BR.inf = 1;
    applyAction(s, { type: 'replace', unitId: 'BR-139-46' });
    const w = cameBack(s, 'BR-139-46');
    expect(w.kind).toBe('entry');
    expect((w as { area: string }).area.split('/').sort()).toEqual(['S1', 'S2']);
  });
});

describe('entry area choices', () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));
  it('lets a unit due at "N1/N2/N3" come on from any of them (Italy \'43)', () => {
    loadGameData('italy43', ITALY_DATA);
    const s = newGame('campaign', 5);
    s.units['GE-274'].where = { kind: 'entry', area: 'N1/N2/N3' };
    s.activeSide = 'German';
    s.phase = 'movement';
    expect(entryReach(s, 'GE-274', 'normal').size).toBeGreaterThan(0);
  });
});
