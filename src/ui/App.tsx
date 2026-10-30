// The game shell: paints the map, then runs the title, setup, briefing and battle screens.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { newGame } from '../engine/game';
import type { GameOptions, GameState, Side } from '../engine/types';
import { humanSides as netSides, seatedOn, type NetLink, type NetSession } from '../net/session';
import { NetLobby } from './NetLobby';
import { GameScreen } from './GameScreen';
import { renderTerrain, type TerrainImage } from './render/terrain';
import { TokenDefs } from './render/units';
import { BriefingScreen, HowToPlay, LoadingScreen, NewGameScreen, TitleScreen } from './screens';
import { SettingsModal } from './SettingsModal';
import { initMusic, setMusic } from './music';
import { setSound } from './sound';
import { autosave, hasAutosave, loadAutosave, loadSettings, saveSettings, type Settings } from './storage';

type Screen = 'loading' | 'title' | 'new' | 'lobby' | 'briefing' | 'game';

const noSub = () => () => {};
// In an online game the session holds the position; the battle screen moves it through the session only.
const ignoreNetSet = () => {};
const zero = () => 0;

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>('loading');
  const [terrain, setTerrain] = useState<TerrainImage | null>(null);
  const [progress, setProgress] = useState<{ f: number; label: string }>({ f: 0, label: 'Unfolding the map' });
  const [game, setGame] = useState<GameState>(() => loadAutosave() ?? newGame('short'));
  const [mapVersion, setMapVersion] = useState(0);
  const [modal, setModal] = useState<'none' | 'settings' | 'howto'>('none');
  const [canContinue, setCanContinue] = useState(hasAutosave);
  const rendering = useRef(false);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  useEffect(() => setSound(settings.sound, settings.volume), [settings.sound, settings.volume]);
  useEffect(() => initMusic(), []);
  useEffect(() => setMusic(settings.music, settings.musicVolume), [settings.music, settings.musicVolume]);
  // Online play: the shared game, the names of its players, and the link the battle screen talks through.
  const [net, setNet] = useState<NetSession | null>(null);
  const netVersion = useSyncExternalStore(net?.subscribe ?? noSub, net?.getVersion ?? zero);
  const [names, setNames] = useState<Record<string, string>>({});
  const seatKey = net?.head ? Object.keys(net.head.seats).sort().join(',') : '';
  useEffect(() => {
    if (!net?.user || !seatKey) return;
    net.user.profiles(seatKey.split(',')).then((p) => setNames(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.name])))).catch(() => {});
  }, [net, seatKey]);
  const link = useMemo<NetLink | undefined>(() => {
    if (!net?.head) return undefined;
    const h = net.head;
    const nameOf = (id: string) => names[id] || h.names?.[id] || 'your friend';
    return {
      incoming: net.incoming(),
      push: (a, base, next) => net.push(a, base, next),
      consumed: (base, next) => net.consumed(base, next),
      canUndo: net.canUndo(),
      undo: (prev) => void net.undo(prev),
      status: net.status,
      notice: net.notice,
      who: (side: Side) => {
        if (h.aiSide === side) return 'the computer';
        const ids = seatedOn(h, side).filter((id) => id !== net.me);
        return ids.length ? ids.map(nameOf).join(' & ') : 'a friend to join';
      },
      others: netSides(h).flatMap((side) => seatedOn(h, side).filter((id) => id !== net.me).map((id) => ({ name: nameOf(id), side, here: net.online.has(id) }))),
    };
  }, [net, netVersion, names]); // eslint-disable-line react-hooks/exhaustive-deps
  // In an online game the seats decide who commands each side (and the host's choice the computer's skill).
  const playSettings = useMemo<Settings>(
    () => (net?.head ? { ...settings, controllers: net.controllers, aiLevel: net.head.aiLevel } : settings),
    [settings, net, net?.controllers, net?.head?.aiLevel], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const setPlaySettings = (s: Settings) => setSettings(net ? { ...s, controllers: settings.controllers, aiLevel: settings.aiLevel } : s);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __net?: NetSession | null }).__net = net;
  }, [net]);
  const enterNet = (s: NetSession) => {
    setNet(s);
    setScreen(s.shown > 0 ? 'game' : 'briefing');
  };
  const leaveNet = () => {
    net?.stop();
    setNet(null);
    setNames({});
    setGame(loadAutosave() ?? newGame('short'));
    setCanContinue(hasAutosave());
  };

  useEffect(() => {
    if (screen === 'game' && !net) autosave(game);
  }, [game, screen, net]);

  // Paint the map once (cached afterwards); repaint in the background after map edits.
  useEffect(() => {
    if (rendering.current) return;
    rendering.current = true;
    renderTerrain((f, label) => setProgress({ f, label }))
      .then((t) => {
        setTerrain(t);
        setScreen((s) => (s === 'loading' ? 'title' : s));
      })
      .catch((e) => setProgress({ f: 1, label: `Could not paint the map (${(e as Error).message})` }))
      .finally(() => {
        rendering.current = false;
      });
  }, [mapVersion]);

  const startNew = (scenario: string, options: GameOptions) => {
    setGame(newGame(scenario, undefined, options));
    setScreen('briefing');
  };
  const localSide = settings.controllers.Allied === 'human' && settings.controllers.German !== 'human' ? 'Allied'
    : settings.controllers.German === 'human' && settings.controllers.Allied !== 'human' ? 'German' : null;
  const humanSide = net ? (net.head?.seats[net.me] ?? null) : localSide;

  if (!terrain || screen === 'loading') {
    return (
      <>
        <TokenDefs />
        <LoadingScreen progress={progress.f} label={progress.label} />
      </>
    );
  }
  return (
    <>
      <TokenDefs />
      {screen === 'title' && (
        <TitleScreen terrain={terrain} canContinue={canContinue} onContinue={() => setScreen('game')} onNew={() => setScreen('new')} onOnline={() => setScreen('lobby')}
          onSettings={() => setModal('settings')} onHowTo={() => setModal('howto')} />
      )}
      {screen === 'new' && <NewGameScreen terrain={terrain} settings={settings} setSettings={setSettings} onStart={startNew} onBack={() => setScreen('title')} />}
      {screen === 'lobby' && <NetLobby terrain={terrain} aiLevel={settings.aiLevel} alerts={settings.turnAlerts !== false} onEnter={enterNet} onBack={() => setScreen('title')} />}
      {screen === 'briefing' && <BriefingScreen terrain={terrain} game={net?.game ?? game} side={humanSide} onBegin={() => setScreen('game')} />}
      {screen === 'game' && (
        <GameScreen
          game={net?.game ?? game}
          setGame={net ? ignoreNetSet : setGame}
          settings={playSettings}
          setSettings={setPlaySettings}
          net={link}
          terrain={terrain}
          mapVersion={mapVersion}
          bumpMap={() => setMapVersion((v) => v + 1)}
          onQuit={() => {
            if (net) leaveNet();
            else setCanContinue(game.phase !== 'gameOver');
            setScreen(net ? 'lobby' : 'title');
          }}
          onLoad={(g) => setGame(g)}
        />
      )}
      {modal === 'settings' && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setModal('none')} />}
      {modal === 'howto' && <HowToPlay mouse={settings.mouseControls} onClose={() => setModal('none')} />}
    </>
  );
}
