// Heads-up display: top bar, phase banners, event feed, unit card,
// combat pop-up with dice, game over and pause menus.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BATTLESHIPS_TURN, MAP, RULES, SCENARIOS } from '../engine/data';
import { alliedVp, benchmark, currentWeather, vpBreakdown } from '../engine/game';
import { cannotMove } from '../engine/movement';
import type { CombatReport, GameState, Side, UnitState } from '../engine/types';
import { def, isElite, isLowQuality, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';
import { Insignia, TokenIcon } from './render/units';
import { setSound, sfx } from './sound';
import { downloadText, type Settings } from './storage';
import { EventCard, feedWorthy, readMs, sideOfEntry, type FeedItem, type FocusFn } from './logView';
import { moveLeft } from './qol';
import { useConfirm } from './astryx/kit';
import { Button, Dialog, DialogHeader, HStack, Icon, IconButton, Layout, LayoutContent } from '@astryxdesign/core';
import { Ico, weatherIcon } from './icons';
import { Meander, Medal, MenuButton, Stat, Tip } from './chrome';
import { turnDate, turnLabel, firstBenchmarkTurn } from '../engine/words';

const DATE = (turn: number) => turnDate(turn).toUpperCase();

const PHASE_NAME: Record<string, string> = {
  invasion: 'Invasion', weather: 'Weather', initial: 'Initial', movement: 'Movement', combat: 'Combat', recovery: 'Recovery', supply: 'Supply',
  victory: 'Victory check', gameOver: 'Game over',
};

function SideEmblem({ side, size = 26 }: { side: Side; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-6 -6 12 12" className="emblem">
      <Insignia nation={side === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} />
    </svg>
  );
}

/** The phase track's icon for each phase. */
export const PHASE_ICON: Record<string, string> = {
  invasion: 'landing', weather: 'sunCloud', initial: 'replacement', movement: 'boot', combat: 'swords', recovery: 'flag', supply: 'supply', gameOver: 'laurel',
};

/** What the weather box means for play, in a few short lines. */
function weatherLines(w: ReturnType<typeof currentWeather>): string[] {
  const out: string[] = [];
  out.push(w.air.length ? `Air: ${w.air.join(', ')}` : 'No air support');
  out.push(w.naval.length ? `Naval: ${w.naval.map((n) => (n === 'AL' ? 'Allied' : n)).join(', ')}` : 'No naval gunfire');
  out.push(`Supply: Allied ${w.alliedSupply} · German ${w.germanSupply}`);
  if (w.rain) out.push('Vehicles stop at unbridged rivers');
  if (w.mud) out.push('Mud: every attack one column left');
  return out;
}

// ------------------------------------------------------------------ top bar

export function TopBar({ game, settings, setSettings, humanTurn, acting, onMenu, onSettings, aiStatus }: {
  game: GameState; settings: Settings; setSettings: (s: Settings) => void; humanTurn: boolean; acting: Side;
  onMenu: () => void; onSettings: () => void; aiStatus: string;
}) {
  const wb = currentWeather(game);
  const vp = alliedVp(game);
  const bm = benchmark(game.turn);
  const phases = game.phase === 'invasion' ? ['invasion'] : ['initial', 'movement', 'combat', 'recovery', 'supply'];
  const at = phases.indexOf(game.phase);
  const ready = (k: string) => game.support.ready.includes(k);
  const lo = (bm ?? 6) - RULES.automaticMargin;
  const hi = (bm ?? 6) + RULES.automaticMargin;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const over = game.phase === 'gameOver';
  const who = over ? 'Battle over' : humanTurn ? (acting !== game.activeSide ? `${acting} decides` : 'Your orders') : aiStatus || 'Enemy moving';
  const wIcon = weatherIcon(wb);
  return (
    <header className="hud-top">
      <div className="hud-side">
        <Tip title={`${game.activeSide} turn`} lines={[who]} pos="below">
          <div className={`hud-emblem ${game.activeSide === 'Allied' ? 'allied' : 'german'}`}>
            <SideEmblem side={game.activeSide} size={40} />
          </div>
        </Tip>
        <div className="hud-who">
          <b>{over ? 'Finis' : game.activeSide}</b>
          <small><Ico name={humanTurn ? 'quill' : 'radio'} size={13} /><span>{who}</span></small>
        </div>
      </div>
      <div className="hud-sep" />
      <div className="hud-res">
        <Tip title="Victory points" pos="below" lines={bm !== null
          ? [`Allied ${vp} · benchmark ${bm}`, `Allies win at ${hi} (or 20)`, `Germans win at ${lo}`]
          : [`Allied ${vp}`, `Benchmarks from ${turnLabel(firstBenchmarkTurn()).toLowerCase()}`]}>
          <div className="hud-vp">
            <Stat icon="laurel" value={vp} sub={bm !== null ? `/ ${bm}` : undefined} className="vp" />
            {bm !== null && (
              <div className="hud-vp-bar">
                <i className="mark" style={{ left: pct(bm) }} />
                <i className="dot" style={{ left: pct(vp) }} />
              </div>
            )}
          </div>
        </Tip>
        <Tip title={`Weather · ${wb.name}`} lines={weatherLines(wb)} pos="below">
          <span className={`stat hud-weather ${wIcon === 'sunCloud' ? 'cloud' : wIcon}`}><Ico name={wIcon} size={24} /><b>{wb.name}</b></span>
        </Tip>
        <Tip title="Supply points" lines={[`Allied ${game.supplyPoints.Allied} · German ${game.supplyPoints.German}`, 'Spent to ready artillery']} pos="below">
          <span className="stat hud-supply"><Ico name="supply" size={20} /><b><span className="a">{game.supplyPoints.Allied}</span><span>·</span><span className="g">{game.supplyPoints.German}</span></b></span>
        </Tip>
        <div className="hud-support">
          {RULES.supportMarkers.map((k) => {
            const [nation, kind] = k.split('-');
            // Italy '43's one naval marker shows as ready for both armies until it is used (9.6).
            const on = nation === 'AL' ? ready('US-naval') || ready('BR-naval') : ready(k);
            const name = nation === 'AL' ? 'Allied' : nation === 'GE' ? 'German' : nation;
            return (
              <Tip key={k} title={`${name} ${kind === 'air' ? 'air support' : 'naval gunfire'}`} lines={[on ? 'Ready' : 'Used or grounded']} pos="below">
                <span className={`sup ${kind}${on ? ' ready' : ''}`}><Ico name={kind === 'air' ? 'plane' : 'ship'} size={18} /><em>{nation === 'AL' ? 'ALL' : nation}</em></span>
              </Tip>
            );
          })}
          {game.turn >= BATTLESHIPS_TURN && game.support.battleships > 0 && (
            <Tip title="Valiant & Warspite" lines={[`${game.support.battleships} bombardment${game.support.battleships > 1 ? 's' : ''} left`]} pos="below">
              <span className="sup ready naval"><Ico name="battleship" size={18} /><em>×{game.support.battleships}</em></span>
            </Tip>
          )}
        </div>
      </div>
      <div className="hud-phases" role="list" aria-label="Phases">
        {phases.map((p, i) => (
          <Tip key={p} title={PHASE_NAME[p]} pos="below">
            <span role="listitem" className={`hud-phase${game.phase === p ? ' on' : i < at ? ' done' : ''}`} aria-current={game.phase === p ? 'step' : undefined}>
              <Ico name={PHASE_ICON[p]} size={game.phase === p ? 21 : 15} />
              {game.phase === p && <span className="hud-phase-name">{PHASE_NAME[p]}</span>}
            </span>
          </Tip>
        ))}
      </div>
      <Tip title={turnLabel(game.turn)} lines={[`${game.lastTurn - game.turn} turn${game.lastTurn - game.turn === 1 ? '' : 's'} after this one`]} pos="below">
        <div className="hud-date">
          <b>{DATE(game.turn)}</b>
          <small><Ico name="hourglass" size={12} />Turn {game.turn} / {game.lastTurn}</small>
        </div>
      </Tip>
      <div className="hud-buttons">
        <Medal icon={settings.sound ? 'soundOn' : 'soundOff'} label={settings.sound ? 'Mute' : 'Sound on'} size="sm" pos="below"
          onClick={() => { setSettings({ ...settings, sound: !settings.sound }); setSound(!settings.sound, settings.volume); }} />
        <Medal icon="gear" label="Settings" size="sm" pos="below" onClick={onSettings} />
        <Medal icon="menu" label="Menu" keyHint="Esc" size="sm" pos="below" onClick={onMenu} />
      </div>
      <Meander />
    </header>
  );
}

// ------------------------------------------------------------------ phase banner

export function PhaseBanner({ game, humanSides }: { game: GameState; humanSides: Side[] }) {
  const [banner, setBanner] = useState<{ key: number; big: boolean; title: string; sub: string; side: Side; phase: string } | null>(null);
  const prev = useRef<{ turn: number; side: Side; phase: string } | null>(null);
  const counter = useRef(0);
  useEffect(() => {
    const cur = { turn: game.turn, side: game.activeSide, phase: game.phase };
    const p = prev.current;
    prev.current = cur;
    if (!p || game.phase === 'gameOver') return;
    if (p.turn === cur.turn && p.side === cur.side && p.phase === cur.phase) return;
    if (!['invasion', 'initial', 'movement', 'combat'].includes(game.phase)) return;
    const sideChange = p.side !== cur.side || p.turn !== cur.turn;
    const yours = humanSides.includes(game.activeSide);
    const wb = currentWeather(game);
    setBanner({
      key: ++counter.current,
      big: sideChange,
      side: game.activeSide,
      phase: game.phase,
      title: sideChange ? `${game.activeSide} turn` : PHASE_NAME[game.phase],
      sub: sideChange ? `${turnDate(game.turn)} · ${wb.name}` : yours ? 'Your orders' : 'Enemy',
    });
    sfx.radio();
  }, [game.turn, game.activeSide, game.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), banner.big ? 2100 : 1400);
    return () => clearTimeout(t);
  }, [banner]);
  if (!banner) return null;
  return (
    <div key={banner.key} className={`phase-banner ${banner.big ? 'big' : ''} ${banner.side === 'Allied' ? 'allied' : 'german'}`}>
      <span className="pb-medal">{banner.big ? <SideEmblem side={banner.side} size={50} /> : <Ico name={PHASE_ICON[banner.phase] ?? 'hourglass'} size={30} />}</span>
      <div>
        <div className="title">{banner.title}</div>
        <div className="sub"><i />{banner.sub}<i /></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ event feed

/** Cards for the important new log entries, newest on top; tap one to look at the hex. */
export function EventFeed({ game, onFocus, humanSides = [] }: { game: GameState; onFocus?: FocusFn; humanSides?: Side[] }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const seen = useRef(game.log.length);
  const counter = useRef(0);
  const hover = useRef(false);
  useEffect(() => {
    // Undo or loading a game shortens the log: start over from there.
    if (game.log.length < seen.current) seen.current = game.log.length;
    const fresh = game.log.slice(seen.current);
    seen.current = game.log.length;
    if (fresh.length > 60) return;
    const now = Date.now();
    const picked = fresh.filter(feedWorthy).map((l) => ({ id: ++counter.current, l, ms: readMs(l.text), until: now + readMs(l.text) }));
    if (picked.length) setItems((cur) => [...picked.reverse(), ...cur].slice(0, 4));
  }, [game.log.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!items.length) return;
    const tick = 400;
    const t = setInterval(() => {
      const now = Date.now();
      setItems((cur) => (hover.current ? cur.map((i) => ({ ...i, until: i.until + tick })) : cur.filter((i) => i.until > now)));
    }, tick);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <div className="event-feed" onPointerEnter={() => (hover.current = true)} onPointerLeave={() => (hover.current = false)} aria-live="polite">
      {items.map((i) => (
        <EventCard key={i.id} item={i} onFocus={onFocus} mine={humanSides.includes(sideOfEntry(i.l) as Side) && humanSides.length === 1} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ unit card

const CAT_NAME: Record<string, string> = {
  infantry: 'Infantry', garrison: 'Coastal garrison', motorized: 'Motorized infantry', pg: 'Panzergrenadiers', engineer: 'Engineers', bh: 'Beachhead',
  airborne: 'Airborne', glider: 'Glider infantry', ranger: 'Rangers', recon: 'Reconnaissance', divAsu: 'Division artillery', corpsAsu: 'Corps artillery',
  nebelwerfer: 'Rocket artillery', tank: 'Armour', mountain: 'Mountain infantry', heavyHowitzer: 'Heavy artillery',
};

function whereText(u: UnitState): string {
  switch (u.where.kind) {
    case 'map': return `Hex ${u.where.hex}${MAP.hexes[u.where.hex]?.city ? ` · ${MAP.hexes[u.where.hex].city}` : MAP.hexes[u.where.hex]?.town ? ` · ${MAP.hexes[u.where.hex].town}` : ''}`;
    case 'entry': return `Entry area ${u.where.area}`;
    case 'reserve': return 'Floating Reserve (at sea)';
    case 'followUp': return 'Follow-up wave';
    case 'atSea': return `At sea, bound for ${u.where.port}`;
    case 'pending': return `Arrives ${turnLabel(u.where.turn).toLowerCase()}`;
    case 'eliminated': return 'Eliminated';
    default: return u.where.kind;
  }
}

const CHIP_ICON: Record<string, string> = {
  Elite: 'star', 'Low quality': 'starOutline', Disrupted: 'disrupted', 'Full Retreat': 'retreat', '½ Effective': 'warning', Isolated: 'shattered',
  'Out of supply': 'supply', Replacement: 'replacement', 'On trucks': 'truck', 'Has attacked': 'swords', Fired: 'artillery', 'Ready to fire': 'artillery',
  '8th Army': 'flag',
};

/** The selected unit, as a strategy game's unit panel: its counter, name, figures and condition. */
export function UnitCard({ game, unit, hex, onSelect, onClose }: { game: GameState; unit: UnitState; hex: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const d = def(unit.id);
  const v = values(unit);
  const stackHex = unit.where.kind === 'map' ? unit.where.hex : hex;
  const stack = stackHex ? unitsAt(game, stackHex) : [];
  const own = sideOf(unit) === game.activeSide;
  const why = unit.where.kind === 'map' && own && game.phase === 'movement' ? cannotMove(game, unit) : null;
  const chips: [string, string, string?][] = [];
  if (isElite(unit)) chips.push(['Elite', 'gold']);
  if (isLowQuality(unit)) chips.push(['Low quality', 'grey']);
  if (unit.status === 'disrupted') chips.push(['Disrupted', 'orange']);
  if (unit.status === 'fullRetreat') chips.push(['Full Retreat', 'red']);
  if (unit.halfEff) chips.push(['½ Effective', 'yellow']);
  if (unit.isolated) chips.push(['Isolated', 'red']);
  else if (unit.outOfSupply) chips.push(['Out of supply', 'red']);
  if (unit.repl) chips.push(['Replacement', 'blue']);
  if (unit.truck) chips.push(['On trucks', 'grey']);
  if (unit.attacked && own && game.phase === 'combat') chips.push(['Has attacked', 'grey']);
  if (d.asu) chips.push([unit.fired ? 'Fired' : 'Ready to fire', unit.fired ? 'grey' : 'green']);
  if (unit.garrison && unit.frozenUntil && game.turn < unit.frozenUntil) chips.push([`Garrison`, 'blue', `Garrison of ${unit.garrison}`]);
  else if (unit.frozenUntil && game.turn < unit.frozenUntil) chips.push(['Frozen', 'blue', unit.frozenUntil >= 99 ? 'Until the enemy comes close' : `Until ${turnLabel(unit.frozenUntil).toLowerCase()}`]);
  if (d.army8) chips.push(['8th Army', 'gold']);
  const steps = stepsRemaining(unit);
  const moveNote = own && unit.where.kind === 'map' && game.phase === 'movement'
    ? why ? `Can't move: ${why}` : unit.mpSpent === null ? 'Ready to move' : moveLeft(game, unit) ? `${moveLeft(game, unit)} left` : `${+unit.mpSpent.toFixed(1)} MP used`
    : '';
  return (
    <div className="unit-card unit-panel gilt">
      <button className="up-close" aria-label="Close" onClick={onClose}><Ico name="close" size={14} /></button>
      <div className="up-main">
        <div className="up-portrait"><TokenIcon unit={unit} size={64} /></div>
        <div className="up-info">
          <div className="up-name">{d.name}</div>
          <div className="up-sub">{CAT_NAME[d.cat] ?? d.cat} · {d.formation}</div>
          <div className="up-stats">
            {d.asu ? <Tip title="Range" pos="above"><Stat icon="target" value={d.asuRange} className="att" /></Tip> : (
              <>
                <Tip title="Attack" pos="above"><Stat icon="swords" value={v.attack} className="att" /></Tip>
                <Tip title="Defense" pos="above"><Stat icon="shield" value={v.defense} className="def" /></Tip>
              </>
            )}
            <Tip title="Movement" pos="above"><Stat icon="boot" value={v.move} className="mov" /></Tip>
            {d.tankRating ? <Tip title="Tank rating" pos="above"><Stat icon="tank" value={d.tankRating} /></Tip> : null}
            <Tip title="Steps" lines={[`${steps} of ${d.steps.length} left`]} pos="above">
              <span className="up-steps">{d.steps.map((_, i) => <i key={i} className={i < steps ? 'on' : ''} />)}</span>
            </Tip>
          </div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="up-chips">
          {chips.map(([t, tone, tip]) => (
            <Tip key={t} title={t} lines={tip ? [tip] : undefined} pos="above">
              <span className={`up-chip ${tone}`}><Ico name={CHIP_ICON[t] ?? (t === 'Garrison' ? 'garrison' : t === 'Frozen' ? 'sleep' : 'info')} size={13} />{t}</span>
            </Tip>
          ))}
        </div>
      )}
      <div className="up-where"><Ico name="hex" size={13} />{whereText(unit)}{moveNote && <em>{moveNote}</em>}</div>
      {stack.length > 1 && (
        <div className="up-stack">
          {stack.map((u) => (
            <Tip key={u.id} title={def(u.id).name} pos="above">
              <button className={u.id === unit.id ? 'on' : ''} aria-label={def(u.id).name} onClick={() => onSelect(u.id)}>
                <TokenIcon unit={u} size={36} />
              </button>
            </Tip>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ combat pop-up

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(t);
  }, [rolling, value]);
  const pips: Record<number, [number, number][]> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  return (
    <svg viewBox="-12 -12 24 24" width={54} height={54} className={`die${rolling ? ' rolling' : ''}`}>
      <rect x={-11} y={-11} width={22} height={22} rx={4.5} fill="#f6f1e2" stroke="#2a2418" strokeWidth={1} />
      {(pips[Math.max(1, Math.min(6, face))] ?? []).map(([x, y], i) => <circle key={i} cx={x * 5.5} cy={y * 5.5} r={2.1} fill="#1b1a17" />)}
    </svg>
  );
}

function resultText(r: string): string {
  const key = r.replace(/ Adv \d$/, '');
  return RULES.combat.results[key] ?? '';
}

/** The compact result card for combats shown without the battle screen; `speed` scales how long it stays up. */
export function CombatPopup({ game, humanSides, speed = 1 }: { game: GameState; humanSides: Side[]; speed?: number }) {
  const [shown, setShown] = useState<{ rep: CombatReport; key: number } | null>(null);
  const [rolling, setRolling] = useState(false);
  const seen = useRef(game.combats.length);
  useEffect(() => {
    if (game.combats.length < seen.current) seen.current = game.combats.length;
    if (game.combats.length > seen.current) {
      const rep = game.combats[game.combats.length - 1];
      seen.current = game.combats.length;
      setShown({ rep, key: rep.id });
      setRolling(rep.roll > 0);
      if (rep.roll > 0) sfx.dice();
    } else if (shown) {
      // The Determined Defense result arrives in a later update of the same report.
      const rep = game.combats.find((c) => c.id === shown.rep.id);
      if (rep && rep.dd && !shown.rep.dd) setShown({ rep: { ...rep }, key: shown.key });
    }
  }, [game.combats]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rolling) return;
    const t = setTimeout(() => setRolling(false), 750 * speed);
    return () => clearTimeout(t);
  }, [rolling, shown?.key]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), game.pendingDefense ? 60000 : 7500 * speed);
    return () => clearTimeout(t);
  }, [shown, game.pendingDefense, speed]);
  if (!shown) return null;
  const r = shown.rep;
  const place = MAP.hexes[r.defenderHex]?.city ?? MAP.hexes[r.defenderHex]?.town ?? `hex ${r.defenderHex}`;
  const yours = humanSides.includes(r.attackerSide);
  return (
    <div className={`combat-pop ${r.attackerSide === 'Allied' ? 'allied' : 'german'}`}>
      <IconButton label="Close" icon={<Icon icon="close" />} variant="ghost" size="sm" className="cp-close" onClick={() => setShown(null)} />
      <div className="cp-head">
        <span>{r.breakthrough ? 'BREAKTHROUGH' : r.phase === 'movement' ? 'OVERRUN' : 'ASSAULT'}</span>
        <b>{place.toUpperCase()}</b>
        <em>{yours ? 'your attack' : humanSides.length ? 'enemy attack' : `${r.attackerSide} attack`}</em>
      </div>
      <div className="cp-body">
        <div className="cp-side">
          <div className="cp-label">{r.attackerSide.toUpperCase()}</div>
          <div className="cp-units">{r.attackers.slice(0, 5).map((id) => <TokenIcon key={id} unit={game.units[id]} size={34} />)}</div>
          <div className="cp-str">{r.attack}</div>
        </div>
        <div className="cp-mid">
          <div className="cp-odds">{r.finalColumn}</div>
          <div className="cp-col">{r.baseColumn}{r.shifts.length ? ` ${r.shifts.map((s) => (s.shift > 0 ? '▶' : '◀')).join('')}` : ''}</div>
          {r.roll > 0 ? <Die value={Math.min(6, r.roll)} rolling={rolling} /> : <div className="cp-auto">AUTO</div>}
          {r.drm ? <div className="cp-col">DRM {r.drm > 0 ? '+' : ''}{r.drm}</div> : null}
        </div>
        <div className="cp-side">
          <div className="cp-label">{r.attackerSide === 'Allied' ? 'GERMAN' : 'ALLIED'}</div>
          <div className="cp-units">{r.defenders.slice(0, 5).map((id) => <TokenIcon key={id} unit={game.units[id]} size={34} />)}</div>
          <div className="cp-str">{r.defense}</div>
        </div>
      </div>
      {!rolling && (
        <div className="cp-result">
          <b>{r.result}</b>
          <span>{resultText(r.result)}</span>
          {r.dd && <span className="dd">Determined Defense: rolled {r.dd.roll}{r.dd.drm ? ` ${r.dd.drm > 0 ? '+' : ''}${r.dd.drm}` : ''} → {r.dd.result}</span>}
          {r.shifts.length > 0 && <small>{r.shifts.map((s) => `${s.reason} ${s.shift > 0 ? '+' : ''}${s.shift}`).join(' · ')}</small>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

export function GameOverScreen({ game, humanSides, onReview, onMenu }: { game: GameState; humanSides: Side[]; onReview: () => void; onMenu: () => void }) {
  const breakdown = useMemo(() => vpBreakdown(game, true), [game]);
  const solo = humanSides.length === 1 ? humanSides[0] : null;
  const won = solo ? game.winner === solo : null;
  useEffect(() => {
    sfx.fanfare(won !== false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = (side: Side) => Object.values(game.units).filter((u) => sideOf(u) === side && u.where.kind === 'eliminated').length;
  const title = won === true ? 'VICTORY' : won === false ? 'DEFEAT' : game.winner === 'draw' ? 'DRAW' : `${(game.winner ?? '').toUpperCase()} VICTORY`;
  return (
    <div className="gameover">
      <div className={`go-card ${won === false ? 'lost' : 'won'}`}>
        <Ico name="laurel" size={84} className="go-laurel" />
        <div className="go-kicker">{SCENARIOS[game.scenarioId]?.name} · {turnLabel(game.turn).toLowerCase()}</div>
        <h1>{title}</h1>
        {solo && <div className="go-sub">{game.winner} victory</div>}
        <p>{game.victoryNote}</p>
        <div className="go-stats">
          <div><Ico name="laurel" size={22} /><b>{alliedVp(game)}</b><span>Allied VP</span></div>
          <div><Ico name="swords" size={22} /><b>{game.combats.length}</b><span>Battles</span></div>
          <div><Ico name="shattered" size={22} /><b>{lost('Allied')}</b><span>Allied lost</span></div>
          <div><Ico name="shattered" size={22} /><b>{lost('German')}</b><span>German lost</span></div>
        </div>
        {breakdown.parts.length > 0 && <div className="go-parts">{breakdown.parts.join(' · ')}</div>}
        <HStack className="go-buttons" gap={3} hAlign="center">
          <Button label="Review the battlefield" size="lg" onClick={onReview} />
          <Button label="Main menu" variant="primary" size="lg" onClick={onMenu} />
        </HStack>
      </div>
    </div>
  );
}

export function PauseMenu({ game, onResume, onSettings, onQuit, onLoad, onRules }: {
  game: GameState; onResume: () => void; onSettings: () => void; onQuit: () => void; onLoad: (g: GameState) => void; onRules: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  return (
    <>
    {confirm.dialog}
    <Dialog isOpen onOpenChange={(o) => !o && onResume()} width={380} className="pause">
      <Layout header={<DialogHeader title="Paused" subtitle={`${SCENARIOS[game.scenarioId]?.name} · ${turnLabel(game.turn).toLowerCase()} · saved`} onOpenChange={(o) => !o && onResume()} />} content={
        <LayoutContent role="region" label="Pause menu options" tabIndex={0}>
        <nav className="main-menu pause-menu" aria-label="Menu">
          <MenuButton icon="play" label="Resume" primary onClick={onResume} />
          <MenuButton icon="gear" label="Settings" onClick={onSettings} />
          <MenuButton icon="book" label="Rules" onClick={onRules} />
          <MenuButton icon="save" label="Save to file" onClick={() => downloadText(`salerno43-day${game.turn}.json`, JSON.stringify(game))} />
          <MenuButton icon="load" label="Load from file" onClick={() => fileRef.current?.click()} />
          <MenuButton icon="exit" label="Main menu" danger onClick={onQuit} />
        </nav>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              onLoad(JSON.parse(await f.text()) as GameState);
            } catch {
              void confirm.ask({ title: 'Not a saved game', description: 'That file is not a saved game of Salerno \'43.', actionLabel: 'OK', cancelLabel: null });
            }
          }} />
        </LayoutContent>
      } />
    </Dialog>
    </>
  );
}
