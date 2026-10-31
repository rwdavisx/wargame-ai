// The AI in src/ai against a frozen copy of build 36's (scripts/b36), from both sides, on either game:
//   npx vite-node scripts/vs.ts <game> <scenario> <games> [level] [seed0]
// Prints the new AI's results as the Allies and as the Germans, and the mean Allied VP in each pairing.
import { loadGameData } from '../src/engine/data';
import { actingSide, alliedVp, applyAction, newGame } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { createHeuristicAi, TUNING, type Difficulty } from '../src/ai/heuristic';
import { createHeuristicAi as createCur } from './b36/heuristic';
import { SALERNO_DATA } from '../src/games/salerno43/data';
import { ITALY_DATA } from '../src/games/italy43/data';

const [game = 'italy43', scenario = 'volturno', n = '6', level = 'elite', seed0 = '9000'] = process.argv.slice(2);
loadGameData(game, game === 'italy43' ? ITALY_DATA : SALERNO_DATA);
// TUNE (JSON) changes the tested AI's weights; OPP=new plays it against the current AI on its default weights instead
// of the frozen one. The weights are set before each side's move, as the two share them.
const DEFAULT = { ...TUNING };
const TEST = { ...TUNING, ...(process.env.TUNE ? JSON.parse(process.env.TUNE) : {}) };
type P = { nextAction(s: GameState): unknown };
const tuned = (t: typeof TUNING, ai: P): P => ({ nextAction: (s) => (Object.assign(TUNING, t), ai.nextAction(s)) });

function play(seed: number, allied: { nextAction(s: GameState): unknown }, german: { nextAction(s: GameState): unknown }) {
  const s: GameState = newGame(scenario, seed);
  const ai: Record<Side, { nextAction(s: GameState): unknown }> = { Allied: allied, German: german };
  let k = 0;
  let illegal = 0;
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
  }
  return { winner: s.winner, vp: alliedVp(s), illegal };
}

const L = level as Difficulty;
// BASE=1 plays the frozen AI against itself on the same seeds, for a reference.
const mk = (l: Difficulty): P => (process.env.BASE ? createCur(l) : tuned(TEST, createHeuristicAi(l)));
const opp = (l: Difficulty): P => (process.env.OPP === 'new' ? tuned(DEFAULT, createHeuristicAi(l)) : createCur(l));
const res = { newA: 0, newG: 0, vpNewA: 0, vpNewG: 0, ill: 0 };
for (let i = 0; i < Number(n); i++) {
  const seed = Number(seed0) + i;
  const a = play(seed, mk(L), opp(L));
  const g = play(seed, opp(L), mk(L));
  if (a.winner === 'Allied') res.newA++;
  if (g.winner === 'German') res.newG++;
  res.vpNewA += a.vp;
  res.vpNewG += g.vp;
  res.ill += a.illegal + g.illegal;
  console.log(`seed ${seed}: new Allies ${a.winner} (VP ${a.vp}) · new Germans ${g.winner} (VP ${g.vp})`);
}
const N = Number(n);
console.log(`${game}/${scenario} ${level}: new AI wins ${res.newA}/${N} as Allies (mean VP ${(res.vpNewA / N).toFixed(1)}), ${res.newG}/${N} as Germans (mean Allied VP ${(res.vpNewG / N).toFixed(1)}); illegal ${res.ill}`);
