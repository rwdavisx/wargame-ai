// AI-vs-AI games from the command line: npm run selfplay -- [scenario] [seed] [games]
import { alliedVp } from '../src/engine/game';
import { playOut } from '../src/ai/selfplay';

const scenario = process.argv[2] ?? 'short';
const seed = Number(process.argv[3] ?? 1);
const games = Number(process.argv[4] ?? 1);
for (let g = 0; g < games; g++) {
  const t0 = Date.now();
  const { state: s, illegal } = playOut(scenario, seed + g);
  const elim = Object.values(s.units).filter((u) => u.where.kind === 'eliminated');
  console.log(
    `game ${g + 1}: turn ${s.turn} ${s.phase} winner=${s.winner} VP=${alliedVp(s)} combats=${s.combats.length} ` +
      `eliminated=${elim.length} [${elim.map((u) => u.id).join(' ')}] illegal=${illegal.length} ${Date.now() - t0}ms`,
  );
  if (s.victoryNote) console.log('   ', s.victoryNote);
  for (const i of illegal.slice(0, 5)) console.log('    illegal:', i);
}
