// The games this system plays. Each provides its map, tables and counters; choosing one on the home screen loads
// its data into the engine (src/engine/data.ts) before any game of it is started or resumed.
import { GAME_ID, loadGameData } from '../engine/data';
import { SALERNO_DATA } from './salerno43/data';
import type { GameData } from './types';

export interface GameInfo {
  id: string;
  /** Title as printed on the box, e.g. "SALERNO '43". */
  title: string;
  /** The game's name in running text, e.g. "Salerno ’43". */
  name: string;
  /** The line above the title. */
  kicker: string;
  /** The span of the campaign. */
  dates: string;
  blurb: string;
  /** 'preparing': the system knows the game but its map or counters are not entered yet, so it cannot be played. */
  status: 'ready' | 'preparing';
  /** For a game in preparation: what is in and what is still needed. */
  progress?: { done: string[]; todo: string[] };
  data?: GameData;
}

export const GAMES: GameInfo[] = [
  {
    id: 'salerno43',
    title: "SALERNO '43",
    name: 'Salerno ’43',
    kicker: 'OPERATION AVALANCHE',
    dates: '9 – 30 SEPTEMBER 1943',
    blurb: 'The Allied landings in the Gulf of Salerno and the German counterattacks on the beachhead.',
    status: 'ready',
    data: SALERNO_DATA,
  },
  {
    id: 'italy43',
    title: "ITALY '43",
    name: 'Italy ’43',
    kicker: "FIFTH ARMY'S ADVANCE TO THE GUSTAV LINE",
    dates: '1 OCTOBER – 31 DECEMBER 1943',
    blurb: 'From Naples across the Volturno to the Bernhard Line and the approaches to Cassino.',
    status: 'preparing',
    progress: {
      done: ['Rulebook read and compared with Salerno ’43', 'Combat, Determined Defense, isolation, rally and disengagement tables', 'Terrain effects', 'Weather track, replacements and victory benchmarks for all 32 turns'],
      todo: ['Counters from the four set-up cards (being entered)', 'The map, hex by hex', 'Counter backs (reduced sides)', 'The Italy ’43 rules that differ from Salerno ’43'],
    },
  },
];

export const gameInfo = (id: string): GameInfo => GAMES.find((g) => g.id === id) ?? GAMES[0];
export const playable = (id: string): boolean => gameInfo(id).status === 'ready' && !!gameInfo(id).data;

/** Load a game's data into the engine (does nothing when it is already loaded or cannot be played yet). */
export function selectGame(id: string): string {
  const g = playable(id) ? gameInfo(id) : GAMES[0];
  if (g.id !== GAME_ID) loadGameData(g.id, g.data!);
  return g.id;
}
