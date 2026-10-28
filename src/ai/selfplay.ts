import { actingSide, applyAction, newGame } from '../engine/game';
import type { Action, GameState } from '../engine/types';
import { createHeuristicAi } from './heuristic';

/** Plays a whole game with the heuristic AI on both sides. */
export function playOut(scenario: string, seed: number, maxActions = 30000): { state: GameState; illegal: string[] } {
  const s = newGame(scenario, seed);
  const ai = { Allied: createHeuristicAi(), German: createHeuristicAi() };
  const illegal: string[] = [];
  let n = 0;
  while (s.phase !== 'gameOver' && n++ < maxActions) {
    const side = actingSide(s);
    const a = ai[side].nextAction(s) as Action;
    try {
      applyAction(s, a);
    } catch (e) {
      illegal.push(`T${s.turn} ${side} ${s.phase}: ${JSON.stringify(a)}: ${(e as Error).message}`);
      if (s.pendingDefense) applyAction(s, { type: 'defend', choice: 'retreat' });
      else if (s.pendingAdvance) applyAction(s, { type: 'advance', unitIds: [] });
      else applyAction(s, { type: 'endPhase' });
    }
  }
  return { state: s, illegal };
}
