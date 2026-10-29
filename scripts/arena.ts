// New AI against the frozen baseline AI (scripts/baseline), from both sides:
//   npx vite-node scripts/arena.ts [games] [scenario] [difficulty]
import { actingSide, alliedVp, applyAction, newGame } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { def } from '../src/engine/units';
import { createHeuristicAi, type AiPlayer } from '../src/ai/heuristic';
import { createHeuristicAi as createOld } from './baseline/heuristic';
import { createHeuristicAi as createRef } from './ref/heuristic';
// Opponent: the original AI ('base') or a frozen copy of a stronger one ('ref', Elite).
const createBaseline = () => (process.argv[6] === 'ref' ? createRef('elite') : createOld());

const games = Number(process.argv[2] ?? 10);
const scenario = process.argv[3] ?? 'short';
const level = (process.argv[4] ?? 'elite') as Parameters<typeof createHeuristicAi>[0];
const only = process.argv[5] ?? 'both';

function play(seed: number, allied: AiPlayer, german: AiPlayer) {
  const s: GameState = newGame(scenario, seed);
  const ai: Record<Side, AiPlayer> = { Allied: allied, German: german };
  let n = 0;
  let illegal = 0;
  while (s.phase !== 'gameOver' && n++ < 40000) {
    const a = ai[actingSide(s)].nextAction(s) as Action;
    try {
      applyAction(s, a);
    } catch {
      illegal++;
      if (s.retreatQueue?.length) applyAction(s, { type: 'retreatChoice', index: 0 });
      else if (s.pendingDefense) applyAction(s, { type: 'defend', choice: 'retreat' });
      else if (s.breakthrough) applyAction(s, { type: 'btEnd' });
      else if (s.pendingAdvance) applyAction(s, { type: 'advance', unitIds: [] });
      else applyAction(s, { type: 'endPhase' });
    }
  }
  const lost = (side: Side) => Object.values(s.units).filter((u) => (u.id.startsWith('GE') ? 'German' : 'Allied') === side)
    .reduce((a, u) => a + (u.where.kind === 'eliminated' ? 1 : 0), 0);
  const asuLost = (side: Side) => Object.values(s.units).filter((u) => def(u.id).asu && def(u.id).side === side && u.where.kind === 'eliminated').length;
  const bhLost = Object.values(s.units).filter((u) => def(u.id).cat === 'bh' && u.where.kind === 'eliminated').length;
  return { winner: s.winner, vp: alliedVp(s), turn: s.turn, illegal, alliedLost: lost('Allied'), germanLost: lost('German'), asuA: asuLost('Allied'), asuG: asuLost('German'), bh: bhLost };
}

type R = ReturnType<typeof play>;
const sum = (rs: R[], label: string, good: 'Allied' | 'German') => {
  const wins = rs.filter((r) => r.winner === good).length;
  const vp = rs.reduce((a, r) => a + r.vp, 0) / rs.length;
  const al = rs.reduce((a, r) => a + r.alliedLost, 0) / rs.length;
  const gl = rs.reduce((a, r) => a + r.germanLost, 0) / rs.length;
  const il = rs.reduce((a, r) => a + r.illegal, 0);
  const m = (k: 'asuA' | 'asuG' | 'bh') => (rs.reduce((a, r) => a + r[k], 0) / rs.length).toFixed(1);
  console.log(`${label.padEnd(34)} ${good} wins ${wins}/${rs.length}  mean Allied VP ${vp.toFixed(2)}  units lost A ${al.toFixed(1)} G ${gl.toFixed(1)}  ASU lost A ${m('asuA')} G ${m('asuG')}  BH lost ${m('bh')}  illegal ${il}`);
};

const t0 = Date.now();
const base: R[] = [], newA: R[] = [], newG: R[] = [];
for (let g = 0; g < games; g++) {
  const seed = 1000 + g;
  if (only === 'both') base.push(play(seed, createBaseline(), createBaseline()));
  if (only !== 'German') newA.push(play(seed, createHeuristicAi(level), createBaseline()));
  if (only !== 'Allied') newG.push(play(seed, createBaseline(), createHeuristicAi(level)));
}
if (base.length) sum(base, 'baseline v baseline', 'Allied');
if (newA.length) sum(newA, `new Allied (${level}) v baseline`, 'Allied');
if (newG.length) sum(newG, `baseline v new German (${level})`, 'German');
console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`);
