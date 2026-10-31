// Italy '43: the map, tables and counters (data/italy43), and how its counters belong to formations.
import map from '../../../data/italy43/map.json';
import oob from '../../../data/italy43/oob.json';
import rules from '../../../data/italy43/rules.json';
import type { GameData } from '../types';

export const ITALY_DATA: GameData = {
  map,
  rules,
  oob,
  units: {
    // Units in a white box belong to no division (8.4.4); the Remnants with a coloured box keep their formation.
    independentFormations: ['Independent'],
    tankDestroyers: ['US-601', 'US-636', 'US-645', 'US-776'],
  },
};
