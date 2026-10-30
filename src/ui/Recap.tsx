// "Since your last turn": what the computer did on its turn, worked out by comparing the game state
// when its turn began with the state when yours begins. Every entry jumps the camera to its hex.
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Icon, IconButton, List, ListItem } from '@astryxdesign/core';
import { MAP } from '../engine/data';
import type { HexId } from '../engine/hex';
import type { GameState, Side, UnitState } from '../engine/types';
import { def, sideOf } from '../engine/units';

type Kind = 'attack' | 'capture' | 'loss' | 'enemyLoss' | 'arrive' | 'move';

interface Entry {
  kind: Kind;
  text: string;
  hex: HexId | null;
}

interface RecapData {
  side: Side;
  turn: number;
  moved: number;
  attacks: number;
  stepsLost: number;
  hexesLost: number;
  entries: Entry[];
  moves: Entry[];
}

const place = (h: HexId) => MAP.hexes[h]?.city ?? MAP.hexes[h]?.town ?? `hex ${h}`;
const name = (id: string) => def(id).name;
const hexOfWhere = (u: UnitState | undefined): HexId | null => (u?.where.kind === 'map' ? u.where.hex : null);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Compares the state at the start of the enemy's turn with the state now. */
function diff(a: GameState, b: GameState, enemy: Side): RecapData {
  const entries: Entry[] = [];
  const losses: Entry[] = [];
  const enemyLosses: Entry[] = [];
  const arrivals: Entry[] = [];
  const moves: Entry[] = [];
  let stepsLost = 0;
  // Attacks the enemy made (reports are appended, so the new ones are past the old length).
  const known = new Set(a.combats.map((c) => c.id));
  const attacks = b.combats.filter((c) => !known.has(c.id) && c.attackerSide === enemy);
  for (const c of attacks) {
    const dd = c.dd ? `; Determined Defense: ${c.dd.result}` : '';
    const who = c.defenders.length ? ` (${name(c.defenders[0])}${c.defenders.length > 1 ? ` +${c.defenders.length - 1}` : ''})` : '';
    entries.push({ kind: 'attack', hex: c.defenderHex, text: `${c.breakthrough ? 'Breakthrough' : c.phase === 'movement' ? 'Overrun' : 'Attack'} on ${place(c.defenderHex)}${who} at ${c.finalColumn}: ${c.result}${dd}` });
  }
  // Ports, cities and VP hexes that changed hands, and entry areas.
  const keys = new Set([...Object.keys(a.control), ...Object.keys(b.control)]);
  let hexesLost = 0;
  for (const k of keys) {
    const was = a.control[k] ?? 'German';
    const now = b.control[k] ?? 'German';
    if (was === now) continue;
    const h = MAP.hexes[k];
    const area = MAP.entryAreas[k];
    if (!h && !area) continue;
    if (h && !h.vp && !h.city && !h.port) continue;
    const vp = h?.vp ?? area?.vp ?? 0;
    const what = h ? place(k) : `entry area ${k}`;
    if (now === enemy) hexesLost++;
    entries.push({ kind: 'capture', hex: h ? k : area.hexes[0], text: `${now === enemy ? `${enemy === 'German' ? 'Germans' : 'Allies'} took` : 'You regained'} ${what}${vp ? ` (${vp} VP)` : ''}` });
  }
  let moved = 0;
  for (const [id, ub] of Object.entries(b.units)) {
    const ua = a.units[id];
    if (!ua) continue;
    const mine = sideOf(ub) !== enemy;
    const ha = hexOfWhere(ua);
    const hb = hexOfWhere(ub);
    const lost = Math.max(0, ub.stepsLost - ua.stepsLost);
    const gone = (ub.where.kind === 'eliminated' || ub.where.kind === 'remnantHeld') && ua.where.kind !== ub.where.kind;
    if (mine) {
      if (gone) {
        stepsLost += Math.max(1, def(id).steps.length - ua.stepsLost);
        losses.push({ kind: 'loss', hex: ha, text: `${name(id)} ${ub.where.kind === 'remnantHeld' ? 'shattered (now a Remnant)' : 'destroyed'}` });
      } else if (lost || (ha && hb && ha !== hb) || (ub.status !== ua.status && ub.status !== 'good')) {
        stepsLost += lost;
        const bits = [lost ? `lost ${plural(lost, 'step')}` : '', ub.status === 'fullRetreat' && ua.status !== 'fullRetreat' ? 'in Full Retreat' : ub.status === 'disrupted' && ua.status !== 'disrupted' ? 'disrupted' : '',
          ha && hb && ha !== hb ? `retreated to ${hb}` : ''].filter(Boolean);
        losses.push({ kind: 'loss', hex: hb ?? ha, text: `${name(id)} ${bits.join(', ')}` });
      }
      continue;
    }
    if (gone) enemyLosses.push({ kind: 'enemyLoss', hex: ha, text: `${name(id)} ${ub.where.kind === 'remnantHeld' ? 'shattered' : 'destroyed'}` });
    else if (lost) enemyLosses.push({ kind: 'enemyLoss', hex: hb ?? ha, text: `${name(id)} lost ${plural(lost, 'step')}` });
    if (hb && ha !== hb) {
      if (ha) {
        moved++;
        moves.push({ kind: 'move', hex: hb, text: `${name(id)} ${ha} → ${hb}${MAP.hexes[hb]?.city || MAP.hexes[hb]?.town ? ` (${place(hb)})` : ''}` });
      } else arrivals.push({ kind: 'arrive', hex: hb, text: `${name(id)} entered the map at ${place(hb)}` });
    } else if (ub.where.kind === 'entry' && ua.where.kind !== 'entry' && !ub.where.area.startsWith('airdrop')) {
      const area = ub.where.area;
      arrivals.push({ kind: 'arrive', hex: MAP.entryAreas[area]?.hexes[0] ?? null, text: `${name(id)} waiting to enter at ${area}` });
    }
  }
  return {
    side: enemy, turn: b.turn, moved, attacks: attacks.length, stepsLost, hexesLost,
    entries: [...entries, ...losses, ...enemyLosses, ...arrivals], moves,
  };
}

const KIND_LABEL: Record<Kind, string> = { attack: 'Attack', capture: 'Control', loss: 'Your loss', enemyLoss: 'Enemy loss', arrive: 'Arrival', move: 'Move' };

export function Recap({ game, humanSides, onJump }: { game: GameState; humanSides: Side[]; onJump: (h: HexId) => void }) {
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [open, setOpen] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
  const start = useRef<GameState | null>(null);
  // Only against a computer opponent: one human side.
  const human = humanSides.length === 1 ? humanSides[0] : null;
  const enemyActive = !!human && game.activeSide !== human && game.phase !== 'gameOver';

  useEffect(() => {
    const s0 = start.current;
    if (s0 && (s0.scenarioId !== game.scenarioId || game.seq < s0.seq)) start.current = null; // a different game was loaded
    if (!human) return;
    if (enemyActive) {
      if (!start.current) {
        start.current = game;
        setRecap(null);
      }
    } else if (start.current) {
      const r = diff(start.current, game, start.current.activeSide);
      start.current = null;
      if (r.entries.length || r.moves.length) {
        setRecap(r);
        setShowMoves(false);
        // Phones get a small pill to open; larger screens show the card straight away.
        setOpen(!window.matchMedia('(max-width: 820px), (max-height: 520px)').matches);
      }
    }
  }, [game, enemyActive, human]);

  // Once the player gets on with the turn (any action), the card folds back into its pill.
  // (Phases that run by themselves right after the enemy turn don't count: give the card a few seconds.)
  const shownAt = useRef({ seq: 0, t: 0 });
  useEffect(() => {
    if (open) shownAt.current = { seq: game.seq, t: Date.now() };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    if (Date.now() - shownAt.current.t < 4000) shownAt.current.seq = game.seq;
    else if (game.seq > shownAt.current.seq) setOpen(false);
  }, [game.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // R opens or closes the recap.
  useEffect(() => {
    if (!recap) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recap]);

  if (!recap || enemyActive) return null;
  const who = recap.side === 'German' ? 'German' : 'Allied';
  const summary = [
    plural(recap.moved, 'unit') + ' moved',
    plural(recap.attacks, 'attack'),
    recap.stepsLost ? `you lost ${plural(recap.stepsLost, 'step')}` : '',
    recap.hexesLost ? `${plural(recap.hexesLost, 'place')} lost` : '',
  ].filter(Boolean);
  if (!open) {
    return (
      <Button label={`${who} turn`} className="recap-pill" tooltip="What the enemy did on its turn (R)" onClick={() => setOpen(true)}>
        <b>{who} turn</b> {recap.attacks ? plural(recap.attacks, 'attack') : plural(recap.moved, 'move')} <span aria-hidden>›</span>
      </Button>
    );
  }
  const row = (e: Entry, i: number) => (
    <ListItem key={i} className={`recap-item ${e.kind}`} isDisabled={!e.hex} align="first-line"
      startContent={<i aria-label={KIND_LABEL[e.kind]} />} label={<span>{e.text}</span>} endContent={e.hex ? <em>{e.hex}</em> : undefined}
      onClick={e.hex ? () => {
        onJump(e.hex!);
        // On a phone the card would hide the hex: fold it back into its pill.
        if (window.matchMedia('(max-width: 820px), (max-height: 520px)').matches) setOpen(false);
      } : undefined} />
  );
  return (
    <Card padding={0} elevation="high" className="recap" aria-label="Enemy turn recap">
      <header>
        <div>
          <div className="recap-kicker">Since your last turn</div>
          <div className="recap-title">{who} turn · day {recap.turn}</div>
        </div>
        <IconButton label="Hide (R)" tooltip="Hide (R)" icon={<Icon icon="close" />} variant="ghost" size="sm" className="recap-close" onClick={() => setOpen(false)} />
      </header>
      <div className="recap-sum">{summary.join(' · ')}</div>
      <div className="recap-body">
        {recap.entries.length > 0 ? <List density="compact">{recap.entries.map(row)}</List> : <p className="recap-quiet">No attacks, losses or captures.</p>}
        {recap.moves.length > 0 && (
          <>
            <Button label={`${showMoves ? 'Hide' : 'Show'} ${plural(recap.moves.length, 'enemy move')}`} variant="ghost" size="sm" className="recap-more"
              aria-expanded={showMoves} onClick={() => setShowMoves((m) => !m)} />
            {showMoves && <List density="compact">{recap.moves.map(row)}</List>}
          </>
        )}
      </div>
    </Card>
  );
}
