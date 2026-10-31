// Italy '43's briefings and role cards, in the program's own words.
import type { Briefing } from '../types';

export const ITALY_ROLES = {
  Allied: 'Fifth Army: force the Volturno, fight through the mountains of the Winter Line, reach the Gustav Line.',
  German: 'Tenth Army: trade ground for time along the rivers and ridges while the Gustav Line is built.',
};

const win = (sc: string) => (sc === 'volturno' ? { vp: 7, turn: 7 } : { vp: 18, turn: 32 });

export const ITALY_BRIEF: Briefing = {
  Allied: {
    title: 'FIFTH ARMY — THE ROAD TO ROME',
    text: [
      'Naples is ours, but the port is wrecked and the Germans have pulled back behind the Volturno. British X Corps holds the coast and US VI Corps the hills inland; reinforcements come in through Naples and the south edge of the map.',
      'Force the river before the autumn rains set in, then fight through the mountain lines the Germans are digging across the peninsula: the Bernhard Line around Monte Camino and San Pietro, and behind it the Gustav Line along the Garigliano and Rapido and below Cassino. The Eighth Army is advancing on the Adriatic side: its zone in the east is closed to you.',
    ],
    goals: (sc) => [
      `Hold at least ${win(sc).vp} VP at the end of turn ${win(sc).turn}.`,
      'From turn 2 keep pace with the benchmark: 5 VP above it (or 20 VP) wins at once, 5 below loses.',
      'VP hexes count only with a supply line back to Naples or a friendly entry area. Each airborne regiment or artillery unit lost costs 1 VP.',
      'The 82nd Airborne garrisons Naples until it is released. Rain stops vehicles at unbridged rivers; mud costs every attack a column.',
    ],
  },
  German: {
    title: 'TENTH ARMY — XIV PANZER CORPS',
    text: [
      'The enemy has taken Naples. Hold him on the Volturno as long as you can, then fall back fighting from ridge to ridge while the engineers fortify the Bernhard and Gustav Lines. Every turn you buy costs him dearly in the mud and the mountains.',
      'Divisions will be pulled away to other fronts on a fixed schedule, so spend your strength carefully. The 15th Panzergrenadiers guard the Gulf of Gaeta and wake only when the enemy comes near or crosses the Volturno, and a unit must always hold Formia.',
    ],
    goals: (sc) => [
      `Keep the Allies below ${win(sc).vp} VP at the end of turn ${win(sc).turn}.`,
      'From turn 2, if the Allies fall 5 VP below the benchmark you win at once.',
      ...(sc === 'volturno' ? [] : ['Each turn your engineers may start or complete one fortification: start all eight Level 1 forts before you complete any. Level 2 forts go on or behind the Gustav Line.']),
      'As the British Eighth Army advances, its zone passes to the Allies on turns 8, 11 and 15: your units still there fall back, disrupted.',
    ],
  },
};
