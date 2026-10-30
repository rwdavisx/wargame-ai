// Front-end screens: loading, title, new operation, briefing and how to play.
import { useState } from 'react';
import { CanvasImage } from './render/CanvasImage';
import type { TerrainImage } from './render/terrain';
import { SCENARIOS } from '../engine/data';
import { DIFFICULTIES } from '../ai/heuristic';
import type { GameOptions, GameState, Side } from '../engine/types';
import { Insignia } from './render/units';
import { sfx } from './sound';
import { BUILD } from './version';
import type { Controller, MouseControls, Settings } from './storage';
import { Button, CheckboxInput, Dialog, DialogHeader, Heading, HStack, SegmentedControl, SegmentedControlItem, TextInput, VStack } from '@astryxdesign/core';
import { ChoiceCard, SectionLabel } from './astryx/kit';

/** A side's emblem for a choice card. */
export const SideBadge = ({ side }: { side: Side }) => (
  <svg viewBox="-6 -6 12 12" width={30} height={30} aria-hidden>
    <Insignia nation={side === 'Allied' ? 'US' : 'GE'} x={0} y={0} r={5.4} />
  </svg>
);
/** Difficulty as one to four stars. */
export const Pips = ({ n }: { n: number }) => (
  <span className="pips" aria-hidden>{[0, 1, 2, 3].map((k) => <i key={k} className={k <= n ? 'on' : ''}>★</i>)}</span>
);

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

function Backdrop({ terrain }: { terrain: TerrainImage }) {
  return (
    <div className="backdrop">
      <CanvasImage src={terrain.medium} className="backdrop-img" />
      <div className="backdrop-shade" />
    </div>
  );
}

export function TitleScreen({ terrain, canContinue, onContinue, onNew, onOnline, onSettings, onHowTo }: {
  terrain: TerrainImage; canContinue: boolean; onContinue: () => void; onNew: () => void; onOnline: () => void; onSettings: () => void; onHowTo: () => void;
}) {
  const click = (f: () => void) => () => {
    sfx.click();
    f();
  };
  return (
    <div className="screen title">
      <Backdrop terrain={terrain} />
      <div className="title-col">
        <div className="logo">
          <div className="logo-kicker">OPERATION AVALANCHE</div>
          <div className="logo-title">SALERNO '43</div>
          <div className="logo-date">9 – 30 SEPTEMBER 1943</div>
        </div>
        <VStack gap={2} className="main-menu" width={260}>
          {canContinue && <Button label="Continue" variant="primary" size="lg" width="100%" onClick={click(onContinue)} />}
          <Button label="New operation" variant={canContinue ? 'secondary' : 'primary'} size="lg" width="100%" onClick={click(onNew)} />
          <Button label="Play with friends" size="lg" width="100%" onClick={click(onOnline)} />
          <Button label="How to play" size="lg" width="100%" onClick={click(onHowTo)} />
          <Button label="Settings" size="lg" width="100%" onClick={click(onSettings)} />
        </VStack>
        <div className="title-foot">A digital companion to GMT Games' Salerno '43 · keep your copy of the game at hand for the full rules<span className="build">Build {BUILD}</span></div>
      </div>
    </div>
  );
}

type Role = 'Allied' | 'German' | 'hotseat' | 'watch';

export function NewGameScreen({ terrain, settings, setSettings, onStart, onBack }: {
  terrain: TerrainImage; settings: Settings; setSettings: (s: Settings) => void;
  onStart: (scenario: string, options: GameOptions) => void; onBack: () => void;
}) {
  const [scenario, setScenario] = useState('short');
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
  const roles: { id: Role; title: string; text: string; emblem?: Side }[] = [
    { id: 'Allied', title: 'Command the Allies', text: 'Fifth Army: land on the beaches, take Salerno and the plain, break out for Naples.', emblem: 'Allied' },
    { id: 'German', title: 'Command the Germans', text: 'Tenth Army: counterattack the beachhead, then hold the hills and the roads north.', emblem: 'German' },
    { id: 'hotseat', title: 'Two players', text: 'Both sides on this screen, taking turns.' },
    { id: 'watch', title: 'Watch the computer', text: 'The computer plays both sides while you watch.' },
  ];
  return (
    <div className="screen setup">
      <Backdrop terrain={terrain} />
      <div className="setup-panel">
        <Heading level={1} className="screen-title">New operation</Heading>
        <ScenarioCards scenario={scenario} setScenario={setScenario} />
        <SectionLabel>Your role</SectionLabel>
        <div className="cards four">
          {roles.map((r) => (
            <ChoiceCard key={r.id} selected={role === r.id} onSelect={() => setRole(r.id)} title={r.title} text={r.text}
              icon={r.emblem && <SideBadge side={r.emblem} />} />
          ))}
        </div>
        {role !== 'hotseat' && (
          <>
            <SectionLabel>Computer opponent</SectionLabel>
            <SegmentedControl label="Computer opponent" value={opponent} onChange={(v) => setOpponent(v as Controller)}>
              <SegmentedControlItem value="heuristic" label="Built-in AI" />
              <SegmentedControlItem value="claude" label="Claude" />
            </SegmentedControl>
            {opponent === 'heuristic' && <DifficultyCards value={settings.aiLevel} onChange={(k) => setSettings({ ...settings, aiLevel: k })} />}
            {opponent === 'claude' && (
              <TextInput type="password" label="Anthropic API key" isLabelHidden placeholder="Anthropic API key (sk-ant-…)" value={settings.claudeApiKey}
                width="100%" containerClassName="row" onChange={(v) => setSettings({ ...settings, claudeApiKey: v.trim() })} />
            )}
          </>
        )}
        <StartAndRules options={options} setOptions={setOptions} />
        <HStack className="setup-buttons" hAlign="between">
          <Button label="Back" onClick={onBack} />
          <Button label="To the briefing ▶" variant="primary" size="lg" onClick={start} />
        </HStack>
      </div>
    </div>
  );
}

export function ScenarioCards({ scenario, setScenario }: { scenario: string; setScenario: (s: string) => void }) {
  return (
    <>
      <SectionLabel>Scenario</SectionLabel>
      <div className="cards">
        {Object.entries(SCENARIOS).map(([k, sc]) => (
          <ChoiceCard key={k} selected={scenario === k} onSelect={() => setScenario(k)} title={sc.name}
            meta={`${sc.lastTurn} days · Allies need ${k === 'short' ? 8 : 20} VP`} text={sc.description} />
        ))}
      </div>
    </>
  );
}

/** The computer's skill, as four cards. */
export function DifficultyCards({ value, onChange }: { value: string; onChange: (k: (typeof DIFFICULTIES)[number]['key']) => void }) {
  return (
    <>
      <SectionLabel>Difficulty</SectionLabel>
      <div className="cards four difficulty">
        {DIFFICULTIES.map((d, i) => (
          <ChoiceCard key={d.key} selected={value === d.key} onSelect={() => onChange(d.key)} label={d.label} title={<><Pips n={i} /> {d.label}</>} text={d.note} />
        ))}
      </div>
    </>
  );
}

/** The opening (D-Day or the tournament start) and the optional rules. */
export function StartAndRules({ options, setOptions }: { options: GameOptions; setOptions: (o: GameOptions) => void }) {
  return (
    <>
      <SectionLabel>Start</SectionLabel>
      <div className="cards">
        <ChoiceCard selected={!options.optionalStart} onSelect={() => setOptions({ ...options, optionalStart: false })} title="D-Day landings"
          text="The standard start: the Allies roll the Invasion table for each beach, then the Germans react." />
        <ChoiceCard selected={!!options.optionalStart} onSelect={() => setOptions({ ...options, optionalStart: true })} title="Allies already ashore"
          text="Tournament start (S1.4): no landing rolls; the assault units start inland and the Germans move first." />
      </div>
      <SectionLabel>Optional rules</SectionLabel>
      <VStack gap={2}>
        <CheckboxInput label="25.1 Disengagement" description="Units next to the enemy may roll to pull back one hex in the combat phase."
          value={options.disengagement !== false} onChange={(v) => setOptions({ ...options, disengagement: v })} />
        <CheckboxInput label="25.2 Reconnaissance" description="Reconnaissance units shrug off the step loss of a D1 or DS when alone."
          value={!!options.recon} onChange={(v) => setOptions({ ...options, recon: v })} />
        <CheckboxInput label="25.3 Limited port supply" description="Ports can only supply a limited number of units."
          value={!!options.limitedPortSupply} onChange={(v) => setOptions({ ...options, limitedPortSupply: v })} />
      </VStack>
    </>
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

export function BriefingScreen({ terrain, game, side, onBegin }: { terrain: TerrainImage; game: GameState; side: Side | null; onBegin: () => void }) {
  const b = BRIEF[side ?? 'Allied'];
  return (
    <div className="screen briefing">
      <Backdrop terrain={terrain} />
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
          <li>Click a unit to select it, then right-click a highlighted hex to move (on a touch screen, tap it twice). Hover a hex to see the route and its cost.</li>
          <li>Red hexes can be attacked: right-click one to see the odds, right-click it again to attack. Pick attackers and support in the orders panel.</li>
          <li>End each phase with the button at the bottom of the orders panel. Esc opens the menu.</li>
          <li>Drag or use the arrow keys to pan, the mouse wheel or +/− to zoom, and the minimap to jump.</li>
        </ul>
        <div className="dispatch-foot">
          <Button label="Begin ▶" variant="primary" size="lg" onClick={() => { sfx.select(); onBegin(); }} />
        </div>
      </div>
    </div>
  );
}

export function HowToPlay({ mouse = 'rts', onClose }: { mouse?: MouseControls; onClose: () => void }) {
  const rts = mouse !== 'classic';
  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} width={1040} maxHeight="88dvh" className="howto">
      <DialogHeader title="How to play" onOpenChange={(o) => !o && onClose()} />
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
    </Dialog>
  );
}
