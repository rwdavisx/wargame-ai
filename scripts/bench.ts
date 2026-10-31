// How well the heuristic AI plays a game and scenario, for tuning it on both maps:
//   npx vite-node scripts/bench.ts <game> <scenario> <games> <alliedLevel> <germanLevel> [seed0]
// Prints each game's winner, the Allied VP against the benchmark turn by turn, losses and time.
import { loadGameData, MAP } from '../src/engine/data';
import { actingSide, alliedVp, applyAction, benchmark, newGame } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { def, sideOf } from '../src/engine/units';
import { createHeuristicAi, TUNING, type Difficulty } from '../src/ai/heuristic';
import { SALERNO_DATA } from '../src/games/salerno43/data';
import { ITALY_DATA } from '../src/games/italy43/data';

const [game = 'italy43', scenario = 'volturno', n = '4', al = 'elite', gl = 'elite', seed0 = '7000'] = process.argv.slice(2);
loadGameData(game, game === 'italy43' ? ITALY_DATA : SALERNO_DATA);
if (process.env.TUNE) Object.assign(TUNING, JSON.parse(process.env.TUNE));

function play(seed: number) {
  const s: GameState = newGame(scenario, seed);
  const ai: Record<Side, ReturnType<typeof createHeuristicAi>> = { Allied: createHeuristicAi(al as Difficulty), German: createHeuristicAi(gl as Difficulty) };
  const curve: string[] = [];
  let lastTurn = s.turn;
  let illegal = 0;
  let k = 0;
  const t0 = Date.now();
  while (s.phase !== 'gameOver' && k++ < 60000) {
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
    if (s.turn !== lastTurn) {
      const b = benchmark(lastTurn);
      curve.push(`${lastTurn}:${alliedVp(s)}${b !== null ? `/${b}` : ''}`);
      lastTurn = s.turn;
    }
  }
  const lost = (side: Side) => Object.values(s.units).filter((u) => sideOf(u) === side && u.where.kind === 'eliminated' && !def(u.id).isRemnant).length;
  const steps = (side: Side) => Object.values(s.units).filter((u) => sideOf(u) === side).reduce((a, u) => a + (u.where.kind === 'eliminated' ? def(u.id).steps.length : u.stepsLost), 0);
  const vpHexes = Object.entries(MAP.hexes).filter(([, d]) => d.vp).map(([h]) => h);
  const alliedHeld = vpHexes.filter((h) => s.control[h] === 'Allied').length;
  return {
    seed, winner: s.winner, turn: s.turn, vp: alliedVp(s), note: s.victoryNote, illegal, curve: curve.join(' '),
    lost: `A ${lost('Allied')} units/${steps('Allied')} steps · G ${lost('German')} units/${steps('German')} steps`,
    held: `${alliedHeld}/${vpHexes.length} VP hexes Allied`, combats: s.combats.length, secs: Math.round((Date.now() - t0) / 1000),
  };
}

let aw = 0;
for (let i = 0; i < Number(n); i++) {
  const r = play(Number(seed0) + i);
  if (r.winner === 'Allied') aw++;
  console.log(`${game}/${scenario} ${al}(A) v ${gl}(G) seed ${r.seed}: ${r.winner} T${r.turn} VP ${r.vp} | ${r.curve} | ${r.lost} | ${r.held} | ${r.combats} combats | illegal ${r.illegal} | ${r.secs}s`);
  console.log(`   ${r.note}`);
}
console.log(`Allied wins ${aw}/${n}`);
