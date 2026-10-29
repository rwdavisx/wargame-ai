// The working AI on one side against the frozen reference (scripts/ref, same level) on the other:
//   npx vite-node scripts/vsref.ts [games] [side: Allied|German] [level]
import { actingSide, alliedVp, applyAction, newGame } from '../src/engine/game';
import type { Action, Side } from '../src/engine/types';
import { createHeuristicAi, type Difficulty } from '../src/ai/heuristic';
import { createHeuristicAi as createRef } from './ref/heuristic';

const games = Number(process.argv[2] ?? 20);
const side = (process.argv[3] ?? 'Allied') as Side;
const level = (process.argv[4] ?? 'elite') as Difficulty;
let wins = 0;
let vp = 0;
for (let g = 0; g < games; g++) {
  const s = newGame('short', 5000 + g);
  const ai = side === 'Allied' ? { Allied: createHeuristicAi(level), German: createRef(level) } : { Allied: createRef(level), German: createHeuristicAi(level) };
  let n = 0;
  while (s.phase !== 'gameOver' && n++ < 40000) applyAction(s, ai[actingSide(s)].nextAction(s) as Action);
  if (s.winner === side) wins++;
  vp += alliedVp(s);
}
console.log(`working ${side} v reference: ${side} wins ${wins}/${games}, mean Allied VP ${(vp / games).toFixed(2)}`);
