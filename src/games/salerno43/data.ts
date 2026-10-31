// Salerno '43's tables, map and counters as the engine loads them. No engine code here: the engine's data layer
// imports this as its default game, and the game registry offers it on the home screen.
import map from '../../../data/salerno43/map.json';
import rules from '../../../data/salerno43/rules.json';
import oob from '../../../data/salerno43/oob.json';
import type { GameData } from '../types';

export const SALERNO_DATA: GameData = {
  map,
  rules,
  oob,
  units: {
    // Formations that are not divisions (a unit in one has no division for the combat shifts).
    independentFormations: ['VI Corps', 'X Corps', '23 Armd Bde', 'Coastal', 'LXXVI Pz', 'XIV Pz', 'Remnant', '1 CN Armd Bde'],
    tankDestroyers: ['US-601', 'US-636', 'US-645'],
    // Units that belong to no division although their formation is one (2/509 fights independently).
    noDivision: ['US-2-509'],
  },
};
