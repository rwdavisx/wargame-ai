// Salerno '43's briefings and role cards, in the program's own words.
import type { Briefing } from '../types';

export const SALERNO_ROLES = {
  Allied: 'Fifth Army: land on the beaches, take Salerno and the plain, break out for Naples.',
  German: 'Tenth Army: counterattack the beachhead, then hold the hills and the roads north.',
};

export const SALERNO_BRIEF: Briefing = {
  Allied: {
    title: 'FIFTH ARMY — OPERATION AVALANCHE',
    text: [
      'Italy surrendered last night, but the Germans did not. As dawn breaks on 9 September, British X Corps and US VI Corps are coming ashore on the beaches of the Gulf of Salerno, with Rangers and Commandos landing on the Sorrento peninsula to seize the passes to Naples.',
      'The 16th Panzer Division holds the hills above the beaches and more German divisions are already on the roads from the north and from Calabria. Get the corps ashore, join them up, take Salerno, Battipaglia and the Montecorvino airfield, and keep the beachheads open until the Eighth Army arrives from the south.',
    ],
    goals: (sc) => [
      sc === 'short' ? 'Hold at least 8 VP at the end of day 8.' : 'Hold at least 20 VP at the end of day 22.',
      'From day 4 keep pace with the daily benchmark: 5 VP above it (or 20 VP) wins at once, 5 below loses.',
      'VP hexes count only while they are in supply. Each beachhead, airborne regiment or artillery unit lost costs 1 VP.',
      'Break out to the north edge with strong forces for 5 (N1) and 4 (N2) VP.',
    ],
  },
  German: {
    title: 'TENTH ARMY — XIV PANZER CORPS',
    text: [
      'The Anglo-Americans are landing in the Gulf of Salerno. The 16th Panzer Division is spread thin along the coast; the Hermann Göring and 15th Panzergrenadier Divisions are coming down from Naples, and 26th Panzer and 29th Panzergrenadier are racing up from Calabria ahead of the British Eighth Army.',
      'Strike the beachheads before the enemy is fully ashore and drive him back into the sea. If that fails, hold the ring of hills and the roads to Naples for as long as you can.',
    ],
    goals: (sc) => [
      sc === 'short' ? 'Keep the Allies below 8 VP at the end of day 8.' : 'Keep the Allies below 20 VP at the end of day 22.',
      'From day 4, if the Allies fall 5 VP below the daily benchmark you win at once.',
      'Every beachhead you destroy costs the Allies a VP and closes a supply source.',
      ...(sc === 'campaign' ? ['From day 16 you may abandon the Eighth Army sector to shorten your line.'] : []),
    ],
  },
};
