// The game shell: paints the map, then runs the title, setup, briefing and battle screens.
import { useEffect, useRef, useState } from 'react';
import { newGame } from '../engine/game';
import type { GameOptions, GameState } from '../engine/types';
import { GameScreen } from './GameScreen';
import { renderTerrain, type TerrainImage } from './render/terrain';
import { TokenDefs } from './render/units';
import { BriefingScreen, HowToPlay, LoadingScreen, NewGameScreen, TitleScreen } from './screens';
import { SettingsModal } from './SettingsModal';
import { setSound } from './sound';
import { autosave, hasAutosave, loadAutosave, loadSettings, saveSettings, type Settings } from './storage';

type Screen = 'loading' | 'title' | 'new' | 'briefing' | 'game';

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
  useEffect(() => {
    if (screen === 'game') autosave(game);
  }, [game, screen]);

  // Paint the map once (cached afterwards); repaint in the background after map edits.
  useEffect(() => {
    if (rendering.current) return;
    rendering.current = true;
    renderTerrain((f, label) => setProgress({ f, label }))
      .then((t) => {
        setTerrain((old) => {
          if (old?.url.startsWith('blob:')) URL.revokeObjectURL(old.url);
          return t;
        });
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
  const humanSide = settings.controllers.Allied === 'human' && settings.controllers.German !== 'human' ? 'Allied'
    : settings.controllers.German === 'human' && settings.controllers.Allied !== 'human' ? 'German' : null;

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
        <TitleScreen image={terrain.url} canContinue={canContinue} onContinue={() => setScreen('game')} onNew={() => setScreen('new')}
          onSettings={() => setModal('settings')} onHowTo={() => setModal('howto')} />
      )}
      {screen === 'new' && <NewGameScreen image={terrain.url} settings={settings} setSettings={setSettings} onStart={startNew} onBack={() => setScreen('title')} />}
      {screen === 'briefing' && <BriefingScreen image={terrain.url} game={game} side={humanSide} onBegin={() => setScreen('game')} />}
      {screen === 'game' && (
        <GameScreen
          game={game}
          setGame={setGame}
          settings={settings}
          setSettings={setSettings}
          terrain={terrain}
          mapVersion={mapVersion}
          bumpMap={() => setMapVersion((v) => v + 1)}
          onQuit={() => {
            setCanContinue(game.phase !== 'gameOver');
            setScreen('title');
          }}
          onLoad={(g) => setGame(g)}
        />
      )}
      {modal === 'settings' && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setModal('none')} />}
      {modal === 'howto' && <HowToPlay onClose={() => setModal('none')} />}
    </>
  );
}
