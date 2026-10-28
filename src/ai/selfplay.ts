import { applyAction, newGame } from '../engine/game';
import type { GameState } from '../engine/types';
import { createHeuristicAi } from './heuristic';

/** Plays a whole game with the heuristic AI on both sides. */
export function playOut(scenario: string, seed: number, maxActions = 20000): { state: GameState; illegal: string[] } {
  const s = newGame(scenario, seed);
  const ai = { Allied: createHeuristicAi(), German: createHeuristicAi() };
  const illegal: string[] = [];
  let n = 0;
  while (s.phase !== 'gameOver' && n++ < maxActions) {
    const a = ai[s.activeSide].nextAction(s) as ReturnType<ReturnType<typeof createHeuristicAi>['nextAction']> & object;
    try {
      applyAction(s, a as any);
    } catch (e) {
      illegal.push(`T${s.turn} ${s.activeSide} ${s.phase}: ${JSON.stringify(a)}: ${(e as Error).message}`);
      applyAction(s, { type: 'endPhase' });
    }
  }
  return { state: s, illegal };
}
