// Prints the log of one AI-vs-AI game: npx vite-node scripts/gamelog.ts [scenario] [seed] [--moves]
import { playOut } from '../src/ai/selfplay';

const scenario = process.argv[2] ?? 'short';
const seed = Number(process.argv[3] ?? 1);
const showMoves = process.argv.includes('--moves');
const { state: s } = playOut(scenario, seed);
for (const l of s.log) {
  if (l.kind === 'move' && !showMoves) continue;
  console.log(`T${l.turn} ${l.side ?? '-'} ${l.phase}: ${l.text}`);
}
console.log('--- final positions');
for (const u of Object.values(s.units)) {
  if (u.where.kind === 'map') console.log(u.id.padEnd(10), u.where.hex, u.stepsLost ? `-${u.stepsLost}` : '', u.disrupted ? 'disrupted' : '', u.outOfSupply ? 'OOS' : '');
}
