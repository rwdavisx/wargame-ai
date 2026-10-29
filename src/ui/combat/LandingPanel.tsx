// D-Day: the Allied player rolls the Invasion table for each beach (24.2) and watches the assault
// waves come ashore. Docked beside the map like the battle panel, so the beaches stay in view.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAP, RULES } from '../../engine/data';
import { invasionColumn, landingsLeft } from '../../engine/game';
import type { HexId } from '../../engine/hex';
import type { Action, GameState } from '../../engine/types';
import { def } from '../../engine/units';
import { TokenIcon } from '../render/units';
import { sfx } from '../sound';
import { NO_INSET, type BattleInset } from './BattleScreen';
import { Die3D, Pips } from './Die';

const COLUMN_NAME = { Rangers: 'Rangers and Commandos', Uncle: 'Uncle Beach', Other: 'All other beaches' } as const;

/** What an Invasion table entry means, in words. */
function outcome(res: string): { title: string; tone: 'good' | 'mid' | 'bad' } {
  const lose = res.startsWith('-1');
  const adv = Number(res.split(',').pop());
  if (lose) return { title: 'Heavy casualties: a step lost, pinned on the beach', tone: 'bad' };
  return adv >= 2 ? { title: 'Ashore cleanly: may push one hex inland', tone: 'good' } : { title: 'Pinned on the beach', tone: 'mid' };
}
const short = (res: string) => (res.startsWith('-1') ? '−1 step, Adv 1' : `Adv ${res}`);

interface Props {
  game: GameState;
  dispatch: (a: Action) => GameState | null;
  speed: number;
  /** Keep the map at the moment before a roll until the die lands. */
  onHold: (on: boolean) => void;
  onFocus: (hex: HexId) => void;
  /** How much of the map the panel covers, so the camera frames the beaches clear of it. */
  onFootprint: (inset: BattleInset) => void;
  onClose: () => void;
  /** The computer commands the Allies: the panel rolls every beach by itself while the player watches. */
  spectator?: boolean;
}

export function LandingPanel({ game, dispatch, speed, onHold, onFocus, onFootprint, onClose, spectator }: Props) {
  // Beaches in the order the card lists them, with the units waiting in each landing box (captured before any roll).
  const [beaches] = useState(() => landingsLeft(game).map((name) => ({
    name,
    hex: MAP.beaches[name].hex as HexId,
    units: Object.values(game.units).filter((u) => u.where.kind === 'landing' && u.where.beach === name).map((u) => ({ ...u })),
  })));
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [throwKey, setThrowKey] = useState(0);
  const [rolling, setRolling] = useState(false);
  const queue = useRef<string[]>([]);
  const left = landingsLeft(game);
  const done = !left.length && !rolling;

  const rollBeach = (name: string) => {
    if (rolling || !left.includes(name)) return;
    onFocus(MAP.beaches[name].hex);
    onHold(true);
    const next = dispatch({ type: 'landBeach', beach: name });
    if (!next) {
      onHold(false);
      return;
    }
    const entry = [...next.log].reverse().find((l) => l.kind === 'landing' && l.text.includes(`${name} beach`));
    const roll = Number(entry?.text.match(/Landing roll (\d)/)?.[1] ?? 0);
    setRolls((r) => ({ ...r, [name]: roll }));
    setCurrent(name);
    setRolling(true);
    setThrowKey((k) => k + 1);
  };
  // The next roll in a "Roll all" must use the game as it is after this one, not as it was when it was queued.
  const latest = useRef(rollBeach);
  latest.current = rollBeach;
  const landed = () => {
    setRolling(false);
    onHold(false);
    sfx.march();
    const nextName = queue.current.shift();
    if (nextName) window.setTimeout(() => latest.current(nextName), 500 * speed);
  };
  const rollNext = () => left[0] && rollBeach(left[0]);
  const rollAll = () => {
    queue.current = left.slice(1);
    rollNext();
  };

  // Watching the computer: it rolls every beach in turn, starting a moment after the panel opens.
  useEffect(() => {
    if (!spectator) return;
    const t = window.setTimeout(() => {
      queue.current = landingsLeft(game).slice(1);
      latest.current(landingsLeft(game)[0]);
    }, 700 * speed);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Space rolls the next beach (or closes the panel once every beach is ashore); Enter as well.
  const keys = useRef({ rollNext, done, onClose, spectator });
  keys.current = { rollNext, done, onClose, spectator };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (keys.current.done) keys.current.onClose();
      else if (!keys.current.spectator) keys.current.rollNext();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => () => onHold(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tell the map how much of it the panel covers (a side panel, or a bottom sheet on a phone held upright).
  const dockRef = useRef<HTMLDivElement>(null);
  const footprint = useRef(onFootprint);
  footprint.current = onFootprint;
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const side = el.offsetHeight > H * 0.6 && el.offsetLeft > W * 0.2;
      const sheet = !side && el.offsetLeft < 8 && el.offsetWidth > W * 0.9;
      footprint.current({ right: side ? Math.max(0, W - el.offsetLeft) : 0, bottom: sheet ? Math.max(0, H - el.offsetTop) : 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      footprint.current(NO_INSET);
    };
  }, []);

  const cur = current ? beaches.find((b) => b.name === current) : null;
  const curRes = cur && rolls[cur.name] ? RULES.invasion[invasionColumn(cur.name)][rolls[cur.name] - 1] : null;

  return (
    <div ref={dockRef} className="cbx-dock att-allied landing-dock">
      <div className="cbx" role="dialog" aria-modal="false" aria-label="The landings">
        <header className="cbx-head">
          <div className="cbx-kicker">D-Day · 9 September 1943 · Invasion table (24.2)</div>
          <h2 className="cbx-title">{spectator ? 'The Allies land' : 'The landings'}</h2>
        </header>
        <div className="land-die">
          <Die3D value={cur ? rolls[cur.name] ?? null : null} throwKey={throwKey} size={64} speed={speed} onLanded={landed} />
          <div className="land-die-cap">
            {!cur ? 'Roll for each beach' : rolling ? `${cur.name} beach…` : curRes ? <><b>{cur.name}: rolled {rolls[cur.name]}</b><span className={`tone-${outcome(curRes).tone}`}>{outcome(curRes).title}</span></> : null}
          </div>
        </div>
        <div className="cbx-body">
          <ol className="land-list">
            {beaches.map((b) => {
              const col = invasionColumn(b.name);
              const table = RULES.invasion[col] as string[];
              const r = rolls[b.name];
              const shown = r && !(rolling && current === b.name);
              const pending = left.includes(b.name);
              return (
                <li key={b.name} className={`land-row${current === b.name ? ' on' : ''}${shown ? ' rolled' : ''}`}>
                  <div className="land-head">
                    <button className="land-name" onClick={() => onFocus(b.hex)} title={`Show ${b.name} beach on the map`}>
                      <b>{b.name}</b><small>{b.hex} · {COLUMN_NAME[col]}</small>
                    </button>
                    {pending && !spectator ? (
                      <button className="land-roll" disabled={rolling} onClick={() => rollBeach(b.name)}><Pips n={5} size={16} /> Roll</button>
                    ) : shown ? (
                      <span className={`land-result tone-${outcome(table[r - 1]).tone}`}>{r}: {short(table[r - 1])}</span>
                    ) : null}
                  </div>
                  <div className="land-units">
                    {b.units.map((u) => <span key={u.id} title={def(u.id).name}><TokenIcon unit={u} size={30} /></span>)}
                  </div>
                  <div className="land-faces" role="list">
                    {table.map((res, i) => (
                      <span key={i} role="listitem" className={`land-face tone-${outcome(res).tone}${shown && r === i + 1 ? ' lit' : ''}`} title={outcome(res).title}>
                        <Pips n={i + 1} size={13} />
                        <i>{short(res)}</i>
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="land-note">Adv 1: the units stop on the beach. Adv 2: they may move one more hex inland. Only the Commandos may attack (Salerno) this phase.</p>
        </div>
        <footer className="cbx-actions">
          {!done && !spectator && left.length > 1 && <button className="cbx-secondary" disabled={rolling} onClick={rollAll}>Roll all</button>}
          {done ? (
            <button className="primary cbx-primary" onClick={onClose}>{spectator ? 'Continue ▶' : 'To the beaches ▶'}<kbd>Enter</kbd></button>
          ) : spectator ? (
            <button className="primary cbx-primary" disabled>The Allies are landing…</button>
          ) : (
            <button className="primary cbx-primary roll" disabled={rolling} onClick={rollNext}>
              <Pips n={5} size={20} /> {rolling ? 'Rolling…' : `Roll ${left[0]}`}<kbd>Space</kbd>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
