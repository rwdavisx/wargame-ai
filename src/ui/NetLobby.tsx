// Play with friends: the games open on this shared page, hosting a new one and taking a seat in one.
import { useEffect, useMemo, useState } from 'react';
import { DIFFICULTIES, type Difficulty } from '../ai/heuristic';
import { SCENARIOS } from '../engine/data';
import type { GameOptions, Side } from '../engine/types';
import { loadCaps, type Caps } from '../net/caps';
import { claimSeat, createGame, deleteGame, freeSides, humanSides, NetSession, seatedOn, type NetHead, type NetMode } from '../net/session';
import { CanvasImage } from './render/CanvasImage';
import type { TerrainImage } from './render/terrain';
import { Insignia } from './render/units';
import { ScenarioCards, StartAndRules } from './screens';
import { sfx } from './sound';

const SIDE_NAME: Record<Side, string> = { Allied: 'Allies', German: 'Germans' };
const PHASE: Record<string, string> = { invasion: 'landings', initial: 'initial phase', movement: 'movement', combat: 'combat', recovery: 'recovery', supply: 'supply', gameOver: 'over' };

/** A player id for viewers the platform gives none (kept in this browser). */
function localPid(): string {
  try {
    let id = localStorage.getItem('s43.pid');
    if (!id) {
      id = `p-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('s43.pid', id);
    }
    return id;
  } catch {
    return `p-${Math.random().toString(36).slice(2, 12)}`;
  }
}
const loadCallsign = () => {
  try {
    return localStorage.getItem('s43.callsign') ?? '';
  } catch {
    return '';
  }
};
const saveCallsign = (s: string) => {
  try {
    localStorage.setItem('s43.callsign', s);
  } catch {
    /* not kept */
  }
};

interface Row {
  id: string;
  head: NetHead;
}

interface Props {
  terrain: TerrainImage;
  aiLevel: Difficulty;
  onEnter: (session: NetSession) => void;
  onBack: () => void;
}

export function NetLobby({ terrain, aiLevel, onEnter, onBack }: Props) {
  const [caps, setCaps] = useState<Caps | null | undefined>(undefined);
  const [me, setMe] = useState<string | null>(null);
  const [platformName, setPlatformName] = useState('');
  const [callsign, setCallsign] = useState(loadCallsign);
  const [writable, setWritable] = useState(true);
  const [games, setGames] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [hosting, setHosting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadCaps().then(async (c) => {
      if (!live) return;
      setCaps(c);
      if (!c?.db) return;
      const id = (await c.user?.id()) ?? localPid();
      const who = await c.user?.me();
      const can = await c.user?.can('data.write');
      if (!live) return;
      setMe(id);
      setPlatformName(who?.name ?? '');
      setWritable(can !== false);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const db = caps?.db;
    if (!db) return;
    return db.collection('games').orderBy('updated', 'desc').limit(40).onSnapshot(
      (q) => setGames(q.docs.filter((d) => d.exists).map((d) => ({ id: d.id, head: d.data() as unknown as NetHead })).filter((r) => r.head?.v === 1)),
      (e) => setError(`The game list is not available (${e.message}).`),
    );
  }, [caps]);

  // Players' names as this viewer sees them, or the call signs they typed.
  const ids = useMemo(() => [...new Set((games ?? []).flatMap((r) => Object.keys(r.head.seats)))].sort().join(','), [games]);
  useEffect(() => {
    const user = caps?.user;
    if (!user || !ids) return;
    user.profiles(ids.split(',')).then((p) => setNames(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.name])))).catch(() => {});
  }, [caps, ids]);
  const nameOf = (h: NetHead, id: string) => (id === me ? 'You' : names[id] || h.names?.[id] || 'A friend');

  const myName = platformName || callsign.trim();
  const typed = platformName ? undefined : callsign.trim() || undefined;

  const enter = async (gid: string) => {
    if (!caps?.db || !me) return;
    setBusy(gid);
    setError(null);
    try {
      const s = new NetSession(caps.db, gid, me, caps.room);
      s.user = caps.user;
      await s.start();
      sfx.select();
      onEnter(s);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const join = async (gid: string, side: Side) => {
    if (!caps?.db || !me) return;
    setBusy(gid);
    setError(null);
    try {
      if (typed) saveCallsign(callsign.trim());
      await claimSeat(caps.db, gid, me, side, typed);
      await enter(gid);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const remove = async (r: Row) => {
    if (!caps?.db || !window.confirm(`Delete "${r.head.title}" for everyone?`)) return;
    setBusy(r.id);
    try {
      await deleteGame(caps.db, r.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const shell = (body: React.ReactNode) => (
    <div className="screen setup">
      <div className="backdrop">
        <CanvasImage src={terrain.medium} className="backdrop-img" />
        <div className="backdrop-shade" />
      </div>
      <div className="setup-panel net-lobby">
        <h1>Play with friends</h1>
        {body}
        {error && <p className="net-error" role="alert">{error}</p>}
      </div>
    </div>
  );

  if (caps === undefined) return shell(<p className="muted">Connecting…</p>);
  if (!caps || !caps.db) {
    return shell(
      <>
        <p>
          {caps ? 'Sign in to claude.ai to play online.' : 'Online play works on the shared claude.ai page of this game.'} Open the game from its claude.ai link, on a phone or a computer, to host a game or join a friend's.
        </p>
        <div className="setup-buttons"><button onClick={onBack}>Back</button></div>
      </>,
    );
  }
  if (hosting && me) {
    return shell(
      <HostForm aiLevel={aiLevel} needName={!platformName} callsign={callsign} setCallsign={setCallsign} onBack={() => setHosting(false)}
        onCreate={async (setup) => {
          setBusy('new');
          setError(null);
          try {
            if (typed) saveCallsign(callsign.trim());
            const title = `${myName || 'Someone'}'s ${setup.mode === 'versus' ? 'battle' : 'co-op'}`;
            const gid = await createGame(caps.db!, me, { ...setup, title, name: typed });
            await enter(gid);
          } catch (e) {
            setError((e as Error).message);
            setBusy(null);
          }
        }} busy={busy === 'new'} />,
    );
  }

  return shell(
    <>
      <p className="net-how">
        Host a game here, then share this page with your friends: in its <b>Share</b> menu on claude.ai invite each of them by email as an <b>Editor</b> (with no public link). They open the same page on their phone, tap <b>Play with friends</b> and take the free seat. Moves reach the other phone within a moment, and everyone can leave and come back later.
      </p>
      {!writable && <p className="net-error">You can watch games on this page, but to play you need Editor access: ask the page's owner to invite you as an Editor.</p>}
      {!platformName && (
        <label className="field net-callsign">
          <span>Your call sign</span>
          <input value={callsign} maxLength={24} placeholder="How your friends see you" onChange={(e) => setCallsign(e.target.value)} />
        </label>
      )}
      <div className="net-head-row">
        <h3>Games on this page</h3>
        {writable && <button className="primary" onClick={() => setHosting(true)}>Host a new game</button>}
      </div>
      {games === null ? <p className="muted">Loading…</p> : !games.length ? <p className="muted">No games yet. Host one and invite a friend.</p> : (
        <ul className="net-games">
          {games.map((r) => {
            const h = r.head;
            const mine = me ? h.seats[me] : undefined;
            const open = freeSides(h);
            const sc = SCENARIOS[h.scenario]?.name ?? h.scenario;
            return (
              <li key={r.id} className={`net-game${mine ? ' mine' : ''}`}>
                <div className="net-game-main">
                  <div className="net-game-title">{h.title}</div>
                  <div className="net-game-meta">
                    {h.mode === 'versus' ? 'Versus' : `Co-op against the computer (${DIFFICULTIES.find((d) => d.key === h.aiLevel)?.label ?? h.aiLevel})`} · {sc} · {h.over ? 'finished' : `day ${h.turn}, ${SIDE_NAME[h.active]} ${PHASE[h.phase] ?? h.phase}`}
                  </div>
                  <div className="net-seats">
                    {humanSides(h).map((side) => (
                      <span key={side} className={`net-seat ${side === 'Allied' ? 'allied' : 'german'}`}>
                        <svg viewBox="-6 -6 12 12" width={16} height={16} aria-hidden><Insignia nation={side === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} /></svg>
                        {SIDE_NAME[side]}: {seatedOn(h, side).map((id) => nameOf(h, id)).join(' & ') || <i>open</i>}
                      </span>
                    ))}
                    {h.aiSide && <span className="net-seat ai">{SIDE_NAME[h.aiSide]}: computer</span>}
                  </div>
                </div>
                <div className="net-game-actions">
                  {mine ? (
                    <button className="primary" disabled={!!busy} onClick={() => enter(r.id)}>{busy === r.id ? 'Opening…' : h.over ? 'Review' : 'Resume'}</button>
                  ) : (
                    <>
                      {writable && !h.over && open.map((side) => (
                        <button key={side} className="primary" disabled={!!busy || (!platformName && !callsign.trim())} onClick={() => join(r.id, side)}
                          title={!platformName && !callsign.trim() ? 'Type a call sign first' : undefined}>
                          {busy === r.id ? 'Joining…' : `Join as ${SIDE_NAME[side]}`}
                        </button>
                      ))}
                      <button disabled={!!busy} onClick={() => enter(r.id)}>Watch</button>
                    </>
                  )}
                  {me === h.host && <button className="net-delete" disabled={!!busy} onClick={() => remove(r)} title="Delete this game for everyone">Delete</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="setup-buttons"><button onClick={onBack}>Back</button></div>
    </>,
  );
}

function HostForm({ aiLevel, needName, callsign, setCallsign, onBack, onCreate, busy }: {
  aiLevel: Difficulty; needName: boolean; callsign: string; setCallsign: (s: string) => void; onBack: () => void; busy: boolean;
  onCreate: (s: { mode: NetMode; side: Side; scenario: string; options: GameOptions; aiLevel: Difficulty }) => void;
}) {
  const [mode, setMode] = useState<NetMode>('versus');
  const [side, setSide] = useState<Side>('Allied');
  const [scenario, setScenario] = useState('short');
  const [options, setOptions] = useState<GameOptions>({ disengagement: true, rollLandings: true });
  const [level, setLevel] = useState<Difficulty>(aiLevel);
  return (
    <>
      <h3>Game</h3>
      <div className="cards">
        <button className={`card${mode === 'versus' ? ' on' : ''}`} onClick={() => setMode('versus')}>
          <div className="card-title">Versus</div>
          <div className="card-text">You against a friend: one of you commands the Allies, the other the Germans.</div>
        </button>
        <button className={`card${mode === 'coop' ? ' on' : ''}`} onClick={() => setMode('coop')}>
          <div className="card-title">Co-op</div>
          <div className="card-text">You and a friend command the same side together against the computer. Either of you can move any unit.</div>
        </button>
      </div>
      <h3>{mode === 'versus' ? 'Your side' : 'Your side (and your friend\'s)'}</h3>
      <div className="cards">
        {(['Allied', 'German'] as const).map((sd) => (
          <button key={sd} className={`card${side === sd ? ' on' : ''}`} onClick={() => setSide(sd)}>
            <svg viewBox="-6 -6 12 12" width={30} height={30}><Insignia nation={sd === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} /></svg>
            <div className="card-title">{sd === 'Allied' ? 'The Allies' : 'The Germans'}</div>
            <div className="card-text">{sd === 'Allied' ? 'Fifth Army: land, take Salerno and the plain, break out for Naples.' : 'Tenth Army: counterattack the beachhead, then hold the hills and the roads north.'}</div>
          </button>
        ))}
      </div>
      {mode === 'coop' && (
        <>
          <h3>Computer opponent</h3>
          <div className="cards four difficulty">
            {DIFFICULTIES.map((d, i) => (
              <button key={d.key} className={`card${level === d.key ? ' on' : ''}`} onClick={() => setLevel(d.key)}>
                <div className="card-title"><span className="pips" aria-hidden>{[0, 1, 2, 3].map((k) => <i key={k} className={k <= i ? 'on' : ''}>★</i>)}</span> {d.label}</div>
                <div className="card-text">{d.note}</div>
              </button>
            ))}
          </div>
        </>
      )}
      <ScenarioCards scenario={scenario} setScenario={setScenario} />
      <StartAndRules options={options} setOptions={setOptions} />
      {needName && (
        <label className="field net-callsign">
          <span>Your call sign</span>
          <input value={callsign} maxLength={24} placeholder="How your friends see you" onChange={(e) => setCallsign(e.target.value)} />
        </label>
      )}
      <div className="setup-buttons">
        <button onClick={onBack}>Back</button>
        <button className="primary big" disabled={busy || (needName && !callsign.trim())} onClick={() => onCreate({ mode, side, scenario, options, aiLevel: level })}>
          {busy ? 'Opening…' : 'Open the game ▶'}
        </button>
      </div>
    </>
  );
}
