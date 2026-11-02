// The grand campaign's briefings and role cards, in the program's own words.
import { RULES, SCENARIOS } from '../../engine/data';
import type { Briefing } from '../types';

export const GRAND_ROLES = {
  Allied: 'Fifth and Eighth Armies: land at Salerno, take Naples and the Foggia airfields, then break the Winter Line on both coasts.',
  German: 'Tenth Army: fight the landing, then fall back across the peninsula from river to ridge while the Gustav Line is built.',
};

const win = (sc: string) => ({ vp: RULES.scenarioWin[sc] ?? 0, turn: SCENARIOS[sc]?.lastTurn ?? 0 });
const when = (t: number) => (RULES.turnDates?.[String(t)] ? `turn ${t} (${RULES.turnDates[String(t)]})` : `turn ${t}`);

export const GRAND_BRIEF: Briefing = {
  Allied: {
    title: 'FIFTH AND EIGHTH ARMIES — FROM AVALANCHE TO THE SANGRO',
    text: [
      'All of southern Italy on one map, from the Pontine Marshes and the Abruzzo to Potenza and the Foggia plain. On 9 September the Fifth Army comes ashore in the Gulf of Salerno; the Eighth Army, already across the Strait of Messina, is coming up from Calabria, Taranto and Bari and reaches the map from the south from 19 September. In September a turn is a day, as in Salerno ’43; from October two or three days, as in Italy ’43.',
      'Hold the beachhead, then take Naples and its port and the Foggia airfields. After them come the rivers and the mountains: the Volturno, the Trigno and the Sangro, the Bernhard positions round Monte Camino and San Pietro, Ortona on the Adriatic, and behind them the Gustav Line and Cassino. Victory points are counted for both fronts together, against the pace of 1943.',
    ],
    goals: (sc) => [
      `Hold at least ${win(sc).vp} VP at the end of ${when(win(sc).turn)}.`,
      `From ${when(RULES.automaticFromTurn)} keep pace with the benchmark: ${RULES.automaticMargin} VP above it wins at once, ${RULES.automaticMargin} below loses. September's landing battle is fought out whatever the count.`,
      'VP hexes count only with a supply line. Worth the most: the Via Casilina above Aquino (5), Naples and Terracina (4), Foggia, Pescara and Atina (3); Salerno, Avellino, Termoli, Campobasso, Ortona, Chieti, Sulmona, Cassino and Frosinone 2 each.',
      ...(sc === 'winter' ? [] : ['Day 1 is the landing: each beach rolls on the Invasion table. Later waves come by sea through the Floating Reserve to a beachhead or a port you hold. In September a turn is a day.']),
      'Naples, once taken, is your port: reinforcements due there come straight onto the map; until then they come by sea.',
    ],
  },
  German: {
    title: 'TENTH ARMY — XIV AND LXXVI PANZER CORPS',
    text: [
      'The Italians have gone over to the enemy and the Anglo-Americans are landing in the Gulf of Salerno. The 16th Panzer Division holds the hills above the beaches; the Hermann Göring and 15th Panzergrenadier Divisions are round Naples and the Gulf of Gaeta; the 26th Panzer, 29th Panzergrenadier and 1st Parachute Divisions are coming up from Calabria and Apulia ahead of the British Eighth Army.',
      'Strike the beachhead while it is weak. When it holds, give ground for time: the Volturno and the Trigno, then the Bernhard and Gustav positions from the Garigliano to Ortona, which your engineers are building. Divisions leave for other fronts, and others arrive from the north, on a fixed schedule.',
    ],
    goals: (sc) => [
      `Keep the Allies below ${win(sc).vp} VP at the end of ${when(win(sc).turn)}.`,
      `From ${when(RULES.automaticFromTurn)}, if the Allies fall ${RULES.automaticMargin} VP below the benchmark, you win at once.`,
      'The 16th Panzer Division leaves for Russia in mid-November; the 65th, 90th Panzergrenadier and 334th Divisions come to the Adriatic, the 94th, 305th, 44th and 5th Mountain to the west.',
      'Each turn your engineers may start or complete one fortification. The Eighth Army takes the south-edge entry areas as it comes up: units still waiting there are lost.',
    ],
  },
};
