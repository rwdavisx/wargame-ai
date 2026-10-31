import { GAME_ID } from '../engine/data';
import type { GameState, Side } from '../engine/types';
import type { Difficulty } from '../ai/heuristic';

/** 'remote': another player, on another device, in an online game. */
export type Controller = 'human' | 'heuristic' | 'claude' | 'remote';
/** 'rts': left-click selects, right-click moves and attacks. 'classic': left-click does everything, right-click backs out. */
export type MouseControls = 'rts' | 'classic';

export interface Settings {
  controllers: Record<Side, Controller>;
  aiDelayMs: number;
  claudeApiKey: string;
  claudeModel: string;
  noticeDismissed: boolean;
  defensiveAir: Record<Side, 'auto' | 'always' | 'never'>;
  sound: boolean;
  volume: number;
  followAi: boolean;
  /** Animation duration multiplier (0.5 fast to 1.5 slow). */
  animSpeed: number;
  /** Combats you take part in: step through them and roll the die yourself, or just show the result. */
  combatDice: 'watch' | 'quick';
  showGrid: boolean;
  showLabels: boolean;
  mouseControls: MouseControls;
  /** Ready-to-act cues, odds on targets and movement left on the map. */
  showCues: boolean;
  /** Map mode: normal, supply, control, zoc, support, terrain or stacking (see mapModes.ts). */
  mapMode: string;
  /** Map layers that can be switched off from the map bar. */
  showUnits: boolean;
  showMarkers: boolean;
  showHexIds: boolean;
  /** Background music on or off, and its volume (0..1), separate from the sound effects. */
  music: boolean;
  musicVolume: number;
  /** How well the built-in computer opponent plays. */
  aiLevel: Difficulty;
  /** The game of the series chosen on the home screen. */
  game: string;
  /** Before a phase ends, list overstacks, units cut off, open objectives and good attacks not taken. */
  endChecks: boolean;
  /** Online: buzz and chime when the other player hands the game back. */
  turnAlerts: boolean;
}

// One autosave per game (Salerno's keeps its original key; its v1 saves predate the real rules and are ignored).
const gameKey = (id: string) => (id === 'salerno43' ? 's43.autosave.v2' : `${id}.autosave.v1`);
const SETTINGS_KEY = 's43.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  controllers: { Allied: 'human', German: 'heuristic' },
  aiDelayMs: 450,
  claudeApiKey: '',
  claudeModel: 'claude-opus-5-5',
  noticeDismissed: false,
  defensiveAir: { Allied: 'auto', German: 'auto' },
  sound: true,
  volume: 0.5,
  followAi: true,
  animSpeed: 1,
  combatDice: 'watch',
  showGrid: true,
  showLabels: true,
  mouseControls: 'rts',
  showCues: true,
  mapMode: 'normal',
  showUnits: true,
  showMarkers: true,
  showHexIds: false,
  music: true,
  musicVolume: 0.35,
  aiLevel: 'veteran',
  game: 'salerno43',
  endChecks: true,
  turnAlerts: true,
};

export function hasAutosave(): boolean {
  const g = loadAutosave();
  return !!g && g.phase !== 'gameOver';
}

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable or full */
  }
}

export function loadSettings(): Settings {
  const raw = get(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  set(SETTINGS_KEY, JSON.stringify(s));
}

/** The autosave of the game loaded in the engine (or of `id`). */
export function loadAutosave(id: string = GAME_ID): GameState | null {
  const raw = get(gameKey(id));
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as GameState;
    return (g.gameId ?? 'salerno43') === id ? g : null;
  } catch {
    return null;
  }
}

export function autosave(g: GameState): void {
  set(gameKey(g.gameId ?? 'salerno43'), JSON.stringify(g));
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
