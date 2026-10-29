// Where the Allied VPs come from at the end of reference-vs-reference games (both sides scripts/ref at a level).
import { actingSide, applyAction, newGame, vpBreakdown } from '../src/engine/game';
import type { Action } from '../src/engine/types';
import { createHeuristicAi as createRef } from './ref/heuristic';
import { createHeuristicAi } from '../src/ai/heuristic';

const games = Number(process.argv[2] ?? 30);
const who = process.argv[3] ?? 'ref';
const tally = new Map<string, number>();
let total = 0;
for (let g = 0; g < games; g++) {
  const s = newGame('short', 5000 + g);
  const mk = who === 'ref' ? createRef : createHeuristicAi;
  const ai = { Allied: mk('elite'), German: createRef('elite') };
  let n = 0;
  while (s.phase !== 'gameOver' && n++ < 40000) applyAction(s, ai[actingSide(s)].nextAction(s) as Action);
  const b = vpBreakdown(s);
  total += b.total;
  for (const p of b.parts) {
    const m = p.match(/^(.*) ([+-]\d+)$/);
    if (!m) continue;
    const key = m[1].includes('artillery') || m[1].includes('Nebelwerfer') ? (m[2].startsWith('+') ? 'German ASU killed' : 'Allied ASU lost') : m[1].includes('Beach Group') || m[1].includes('Shore Rgt') ? 'BH lost' : m[1];
    tally.set(key, (tally.get(key) ?? 0) + Number(m[2]));
  }
}
console.log('mean Allied VP', (total / games).toFixed(2));
for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(k.padEnd(28), (v / games).toFixed(2));
