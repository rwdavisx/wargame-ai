// One game's log, new AI against the baseline: npx vite-node scripts/duel.ts [seed] [newSide] [level] [--moves]
import { actingSide, alliedVp, applyAction, newGame } from '../src/engine/game';
import type { Action, Side } from '../src/engine/types';
import { createHeuristicAi, type Difficulty } from '../src/ai/heuristic';
import { createHeuristicAi as createBaseline } from './baseline/heuristic';

const seed = Number(process.argv[2] ?? 1000);
const newSide = (process.argv[3] ?? 'Allied') as Side | 'both';
const level = (process.argv[4] ?? 'elite') as Difficulty;
const showMoves = process.argv.includes('--moves');
const s = newGame('short', seed);
const ai = {
  Allied: newSide === 'Allied' || newSide === 'both' ? createHeuristicAi(level) : createBaseline(),
  German: newSide === 'German' || newSide === 'both' ? createHeuristicAi(level) : createBaseline(),
};
let n = 0;
while (s.phase !== 'gameOver' && n++ < 40000) applyAction(s, ai[actingSide(s)].nextAction(s) as Action);
for (const l of s.log) {
  if ((l.kind === 'move' && !showMoves) || l.phase === 'weather') continue;
  console.log(`T${l.turn} ${l.side ?? '-'} ${l.phase}: ${l.text}`);
}
console.log('VP', alliedVp(s), s.winner, s.victoryNote);
