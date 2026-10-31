// Lets the owner correct the transcribed map against their physical copy.
// Edits are kept in localStorage and applied on start-up; the full map can be
// exported as JSON to replace the game's map.json (data/<game>/map.json). Each game keeps its own edits.
import { GAME_ID, MAP, onGameData } from '../engine/data';
import type { HexData, HexsideData } from '../engine/types';

const key = () => (GAME_ID === 'salerno43' ? 's43.mapOverrides.v1' : `${GAME_ID}.mapOverrides.v1`);

interface Overrides {
  hexes: Record<string, HexData>;
  hexsides: Record<string, HexsideData | null>;
}

function read(): Overrides {
  try {
    const raw = localStorage.getItem(key());
    if (raw) return JSON.parse(raw) as Overrides;
  } catch {
    /* storage unavailable */
  }
  return { hexes: {}, hexsides: {} };
}

function write(o: Overrides): void {
  try {
    localStorage.setItem(key(), JSON.stringify(o));
  } catch {
    /* storage unavailable */
  }
}

// Another game's map: apply that game's own edits to it.
onGameData(() => applyMapOverrides());

export function applyMapOverrides(): void {
  const o = read();
  for (const [h, d] of Object.entries(o.hexes)) MAP.hexes[h] = d;
  for (const [k, d] of Object.entries(o.hexsides)) {
    if (d && Object.keys(d).length) MAP.hexsides[k] = d;
    else delete MAP.hexsides[k];
  }
}

export function editHex(id: string, data: HexData): void {
  MAP.hexes[id] = data;
  const o = read();
  o.hexes[id] = data;
  write(o);
}

export function editHexside(key: string, data: HexsideData): void {
  const clean: HexsideData = {};
  if (data.river) clean.river = true;
  if (data.mountain) clean.mountain = true;
  if (data.pass) clean.pass = true;
  if (data.road) clean.road = data.road;
  if (Object.keys(clean).length) MAP.hexsides[key] = clean;
  else delete MAP.hexsides[key];
  const o = read();
  o.hexsides[key] = Object.keys(clean).length ? clean : null;
  write(o);
}

export function overrideCount(): number {
  const o = read();
  return Object.keys(o.hexes).length + Object.keys(o.hexsides).length;
}

export function clearOverrides(): void {
  try {
    localStorage.removeItem(key());
  } catch {
    /* storage unavailable */
  }
}

export function exportMapJson(): string {
  return JSON.stringify(MAP, null, 1);
}
