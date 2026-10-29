// Same level on both sides: npx vite-node scripts/balance.ts [games] [level] [scenario]
// With a balanced scenario and an AI that plays both sides equally well this should be near 50/50.
import { alliedVp } from '../src/engine/game';
import { playOut } from '../src/ai/selfplay';
import type { Difficulty } from '../src/ai/heuristic';

const games = Number(process.argv[2] ?? 20);
const level = (process.argv[3] ?? 'elite') as Difficulty;
const scenario = process.argv[4] ?? 'short';
let allied = 0;
let vp = 0;
const early: number[] = [];
for (let g = 0; g < games; g++) {
  const { state } = playOut(scenario, 5000 + g, 40000, {}, { Allied: level, German: level });
  if (state.winner === 'Allied') allied++;
  vp += alliedVp(state);
  if (state.turn < state.lastTurn) early.push(state.turn);
}
console.log(`${level} v ${level}, ${scenario}: Allied wins ${allied}/${games}, mean Allied VP ${(vp / games).toFixed(2)}, ended early ${early.length} (turns ${early.join(',')})`);
