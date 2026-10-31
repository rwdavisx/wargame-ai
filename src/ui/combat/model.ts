// Plain-language helpers for the battle screen: what each CRT result means,
// the six outcomes of a column, and the odds of a Determined Defense.
import { BATTLESHIPS_TURN, MAP, RULES } from '../../engine/data';
import { columnLabel, parseCell } from '../../engine/combat';
import type { HexId } from '../../engine/hex';
import { planRetreat } from '../../engine/retreat';
import type { CombatReport, GameState, PendingDefense, Side, UnitState } from '../../engine/types';
import { def, goodOrder, sideOf, stepsRemaining, unitsAt } from '../../engine/units';
import { nameList, oddsText, place, placeShort, resultAdvance, resultHeadline, SIDE_PEOPLE, supportName, unitName } from '../../engine/words';

export const sideNoun = (s: Side) => SIDE_PEOPLE[s];
export const sideAdj = (s: Side) => (s === 'Allied' ? 'Allied' : 'German');
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Wording shared with the game log.
export const placeName = placeShort;
/** For sentences: "Salerno (2707)", "hex 2913 near Eboli". */
export const placeLong = place;
export const supportLabel = supportName;
export const oddsWords = oddsText;
export { resultAdvance };

/** The log's headline for a result, as a sentence start: "The defenders must give ground". */
export const resultTitle = (result: string) => cap(resultHeadline(result));

const NOUN: Record<string, string> = {
  infantry: 'infantry', garrison: 'coastal garrison', motorized: 'motorized infantry', pg: 'panzergrenadiers', engineer: 'engineers',
  bh: 'beachhead', airborne: 'paratroops', glider: 'glider infantry', ranger: 'rangers', recon: 'reconnaissance', divAsu: 'artillery',
  corpsAsu: 'corps artillery', nebelwerfer: 'rocket artillery', tank: 'armour', mountain: 'mountain troops', heavyHowitzer: 'heavy artillery',
};

/** "II/1 HG (panzergrenadiers)", "2/6 Queen's and 128 Bde (-)", "5 units". */
export function forceText(ids: string[]): string {
  if (ids.length === 1) return `${unitName(ids[0])} (${NOUN[def(ids[0]).cat] ?? def(ids[0]).cat})`;
  return nameList(ids, 3);
}

export const resultKey = (r: string) => r.replace(/ Adv \d+$/, '');

/** A few words per result for the outcome tiles (the log's headlines, shortened). */
export const RESULT_TITLE: Record<string, string> = {
  A1: 'Thrown back', EX: 'Bloody exchange', Dis: 'Pinned down', DR2: 'Give ground', 'A1/DR2': 'Costly success',
  DRX: 'Losses both sides', 'A1/D1': 'Losses both sides', D1: 'Losses, give ground', DR4: 'Routed', DS: 'Shattered',
};

/** How good a result is for the attacker: colours the outcome table. */
export function resultTone(key: string): 'bad' | 'mixed' | 'fair' | 'good' | 'great' {
  if (key === 'A1') return 'bad';
  if (key === 'EX') return 'mixed';
  if (key === 'Dis') return 'fair';
  if (key === 'DR4' || key === 'DS') return 'great';
  return 'good';
}

/** Plain-English sentence for a CRT result, from the attacker's point of view. */
export function explainResult(key: string, att: string, dfn: string): string {
  switch (key) {
    case 'A1': return `The attack fails: ${att} lose a step.`;
    case 'EX': return `A bloody exchange: both sides lose a step.`;
    case 'Dis': return `${cap(dfn)} are shaken and become disrupted, but keep the hex. Units already disrupted fall back 2 hexes in Full Retreat.`;
    case 'DR2': return `${cap(dfn)} must retreat 2 hexes and become disrupted, or stand and make a Determined Defense.`;
    case 'A1/DR2': return `${cap(att)} lose a step, and ${dfn} must retreat 2 hexes or stand and make a Determined Defense.`;
    case 'DRX': return `Both sides lose a step, and ${dfn} must retreat 2 hexes or stand and make a Determined Defense.`;
    case 'A1/D1': return `Both sides lose a step, and ${dfn} must retreat 2 hexes or stand and make a Determined Defense.`;
    case 'D1': return `${cap(dfn)} lose a step and must retreat ${RULES.combat.d1Retreat} hexes, or stand and make a Determined Defense.`;
    case 'DR4': return `${cap(dfn)} are routed: they flee 4 hexes in Full Retreat. No stand is allowed.`;
    case 'DS': return `${cap(dfn)} are shattered: they lose a step and flee 4 hexes in Full Retreat. No stand is allowed.`;
    default: return RULES.combat.results[key] ?? '';
  }
}

export interface CrtFace {
  face: number;
  /** Row of the table after the die roll modifier. */
  row: number;
  key: string;
  adv: number;
  /** y: a stand rolls at −1; r: no stand allowed. */
  color: '' | 'y' | 'r';
}

/** The six outcomes of a CRT column, one per die face. */
export function crtFaces(column: number, drm: number): CrtFace[] {
  return [1, 2, 3, 4, 5, 6].map((face) => {
    const row = Math.max(1, Math.min(6, face + drm));
    const c = parseCell(RULES.combat.crt[String(row)][Math.max(0, Math.min(8, column))]);
    return { face, row, key: c.result, adv: c.adv, color: c.color };
  });
}

export const columnIndex = (label: string) => Math.max(0, RULES.combat.columns.indexOf(label));
export { columnLabel };

// ------------------------------------------------------------------ Determined Defense

export type DdKind = 'hold' | 'holdLoss' | 'partial' | 'delay' | 'fail';

export interface DdOutcome {
  kind: DdKind;
  title: string;
  detail: string;
}

export interface DdFace extends DdOutcome {
  face: number;
  eff: number;
  /** The table offers hold or delay; `prefer` picked one. */
  choice: boolean;
}

export const DD_KIND_LABEL: Record<DdKind, string> = { hold: 'Hold', holdLoss: 'Hold, at a cost', partial: 'Partial hold', delay: 'Delay', fail: 'Stand fails' };

/** Column of the Determined Defense table for the defender's hex. */
export function ddColumn(hex: HexId): 'Clear' | 'Other' | 'City' {
  const d = MAP.hexes[hex];
  if (d.city) return 'City';
  if (d.terrain === 'clear' && !d.town) return 'Clear';
  return 'Other';
}

// Explains one Determined Defense table entry ("-/1 H", "-/- D", "1*/1 H" …).
export function explainDd(pick: string, o: { retreat: number; delay: number; desperate: boolean; cityBattle: boolean; mine: boolean; first?: boolean }): DdOutcome {
  const [losses, letter] = pick.split(' ');
  const [att, dfn] = losses.split('/');
  let out = letter ?? '';
  if (out === 'P' && o.cityBattle) out = 'D';
  const you = o.mine ? 'you' : 'they';
  const extra: string[] = [];
  if (dfn === '1') extra.push('the lead unit loses a step');
  if (dfn === 'dis') extra.push('the lead unit is disrupted');
  if (att?.startsWith('1')) extra.push(`the attacker loses a step${att.includes('*') ? ` (${o.mine ? 'you pick' : 'the defender picks'} which)` : ''}`);
  const tail = extra.length ? `; ${extra.join(', ')}` : '';
  if (o.desperate && (out === '' || (out === 'D' && o.first !== false))) {
    return { kind: 'fail', title: out === 'D' ? 'Delay counts as a failure' : 'Stand fails', detail: `the lead unit loses a step and ${you} roll again (Desperate Defense).` };
  }
  if (out === 'H') return { kind: extra.length ? 'holdLoss' : 'hold', title: 'Hold', detail: `The hex is held, with no retreat${tail}.` };
  if (out === 'P') return { kind: 'partial', title: 'Partial hold', detail: `The hex is held and a City Battle marker is placed${tail}.` };
  if (out === 'D') return { kind: 'delay', title: 'Delay', detail: `Fall back ${o.delay} hex${o.delay > 1 ? 'es' : ''} and become disrupted; the attacker may only enter the vacated hex${tail}.` };
  return { kind: 'fail', title: 'Stand fails', detail: `Retreat ${o.retreat} hexes anyway and become disrupted${tail}.` };
}

function canLead(u: UnitState, bt: boolean): boolean {
  return u.where.kind === 'map' && goodOrder(u) && !def(u.id).asu && (bt || !u.retreatedThisPhase);
}

/** May Valiant and Warspite add their guns to this naval support? */
export function shipsAllowed(g: GameState, pd: PendingDefense, support: string | null): boolean {
  return pd.defenderSide === 'Allied' && !!support?.endsWith('-naval') && g.support.battleships > 0 && g.turn >= BATTLESHIPS_TURN;
}

export interface DdForecast {
  column: 'Clear' | 'Other' | 'City';
  lead: string | null;
  mods: { label: string; value: number }[];
  drm: number;
  faces: DdFace[];
  /** Chance (out of 6) of holding, delaying and failing on the first roll. */
  odds: { hold: number; delay: number; fail: number };
  /** Units that cannot retreat at all (they would be destroyed). */
  trapped: string[];
}

/** What a Determined Defense would do on each die face, mirroring resolveDefense. */
export function ddForecast(g: GameState, pd: PendingDefense, c: { support: string | null; ships: boolean; prefer: 'hold' | 'delay'; delay: number }): DdForecast {
  const rep = g.combats.find((x) => x.id === pd.combatId);
  const bt = !!rep?.breakthrough;
  const here = unitsAt(g, pd.hex).filter((u) => sideOf(u) === pd.defenderSide && (bt || !u.retreatedThisPhase));
  const trapped = planRetreat(g, here.map((u) => u.id), pd.retreat, pd.hex).lost;
  let cands = here.filter((u) => canLead(u, bt));
  // In a Desperate Defense the units that can retreat do so; the others fight.
  if (pd.desperate && trapped.length) {
    const stuck = cands.filter((u) => trapped.includes(u.id));
    if (stuck.length) cands = stuck;
  }
  cands.sort((a, b) => Number(!!def(b.id).elite) - Number(!!def(a.id).elite) || Number(!!def(a.id).lowQuality) - Number(!!def(b.id).lowQuality) ||
    stepsRemaining(b) - stepsRemaining(a));
  const lead = cands[0]?.id ?? null;
  const mods: { label: string; value: number }[] = [];
  const support = c.support && pd.supportOptions.includes(c.support) ? c.support : null;
  if (support) mods.push({ label: supportLabel(support), value: RULES.dd.drms.defensiveSupport ?? 1 });
  const ships = c.ships && shipsAllowed(g, pd, support);
  if (ships) mods.push({ label: 'Valiant & Warspite', value: 1 });
  if (lead && def(lead).elite) mods.push({ label: `Elite lead unit (${def(lead).name})`, value: 1 });
  if (lead && def(lead).lowQuality) mods.push({ label: `Low-quality lead unit (${def(lead).name})`, value: -1 });
  if (pd.yellow) mods.push({ label: 'Yellow result on the combat table', value: -1 });
  const drm = Math.min(mods.reduce((a, m) => a + m.value, 0), ships ? 3 : 2);
  const column = ddColumn(pd.hex);
  const faces = ddFaces(column, drm, c.prefer, { retreat: pd.retreat, delay: c.delay, desperate: pd.desperate, cityBattle: !!g.cityBattle[pd.hex], mine: true });
  const count = (k: DdKind[]) => faces.filter((f) => k.includes(f.kind)).length;
  return {
    column, lead, mods, drm, faces, trapped,
    odds: { hold: count(['hold', 'holdLoss', 'partial']), delay: count(['delay']), fail: count(['fail']) },
  };
}

/** The six Determined Defense outcomes for a column and modifier. */
export function ddFaces(column: string, drm: number, prefer: 'hold' | 'delay', o: { retreat: number; delay: number; desperate: boolean; cityBattle: boolean; mine: boolean }): DdFace[] {
  const delay = Math.max(1, Math.min(3, o.delay));
  return [1, 2, 3, 4, 5, 6].map((face): DdFace => {
    const eff = Math.max(1, Math.min(7, face + drm));
    const opts = RULES.dd.table[column][eff - 1].split('|');
    const pick = opts.length > 1 ? opts.find((x) => (prefer === 'delay' ? !x.includes('H') : x.includes('H'))) ?? opts[0] : opts[0];
    return { face, eff, choice: opts.length > 1, ...explainDd(pick, { ...o, delay }) };
  });
}

/** Every Determined Defense roll recorded on a report (a Desperate Defense may roll several times). */
export function ddRolls(rep: CombatReport): { roll: number; drm: number; pick: string }[] {
  if (!rep.dd) return [];
  const dd = rep.dd;
  const out: { roll: number; drm: number; pick: string }[] = [];
  for (const n of rep.notes) {
    const m = / (?:leads a Determined Defense|rolls again): roll (\d)(?: ([+-]\d))?, /.exec(n);
    if (!m) continue;
    // Earlier rolls of a Desperate Defense did not end it: read their entry from the table.
    const roll = Number(m[1]);
    const drm = Number(m[2] ?? 0);
    const opts = (RULES.dd.table[dd.column]?.[Math.max(1, Math.min(7, roll + drm)) - 1] ?? '').split('|');
    out.push({ roll, drm, pick: opts.find((o) => !o.includes('H')) ?? opts[0] });
  }
  if (out.length) out[out.length - 1].pick = dd.result;
  else out.push({ roll: dd.roll, drm: dd.drm, pick: dd.result });
  return out;
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
