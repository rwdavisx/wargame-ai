import type { GameState, Side } from '../engine/types';

export type Controller = 'human' | 'heuristic' | 'claude';

export interface Settings {
  controllers: Record<Side, Controller>;
  aiDelayMs: number;
  claudeApiKey: string;
  claudeModel: string;
  bannerDismissed: boolean;
}

const GAME_KEY = 's43.autosave.v1';
const SETTINGS_KEY = 's43.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  controllers: { Allied: 'human', German: 'heuristic' },
  aiDelayMs: 350,
  claudeApiKey: '',
  claudeModel: 'claude-opus-5-5',
  bannerDismissed: false,
};

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

export function loadAutosave(): GameState | null {
  const raw = get(GAME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function autosave(g: GameState): void {
  set(GAME_KEY, JSON.stringify(g));
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
