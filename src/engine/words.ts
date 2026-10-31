// Plain-English wording for the log: place names, unit lists and combat results.
// Text only; nothing here touches the rules.
import { MAP, onGameData, RULES } from './data';
import { distance, type HexId } from './hex';
import type { CombatReport, Phase, Side } from './types';
import { def } from './units';

let named: [HexId, string][] | null = null;
onGameData(() => (named = null));
/** Hexes with a city or town name (built lazily, after any map overrides are applied). */
function namedHexes(): [HexId, string][] {
  return (named ??= Object.entries(MAP.hexes).filter(([, d]) => d.city || d.town).map(([h, d]) => [h, (d.city ?? d.town)!]));
}

/** The city, town or beach name of a hex, if it has one. */
export function hexName(hex: HexId): string | null {
  const d = MAP.hexes[hex];
  if (d?.city || d?.town) return (d.city ?? d.town)!;
  if (d?.airfield) return `${d.airfield} airfield`;
  const beach = Object.entries(MAP.beaches).find(([, b]) => b.hex === hex);
  return beach ? `${beach[0]} beach` : null;
}

/** The nearest named place within two hexes, for unnamed hexes. */
export function nearName(hex: HexId): string | null {
  let best: [string, number] | null = null;
  for (const [h, n] of namedHexes()) {
    const dist = distance(h, hex);
    if (dist <= 2 && (!best || dist < best[1])) best = [n, dist];
  }
  return best?.[0] ?? null;
}

/** "Salerno (2707)", "hex 2913 near Eboli" or "hex 2913". */
export function place(hex: HexId): string {
  const n = hexName(hex);
  if (n) return `${n} (${hex})`;
  const near = nearName(hex);
  return near ? `hex ${hex} near ${near}` : `hex ${hex}`;
}

/** A short label for headers: "Salerno", "near Eboli" or "Hex 2913". */
export function placeShort(hex: HexId): string {
  return hexName(hex) ?? (nearName(hex) ? `near ${nearName(hex)}` : `Hex ${hex}`);
}

/** Entry areas, map edges and off-map boxes. */
const MONTHS: Record<string, string> = { Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };

/** "Day" in Salerno '43 (a turn a day), "Turn" in Italy '43 (two to four days a turn). */
export const turnWord = (): string => (RULES.turnDates ? 'Turn' : 'Day');

/** "Day 3", "Turn 13". */
export const turnLabel = (turn: number): string => `${turnWord()} ${turn}`;

/** The date a turn covers: "11 September 1943", "1–2 October 1943". */
export function turnDate(turn: number): string {
  const d = RULES.turnDates?.[String(turn)];
  if (!d) return `${8 + turn} September 1943`;
  const m = /^(\w+)\s+(\d+)(?:-(\d+))?$/.exec(d.trim());
  if (!m) return `${d} 1943`;
  return `${m[2]}${m[3] ? `–${m[3]}` : ''} ${MONTHS[m[1]] ?? m[1]} 1943`;
}

/** The first turn with a VP benchmark. */
export const firstBenchmarkTurn = (): number => Math.min(...Object.keys(RULES.benchmarks).map(Number));

export function areaName(a: string): string {
  if (a === 'N') return 'the north map edge';
  if (a === 'S') return 'the south map edge';
  if (a === 'E') return 'the east map edge';
  if (a === 'reserve') return 'the Floating Reserve';
  if (a.startsWith('airdrop') || a.startsWith('hex:')) return 'the airfields, waiting to drop';
  if (a.includes('/')) return `Entry Area ${a.split('/').join(', ').replace(/, ([^,]*)$/, ' or $1')}`;
  if (a === 'Naples') return 'Naples';
  const ea = MAP.entryAreas[a];
  if (!ea) return a;
  const label = ea.label?.replace(/^\w+\s*/, '').replace(/^\((.*)\)$/, '$1');
  return `Entry Area ${a}${label ? ` (${label})` : ''}`;
}

/** Unit name as printed, with "ASU" spelled out as artillery. */
export function unitName(id: string): string {
  return def(id).name.replace(/\bDiv ASU$/, 'Div artillery').replace(/\bCorps ASU$/, 'Corps artillery');
}

/** "A", "A and B", "A, B and C", or "A, B, C and 2 others" past `max` names. */
export function nameList(ids: string[], max = 4): string {
  const names = ids.map(unitName);
  if (names.length > max) return `${names.slice(0, max - 1).join(', ')} and ${names.length - max + 1} others`;
  if (names.length <= 1) return names[0] ?? 'nobody';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Picks the singular or plural verb for a list of units. */
export function verb(ids: string[] | number, one: string, many: string): string {
  return (typeof ids === 'number' ? ids : ids.length) === 1 ? one : many;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function hexes(n: number): string {
  return `${n} ${n === 1 ? 'hex' : 'hexes'}`;
}

export const SIDE_PEOPLE: Record<Side, string> = { Allied: 'the Allies', German: 'the Germans' };

export const PHASE_LABEL: Record<Phase, string> = {
  invasion: 'Invasion', weather: 'Weather and supply', initial: 'Initial phase', movement: 'Movement', combat: 'Combat',
  recovery: 'Recovery', supply: 'Supply', victory: 'Victory check', gameOver: 'Game over',
};

/** "Day 3 · German movement", used as the log's phase headers. */
export function phaseTitle(turn: number, side: Side | null, phase: Phase): string {
  const label = PHASE_LABEL[phase] ?? phase;
  if (!side || phase === 'weather' || phase === 'victory' || phase === 'gameOver') return `${turnLabel(turn)} · ${label}`;
  return `${turnLabel(turn)} · ${side} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** "7-1" → "7 to 1". */
export function oddsText(column: string): string {
  return column.replace(/^(\d+)-(\d+)$/, '$1 to $2');
}

/** What a Combat Results Table result means, in a few words. */
export function resultHeadline(result: string): string {
  const r = result.replace(/ Adv \d+$/, '').replace(/\/\d.*$/, '');
  switch (r) {
    case 'A1': return 'the attack is thrown back';
    case 'EX': return 'a bloody exchange';
    case 'Dis': return 'the defenders are pinned down';
    case 'DR2': return 'the defenders must give ground';
    case 'A1/DR2': return 'a costly success, the defenders must give ground';
    case 'DRX':
    case 'A1/D1': return 'losses on both sides, and the defenders must give ground';
    case 'D1': return 'the defenders take losses and must give ground';
    case 'DR4': return 'the defenders are routed';
    case 'DS': return 'the defenders are shattered';
    default: return result;
  }
}

/** Advance after combat earned by a result, e.g. "Adv 3" → 3. */
export function resultAdvance(result: string): number {
  return Number(/Adv (\d+)/.exec(result)?.[1] ?? 0);
}

/** The technical line for an attack: strengths, column shifts, roll and table result. */
export function attackDetail(rep: CombatReport): string {
  const shifts = rep.shifts.map((x) => `${x.reason} ${x.shift > 0 ? '+' : ''}${x.shift}`).join(', ');
  const base = rep.baseColumn === 'no defense' ? 'no defense' : oddsText(rep.baseColumn);
  const odds = `Strength ${rep.attack} against ${rep.defense} (${base}${shifts ? `; ${shifts} → ${oddsText(rep.finalColumn)}` : ''})`;
  const roll = rep.roll ? `Roll ${rep.roll}${rep.drm ? ` +${rep.drm} battleships` : ''} → ${rep.result.replace(/ Adv (\d+)/, ', advance $1')}` : `No roll: ${rep.result.replace(/ Adv (\d+)/, ', advance $1')}`;
  return `${odds}. ${roll}.`;
}

/** "Allied naval gunfire", "German air support", or the artillery unit's name. */
export function supportName(id: string): string {
  const m = /^(US|BR|GE)-(air|naval)$/.exec(id);
  if (!m) return unitName(id);
  const who = m[1] === 'US' ? 'US' : m[1] === 'BR' ? 'British' : 'German';
  return `${who} ${m[2] === 'air' ? 'air support' : 'naval gunfire'}`;
}
