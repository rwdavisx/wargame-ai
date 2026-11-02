// The grand campaign: Salerno '43's and Italy '43's maps joined and carried across to the Adriatic, both games'
// counters and the Eighth Army's on one turn track (data/grand43, built by tools/grand).
import map from '../../../data/grand43/map.json';
import oob from '../../../data/grand43/oob.json';
import rules from '../../../data/grand43/rules.json';
import type { GameData } from '../types';

export const GRAND_DATA: GameData = {
  map,
  rules,
  oob,
  units: {
    // Formations that are not divisions: corps troops, independent brigades and battalions, the remnants.
    independentFormations: ['Independent', 'independent', 'VI Corps', 'X Corps', '10 Corps', 'II Corps', '13 Corps', '5 Corps', '23 Armd Bde',
      '23 Arm Bde', '4 Armd Bde', '4 NZ Armd Bde', '1 CN Armd Bde', 'Coastal', 'LXXVI Pz', 'XIV Pz', 'XIV Pz Corps', 'Remnant',
      'Commando Bde', 'Special Service Bde'],
    tankDestroyers: ['US-601', 'US-636', 'US-645', 'US-776'],
    noDivision: ['US-2-509'],
  },
};
