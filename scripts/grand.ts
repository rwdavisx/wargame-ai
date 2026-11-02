// The grand campaign played AI against AI, with a line per turn: npx vite-node scripts/grand.ts [scenario] [seed] [lastTurn]
// (GAME=italy43 or salerno43 plays one of the printed games instead). TUNE, TUNE_A and TUNE_G (JSON) change the AI's
// weights (TUNING in src/ai/heuristic.ts) for both sides, the Allies or the Germans.
import { loadGameData, MAP, RULES } from '../src/engine/data';
import { actingSide, alliedVp, applyAction, benchmark, newGame } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { def, sideOf } from '../src/engine/units';
import { createHeuristicAi, TUNING } from '../src/ai/heuristic';
import { GRAND_DATA } from '../src/games/grand43/data';
import { ITALY_DATA } from '../src/games/italy43/data';
import { SALERNO_DATA } from '../src/games/salerno43/data';

const [scenario = 'race', seed = '11', stop = '99'] = process.argv.slice(2);
const game = process.env.GAME ?? 'grand43';
loadGameData(game, game === 'italy43' ? ITALY_DATA : game === 'salerno43' ? SALERNO_DATA : GRAND_DATA);
// NOAUTO=1: play to the last turn whatever the benchmark says (for balancing).
if (process.env.NOAUTO) (RULES as { automaticMargin: number }).automaticMargin = 999;
const s: GameState = newGame(scenario, Number(seed));
const weights = (side: string) => ({ ...TUNING, ...JSON.parse(process.env.TUNE ?? '{}'), ...JSON.parse(process.env[`TUNE_${side}`] ?? '{}') });
const tuned = (w: typeof TUNING, p: ReturnType<typeof createHeuristicAi>) => ({ nextAction: (st: GameState) => (Object.assign(TUNING, w), p.nextAction(st)) });
const ai: Record<Side, { nextAction(s: GameState): unknown }> = {
  Allied: tuned(weights('A'), createHeuristicAi('elite')), German: tuned(weights('G'), createHeuristicAi('elite')),
};
const illegal: string[] = [];
let k = 0;
let turn = s.turn;
let t0 = Date.now();
const line = () => {
  const on = (side: Side) => Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side).length;
  const elim = (side: Side) => Object.values(s.units).filter((u) => u.where.kind === 'eliminated' && sideOf(u) === side).length;
  const held = Object.entries(MAP.hexes).filter(([h, d]) => d.vp && s.control[h] === 'Allied').map(([h]) => h);
  console.log(`T${turn} VP ${alliedVp(s)} (bench ${benchmark(turn)}) on map A${on('Allied')} G${on('German')} lost A${elim('Allied')} G${elim('German')} ` +
    `held ${held.length} illegal ${illegal.length} ${Date.now() - t0}ms`);
  t0 = Date.now();
};
while (s.phase !== 'gameOver' && k++ < 200000 && s.turn <= Number(stop)) {
  const side = actingSide(s);
  const a = ai[side].nextAction(s) as Action;
  try {
    applyAction(s, a);
  } catch (e) {
    illegal.push(`T${s.turn} ${side} ${s.phase}: ${JSON.stringify(a)}: ${(e as Error).message}`);
    if (illegal.length < 8) console.log('illegal', illegal[illegal.length - 1]);
    if (s.retreatQueue?.length) applyAction(s, { type: 'retreatChoice', index: 0 });
    else if (s.pendingDefense) applyAction(s, { type: 'defend', choice: 'retreat' });
    else if (s.breakthrough) applyAction(s, { type: 'btEnd' });
    else if (s.pendingAdvance) applyAction(s, { type: 'advance', unitIds: [] });
    else applyAction(s, { type: 'endPhase' });
  }
  if (s.turn !== turn) {
    line();
    turn = s.turn;
  }
}
line();
console.log(s.winner, s.victoryNote ?? '');
const lostGuns = (side: Side) => Object.values(s.units).filter((u) => u.where.kind === 'eliminated' && sideOf(u) === side && def(u.id).asu).length;
console.log(`guns lost: German ${lostGuns('German')}, Allied ${lostGuns('Allied')}`);
if (process.env.LOG) for (const e of s.log.slice(-Number(process.env.LOG))) console.log(`  ${e.text}`);
