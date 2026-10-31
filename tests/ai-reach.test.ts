import { afterAll, describe, expect, it } from 'vitest';
import { loadGameData } from '../src/engine/data';
import { actingSide, applyAction, newGame } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { createHeuristicAi } from '../src/ai/heuristic';
import { threatMap, updateThreatMap, type ThreatMap } from '../src/ai/reach';
import { ITALY_DATA } from '../src/games/italy43/data';
import { SALERNO_DATA } from '../src/games/salerno43/data';

// The AI keeps the enemy's reach up to date after each of its moves by tracing again only the enemy units whose
// routes pass near the move. That must give exactly what tracing everything afresh gives.
const sameSets = (a: Map<string, Set<string>>, b: Map<string, Set<string>>) =>
  a.size === b.size && [...a].every(([id, x]) => {
    const y = b.get(id);
    return !!y && y.size === x.size && [...x].every((h) => y.has(h));
  });
const sameNumbers = (a: Map<string, number>, b: Map<string, number>) =>
  [...a].every(([h, v]) => Math.abs(v - (b.get(h) ?? 0)) < 1e-9) && [...b].every(([h, v]) => Math.abs(v - (a.get(h) ?? 0)) < 1e-9);

function check(game: string, scenario: string, seed: number, turns: number) {
  loadGameData(game, game === 'italy43' ? ITALY_DATA : SALERNO_DATA);
  const s: GameState = newGame(scenario, seed);
  const ai: Record<Side, ReturnType<typeof createHeuristicAi>> = { Allied: createHeuristicAi('veteran'), German: createHeuristicAi('veteran') };
  let tm: ThreatMap | null = null;
  let key = '';
  let checks = 0;
  for (let k = 0; k < 20000 && s.phase !== 'gameOver' && s.turn <= turns; k++) {
    if (s.phase === 'movement' && !s.pendingDefense && !s.retreatQueue?.length) {
      const phase = `${s.turn}|${s.activeSide}`;
      const full = threatMap(s, s.activeSide);
      tm = tm && key === phase ? updateThreatMap(tm, s, s.activeSide) : full;
      key = phase;
      checks++;
      expect(sameSets(tm.strikeBy, full.strikeBy)).toBe(true);
      expect(sameSets(tm.walkBy, full.walkBy)).toBe(true);
      expect(sameNumbers(tm.strength, full.strength)).toBe(true);
      expect(sameNumbers(tm.walkCount, full.walkCount)).toBe(true);
      expect(tm.reach.size).toBe(full.reach.size);
    }
    applyAction(s, ai[actingSide(s)].nextAction(s) as Action);
  }
  return checks;
}

describe('AI threat map', () => {
  afterAll(() => loadGameData('salerno43', SALERNO_DATA));
  it('updated move by move matches one drawn afresh (Italy 43)', () => {
    expect(check('italy43', 'volturno', 9003, 2)).toBeGreaterThan(40);
  }, 60000);
  it('updated move by move matches one drawn afresh (Salerno 43)', () => {
    expect(check('salerno43', 'short', 9001, 2)).toBeGreaterThan(30);
  }, 60000);
});
