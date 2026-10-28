// Front-end screens: loading, title, new operation, briefing and how to play.
import { useState } from 'react';
import { SCENARIOS } from '../engine/data';
import type { GameOptions, GameState, Side } from '../engine/types';
import { Insignia } from './render/units';
import { sfx } from './sound';
import type { Controller, Settings } from './storage';

export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="screen loading">
      <div className="logo small">
        <span className="logo-title">SALERNO '43</span>
      </div>
      <div className="load-bar">
        <i style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="load-label">{label}…</div>
    </div>
  );
}

function Backdrop({ image }: { image: string }) {
  return (
    <div className="backdrop">
      <div className="backdrop-img" style={{ backgroundImage: `url(${image})` }} />
      <div className="backdrop-shade" />
    </div>
  );
}

export function TitleScreen({ image, canContinue, onContinue, onNew, onSettings, onHowTo }: {
  image: string; canContinue: boolean; onContinue: () => void; onNew: () => void; onSettings: () => void; onHowTo: () => void;
}) {
  const click = (f: () => void) => () => {
    sfx.click();
    f();
  };
  return (
    <div className="screen title">
      <Backdrop image={image} />
      <div className="title-col">
        <div className="logo">
          <div className="logo-kicker">OPERATION AVALANCHE</div>
          <div className="logo-title">SALERNO '43</div>
          <div className="logo-date">9 – 30 SEPTEMBER 1943</div>
        </div>
        <nav className="main-menu">
          {canContinue && <button className="primary" onClick={click(onContinue)}>Continue</button>}
          <button className={canContinue ? '' : 'primary'} onClick={click(onNew)}>New operation</button>
          <button onClick={click(onHowTo)}>How to play</button>
          <button onClick={click(onSettings)}>Settings</button>
        </nav>
        <div className="title-foot">A digital companion to GMT Games' Salerno '43 · keep your copy of the game at hand for the full rules</div>
      </div>
    </div>
  );
}

type Role = 'Allied' | 'German' | 'hotseat' | 'watch';

export function NewGameScreen({ image, settings, setSettings, onStart, onBack }: {
  image: string; settings: Settings; setSettings: (s: Settings) => void;
  onStart: (scenario: string, options: GameOptions) => void; onBack: () => void;
}) {
  const [scenario, setScenario] = useState('short');
  const initialRole: Role = settings.controllers.Allied === 'human' && settings.controllers.German === 'human' ? 'hotseat'
    : settings.controllers.Allied === 'human' ? 'Allied' : settings.controllers.German === 'human' ? 'German' : 'watch';
  const [role, setRole] = useState<Role>(initialRole);
  const [opponent, setOpponent] = useState<Controller>(
    (role === 'Allied' ? settings.controllers.German : settings.controllers.Allied) === 'claude' ? 'claude' : 'heuristic',
  );
  const [options, setOptions] = useState<GameOptions>({});
  const start = () => {
    const ai: Controller = opponent;
    const controllers: Record<Side, Controller> =
      role === 'Allied' ? { Allied: 'human', German: ai } : role === 'German' ? { Allied: ai, German: 'human' } : role === 'hotseat' ? { Allied: 'human', German: 'human' } : { Allied: ai, German: ai };
    setSettings({ ...settings, controllers });
    sfx.select();
    onStart(scenario, options);
  };
  const roles: { id: Role; title: string; text: string; emblem?: Side }[] = [
    { id: 'Allied', title: 'Command the Allies', text: 'Fifth Army: land on the beaches, take Salerno and the plain, break out for Naples.', emblem: 'Allied' },
    { id: 'German', title: 'Command the Germans', text: 'Tenth Army: counterattack the beachhead, then hold the hills and the roads north.', emblem: 'German' },
    { id: 'hotseat', title: 'Two players', text: 'Both sides on this screen, taking turns.' },
    { id: 'watch', title: 'Watch the computer', text: 'The computer plays both sides while you watch.' },
  ];
  return (
    <div className="screen setup">
      <Backdrop image={image} />
      <div className="setup-panel">
        <h1>New operation</h1>
        <h3>Scenario</h3>
        <div className="cards">
          {Object.entries(SCENARIOS).map(([k, sc]) => (
            <button key={k} className={`card${scenario === k ? ' on' : ''}`} onClick={() => setScenario(k)}>
              <div className="card-title">{sc.name}</div>
              <div className="card-meta">{sc.lastTurn} days · Allies need {k === 'short' ? 8 : 20} VP</div>
              <div className="card-text">{sc.description}</div>
            </button>
          ))}
        </div>
        <h3>Your role</h3>
        <div className="cards four">
          {roles.map((r) => (
            <button key={r.id} className={`card${role === r.id ? ' on' : ''}`} onClick={() => setRole(r.id)}>
              {r.emblem && (
                <svg viewBox="-6 -6 12 12" width={30} height={30}>
                  <Insignia nation={r.emblem === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} />
                </svg>
              )}
              <div className="card-title">{r.title}</div>
              <div className="card-text">{r.text}</div>
            </button>
          ))}
        </div>
        {role !== 'hotseat' && (
          <>
            <h3>Computer opponent</h3>
            <div className="segmented">
              <button className={opponent === 'heuristic' ? 'on' : ''} onClick={() => setOpponent('heuristic')}>Built-in AI</button>
              <button className={opponent === 'claude' ? 'on' : ''} onClick={() => setOpponent('claude')}>Claude</button>
            </div>
            {opponent === 'claude' && (
              <div className="row">
                <input type="password" placeholder="Anthropic API key (sk-ant-…)" value={settings.claudeApiKey} style={{ flex: 1 }}
                  onChange={(e) => setSettings({ ...settings, claudeApiKey: e.target.value.trim() })} />
              </div>
            )}
          </>
        )}
        <h3>Optional rules</h3>
        <label className="check">
          <input type="checkbox" checked={!!options.recon} onChange={(e) => setOptions({ ...options, recon: e.target.checked })} />
          25.2 Reconnaissance units shrug off the step loss of a D1 or DS when alone
        </label>
        <label className="check">
          <input type="checkbox" checked={!!options.limitedPortSupply} onChange={(e) => setOptions({ ...options, limitedPortSupply: e.target.checked })} />
          25.3 Ports can only supply a limited number of units
        </label>
        <div className="setup-buttons">
          <button onClick={onBack}>Back</button>
          <button className="primary big" onClick={start}>To the briefing ▶</button>
        </div>
      </div>
    </div>
  );
}

const BRIEF: Record<Side, { title: string; text: string[]; goals: (scenario: string) => string[] }> = {
  Allied: {
    title: 'FIFTH ARMY — OPERATION AVALANCHE',
    text: [
      'Italy surrendered last night, but the Germans did not. As dawn breaks on 9 September, British X Corps and US VI Corps are coming ashore on the beaches of the Gulf of Salerno, with Rangers and Commandos landing on the Sorrento peninsula to seize the passes to Naples.',
      'The 16th Panzer Division holds the hills above the beaches and more German divisions are already on the roads from the north and from Calabria. Get the corps ashore, join them up, take Salerno, Battipaglia and the Montecorvino airfield, and keep the beachheads open until the Eighth Army arrives from the south.',
    ],
    goals: (sc) => [
      sc === 'short' ? 'Hold at least 8 VP at the end of day 8.' : 'Hold at least 20 VP at the end of day 22.',
      'From day 4 keep pace with the daily benchmark: 5 VP above it (or 20 VP) wins at once, 5 below loses.',
      'VP hexes count only while they are in supply. Each beachhead, airborne regiment or artillery unit lost costs 1 VP.',
      'Break out to the north edge with strong forces for 5 (N1) and 4 (N2) VP.',
    ],
  },
  German: {
    title: 'TENTH ARMY — XIV PANZER CORPS',
    text: [
      'The Anglo-Americans are landing in the Gulf of Salerno. The 16th Panzer Division is spread thin along the coast; the Hermann Göring and 15th Panzergrenadier Divisions are coming down from Naples, and 26th Panzer and 29th Panzergrenadier are racing up from Calabria ahead of the British Eighth Army.',
      'Strike the beachheads before the enemy is fully ashore and drive him back into the sea. If that fails, hold the ring of hills and the roads to Naples for as long as you can.',
    ],
    goals: (sc) => [
      sc === 'short' ? 'Keep the Allies below 8 VP at the end of day 8.' : 'Keep the Allies below 20 VP at the end of day 22.',
      'From day 4, if the Allies fall 5 VP below the daily benchmark you win at once.',
      'Every beachhead you destroy costs the Allies a VP and closes a supply source.',
      ...(sc === 'campaign' ? ['From day 16 you may abandon the Eighth Army sector to shorten your line.'] : []),
    ],
  },
};

export function BriefingScreen({ image, game, side, onBegin }: { image: string; game: GameState; side: Side | null; onBegin: () => void }) {
  const b = BRIEF[side ?? 'Allied'];
  return (
    <div className="screen briefing">
      <Backdrop image={image} />
      <div className="dispatch">
        <div className="stamp">{side === 'German' ? 'GEHEIME KOMMANDOSACHE' : 'MOST SECRET'}</div>
        <div className="dispatch-head">
          <span>{b.title}</span>
          <span>{SCENARIOS[game.scenarioId]?.name.toUpperCase()}</span>
        </div>
        {b.text.map((t, i) => <p key={i}>{t}</p>)}
        <h3>OBJECTIVES</h3>
        <ul>{b.goals(game.scenarioId).map((g) => <li key={g}>{g}</li>)}</ul>
        <h3>FIELD NOTES</h3>
        <ul className="notes">
          <li>Select a unit, then click a highlighted hex to move. Hover a hex to see the route and its cost.</li>
          <li>Red hexes can be attacked: pick attackers and support in the orders panel, then roll.</li>
          <li>End each phase with the button at the bottom of the orders panel. Esc opens the menu.</li>
          <li>Drag or use the arrow keys to pan, the mouse wheel or +/− to zoom, and the minimap to jump.</li>
        </ul>
        <div className="dispatch-foot">
          <button className="primary big" onClick={() => { sfx.select(); onBegin(); }}>Begin ▶</button>
        </div>
      </div>
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal howto" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>How to play</h2>
          <button className="close" onClick={onClose}>✕</button>
        </header>
        <div className="howto-grid">
          <section>
            <h3>The day</h3>
            <p>Each turn is one day: weather, then the German player turn, then the Allied player turn, then the victory check. A player turn runs through initial, movement, combat, recovery and supply phases; the program skips phases with nothing to decide.</p>
            <h3>Moving</h3>
            <p>Click one of your units. Blue hexes it can reach; amber ones are where it must stop (enemy zone of control). Hover to see the route. Choose Normal, Extended (+3 MP, never next to the enemy), Tactical (1–2 hexes over any terrain) or Truck in the orders panel. Reserves land at beaches and ports; reinforcements enter from the map edges.</p>
          </section>
          <section>
            <h3>Fighting</h3>
            <p>Click a red enemy hex. Tick the attackers and any air, naval or artillery support; the panel shows the odds, column shifts and every possible result. Only one division (the Main Assault Force) attacks at full strength. A defender told to retreat may make a Determined Defense instead.</p>
            <h3>After combat</h3>
            <p>Advance into the vacated hex, or form a Breakthrough Group to keep going and attack again. Retreating units can end up disrupted or in Full Retreat; units cut off from supply suffer attrition.</p>
          </section>
          <section>
            <h3>Controls</h3>
            <ul>
              <li>Drag, arrow keys or WASD: pan</li>
              <li>Mouse wheel or + / −: zoom</li>
              <li>Minimap: jump around the map</li>
              <li>Click a stack again: next unit in it</li>
              <li>Esc: cancel or open the menu</li>
            </ul>
            <h3>Winning</h3>
            <p>The Allies score VP for objective hexes they hold in supply and must keep up with a rising daily benchmark. The top bar shows Allied VP against the benchmark.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
