// Heads-up display: top bar, phase banners, event feed, unit card,
// combat pop-up with dice, defender's dialog, game over and pause menus.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BATTLESHIPS_TURN, MAP, RULES, SCENARIOS } from '../engine/data';
import { alliedVp, benchmark, currentWeather, vpBreakdown } from '../engine/game';
import { cannotMove, allowedModes } from '../engine/movement';
import type { CombatReport, GameState, Side, UnitState } from '../engine/types';
import { def, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';
import { Insignia, TokenIcon } from './render/units';
import { setSound, sfx } from './sound';
import { downloadText, type Settings } from './storage';
import { EventCard, feedWorthy, readMs, sideOfEntry, type FeedItem, type FocusFn } from './logView';

const DATE = (turn: number) => `${8 + turn} SEPT 1943`;

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

function WeatherIcon({ name }: { name: string }) {
  if (name === 'Rain')
    return (
      <svg viewBox="0 0 24 24" width={22} height={22}>
        <path d="M6 14a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.4A3.5 3.5 0 0 1 17 14Z" fill="#c9d3dc" />
        <path d="M8 17l-1.5 3M12 17l-1.5 3M16 17l-1.5 3" stroke="#6fb4ff" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
    );
  if (name === 'Cloudy')
    return (
      <svg viewBox="0 0 24 24" width={22} height={22}>
        <circle cx={8} cy={8} r={3.5} fill="#f6c945" />
        <path d="M7 18a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.4A3.5 3.5 0 0 1 18 18Z" fill="#dfe6ec" />
      </svg>
    );
  if (name === 'Air Support')
    return (
      <svg viewBox="0 0 24 24" width={22} height={22}>
        <circle cx={12} cy={12} r={5} fill="#f6c945" />
        <path d="M3 13h18M12 7v11M9 18h6" stroke="#e8eef2" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width={22} height={22}>
      <circle cx={12} cy={12} r={5} fill="#f6c945" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={12 + Math.cos(a) * 7.5} y1={12 + Math.sin(a) * 7.5} x2={12 + Math.cos(a) * 10} y2={12 + Math.sin(a) * 10} stroke="#f6c945" strokeWidth={1.8} strokeLinecap="round" />;
      })}
    </svg>
  );
}

function SupportIcon({ kind, label, ready }: { kind: 'air' | 'naval'; label: string; ready: boolean }) {
  return (
    <span className={`support${ready ? ' ready' : ''}`} title={`${label} ${kind === 'air' ? 'air support' : 'naval gunfire'}: ${ready ? 'ready' : 'used or unavailable'}`}>
      <svg viewBox="0 0 24 16" width={22} height={15}>
        {kind === 'air' ? (
          <path d="M2 8h20M12 3v10M8 13h8M4 6l2 2-2 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none" />
        ) : (
          <path d="M2 10h20l-3 4H5Z M7 10V7h8v3 M10 7V4h3v3 M15 8l5-2" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        )}
      </svg>
      <b>{label}</b>
    </span>
  );
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
  const ready = (k: string) => game.support.ready.includes(k);
  const lo = (bm ?? 6) - RULES.automaticMargin;
  const hi = (bm ?? 6) + RULES.automaticMargin;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <header className="topbar">
      <div className={`turn-side ${game.activeSide === 'Allied' ? 'allied' : 'german'}`}>
        <SideEmblem side={game.activeSide} />
        <div>
          <div className="big">{game.phase === 'gameOver' ? 'BATTLE OVER' : `${game.activeSide.toUpperCase()} TURN`}</div>
          <div className="small">{humanTurn ? (acting !== game.activeSide ? `${acting} must decide` : 'Your orders') : aiStatus || 'Computer is moving…'}</div>
        </div>
      </div>
      <div className="date-block">
        <div className="big">DAY {game.turn}</div>
        <div className="small">
          {DATE(game.turn)} · {game.turn}/{game.lastTurn}
        </div>
      </div>
      <div className="phases">
        {phases.map((p) => (
          <span key={p} className={`phase${game.phase === p ? ' on' : ''}`}>{PHASE_NAME[p]}</span>
        ))}
      </div>
      <div className="spacer" />
      <div className="vp-block" title={bm !== null ? `Allied VP ${vp}. Benchmark ${bm}: the Allies win automatically at ${hi} or 20, the Germans if the Allies fall to ${lo}.` : `Allied VP ${vp}. Benchmarks start on day 4.`}>
        <div className="vp-num">
          <span>ALLIED VP</span>
          <b>{vp}</b>
          {bm !== null && <em>/ {bm}</em>}
        </div>
        <div className="vp-bar">
          {bm !== null ? (
            <>
              <i className="mark" style={{ left: pct(bm) }} />
              <i className="dot" style={{ left: pct(vp) }} />
            </>
          ) : (
            <span>benchmark from day 4</span>
          )}
        </div>
      </div>
      <div className="weather" title={`Weather box ${wb.box}: ${wb.name}`}>
        <WeatherIcon name={wb.name} />
        <span>{wb.name}</span>
      </div>
      <div className="supplies" title="Supply points (ready artillery)">
        <span className="crate">▣</span> A {game.supplyPoints.Allied} · G {game.supplyPoints.German}
      </div>
      <div className="supports">
        <SupportIcon kind="air" label="US" ready={ready('US-air')} />
        <SupportIcon kind="air" label="BR" ready={ready('BR-air')} />
        <SupportIcon kind="naval" label="US" ready={ready('US-naval')} />
        <SupportIcon kind="naval" label="BR" ready={ready('BR-naval')} />
        <SupportIcon kind="air" label="GE" ready={ready('GE-air')} />
        {game.turn >= BATTLESHIPS_TURN && game.support.battleships > 0 && <span className="bb" title="Valiant & Warspite uses left">BB×{game.support.battleships}</span>}
      </div>
      <div className="top-buttons">
        <button title={settings.sound ? 'Mute' : 'Sound on'} onClick={() => { setSettings({ ...settings, sound: !settings.sound }); setSound(!settings.sound, settings.volume); }}>
          {settings.sound ? '🔊' : '🔈'}
        </button>
        <button title="Settings" onClick={onSettings}>⚙</button>
        <button title="Menu (Esc)" onClick={onMenu}>☰</button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ phase banner

export function PhaseBanner({ game, humanSides }: { game: GameState; humanSides: Side[] }) {
  const [banner, setBanner] = useState<{ key: number; big: boolean; title: string; sub: string; side: Side } | null>(null);
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
      title: sideChange ? `${game.activeSide.toUpperCase()} TURN` : `${PHASE_NAME[game.phase].toUpperCase()} PHASE`,
      sub: sideChange ? `Day ${game.turn} · ${DATE(game.turn).toLowerCase()} · ${wb.name}${yours ? ' · your command' : ''}` : yours ? 'Your orders' : 'Enemy activity',
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
      {banner.big && <SideEmblem side={banner.side} size={56} />}
      <div>
        <div className="title">{banner.title}</div>
        <div className="sub">{banner.sub}</div>
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
  nebelwerfer: 'Rocket artillery', tank: 'Armour',
};

function whereText(u: UnitState): string {
  switch (u.where.kind) {
    case 'map': return `Hex ${u.where.hex}${MAP.hexes[u.where.hex]?.city ? ` · ${MAP.hexes[u.where.hex].city}` : MAP.hexes[u.where.hex]?.town ? ` · ${MAP.hexes[u.where.hex].town}` : ''}`;
    case 'entry': return `Entry area ${u.where.area}`;
    case 'reserve': return 'Floating Reserve (at sea)';
    case 'followUp': return 'Follow-up wave';
    case 'atSea': return `At sea, bound for ${u.where.port}`;
    case 'pending': return `Arrives day ${u.where.turn}`;
    case 'eliminated': return 'Eliminated';
    default: return u.where.kind;
  }
}

export function UnitCard({ game, unit, hex, onSelect, onClose }: { game: GameState; unit: UnitState; hex: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const d = def(unit.id);
  const v = values(unit);
  const stackHex = unit.where.kind === 'map' ? unit.where.hex : hex;
  const stack = stackHex ? unitsAt(game, stackHex) : [];
  const own = sideOf(unit) === game.activeSide;
  const why = unit.where.kind === 'map' && own && game.phase === 'movement' ? cannotMove(game, unit) : null;
  const chips: [string, string][] = [];
  if (d.elite) chips.push(['Elite', 'gold']);
  if (d.lowQuality) chips.push(['Low quality', 'grey']);
  if (unit.status === 'disrupted') chips.push(['Disrupted', 'orange']);
  if (unit.status === 'fullRetreat') chips.push(['Full Retreat', 'red']);
  if (unit.halfEff) chips.push(['½ Effective', 'yellow']);
  if (unit.isolated) chips.push(['Isolated', 'red']);
  else if (unit.outOfSupply) chips.push(['Out of supply', 'red']);
  if (unit.repl) chips.push(['Replacement', 'blue']);
  if (d.asu) chips.push([unit.fired ? 'Fired' : 'Ready to fire', unit.fired ? 'grey' : 'green']);
  if (unit.frozenUntil && game.turn < unit.frozenUntil) chips.push([`Frozen until day ${unit.frozenUntil}`, 'blue']);
  if (d.army8) chips.push(['8th Army', 'gold']);
  return (
    <div className="unit-card">
      <button className="close" onClick={onClose}>✕</button>
      <div className="uc-main">
        <TokenIcon unit={unit} size={84} />
        <div className="uc-info">
          <div className="uc-name">{d.name}</div>
          <div className="uc-sub">{CAT_NAME[d.cat] ?? d.cat} · {d.formation} · {d.nation === 'GE' ? 'German' : d.nation === 'US' ? 'American' : d.nation === 'CN' ? 'Canadian' : 'British'}</div>
          <div className="uc-stats">
            {d.asu ? (
              <span><b>{d.asuRange}</b><i>RANGE</i></span>
            ) : (
              <>
                <span><b>{v.attack}</b><i>ATTACK</i></span>
                <span><b>{v.defense}</b><i>DEFENSE</i></span>
              </>
            )}
            <span><b>{v.move}</b><i>MOVE</i></span>
            {d.tankRating ? <span><b>{d.tankRating}</b><i>TANK</i></span> : null}
            <span><b>{stepsRemaining(unit)}/{d.steps.length}</b><i>STEPS</i></span>
          </div>
          <div className="uc-chips">
            {chips.map(([t, c]) => <span key={t} className={`chip ${c}`}>{t}</span>)}
          </div>
          <div className="uc-where">
            {whereText(unit)}
            {own && unit.where.kind === 'map' && game.phase === 'movement' && (
              <> · {why ? `cannot move: ${why}` : unit.mpSpent === null ? `can move (${allowedModes(game, unit).join(', ')})` : `${+unit.mpSpent.toFixed(1)} MP used`}</>
            )}
          </div>
        </div>
      </div>
      {stack.length > 1 && (
        <div className="uc-stack">
          {stack.map((u) => (
            <button key={u.id} className={u.id === unit.id ? 'on' : ''} onClick={() => onSelect(u.id)} title={def(u.id).name}>
              <TokenIcon unit={u} size={40} />
            </button>
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

export function CombatPopup({ game, humanSides }: { game: GameState; humanSides: Side[] }) {
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
    const t = setTimeout(() => setRolling(false), 750);
    return () => clearTimeout(t);
  }, [rolling, shown?.key]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), game.pendingDefense ? 60000 : 5200);
    return () => clearTimeout(t);
  }, [shown, game.pendingDefense]);
  if (!shown) return null;
  const r = shown.rep;
  const place = MAP.hexes[r.defenderHex]?.city ?? MAP.hexes[r.defenderHex]?.town ?? `hex ${r.defenderHex}`;
  const yours = humanSides.includes(r.attackerSide);
  return (
    <div className={`combat-pop ${r.attackerSide === 'Allied' ? 'allied' : 'german'}`}>
      <button className="cp-close" title="Close" onClick={() => setShown(null)}>✕</button>
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

export function DefenseModal({ children }: { children: React.ReactNode }) {
  return (
    <div className="modal-back soft">
      <div className="modal defense">{children}</div>
    </div>
  );
}

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
        <div className="go-kicker">{SCENARIOS[game.scenarioId]?.name} · day {game.turn}</div>
        <h1>{title}</h1>
        {solo && <div className="go-sub">{game.winner} victory</div>}
        <p>{game.victoryNote}</p>
        <div className="go-stats">
          <div><b>{alliedVp(game)}</b><span>Allied VP</span></div>
          <div><b>{game.combats.length}</b><span>Battles</span></div>
          <div><b>{lost('Allied')}</b><span>Allied units lost</span></div>
          <div><b>{lost('German')}</b><span>German units lost</span></div>
        </div>
        {breakdown.parts.length > 0 && <div className="go-parts">{breakdown.parts.join(' · ')}</div>}
        <div className="go-buttons">
          <button onClick={onReview}>Review the battlefield</button>
          <button className="primary" onClick={onMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}

export function PauseMenu({ game, onResume, onSettings, onQuit, onLoad, onRules }: {
  game: GameState; onResume: () => void; onSettings: () => void; onQuit: () => void; onLoad: (g: GameState) => void; onRules: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-back" onClick={onResume}>
      <div className="modal pause" onClick={(e) => e.stopPropagation()}>
        <h2>Paused</h2>
        <div className="sub">{SCENARIOS[game.scenarioId]?.name} · day {game.turn} · the game saves itself after every action</div>
        <div className="menu-buttons">
          <button className="primary" onClick={onResume}>Resume</button>
          <button onClick={onSettings}>Settings</button>
          <button onClick={onRules}>Rules reference</button>
          <button onClick={() => downloadText(`salerno43-day${game.turn}.json`, JSON.stringify(game))}>Save to file</button>
          <button onClick={() => fileRef.current?.click()}>Load from file</button>
          <button className="danger" onClick={onQuit}>Main menu</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              onLoad(JSON.parse(await f.text()) as GameState);
            } catch {
              alert('That file is not a saved game.');
            }
          }} />
      </div>
    </div>
  );
}
