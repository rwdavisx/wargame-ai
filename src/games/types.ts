// What a game in the system provides: its map, its tables and its counters (as JSON, in the shapes data/salerno43
// uses), plus the few facts about units that the counters do not print.
export interface GameData {
  map: unknown;
  rules: unknown;
  oob: unknown;
  units: {
    independentFormations: string[];
    tankDestroyers: string[];
    noDivision?: string[];
  };
}

type Side = 'Allied' | 'German';

/** The briefing shown before play: a title, a few paragraphs and the objectives for a scenario. */
export type Briefing = Record<Side, { title: string; text: string[]; goals: (scenario: string) => string[] }>;
