// One game's combat and VP story, for reading what the AI does: npx vite-node scripts/trace.ts <game> <scenario> <seed> [alliedLevel] [germanLevel]
import { loadGameData, MAP } from '../src/engine/data';
import { actingSide, alliedVp, applyAction, newGame, vpBreakdown } from '../src/engine/game';
import type { Action, GameState, Side } from '../src/engine/types';
import { def, sideOf, values } from '../src/engine/units';
import { createHeuristicAi, TUNING, type Difficulty } from '../src/ai/heuristic';
import { createHeuristicAi as createCur } from './b36/heuristic';
import { SALERNO_DATA } from '../src/games/salerno43/data';
import { ITALY_DATA } from '../src/games/italy43/data';
import { distance } from '../src/engine/hex';

const [game = 'italy43', scenario = 'volturno', seed = '7001', al = 'elite', gl = 'elite'] = process.argv.slice(2);
loadGameData(game, game === 'italy43' ? ITALY_DATA : SALERNO_DATA);
if (process.env.TUNE) Object.assign(TUNING, JSON.parse(process.env.TUNE));
const s: GameState = newGame(scenario, Number(seed));
const mk = process.env.AI === 'cur' ? createCur : createHeuristicAi;
const ai: Record<Side, ReturnType<typeof createHeuristicAi>> = { Allied: mk(al as Difficulty), German: mk(gl as Difficulty) };
let k = 0;
let turn = s.turn;
let seen = 0;
const timing = new Map<string, { n: number; ms: number; max: number }>();
let wasHeld = new Set<string>(Object.entries(MAP.hexes).filter(([h, d]) => d.vp && s.control[h] === 'Allied').map(([h]) => h));
const front = () => {
  // How far the Allied front has come: the furthest Allied unit's distance from Naples (2024), and German-held VP hexes next to Allied units.
  const allied = Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === 'Allied').map((u) => (u.where as { hex: string }).hex);
  const vpg = Object.entries(MAP.hexes).filter(([h, d]) => d.vp && s.control[h] !== 'Allied').map(([h]) => h);
  const near = vpg.filter((h) => allied.some((a) => distance(a, h) <= 2));
  // Allied combat units in contact with the Germans, and how far the rest are from them.
  const ger = Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === 'German').map((u) => (u.where as { hex: string }).hex);
  const fighters = Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === 'Allied' && !def(u.id).asu && values(u).attack > 0);
  const gap = fighters.map((u) => Math.min(99, ...ger.map((g) => distance((u.where as { hex: string }).hex, g))));
  const contact = gap.filter((d) => d === 1).length;
  const entry = Object.values(s.units).filter((u) => u.where.kind === 'entry' && sideOf(u) === 'Allied').length;
  const hist = [1, 2, 3, 4, 5].map((k) => gap.filter((d) => (k === 5 ? d >= 5 : d === k)).length).join('/');
  return `allied units ${allied.length} (fighters ${fighters.length}, contact ${contact}, by distance 1/2/3/4/5+ ${hist}, entry ${entry}), German VP hexes within 2: ${near.length} (${near.join(' ')})`;
};
while (s.phase !== 'gameOver' && k++ < 60000) {
  const t0 = performance.now();
  const a = ai[actingSide(s)].nextAction(s) as Action;
  const dt = performance.now() - t0;
  const tk = `${actingSide(s)} ${s.phase}`;
  const tt = timing.get(tk) ?? { n: 0, ms: 0, max: 0 };
  timing.set(tk, { n: tt.n + 1, ms: tt.ms + dt, max: Math.max(tt.max, dt) });
  applyAction(s, a);
  for (const c of s.combats.slice(seen)) {
    console.log(`  T${c.turn} ${c.attackerSide[0]} ${c.phase} @${c.defenderHex} ${c.attack}:${c.defense} ${c.finalColumn} → ${c.result}${c.dd ? ` DD ${c.dd.result}` : ''}`);
  }
  seen = s.combats.length;
  if (s.turn !== turn) {
    const held = Object.entries(MAP.hexes).filter(([h, d]) => d.vp && s.control[h] === 'Allied').map(([h]) => h);
    const gained = held.filter((h) => !wasHeld.has(h));
    const lost = [...wasHeld].filter((h) => !held.includes(h));
    wasHeld = new Set(held);
    const gm = Object.values(s.units).filter((u) => sideOf(u) === 'German');
    const where = (k: string) => gm.filter((u) => u.where.kind === k).length;
    console.log(`end T${turn}: VP ${alliedVp(s)} (${vpBreakdown(s).parts.join(', ')}) · ${front()} · VP hexes Allied: +[${gained.join(' ')}] -[${lost.join(' ')}] · German map ${where('map')} entry ${where('entry')} elim ${where('eliminated')} other ${gm.length - where('map') - where('entry') - where('eliminated')}`);
    turn = s.turn;
  }
}
const heldEnd = Object.entries(MAP.hexes).filter(([h, d]) => d.vp && s.control[h] === 'Allied').map(([h]) => h);
console.log(`final T${s.turn}: VP hexes Allied +[${heldEnd.filter((h) => !wasHeld.has(h)).join(' ')}] · German units by hex: ${Object.values(s.units).filter((u) => u.where.kind === 'map' && sideOf(u) === 'German').map((u) => (u.where as { hex: string }).hex).sort().join(' ')}`);
console.log(s.winner, alliedVp(s), s.victoryNote);
if (process.env.LOSSES) for (const e of s.log) if (e.kind === 'loss' || /artillery|ASU| lost/.test(e.text)) console.log(`  log T${e.turn} ${e.side ?? ''} ${e.phase}: ${e.text.slice(0, 220)}`);
if (process.env.LOSSES) {
  for (const c of s.combats) {
    const guns = c.defenders.filter((id) => def(id).asu);
    if (guns.length) console.log(`  gun-combat T${c.turn} ${c.attackerSide} @${c.defenderHex} ${c.attack}:${c.defense} ${c.finalColumn} ${c.result} | defenders ${c.defenders.map((id) => def(id).name).join('+')} | ${c.notes.join(' ').slice(0, 300)}`);
  }
  for (const u of Object.values(s.units)) if (u.where.kind === 'eliminated' && def(u.id).asu) console.log(`  gun lost: ${def(u.id).name} (${sideOf(u)})`);
}
if (process.env.TIMING) for (const [k, v] of timing) console.log(`  time ${k}: ${v.n} actions, mean ${(v.ms / v.n).toFixed(0)} ms, max ${v.max.toFixed(0)} ms, total ${(v.ms / 1000).toFixed(1)} s`);
