// Presentation of the game log: category icons, colour-coded rows, day and phase
// headers, and the floating event cards over the map.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ToggleButton } from '@astryxdesign/core';
import type { HexId } from '../engine/hex';
import type { LogEntry, LogKind, Side } from '../engine/types';
import { PHASE_LABEL, placeShort } from '../engine/words';

const dateOf = (turn: number) => `${8 + turn} September`;

/** Moves the camera to a hex. */
export type FocusFn = (h: HexId) => void;

/** Old saves only know combat/move/info/dice/victory. */
export const kindOf = (l: LogEntry): LogKind => l.kind ?? 'info';

/** The side the entry is about, for its colour. */
export const sideOfEntry = (l: LogEntry): Side | null => l.actor ?? l.side;

const KIND_LABEL: Record<LogKind, string> = {
  phase: 'Phase', move: 'Movement', combat: 'Battle', loss: 'Losses', retreat: 'Retreat', supply: 'Supply', reinforcement: 'Reinforcements',
  landing: 'Landing', airdrop: 'Airdrop', victory: 'Objective', weather: 'Weather', dice: 'Rally', info: 'Notice',
};

/** Small line icons, one per category (inline SVG: no image URLs). */
export function LogIcon({ kind, size = 16 }: { kind: LogKind; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  switch (kind) {
    case 'combat':
      body = <><path d="M4 4l11 11M15 15l2.5-1M15 15l-1 2.5M20 4L9 15M9 15l-2.5-1M9 15l1 2.5" {...p} /><path d="M5 19l2.5-2.5M19 19l-2.5-2.5" {...p} /></>;
      break;
    case 'loss':
      body = <><path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4 3 5v3h8v-3c1.6-1 3-2.4 3-5a7 7 0 0 0-7-7z" {...p} /><circle cx={9.3} cy={10.5} r={1.4} fill="currentColor" /><circle cx={14.7} cy={10.5} r={1.4} fill="currentColor" /><path d="M10.5 18v2.5M13.5 18v2.5" {...p} /></>;
      break;
    case 'retreat':
      body = <path d="M10 6l-6 6 6 6M4 12h11a5 5 0 0 1 5 5v1" {...p} />;
      break;
    case 'move':
      body = <path d="M4 12h14M13 6l6 6-6 6" {...p} />;
      break;
    case 'landing':
      body = <><path d="M12 3v14M8 7h8M5 13a7 7 0 0 0 14 0" {...p} /><circle cx={12} cy={4.5} r={1.5} {...p} /></>;
      break;
    case 'airdrop':
      body = <><path d="M3 10a9 7 0 0 1 18 0" {...p} /><path d="M3 10l9 9 9-9M8 10l4 9 4-9" {...p} /></>;
      break;
    case 'reinforcement':
      body = <><circle cx={12} cy={12} r={8.5} {...p} /><path d="M12 8v8M8 12h8" {...p} /></>;
      break;
    case 'supply':
      body = <><path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4z" {...p} /><path d="M3.5 8L12 12l8.5-4M12 12v8" {...p} /></>;
      break;
    case 'victory':
      body = <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" {...p} />;
      break;
    case 'weather':
      body = <path d="M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.7 1.5A3.3 3.3 0 0 1 17 18z" {...p} />;
      break;
    case 'dice':
      body = <><rect x={4} y={4} width={16} height={16} rx={3} {...p} /><circle cx={9} cy={9} r={1.3} fill="currentColor" /><circle cx={15} cy={15} r={1.3} fill="currentColor" /><circle cx={12} cy={12} r={1.3} fill="currentColor" /></>;
      break;
    case 'phase':
      body = <><circle cx={12} cy={12} r={8.5} {...p} /><path d="M12 7v5l3 2" {...p} /></>;
      break;
    default:
      body = <><circle cx={12} cy={12} r={8.5} {...p} /><path d="M12 11v5" {...p} /><circle cx={12} cy={7.8} r={1.2} fill="currentColor" /></>;
  }
  return (
    <svg className={`log-icon k-${kind}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}

// Place names ("Salerno (2707)", "hex 2913 near Eboli") are emphasised; destruction and losses are tinted.
const NAME = "[A-Z][\\w'’.-]*(?: (?:sul|di|del|della|beach|[A-Z][\\w'’.-]*))*";
const MARKS = new RegExp(
  `(${NAME} \\(\\d{4}\\)|hex \\d{4}(?: near ${NAME})?|\\b(?:is|are) destroyed\\b|\\bdie holding their ground\\b|\\bmelts away\\b|\\bis lost\\b|\\bis overrun\\b|` +
    `\\bloses a step\\b|\\bworn down to a remnant\\b)`,
  'g',
);

export function RichText({ text }: { text: string }) {
  const parts = text.split(MARKS);
  return (
    <>
      {parts.map((s, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{s}</Fragment>;
        const cls = /\(\d{4}\)$|^hex \d/.test(s) ? 'lt-place' : /step|remnant/.test(s) ? 'lt-hurt' : 'lt-dead';
        return <span key={i} className={cls}>{s}</span>;
      })}
    </>
  );
}

const sideClass = (side: Side | null) => (side === 'Allied' ? 's-allied' : side === 'German' ? 's-german' : 's-none');

export function LogRow({ l, onFocus, compact }: { l: LogEntry; onFocus?: (h: HexId) => void; compact?: boolean }) {
  const kind = kindOf(l);
  const jump = l.hex && onFocus ? () => onFocus(l.hex!) : undefined;
  return (
    <div
      className={`log-row k-${kind} ${sideClass(sideOfEntry(l))}${l.important ? ' important' : ''}${jump ? ' jump' : ''}${compact ? ' compact' : ''}`}
      onClick={jump}
      role={jump ? 'button' : undefined}
      tabIndex={jump ? 0 : undefined}
      onKeyDown={jump ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), jump()) : undefined}
      title={jump ? `Show ${placeShort(l.hex!)} on the map` : undefined}
    >
      <LogIcon kind={kind} />
      <div className="log-body">
        <div className="log-text"><RichText text={l.text} /></div>
        {l.detail && !compact && <div className="log-detail">{l.detail}</div>}
      </div>
      {jump && <span className="log-jump" aria-hidden="true">{l.hex}</span>}
    </div>
  );
}

interface Group {
  key: string;
  turn: number;
  side: Side | null;
  phase: LogEntry['phase'];
  items: LogEntry[];
}

/** Splits the log into runs of one turn, side and phase; 'phase' entries only open a group. */
export function groupLog(entries: LogEntry[]): Group[] {
  const out: Group[] = [];
  for (const l of entries) {
    const key = `${l.turn}|${l.side ?? '-'}|${l.phase}`;
    let g = out[out.length - 1];
    if (!g || g.key !== key) out.push((g = { key, turn: l.turn, side: l.side, phase: l.phase, items: [] }));
    if (kindOf(l) !== 'phase') g.items.push(l);
  }
  return out.filter((g) => g.items.length);
}

function groupTitle(g: Group): string {
  const label = PHASE_LABEL[g.phase] ?? g.phase;
  if (!g.side || g.phase === 'weather' || g.phase === 'victory' || g.phase === 'gameOver') return label;
  return `${g.side} turn · ${label}`;
}

/** Plain moves pile up; long runs of them fold into one line that opens on click. */
function MoveRun({ items, onFocus }: { items: LogEntry[]; onFocus?: (h: HexId) => void }) {
  const [open, setOpen] = useState(false);
  if (open || items.length < 4) return <>{items.map((l, i) => <LogRow key={i} l={l} onFocus={onFocus} />)}</>;
  return (
    <div className="log-row k-move fold" role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(true))}>
      <LogIcon kind="move" />
      <div className="log-body">
        <div className="log-text">{items.length} units move <span className="log-more">Show</span></div>
      </div>
    </div>
  );
}

function GroupBody({ items, onFocus, compact }: { items: LogEntry[]; onFocus?: (h: HexId) => void; compact?: boolean }) {
  if (compact) return <>{items.map((l, i) => <LogRow key={i} l={l} onFocus={onFocus} compact />)}</>;
  // Fold consecutive ordinary moves.
  const runs: (LogEntry | LogEntry[])[] = [];
  for (const l of items) {
    const plainMove = kindOf(l) === 'move' && !l.important;
    const last = runs[runs.length - 1];
    if (plainMove && Array.isArray(last)) last.push(l);
    else runs.push(plainMove ? [l] : l);
  }
  return (
    <>
      {runs.map((r, i) => (Array.isArray(r) ? <MoveRun key={i} items={r} onFocus={onFocus} /> : <LogRow key={i} l={r} onFocus={onFocus} />))}
    </>
  );
}

/** The log as an after-action report: day dividers, a header per turn and phase, then the entries. */
export function LogList({ entries, onFocus, compact }: { entries: LogEntry[]; onFocus?: (h: HexId) => void; compact?: boolean }) {
  const groups = groupLog(entries);
  let day = -1;
  return (
    <div className={`log-list${compact ? ' compact' : ''}`}>
      {groups.map((g, gi) => {
        const newDay = g.turn !== day;
        day = g.turn;
        return (
          <Fragment key={`${g.key}|${gi}`}>
            {newDay && !compact && (
              <div className="log-day">
                <span>Day {g.turn}</span>
                <i>{dateOf(g.turn)}</i>
              </div>
            )}
            <div className={`log-group ${sideClass(g.side)}`}>
              <div className="log-ghead">
                {compact && <b>Day {g.turn} · </b>}
                {groupTitle(g)}
              </div>
              <GroupBody items={g.items} onFocus={onFocus} compact={compact} />
            </div>
          </Fragment>
        );
      })}
      {!groups.length && <div className="log-empty">Nothing has happened yet.</div>}
    </div>
  );
}

const FILTERS: [string, string, (l: LogEntry) => boolean][] = [
  ['all', 'Everything', () => true],
  ['key', 'Key events', (l) => !!l.important || kindOf(l) === 'victory'],
  ['combat', 'Battles', (l) => ['combat', 'loss', 'retreat'].includes(kindOf(l))],
  ['move', 'Movement', (l) => ['move', 'landing', 'airdrop'].includes(kindOf(l))],
  ['supply', 'Supply & arrivals', (l) => ['supply', 'reinforcement', 'weather', 'dice', 'info'].includes(kindOf(l))],
];

/** The Log tab: filters, then the whole report, newest at the bottom (kept in view as the game goes on). */
export function FullLog({ entries, onFocus }: { entries: LogEntry[]; onFocus?: (h: HexId) => void }) {
  const [filter, setFilter] = useState('all');
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const test = FILTERS.find((f) => f[0] === filter)![2];
  const shown = entries.filter((l) => kindOf(l) === 'phase' || test(l));
  const scroller = () => ref.current?.closest('.panel') as HTMLElement | null;
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onScroll = () => (pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const el = scroller();
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, filter]);
  return (
    <div ref={ref} className="full-log">
      <div className="log-filters" role="group" aria-label="Show">
        {FILTERS.map(([k, label]) => (
          <ToggleButton key={k} label={label} size="sm" isPressed={filter === k} onPressedChange={() => { setFilter(k); pinned.current = true; }} />
        ))}
      </div>
      <p className="log-hint">Tap an entry with a hex number to see it on the map.</p>
      <LogList entries={shown} onFocus={onFocus} />
    </div>
  );
}

// ------------------------------------------------------------------ floating event cards

/** What earns a card over the map: battle results, captures, losses, airdrops and victory. */
export const feedWorthy = (l: LogEntry) => kindOf(l) !== 'phase' && !!l.important;

/** Long enough to read: about 6 s for a short line, up to 10 s for a long one. */
export const readMs = (text: string) => Math.max(6000, Math.min(10000, 3500 + text.length * 32));

export interface FeedItem {
  id: number;
  l: LogEntry;
  /** Display time, and when the card goes (pushed back while the pointer is over the feed). */
  ms: number;
  until: number;
}

export function EventCard({ item, onFocus, mine }: { item: FeedItem; onFocus?: (h: HexId) => void; mine: boolean }) {
  const { l } = item;
  const kind = kindOf(l);
  const side = sideOfEntry(l);
  const jump = l.hex && onFocus ? () => onFocus(l.hex!) : undefined;
  return (
    <div
      className={`event-card k-${kind} ${sideClass(side)}${jump ? ' jump' : ''}`}
      onClick={jump}
      role={jump ? 'button' : undefined}
      tabIndex={jump ? 0 : undefined}
      onKeyDown={jump ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), jump()) : undefined}
      title={jump ? 'Show on the map' : undefined}
    >
      <div className="ec-head">
        <LogIcon kind={kind} size={15} />
        <span className="ec-place">{l.hex ? placeShort(l.hex) : KIND_LABEL[kind]}</span>
        {l.hex && <span className="ec-hex">{l.hex}</span>}
        {side && <span className="ec-side">{side}{mine ? ' · you' : ''}</span>}
      </div>
      <div className="ec-text"><RichText text={l.text} /></div>
      <i className="ec-timer" style={{ animationDuration: `${item.ms}ms` }} />
    </div>
  );
}
