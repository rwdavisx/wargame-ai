// Play with friends: the games open on this shared page, hosting a new one and taking a seat in one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTIES, type Difficulty } from '../ai/heuristic';
import { SCENARIOS } from '../engine/data';
import type { GameOptions, Side } from '../engine/types';
import { loadCaps, type Caps } from '../net/caps';
import { claimSeat, createGame, deleteGame, freeSides, humanSides, NetSession, seatedOn, type NetHead, type NetMode } from '../net/session';
import { CanvasImage } from './render/CanvasImage';
import { gameInfo, playable, selectGame } from '../games';
import type { TerrainImage } from './render/terrain';
import { Insignia } from './render/units';
import { DifficultyCards, ScenarioCards, SideBadge, StartAndRules } from './screens';
import { Badge, Banner, Button, Card, Heading, HStack, Text, TextInput, VStack } from '@astryxdesign/core';
import { ChoiceCard, SectionLabel, useConfirm } from './astryx/kit';
import { sfx } from './sound';
import { yourMoveAlert } from './alerts';

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
  /** Buzz and chime when one of the player's games comes back to them. */
  alerts: boolean;
  onEnter: (session: NetSession) => void;
  onBack: () => void;
}

export function NetLobby({ terrain, aiLevel, alerts, onEnter, onBack }: Props) {
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
  const confirm = useConfirm();

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
  // The games waiting on this player, first in the list; a game coming back to them while they look at the lobby buzzes.
  const myMove = (h: NetHead) => !!me && !h.over && h.seats[me] === h.active;
  const waiting = useMemo(() => new Set((games ?? []).filter((r) => myMove(r.head)).map((r) => r.id)), [games, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const seenWaiting = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (games === null || !me) return;
    const before = seenWaiting.current;
    if (before && alerts && [...waiting].some((id) => !before.has(id))) yourMoveAlert();
    seenWaiting.current = waiting;
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (games ? [...games].sort((a, b) => Number(waiting.has(b.id)) - Number(waiting.has(a.id))) : null), [games, waiting]);
  const nameOf = (h: NetHead, id: string) => (id === me ? 'You' : names[id] || h.names?.[id] || 'A friend');

  const myName = platformName || callsign.trim();
  const typed = platformName ? undefined : callsign.trim() || undefined;

  const enter = async (gid: string) => {
    if (!caps?.db || !me) return;
    setBusy(gid);
    setError(null);
    try {
      // The game's own map and counters must be loaded before its actions are replayed.
      const head = games?.find((r) => r.id === gid)?.head;
      const want = head?.game ?? 'salerno43';
      if (!playable(want)) throw new Error(`${gameInfo(want).title} cannot be played here yet.`);
      selectGame(want);
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
    if (!caps?.db || !(await confirm.ask({ title: `Delete "${r.head.title}"?`, description: 'The game is deleted for everyone who plays or watches it. This cannot be undone.', actionLabel: 'Delete', destructive: true }))) return;
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
        <Heading level={1} className="screen-title">Play with friends</Heading>
        <VStack gap={3}>
          {body}
          {error && <Banner status="error" title={error} collapsible={false} />}
          {confirm.dialog}
        </VStack>
      </div>
    </div>
  );
  const callsignField = (
    <TextInput label="Your call sign" placeholder="How your friends see you" value={callsign} width={320}
      onChange={(v) => setCallsign(v.slice(0, 24))} />
  );

  if (caps === undefined) return shell(<Text color="secondary">Connecting…</Text>);
  if (!caps || !caps.db) {
    return shell(
      <>
        <Text display="block">
          {caps ? 'Sign in to claude.ai to play online.' : 'Online play works on the shared claude.ai page of this game.'} Open the game from its claude.ai link, on a phone or a computer, to host a game or join a friend's.
        </Text>
        <HStack className="setup-buttons"><Button label="Back" onClick={onBack} /></HStack>
      </>,
    );
  }
  if (hosting && me) {
    return shell(
      <HostForm aiLevel={aiLevel} callsignField={!platformName ? callsignField : null} ready={!!platformName || !!callsign.trim()} onBack={() => setHosting(false)}
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
      <Text display="block" className="net-how">
        Host a game here, then share this page with your friends: in its <b>Share</b> menu on claude.ai invite each of them by email as an <b>Editor</b> (with no public link). They open the same page on their phone, tap <b>Play with friends</b> and take the free seat. Moves reach the other phone within a moment, and everyone can leave and come back later.
      </Text>
      {!writable && <Banner status="warning" title="You can watch games on this page" description="To play you need Editor access: ask the page's owner to invite you as an Editor." collapsible={false} />}
      {!platformName && callsignField}
      <HStack hAlign="between" vAlign="center" className="net-head-row">
        <SectionLabel>Games on this page</SectionLabel>
        {writable && <Button label="Host a new game" variant="primary" onClick={() => setHosting(true)} />}
      </HStack>
      {shown === null ? <Text color="secondary">Loading…</Text> : !shown.length ? <Text color="secondary">No games yet. Host one and invite a friend.</Text> : (
        <VStack gap={2} className="net-games">
          {shown.map((r) => {
            const h = r.head;
            const mine = me ? h.seats[me] : undefined;
            const open = freeSides(h);
            const sc = SCENARIOS[h.scenario]?.name ?? h.scenario;
            const needName = !platformName && !callsign.trim();
            return (
              <Card key={r.id} padding={3} className={`net-game${mine ? ' mine' : ''}`}>
                <div className="net-game-main">
                  <HStack gap={2} vAlign="center">
                    <Heading level={4} className="choice-title">{h.title}</Heading>
                    {waiting.has(r.id) && <Badge variant="warning" label="Your move" />}
                  </HStack>
                  <Text color="secondary" display="block">
                    {gameInfo(h.game ?? 'salerno43').name} · {h.mode === 'versus' ? 'Versus' : `Co-op against the computer (${DIFFICULTIES.find((d) => d.key === h.aiLevel)?.label ?? h.aiLevel})`} · {sc} · {h.over ? 'finished' : `day ${h.turn}, ${SIDE_NAME[h.active]} ${PHASE[h.phase] ?? h.phase}`}
                  </Text>
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
                <HStack gap={2} className="net-game-actions" wrap="wrap">
                  {mine ? (
                    <Button label={h.over ? 'Review' : 'Resume'} variant="primary" isLoading={busy === r.id} isDisabled={!!busy && busy !== r.id} onClick={() => enter(r.id)} />
                  ) : (
                    <>
                      {writable && !h.over && open.map((side) => (
                        <Button key={side} label={`Join as ${SIDE_NAME[side]}`} variant="primary" isLoading={busy === r.id} isDisabled={(!!busy && busy !== r.id) || needName}
                          tooltip={needName ? 'Type a call sign first' : undefined} onClick={() => join(r.id, side)} />
                      ))}
                      <Button label="Watch" isDisabled={!!busy} onClick={() => enter(r.id)} />
                    </>
                  )}
                  {me === h.host && <Button label="Delete" variant="destructive" isDisabled={!!busy} tooltip="Delete this game for everyone" onClick={() => remove(r)} />}
                </HStack>
              </Card>
            );
          })}
        </VStack>
      )}
      <HStack className="setup-buttons"><Button label="Back" onClick={onBack} /></HStack>
    </>,
  );
}

function HostForm({ aiLevel, callsignField, ready, onBack, onCreate, busy }: {
  aiLevel: Difficulty; callsignField: React.ReactNode; ready: boolean; onBack: () => void; busy: boolean;
  onCreate: (s: { mode: NetMode; side: Side; scenario: string; options: GameOptions; aiLevel: Difficulty }) => void;
}) {
  const [mode, setMode] = useState<NetMode>('versus');
  const [side, setSide] = useState<Side>('Allied');
  const [scenario, setScenario] = useState('short');
  const [options, setOptions] = useState<GameOptions>({ disengagement: true, rollLandings: true });
  const [level, setLevel] = useState<Difficulty>(aiLevel);
  return (
    <div>
      <SectionLabel>Game</SectionLabel>
      <div className="cards">
        <ChoiceCard selected={mode === 'versus'} onSelect={() => setMode('versus')} title="Versus"
          text="You against a friend: one of you commands the Allies, the other the Germans." />
        <ChoiceCard selected={mode === 'coop'} onSelect={() => setMode('coop')} title="Co-op"
          text="You and a friend command the same side together against the computer. Either of you can move any unit." />
      </div>
      <SectionLabel>{mode === 'versus' ? 'Your side' : 'Your side (and your friend\'s)'}</SectionLabel>
      <div className="cards">
        {(['Allied', 'German'] as const).map((sd) => (
          <ChoiceCard key={sd} selected={side === sd} onSelect={() => setSide(sd)} icon={<SideBadge side={sd} />} title={sd === 'Allied' ? 'The Allies' : 'The Germans'}
            text={sd === 'Allied' ? 'Fifth Army: land, take Salerno and the plain, break out for Naples.' : 'Tenth Army: counterattack the beachhead, then hold the hills and the roads north.'} />
        ))}
      </div>
      {mode === 'coop' && <DifficultyCards value={level} onChange={setLevel} />}
      <ScenarioCards scenario={scenario} setScenario={setScenario} />
      <StartAndRules options={options} setOptions={setOptions} />
      {callsignField && <div className="net-callsign">{callsignField}</div>}
      <HStack className="setup-buttons" hAlign="between">
        <Button label="Back" onClick={onBack} />
        <Button label="Open the game ▶" variant="primary" size="lg" isLoading={busy} isDisabled={!ready} onClick={() => onCreate({ mode, side, scenario, options, aiLevel: level })} />
      </HStack>
    </div>
  );
}
