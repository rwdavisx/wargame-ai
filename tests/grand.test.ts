import { afterAll, describe, expect, it } from 'vitest';
import { loadGameData, MAP, RULES, SCENARIOS, UNIT_DEFS, scenarioSetup } from '../src/engine/data';
import { actingSide, applyAction, entryReach, newGame } from '../src/engine/game';
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
    expect(s.turn).toBe(24);
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
