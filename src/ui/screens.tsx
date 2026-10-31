// Front-end screens: loading, title, new operation, briefing and how to play.
import { useState } from 'react';
import { CanvasImage } from './render/CanvasImage';
import type { TerrainImage } from './render/terrain';
import { GAME_ID, RULES, SCENARIOS } from '../engine/data';
import { turnWord } from '../engine/words';
import { DIFFICULTIES } from '../ai/heuristic';
import type { GameOptions, GameState, Side } from '../engine/types';
import { Insignia } from './render/units';
import { sfx } from './sound';
import { BUILD } from './version';
import type { Controller, MouseControls, Settings } from './storage';
import { Dialog, DialogHeader, Layout, LayoutContent, TextInput } from '@astryxdesign/core';
import { GAMES, gameInfo } from '../games';
import { SectionLabel } from './astryx/kit';
import { Ico } from './icons';
import { MenuButton, Tip } from './chrome';

/** A side's emblem for a choice card. */
export const SideBadge = ({ side }: { side: Side }) => (
  <svg viewBox="-6 -6 12 12" width={34} height={34} aria-hidden>
    <Insignia nation={side === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} />
  </svg>
);
/** Difficulty as one to four stars. */
export const Pips = ({ n }: { n: number }) => (
  <span className="pips" aria-hidden>{[0, 1, 2, 3].map((k) => <Ico key={k} name={k <= n ? 'star' : 'starOutline'} size={13} className={k <= n ? 'on' : ''} />)}</span>
);

export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="screen loading">
      <Ico name="laurel" size={64} className="load-laurel" />
      <div className="logo small">
        <span className="logo-title">{gameInfo(GAME_ID).title}</span>
      </div>
      <div className="load-bar">
        <i style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="load-label">{label}…</div>
    </div>
  );
}

function Backdrop({ terrain }: { terrain: TerrainImage }) {
  return (
    <div className="backdrop">
      <CanvasImage src={terrain.medium} className="backdrop-img" />
      <div className="backdrop-shade" />
    </div>
  );
}

export function TitleScreen({ terrain, gameId, onChooseGame, canContinue, onContinue, onNew, onOnline, onSettings, onHowTo }: {
  terrain: TerrainImage; gameId: string; onChooseGame: (id: string) => void; canContinue: boolean; onContinue: () => void; onNew: () => void;
  onOnline: () => void; onSettings: () => void; onHowTo: () => void;
}) {
  const click = (f: () => void) => () => {
    sfx.click();
    f();
  };
  // The game shown: the loaded one, or a game still in preparation the player is looking at.
  const [shownId, setShownId] = useState(gameId);
  const shown = gameInfo(shownId);
  const preparing = shown.status !== 'ready';
  return (
    <div className="screen title">
      <Backdrop terrain={terrain} />
      <div className="title-col">
        <div className="game-picker" role="group" aria-label="Game">
          {GAMES.map((g) => (
            <button key={g.id} className={`game-pick${g.id === shownId ? ' on' : ''}`} aria-pressed={g.id === shownId}
              onClick={() => {
                sfx.click();
                setShownId(g.id);
                if (g.status === 'ready') onChooseGame(g.id);
              }}>
              {g.title}{g.status !== 'ready' && <small>soon</small>}
            </button>
          ))}
        </div>
        <div className="logo">
          <div className="logo-kicker"><i />{shown.kicker}<i /></div>
          <div className="logo-title">{shown.title}</div>
          <div className="logo-date"><Ico name="laurel" size={22} />{shown.dates}</div>
        </div>
        {preparing ? (
          <div className="gilt game-preparing">
            <h3 className="roman">{shown.name}</h3>
            <p>{shown.blurb}</p>
            <ul className="prep-list done">{shown.progress?.done.map((t) => <li key={t}><Ico name="check" size={14} />{t}</li>)}</ul>
            <ul className="prep-list">{shown.progress?.todo.map((t) => <li key={t}><Ico name="hourglass" size={14} />{t}</li>)}</ul>
          </div>
        ) : (
          <nav className="main-menu" aria-label="Main menu">
            {canContinue && <MenuButton icon="play" label="Continue" primary onClick={click(onContinue)} />}
            <MenuButton icon="flag" label="New operation" primary={!canContinue} onClick={click(onNew)} />
            <MenuButton icon="globe" label="Play with friends" onClick={click(onOnline)} />
            <MenuButton icon="book" label="How to play" onClick={click(onHowTo)} />
            <MenuButton icon="gear" label="Settings" onClick={click(onSettings)} />
          </nav>
        )}
        <div className="title-foot">Companion to GMT Games’ {shown.name} · you need the boxed game for the rules<span className="build">Build {BUILD}</span></div>
      </div>
    </div>
  );
}

type Role = 'Allied' | 'German' | 'hotseat' | 'watch';

/** A square choice tile: an icon (or emblem) over a short name; the detail is in its tooltip. */
function Tile({ selected, onSelect, icon, title, aria, tip, children }: {
  selected: boolean; onSelect: () => void; icon: React.ReactNode; title: React.ReactNode; aria: string; tip?: string; children?: React.ReactNode;
}) {
  return (
    <Tip title={aria} lines={tip ? [tip] : undefined} pos="below" className="tile-wrap">
      <button className={`tile${selected ? ' on' : ''}`} aria-pressed={selected} aria-label={aria} onClick={onSelect}>
        <span className="tile-icon">{icon}</span>
        <span className="tile-title">{title}</span>
        {children}
      </button>
    </Tip>
  );
}

export function NewGameScreen({ terrain, settings, setSettings, onStart, onBack }: {
  terrain: TerrainImage; settings: Settings; setSettings: (s: Settings) => void;
  onStart: (scenario: string, options: GameOptions) => void; onBack: () => void;
}) {
  const [scenario, setScenario] = useState(defaultScenario());
  const initialRole: Role = settings.controllers.Allied === 'human' && settings.controllers.German === 'human' ? 'hotseat'
    : settings.controllers.Allied === 'human' ? 'Allied' : settings.controllers.German === 'human' ? 'German' : 'watch';
  const [role, setRole] = useState<Role>(initialRole);
  const [opponent, setOpponent] = useState<Controller>(
    (role === 'Allied' ? settings.controllers.German : settings.controllers.Allied) === 'claude' ? 'claude' : 'heuristic',
  );
  const [options, setOptions] = useState<GameOptions>({ disengagement: true, rollLandings: true });
  const start = () => {
    const ai: Controller = opponent;
    const controllers: Record<Side, Controller> =
      role === 'Allied' ? { Allied: 'human', German: ai } : role === 'German' ? { Allied: ai, German: 'human' } : role === 'hotseat' ? { Allied: 'human', German: 'human' } : { Allied: ai, German: ai };
    setSettings({ ...settings, controllers });
    sfx.select();
    onStart(scenario, options);
  };
  const roles: { id: Role; title: string; aria: string; text: string; icon: React.ReactNode }[] = [
    { id: 'Allied', title: 'Allies', aria: 'Command the Allies', text: gameInfo(GAME_ID).roles?.Allied ?? '', icon: <SideBadge side="Allied" /> },
    { id: 'German', title: 'Germans', aria: 'Command the Germans', text: gameInfo(GAME_ID).roles?.German ?? '', icon: <SideBadge side="German" /> },
    { id: 'hotseat', title: 'Two players', aria: 'Two players', text: 'Both sides on this screen, taking turns', icon: <Ico name="twoPlayers" size={28} /> },
    { id: 'watch', title: 'Watch', aria: 'Watch the computer', text: 'The computer plays both sides', icon: <Ico name="eye" size={28} /> },
  ];
  return (
    <div className="screen setup">
      <Backdrop terrain={terrain} />
      <div className="setup-panel gilt">
        <header className="setup-head">
          <Ico name="flag" size={24} />
          <h1 className="screen-title">New operation</h1>
          <span className="setup-game">{gameInfo(GAME_ID).title}</span>
        </header>
        <div className="setup-grid">
          <section>
            <ScenarioCards scenario={scenario} setScenario={setScenario} />
          </section>
          <section>
            <SectionLabel>Command</SectionLabel>
            <div className="tiles four">
              {roles.map((r) => (
                <Tile key={r.id} selected={role === r.id} onSelect={() => setRole(r.id)} icon={r.icon} title={r.title} aria={r.aria} tip={r.text} />
              ))}
            </div>
            {role !== 'hotseat' && (
              <>
                <SectionLabel>Opponent</SectionLabel>
                <div className="tiles two">
                  <Tile selected={opponent === 'heuristic'} onSelect={() => setOpponent('heuristic')} icon={<Ico name="radio" size={24} />} title="Built-in AI" aria="Built-in AI" tip="Plays on this device" />
                  <Tile selected={opponent === 'claude'} onSelect={() => setOpponent('claude')} icon={<Ico name="quill" size={24} />} title="Claude" aria="Claude" tip="Needs an Anthropic API key" />
                </div>
                {opponent === 'heuristic' && <DifficultyCards value={settings.aiLevel} onChange={(k) => setSettings({ ...settings, aiLevel: k })} />}
                {opponent === 'claude' && (
                  <TextInput type="password" label="Anthropic API key" isLabelHidden placeholder="Anthropic API key (sk-ant-…)" value={settings.claudeApiKey}
                    width="100%" containerClassName="row" onChange={(v) => setSettings({ ...settings, claudeApiKey: v.trim() })} />
                )}
              </>
            )}
            <StartAndRules options={options} setOptions={setOptions} />
          </section>
        </div>
        <footer className="setup-buttons">
          <button className="text-btn" onClick={onBack}><Ico name="chevronLeft" size={16} />Back</button>
          <button className="seal-btn" onClick={start}>To the briefing<Ico name="chevronRight" size={18} /></button>
        </footer>
      </div>
    </div>
  );
}

/** The scenario the new-game screens start on: Salerno's short one, or a game's first. */
export const defaultScenario = () => (SCENARIOS.short ? 'short' : Object.keys(SCENARIOS)[0]);

export function ScenarioCards({ scenario, setScenario }: { scenario: string; setScenario: (s: string) => void }) {
  return (
    <>
      <SectionLabel>Scenario</SectionLabel>
      <div className="scenarios" role="radiogroup" aria-label="Scenario">
        {Object.entries(SCENARIOS).map(([k, sc]) => {
          const first = sc.firstTurn ?? 1;
          return (
            <Tip key={k} title={sc.name} lines={[sc.description]} pos="right" className="scen-wrap">
              <button role="radio" aria-checked={scenario === k} className={`scen${scenario === k ? ' on' : ''}`} onClick={() => setScenario(k)}>
                <span className="scen-name">{sc.name}</span>
                <span className="scen-meta">
                  <span><Ico name="hourglass" size={13} />{first > 1 ? `${first}–${sc.lastTurn}` : sc.lastTurn} {turnWord().toLowerCase()}s</span>
                  <span><Ico name="laurel" size={14} />{RULES.scenarioWin[k] ?? 20} VP</span>
                </span>
              </button>
            </Tip>
          );
        })}
      </div>
    </>
  );
}

/** The computer's skill, as four tiles of one to four stars. */
export function DifficultyCards({ value, onChange }: { value: string; onChange: (k: (typeof DIFFICULTIES)[number]['key']) => void }) {
  return (
    <>
      <SectionLabel>Difficulty</SectionLabel>
      <div className="tiles four difficulty">
        {DIFFICULTIES.map((d, i) => (
          <Tile key={d.key} selected={value === d.key} onSelect={() => onChange(d.key)} icon={<Pips n={i} />} title={d.label} aria={d.label} tip={d.note} />
        ))}
      </div>
    </>
  );
}

/** A switch for an optional rule: an icon and a short name, the rule in its tooltip. */
function RuleToggle({ icon, label, tip, on, set }: { icon: string; label: string; tip: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <Tip title={label} lines={[tip]} pos="above">
      <button className={`rule-toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)}>
        <Ico name={icon} size={16} />{label}<i className="rule-led" />
      </button>
    </Tip>
  );
}

/** The opening (D-Day or the tournament start) and the optional rules. */
export function StartAndRules({ options, setOptions }: { options: GameOptions; setOptions: (o: GameOptions) => void }) {
  const dis = <RuleToggle icon="retreat" label="Disengagement" tip="Units next to the enemy may roll to pull back one hex in the combat phase"
    on={options.disengagement !== false} set={(v) => setOptions({ ...options, disengagement: v })} />;
  if (!RULES.invasionGame) {
    return (
      <>
        <SectionLabel>Optional rules</SectionLabel>
        <div className="rule-toggles">{dis}</div>
      </>
    );
  }
  return (
    <>
      <SectionLabel>Start</SectionLabel>
      <div className="tiles two">
        <Tile selected={!options.optionalStart} onSelect={() => setOptions({ ...options, optionalStart: false })} icon={<Ico name="landing" size={24} />}
          title="D-Day" aria="D-Day landings" tip="The Allies roll the Invasion table for each beach" />
        <Tile selected={!!options.optionalStart} onSelect={() => setOptions({ ...options, optionalStart: true })} icon={<Ico name="boot" size={24} />}
          title="Ashore" aria="Allies already ashore" tip="Tournament start: no landing rolls, the Germans move first" />
      </div>
      <SectionLabel>Optional rules</SectionLabel>
      <div className="rule-toggles">
        {dis}
        <RuleToggle icon="eye" label="Recon" tip="Reconnaissance units shrug off the step loss of a D1 or DS when alone"
          on={!!options.recon} set={(v) => setOptions({ ...options, recon: v })} />
        <RuleToggle icon="ship" label="Port supply" tip="Ports can only supply a limited number of units"
          on={!!options.limitedPortSupply} set={(v) => setOptions({ ...options, limitedPortSupply: v })} />
      </div>
    </>
  );
}

/** How to play, in a row of key chips. */
const CONTROLS: [string, string, string][] = [
  ['target', 'Click', 'Select'],
  ['advance', 'Right-click', 'Move · attack'],
  ['hourglass', 'Space', 'End phase'],
  ['next', 'N', 'Next unit'],
  ['zoomIn', 'Wheel', 'Zoom'],
  ['menu', 'Esc', 'Menu'],
];

export function BriefingScreen({ terrain, game, side, onBegin }: { terrain: TerrainImage; game: GameState; side: Side | null; onBegin: () => void }) {
  const b = gameInfo(GAME_ID).brief![side ?? 'Allied'];
  return (
    <div className="screen briefing">
      <Backdrop terrain={terrain} />
      <div className="dispatch">
        <div className="seal" aria-hidden><Ico name="laurel" size={34} /></div>
        <div className="dispatch-head">
          <span className="dispatch-from">{b.title}</span>
          <h2>{SCENARIOS[game.scenarioId]?.name}</h2>
        </div>
        {b.text[0] && <p className="dispatch-lede">{b.text[0]}</p>}
        <h3><Ico name="flag" size={16} />Objectives</h3>
        <ul className="dispatch-goals">{b.goals(game.scenarioId).map((g) => <li key={g}><Ico name="laurel" size={14} /><span>{g}</span></li>)}</ul>
        <div className="dispatch-keys">
          {CONTROLS.map(([icon, key, what]) => <span key={key}><Ico name={icon} size={14} /><kbd>{key}</kbd>{what}</span>)}
        </div>
        <div className="dispatch-foot">
          <button className="seal-btn" onClick={() => { sfx.select(); onBegin(); }}>Begin<Ico name="chevronRight" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

export function HowToPlay({ mouse = 'rts', onClose }: { mouse?: MouseControls; onClose: () => void }) {
  const rts = mouse !== 'classic';
  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} width={1040} maxHeight="88dvh" className="howto">
      <Layout header={<DialogHeader title="How to play" onOpenChange={(o) => !o && onClose()} />} content={
        <LayoutContent role="region" label="How to play instructions" tabIndex={0}>
        <div className="howto-grid">
          <section>
            <SectionLabel>The day</SectionLabel>
            <p>Each turn is one day: weather, then the German player turn, then the Allied player turn, then the victory check. A player turn runs through initial, movement, combat, recovery and supply phases; the program skips phases with nothing to decide.</p>
            <SectionLabel>Moving</SectionLabel>
            <p>Select one of your units (or press Next unit). Blue hexes it can reach; amber ones are where it must stop. Choose a hex to move there: with a mouse {rts ? 'right-click it' : 'one click moves'}, on a touch screen the first tap shows the route and the second tap (or Move here) confirms. The bar at the bottom offers Normal, Extended, Tactical and Truck movement. Land brings in reserves at the beaches and ports.</p>
          </section>
          <section>
            <SectionLabel>Fighting</SectionLabel>
            <p>{rts ? 'Right-click' : 'Click'} or tap a red enemy hex to see the attack: the bar shows the odds, the column shifts and toggles for air, naval and artillery support. {rts ? 'Right-click' : 'Click'} or tap the hex again, or press Attack!, to attack. Every unit in reach joins by default: tap its counter in the bar (or its stack on the map) to leave it out or add it back, or select a unit first to start with just its stack. Next target steps through every enemy in reach; Units… opens the full list. A defender told to retreat may make a Determined Defense instead.</p>
            <SectionLabel>After combat</SectionLabel>
            <p>Pick the units that advance in the bar, then {rts ? 'right-click' : 'click'} or tap a violet hex; or form a Breakthrough Group under Details to keep going. End phase asks again if units have not moved or you have not attacked.</p>
          </section>
          <section>
            <SectionLabel>Controls</SectionLabel>
            <ul>
              {rts ? (
                <>
                  <li>Left-click: select a unit or inspect a hex (again to cycle a stack)</li>
                  <li>Right-click: move to a highlighted hex, or plan an attack on a red hex (again to attack)</li>
                  <li>Right-click where there is nothing to do, or Esc: cancel; Esc again opens the menu</li>
                </>
              ) : (
                <>
                  <li>Select / move / attack: click (a planned target again to attack)</li>
                  <li>Right-click or Esc: cancel; Esc again opens the menu</li>
                </>
              )}
              <li>Touch: tap to select, tap a hex twice to move or attack</li>
              <li>Settings → Mouse controls: right-click to act, or left-click does everything</li>
              <li>N or Tab: next unit or target · Z: undo</li>
              <li>H: Hold (the unit stands still this phase) · F: Sleep (it stays put turn after turn until woken or the enemy comes next to it). A phase ends only when every unit that can move (or attack, in combat) has done so or holds or sleeps.</li>
              <li>Space: end the phase · Enter: confirm or attack</li>
              <li>1–5: movement mode</li>
              <li>Drag, arrows or WASD: pan · wheel, pinch or + / −: zoom</li>
              <li>Map bar (on the minimap, or the layers button): map modes and what the map shows · M / Shift+M: next / previous map mode</li>
              <li>Enemy threat map mode: where the enemy can strike next turn · select an enemy unit to see its reach · the first press of End lists anything to check before the phase ends</li>
            </ul>
            <SectionLabel>Winning</SectionLabel>
            <p>The Allies score VP for objective hexes they hold in supply and must keep up with a rising daily benchmark. The top bar shows Allied VP against the benchmark.</p>
          </section>
        </div>
        </LayoutContent>
      } />
    </Dialog>
  );
}
