// Status markers on the counters, drawn like the little printed markers a player would stack on top
// (Disrupted, Full Retreat, Out of Supply...), plus the digital-only cues: ready to act and movement left.
import type { GameState, UnitState } from '../../engine/types';
import { def, sideOf } from '../../engine/units';

export interface Marker {
  key: string;
  text: string;
  fill: string;
  ink: string;
  /** Hover text: what it means and which units carry it. */
  title: string;
}

interface Kind {
  text: string;
  fill: string;
  ink: string;
  name: string;
  note: string;
}

const LIGHT = '#fbf7ec';
const DARK = '#1c1c18';

// Each pairing keeps at least 4.5:1 contrast between the text and its marker.
const KINDS: Record<string, Kind> = {
  fullRetreat: { text: 'FR', fill: '#b52b20', ink: LIGHT, name: 'Full Retreat', note: 'defense 0, no ZOC, must move away' },
  disrupted: { text: 'DIS', fill: '#e8912a', ink: DARK, name: 'Disrupted', note: 'defense halved, no attack, tactical moves only' },
  isolated: { text: 'ISO', fill: '#141414', ink: '#f6cf3e', name: 'Isolated', note: 'no line of supply at all' },
  outOfSupply: { text: 'OOS', fill: '#f2c63a', ink: DARK, name: 'Out of supply', note: 'attack halved' },
  halfEff: { text: '½', fill: '#6e4fb8', ink: LIGHT, name: '½ Effective', note: 'attack halved' },
  attacked: { text: 'ATK', fill: '#4a4f48', ink: '#efe9d6', name: 'Has attacked', note: 'cannot attack again this phase' },
  repl: { text: 'RPL', fill: '#2c64a0', ink: LIGHT, name: 'Replacement', note: 'received a replacement: no combat from this hex' },
  truck: { text: 'TRK', fill: '#56626b', ink: LIGHT, name: 'On trucks', note: 'attack 0 this turn' },
  frozen: { text: 'FRZ', fill: '#a9daf2', ink: DARK, name: 'Frozen', note: 'may not move yet' },
};
const ORDER = Object.keys(KINDS);

function flagsOf(u: UnitState, s: GameState | null, frozen: boolean): string[] {
  const out: string[] = [];
  if (u.status === 'fullRetreat') out.push('fullRetreat');
  if (u.status === 'disrupted') out.push('disrupted');
  if (u.isolated) out.push('isolated');
  else if (u.outOfSupply) out.push('outOfSupply');
  if (u.halfEff) out.push('halfEff');
  // Attacks matter only during the attacker's own combat phase (the flag is cleared later).
  if (u.attacked && s && sideOf(u) === s.activeSide && s.phase === 'combat') out.push('attacked');
  if (u.repl) out.push('repl');
  if (u.truck) out.push('truck');
  if (frozen || (s && u.frozenUntil && s.turn < u.frozenUntil)) out.push('frozen');
  return out;
}

function build(key: string, units: UnitState[], total: number, frozenUntil?: number): Marker {
  const k = KINDS[key];
  const who = total > 1 ? ` (${units.map((u) => def(u.id).name).join(', ')})` : '';
  const name = key === 'frozen' && frozenUntil ? `Frozen until day ${frozenUntil}` : k.name;
  return { key, text: k.text, fill: k.fill, ink: k.ink, title: `${name}: ${k.note}${who}` };
}

/** Markers for one unit (counters outside a map stack, such as moving ghosts). */
export function unitMarkers(u: UnitState, frozen: boolean): Marker[] {
  return flagsOf(u, null, frozen).map((k) => build(k, [u], 1, u.frozenUntil));
}

/** Markers for a whole stack: any unit in it carrying one shows it on the top counter. */
export function stackMarkers(s: GameState, list: UnitState[]): Marker[] {
  const by = new Map<string, UnitState[]>();
  for (const u of list) for (const k of flagsOf(u, s, false)) by.set(k, [...(by.get(k) ?? []), u]);
  return ORDER.filter((k) => by.has(k)).map((k) => build(k, by.get(k)!, list.length, by.get(k)![0].frozenUntil));
}

/** Every stack's markers, keyed by hex (computed once per game state). */
export function stackMarkerMap(s: GameState): Map<string, Marker[]> {
  const stacks = new Map<string, UnitState[]>();
  for (const u of Object.values(s.units)) if (u.where.kind === 'map') stacks.set(u.where.hex, [...(stacks.get(u.where.hex) ?? []), u]);
  const out = new Map<string, Marker[]>();
  for (const [h, list] of stacks) {
    const m = stackMarkers(s, list);
    if (m.length) out.set(h, m);
  }
  return out;
}

const MW = 15;
const MH = 8.6;
const MAX_SHOWN = 4;

/** The marker chits down the right edge of a counter whose top-right corner is (x, y). */
export function CounterMarkers({ markers, x, y }: { markers: Marker[]; x: number; y: number }) {
  const shown = markers.length > MAX_SHOWN ? markers.slice(0, MAX_SHOWN - 1) : markers;
  const extra = markers.length - shown.length;
  return (
    <g className="counter-markers">
      {shown.map((m, i) => (
        <g key={m.key} transform={`translate(${x - 3.5} ${y + 5 + i * (MH + 0.8)})`} pointerEvents="visiblePainted">
          <title>{m.title}</title>
          <rect width={MW} height={MH} rx={1.2} fill={m.fill} stroke="#0d0d0b" strokeWidth={0.6} />
          <rect x={0.9} y={0.9} width={MW - 1.8} height={MH - 1.8} rx={0.6} fill="none" stroke={m.ink} strokeWidth={0.35} opacity={0.45} />
          <text x={MW / 2} y={MH / 2 + 2.15} textAnchor="middle" fontSize={m.text.length > 2 ? 5.6 : 6.4} fill={m.ink} className="marker-text">{m.text}</text>
        </g>
      ))}
      {extra > 0 && (
        <g transform={`translate(${x - 3.5} ${y + 5 + shown.length * (MH + 0.8)})`} pointerEvents="visiblePainted">
          <title>{markers.slice(shown.length).map((m) => m.title).join('\n')}</title>
          <rect width={MW} height={MH} rx={1.2} fill="#24261f" stroke="#0d0d0b" strokeWidth={0.6} />
          <text x={MW / 2} y={MH / 2 + 2.15} textAnchor="middle" fontSize={5.6} fill="#efe9d6" className="marker-text">+{extra}</text>
        </g>
      )}
    </g>
  );
}

/** A small disc at the counter's top-right corner: this stack can still move (green) or attack (red). */
export function ReadyCue({ kind, x, y }: { kind: 'move' | 'attack'; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className={`ready-cue ${kind}`} pointerEvents="visiblePainted">
      <title>{kind === 'move' ? 'Ready to move' : 'Can still attack'}</title>
      <circle r={5.6} fill={kind === 'move' ? '#7be0a0' : '#ff8a6a'} stroke="#101410" strokeWidth={0.9} />
      {kind === 'move' ? (
        <path d="M-2.6,-2.4 L0,0 L-2.6,2.4 M0.4,-2.4 L3,0 L0.4,2.4" fill="none" stroke="#0f2a1a" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M-2.7,-2.7 L2.7,2.7 M2.7,-2.7 L-2.7,2.7 M-2.9,1.2 L-1.2,2.9 M2.9,1.2 L1.2,2.9" fill="none" stroke="#3a0d06" strokeWidth={1.2} strokeLinecap="round" />
      )}
    </g>
  );
}

/** A tab hanging under the counter with the movement left this phase. */
export function MoveLeftTab({ text, y }: { text: string; y: number }) {
  const w = text.length * 3.3 + 5;
  return (
    <g transform={`translate(0 ${y})`} pointerEvents="visiblePainted">
      <title>{`${text} of movement left this phase`}</title>
      <rect x={-w / 2} y={0} width={w} height={8} rx={2} fill="#59c3e8" stroke="#0d1a20" strokeWidth={0.7} />
      <text y={6} textAnchor="middle" fontSize={6} fill="#08202b" className="marker-text">{text}</text>
    </g>
  );
}
