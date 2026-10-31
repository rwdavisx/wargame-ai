import { useState } from 'react';
import { useConfirm } from './astryx/kit';
import { Button, CheckboxInput, HStack, NumberInput, Selector, TextInput, VStack } from '@astryxdesign/core';
import { Ico } from './icons';
import { Medal, Tip } from './chrome';
import { BATTLESHIPS_TURN, MAP, RULES } from '../engine/data';
import { fortOptions, fortsInPlay } from '../engine/forts';
import { columnLabel, inNavalRange, mafOptions, parseCell, readyAsusFor, type OddsInfo } from '../engine/combat';
import { applyAction, landingHexes, lpCost, navalDestinations, replPool } from '../engine/game';
import { neighbors, sideKey, type HexId } from '../engine/hex';
import { cannotMove } from '../engine/movement';
import { breakthroughTargets, groupUnits } from '../engine/breakthrough';
import { areaFriendly, supplyChecker } from '../engine/supply';
import type { Action, CombatReport, GameState, HexData, HexsideData, MoveMode, ReplPool, Side, Terrain, UnitState } from '../engine/types';
import { def, sideOf, stackPoints, stepsRemaining, supportNation, unitsAt, values } from '../engine/units';
import { clearOverrides, editHex, editHexside, exportMapJson, overrideCount } from './mapEditor';
import { downloadText, type Settings } from './storage';
import { TokenIcon } from './render/units';
import { eligibleAttackers, NO_SUPPORT, type SupportPick } from './play';
import { FullLog, LogList, RichText } from './logView';
import { attackDetail, hexName, oddsText, place, resultHeadline } from '../engine/words';

interface Props {
  game: GameState;
  acting: Side;
  settings: Settings;
  setSettings: (s: Settings) => void;
  tab: string;
  setTab: (t: string) => void;
  humanTurn: boolean;
  dispatch: (a: Action) => GameState | null;
  undo: () => void;
  canUndo: boolean;
  selectedHex: HexId | null;
  selectedUnit: string | null;
  setSelectedUnit: (id: string | null) => void;
  moveMode: MoveMode;
  setMoveMode: (m: MoveMode) => void;
  attackTarget: HexId | null;
  setAttackTarget: (h: HexId | null) => void;
  attackers: Set<string>;
  setAttackers: (s: Set<string>) => void;
  support: SupportPick;
  setSupport: (s: SupportPick) => void;
  advanceSel: string[];
  setAdvanceSel: (ids: string[]) => void;
  odds: OddsInfo | null;
  paused: boolean;
  setPaused: (p: boolean) => void;
  aiStatus: string;
  editorOn: boolean;
  setEditorOn: (b: boolean) => void;
  bumpMap: () => void;
  /** Opens the battle screen for the planned attack (or resolves it at once with quick dice). */
  onAttack?: () => void;
  /** Moves the camera to a hex (log entries). */
  onFocusHex?: (h: HexId) => void;
}

/** How a hex is chosen to move or attack: a tap, a right-click (the default mouse controls) or a click. */
function actVerb(p: Props): string {
  if (window.matchMedia?.('(pointer: coarse)').matches) return 'tap';
  return p.settings.mouseControls === 'classic' ? 'click' : 'right-click';
}
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

function isLegal(s: GameState, a: Action): boolean {
  try {
    applyAction(structuredClone({ ...s, log: [] }), a);
    return true;
  } catch {
    return false;
  }
}

function UnitRow({ u, selected, onClick, extra }: { u: UnitState; selected?: boolean; onClick?: () => void; extra?: React.ReactNode }) {
  const d = def(u.id);
  const v = values(u);
  return (
    <div className={`unitrow${selected ? ' selected' : ''}`} onClick={onClick}>
      <TokenIcon unit={u} size={34} />
      <span className="name">
        {d.name}
        {u.stepsLost > 0 && <span className="tag red"> {stepsRemaining(u)}/{d.steps.length} steps</span>}
        {u.status === 'disrupted' && <span className="tag red"> disrupted</span>}
        {u.status === 'fullRetreat' && <span className="tag red"> full retreat</span>}
        {u.halfEff && <span className="tag yellow"> ½ eff</span>}
        {u.isolated ? <span className="tag red"> isolated</span> : u.outOfSupply && <span className="tag yellow"> OOS</span>}
        {u.repl && <span className="tag yellow"> repl</span>}
        {u.truck && <span className="tag"> truck</span>}
        {d.asu && u.fired && <span className="tag yellow"> fired</span>}
        {u.frozenUntil ? <span className="tag"> {u.garrison ? `garrison of ${u.garrison}` : u.frozenUntil >= 99 ? 'frozen' : `frozen to T${u.frozenUntil}`}</span> : null}
      </span>
      <span className="vals">{d.asu ? `range ${d.asuRange}` : `${v.attack}-${v.defense}-${v.move}`}</span>
      {extra}
    </div>
  );
}

export function Sidebar(p: Props) {
  const tabs: [string, string, string][] = [
    ['play', 'Orders', 'quill'],
    ['units', 'Forces', 'army'],
    ['log', 'Log', 'log'],
    ['crt', 'Rules', 'book'],
  ];
  if (p.editorOn) tabs.push(['editor', 'Map editor', 'compass']);
  const cur = tabs.find(([k]) => k === p.tab) ?? tabs[0];
  return (
    <div className="sidebar">
      <div className="ol-head">
        <div className="ol-tabs" role="tablist" aria-label="Panel">
          {tabs.map(([k, label, icon]) => (
            <Tip key={k} title={label} pos="below">
              <button role="tab" aria-selected={p.tab === k} aria-label={label} className={`ol-tab${p.tab === k ? ' on' : ''}`} onClick={() => p.setTab(k)}>
                <Ico name={icon} size={19} />
              </button>
            </Tip>
          ))}
        </div>
        <div className="ol-title">{cur[1]}</div>
      </div>
      <div className="panel">
        {p.tab === 'play' && <PlayPanel {...p} />}
        {p.tab === 'units' && <OffMapPanel {...p} />}
        {p.tab === 'log' && <FullLog entries={p.game.log} onFocus={p.onFocusHex} />}
        {p.tab === 'crt' && <TablesPanel />}
        {p.tab === 'editor' && <EditorPanel {...p} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ play

function PlayPanel(p: Props) {
  const g = p.game;
  if (g.phase === 'gameOver') {
    return (
      <>
        <h3>{g.winner === 'draw' ? 'Draw' : `${g.winner} victory`}</h3>
        <p>{g.victoryNote}</p>
        <SelectedHexInfo {...p} />
      </>
    );
  }
  if (!p.humanTurn) {
    // Online, another player may command this side on their own device.
    const remote = p.settings.controllers[p.acting] === 'remote';
    return (
      <>
        <div className="ol-status">
          <Ico name={remote ? 'globe' : 'radio'} size={22} />
          <div>
            <b>{p.acting} {remote ? 'player' : 'AI'}</b>
            <small>{g.pendingDefense ? 'Choosing a defense' : p.aiStatus || `${g.phase[0].toUpperCase()}${g.phase.slice(1)} phase`}</small>
          </div>
          <Medal icon={p.paused ? 'play' : 'pause'} label={p.paused ? 'Resume' : 'Pause'} size="sm" active={p.paused} pos="left" onClick={() => p.setPaused(!p.paused)} />
        </div>
        <RecentLog game={g} n={8} onFocus={p.onFocusHex} onMore={() => p.setTab('log')} />
        <SelectedHexInfo {...p} />
      </>
    );
  }
  if (g.retreatQueue?.length) {
    return (
      <>
        <RetreatChoiceControls {...p} />
        <SelectedHexInfo {...p} />
      </>
    );
  }
  if (g.pendingDefense) {
    return (
      <>
        <h3>Under attack</h3>
        <p className="hint"><Ico name="shield" size={14} />{g.pendingDefense.hex}: choose on the battle panel</p>
        <SelectedHexInfo {...p} />
      </>
    );
  }
  const note = RULES.turnNotes[g.turn];
  return (
    <>
      {note && g.phase !== 'combat' && <p className="ol-note"><Ico name="quill" size={15} /><span>{note}</span></p>}
      {g.breakthrough ? (
        <BreakthroughControls {...p} />
      ) : g.pendingAdvance ? (
        <AdvanceControls {...p} />
      ) : (
        <>
          {g.phase === 'invasion' && <InvasionControls {...p} />}
          {g.phase === 'initial' && <InitialControls {...p} />}
          {g.phase === 'movement' && <MovementControls {...p} />}
          {g.phase === 'combat' && <CombatControls {...p} />}
        </>
      )}
      <SelectedHexInfo {...p} />
      <RecentLog game={g} n={6} onFocus={p.onFocusHex} onMore={() => p.setTab('log')} />
    </>
  );
}

/** Italy '43: the German engineers' one step of fortification work this turn (18.1). */
function FortControls(p: Props) {
  const g = p.game;
  const where = (h: HexId) => (hexName(h) ? `${hexName(h)} (${h})` : `hex ${h}`);
  if (g.fortBuiltTurn === g.turn) {
    return (
      <>
        <h3>Fortifications</h3>
        <p className="muted">The engineers have done this turn's work.</p>
      </>
    );
  }
  const opts = fortOptions(g);
  const started = Object.values(g.forts ?? {}).length;
  const work = opts.filter((o) => o.op !== 'start');
  const startHere = p.selectedHex ? opts.find((o) => o.op === 'start' && o.hex === p.selectedHex) : undefined;
  const suggested = opts.filter((o) => o.op === 'start' && MAP.hexes[o.hex].gustav).slice(0, 6);
  const label = { complete: 'Complete', completeUpgrade: 'Complete the Level 2 at', upgrade: 'Start a Level 2 at', start: 'Start a fort at' };
  const build = (hex: HexId, op: (typeof opts)[number]['op']) => p.dispatch({ type: 'buildFort', hex, op });
  return (
    <>
      <h3>Fortifications</h3>
      <p className="muted">
        Each turn the engineers may start one fortification or complete one. All eight Level 1 forts must be started before any is completed
        ({Math.min(started, 8)} of 8 started); Level 2 forts go on or behind the Gustav Line. Work next to the enemy needs a roll of 3 or more.
      </p>
      {work.map((o) => (
        <Button key={`${o.op}${o.hex}`} label={`${label[o.op]} ${where(o.hex)}`} size="sm" onClick={() => build(o.hex, o.op)} />
      ))}
      {startHere ? (
        <Button label={`Start a fort at ${where(startHere.hex)}`} size="sm" variant="primary" onClick={() => build(startHere.hex, 'start')} />
      ) : opts.some((o) => o.op === 'start') ? (
        <>
          <p className="muted">Select a hex on the map to start a fort there, or pick one on the Gustav Line:</p>
          {suggested.map((o) => <Button key={o.hex} label={`Start at ${where(o.hex)}`} size="sm" onClick={() => build(o.hex, 'start')} />)}
        </>
      ) : null}
    </>
  );
}

function InvasionControls(p: Props) {
  return (
    <>
      <h3>Ashore</h3>
      <p className="hint"><Ico name="landing" size={14} />Push inland · Commandos may hit Salerno</p>
      <SelectedUnitBox {...p} />
      {p.attackTarget && <AttackPlanner {...p} kind="invasion" />}
    </>
  );
}

function InitialControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const pools: ReplPool[] = side === 'German' ? ['German'] : RULES.invasionGame ? ['US', 'BR'] : ['US', 'BR', 'FR', 'IT'];
  const own = Object.values(g.units).filter((u) => sideOf(u) === side);
  const candidates = own.filter((u) => def(u.id).repl && !u.repl &&
    ((u.where.kind === 'map' && (u.stepsLost > 0 || !!u.represents)) ||
      (u.where.kind === 'eliminated' && !u.where.permanent && def(u.id).cat !== 'bh' && !def(u.id).isRemnant)));
  const fired = own.filter((u) => def(u.id).asu && def(u.id).cat !== 'nebelwerfer' && u.fired && u.where.kind === 'map');
  const drops = own.filter((u) => u.where.kind === 'entry' && u.where.area.startsWith('airdrop'));
  const confirm = useConfirm();
  return (
    <>
      {confirm.dialog}
      {drops.length > 0 && (
        <>
          <h3>Airborne drops</h3>
          <p className="hint"><Ico name="plane" size={14} />Pick a unit, then a blue hex</p>
          {drops.map((u) => (
            <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)}
              extra={<span className="muted">{landingHexes(g, u.id).length} hexes</span>} />
          ))}
        </>
      )}
      <h3>Replacements</h3>
      <div className="pools">
        {pools.map((k) => (
          <Tip key={k} title={`${k} replacements`} lines={['Unused ones are lost']} pos="below">
            <span className="pool"><b>{k}</b>
              <span title="Infantry"><Ico name="person" size={13} />{g.replacements[k].inf}</span>
              <span title="Special"><Ico name="star" size={13} />{g.replacements[k].special}</span>
              <span title="Armour"><Ico name="tank" size={13} />{g.replacements[k].armor}</span>
            </span>
          </Tip>
        ))}
      </div>
      {candidates.length ? candidates.map((u) => <ReplaceRow key={u.id} {...p} u={u} />) : <p className="hint">None needed</p>}
      <h3>Artillery <span className="h3-stat"><Ico name="supply" size={13} />{g.supplyPoints[side]}</span></h3>
      {fired.length ? (
        fired.map((u) => (
          <UnitRow key={u.id} u={u}
            extra={<Medal icon="artillery" label="Ready" tip={['Costs 1 supply point']} size="sm" pos="left" disabled={g.supplyPoints[side] < 1} onClick={() => p.dispatch({ type: 'readyAsu', unitId: u.id })} />} />
        ))
      ) : (
        <p className="hint">All ready</p>
      )}
      {side === 'German' && fortsInPlay(g) && <FortControls {...p} />}
      {side === 'German' && RULES.invasionGame && g.turn >= 16 && !g.abandoned8th && (
        <>
          <h3>8th Army sector</h3>
          {g.abandon8thDeclared ? (
            <p className="muted">Declared: the sector is abandoned in this turn's German Supply Phase.</p>
          ) : (
            <Button label="Abandon the 8th Army sector" size="sm" variant="destructive" onClick={async () => (await confirm.ask({ title: 'Abandon the 8th Army sector?', description: 'In the Supply Phase, German units in the sector and in the east Entry Areas are lost, and Germans may never enter the sector again.', actionLabel: 'Abandon the sector', destructive: true })) &&
                p.dispatch({ type: 'abandon8th' })} />
          )}
        </>
      )}
    </>
  );
}

function ReplaceRow(p: Props & { u: UnitState }) {
  const g = p.game;
  const u = p.u;
  const d = def(u.id);
  const pool = g.replacements[replPool(u.id)];
  const have = pool[d.repl!] + (d.repl === 'inf' ? pool.special : 0);
  const [to, setTo] = useState('');
  if (u.where.kind === 'map') {
    return <UnitRow u={u} extra={<Medal icon="replacement" label="Add a step" tip={[`Uses one ${d.repl === 'inf' ? 'infantry' : d.repl} replacement`]} size="sm" pos="left" disabled={!have} onClick={() => p.dispatch({ type: 'replace', unitId: u.id })} />} />;
  }
  // Eliminated units return off-map, or to a supplied hex with a suitable friendly ASU.
  const side = sideOf(u);
  const sc = supplyChecker(g, side);
  const asuHexes = [...new Set(Object.values(g.units)
    .filter((x) => x.where.kind === 'map' && sideOf(x) === side &&
      (def(x.id).cat === 'corpsAsu' || (def(x.id).cat === 'divAsu' && def(x.id).division === d.division)))
    .map((x) => (x.where as { hex: HexId }).hex))]
    .filter((h) => sc.inSupply(h) && !neighbors(h).some((n) => unitsAt(g, n).some((x) => sideOf(x) !== side)));
  const offmap = side === 'German' ? 'north edge' : d.army8 ? 'south edge' : 'floating reserve';
  const areas = side === 'German' || d.army8
    ? Object.entries(MAP.entryAreas).filter(([n, ea]) => areaFriendly(g, n, side) && (side === 'German' || ea.side !== 'north')).map(([n]) => n)
    : [];
  return (
    <UnitRow u={u}
      extra={
        <span className="row">
          <Selector label="Return to" isLabelHidden size="sm" value={to} onChange={(v) => setTo(v)}
            options={[{ value: '', label: offmap }, ...areas.map((a) => ({ value: a, label: `Entry Area ${a}` })), ...asuHexes.map((h) => ({ value: h, label: `${h} (ASU hex)` }))]} />
          <Button label={`Return (${d.repl})`} size="sm" isDisabled={!have} onClick={() => p.dispatch({ type: 'replace', unitId: u.id, to: to || undefined })} />
        </span>
      } />
  );
}

const MODE_ICONS: Record<MoveMode, string> = { normal: 'boot', extended: 'advance', tactical: 'hex', truck: 'truck', truckExtended: 'truck' };
const MODE_HELP: Record<MoveMode, string> = {
  normal: 'Full movement allowance; stops on entering an enemy zone of control.',
  extended: '+3 MP, but may never enter an enemy zone of control.',
  tactical: 'One or two hexes regardless of cost; the only way to cross some mountain or river hexsides (half-effective afterwards).',
  truck: 'German infantry on trucks: MA 5 at mechanized rates, attack 0 this turn. Two truck markers per turn.',
  truckExtended: 'Trucks plus Extended Movement: MA 5 + 3, never into an enemy zone of control.',
};

function SelectedUnitBox(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const sel = p.selectedUnit ? g.units[p.selectedUnit] : null;
  if (!sel || sideOf(sel) !== side) return null;
  const d = def(sel.id);
  let status = '';
  if (sel.where.kind === 'map') {
    const why = cannotMove(g, sel);
    if (why) status = `Can't move: ${why}`;
  } else if (sel.where.kind === 'reserve' || sel.where.kind === 'followUp') {
    status = `Lands for ${lpCost(sel.id)} LP · pick a beach or port`;
  } else if (sel.where.kind === 'atSea') {
    status = `At sea to ${sel.where.port} · lands ${sel.where.since >= g.turn ? 'next turn' : 'now'}`;
  } else if (sel.where.kind === 'entry') {
    status = sel.where.area.startsWith('airdrop') ? 'Drops in the initial phase' : `Entry ${sel.where.area} · pick a hex`;
  }
  const areaActions = g.phase === 'movement' && (sel.where.kind === 'map' || sel.where.kind === 'entry')
    ? Object.keys(MAP.entryAreas).map((area) => ({ type: 'changeArea', unitId: sel.id, area }) as Action).filter((a) => isLegal(g, a))
    : [];
  const naval = g.phase === 'movement' ? navalDestinations(g, sel.id) : [];
  const canFullRetreat = g.phase === 'movement' && sel.where.kind === 'map' && sel.mpSpent === null && !sel.stopped && d.cat !== 'bh' &&
    sel.status !== 'fullRetreat';
  return (
    <div className="result-box">
      <UnitRow u={sel} />
      {status && <p className="hint"><Ico name="info" size={14} />{status}</p>}
      <div className="row">
        {areaActions.map((a) => (
          <Button key={(a as { area: string }).area} label={`Enter ${(a as { area: string }).area}${MAP.entryAreas[(a as { area: string }).area].vp ? ` · ${MAP.entryAreas[(a as { area: string }).area].vp} VP` : ''}`} size="sm" onClick={() => p.dispatch(a)} />
        ))}
        {naval.length > 0 && <NavalPicker {...p} unitId={sel.id} options={naval} />}
        {canFullRetreat && (
          <Button label="Full Retreat" size="sm" tooltip="The unit falls back automatically when enemy units move next to it; it may not attack." onClick={() => p.dispatch({ type: 'fullRetreat', unitId: sel.id })} />
        )}
      </div>
    </div>
  );
}

function NavalPicker(p: Props & { unitId: string; options: { to: HexId | 'reserve'; twoTurn: boolean }[] }) {
  const [to, setTo] = useState('');
  const pick = p.options.find((o) => o.to === to) ?? p.options[0];
  return (
    <span className="row" title="Naval movement from a beachhead or port (one of the unit's two tactical hexes; at most 3 LP a turn between ports and beachheads).">
      By sea:
      <Selector label="Sail to" isLabelHidden size="sm" value={pick.to} onChange={(v) => setTo(v)}
        options={p.options.map((o) => ({ value: o.to, label: o.to === 'reserve' ? 'Floating Reserve' : `${o.to}${o.twoTurn ? ' (2 turns)' : ''}` }))} />
      <Button label="Embark" size="sm" onClick={() => p.dispatch({ type: 'naval', unitId: p.unitId, to: pick.to })} />
    </span>
  );
}

function MovementControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const waiting = Object.values(g.units).filter(
    (u) => sideOf(u) === side && (u.where.kind === 'reserve' || u.where.kind === 'followUp' || u.where.kind === 'atSea' ||
      (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop'))),
  );
  const modes: MoveMode[] = side === 'German' ? ['normal', 'extended', 'tactical', 'truck', 'truckExtended'] : ['normal', 'extended', 'tactical'];
  const label = (m: MoveMode) => (m === 'truckExtended' ? 'Truck + Ext' : m[0].toUpperCase() + m.slice(1));
  return (
    <>
      <h3>Move <span className="h3-stat">{side === 'Allied' ? <><Ico name="landing" size={13} />{g.landingPoints} LP</> : <><Ico name="truck" size={13} />{g.trucksUsed}/2</>}</span></h3>
      <div className="row modes">
        {modes.map((m) => (
          <Medal key={m} icon={MODE_ICONS[m]} label={label(m)} tip={[MODE_HELP[m]]} size="sm" pos="below" active={p.moveMode === m} onClick={() => p.setMoveMode(m)} />
        ))}
      </div>
      <SelectedUnitBox {...p} />
      {p.attackTarget && <AttackPlanner {...p} kind="autoDs" />}
      {waiting.length > 0 && <h3>Waiting <span className="h3-stat">{waiting.length}</span></h3>}
      {waiting.length ? (
        waiting.map((u) => (
          <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)}
            extra={<span className="muted">{u.where.kind === 'reserve' ? 'reserve' : u.where.kind === 'followUp' ? `follow-up ${u.where.corps}` :
              u.where.kind === 'atSea' ? `at sea → ${u.where.port}` : (u.where as { area: string }).area}</span>} />
        ))
      ) : null}
    </>
  );
}

function CombatControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const last = g.combats[g.combats.length - 1];
  const h = p.selectedHex;
  const canDisengage = h && g.options?.disengagement !== false && unitsAt(g, h).some((u) => sideOf(u) === side && !u.attacked && !u.repl && !def(u.id).asu && def(u.id).cat !== 'bh') &&
    neighbors(h).some((n) => unitsAt(g, n).some((x) => sideOf(x) !== side));
  return (
    <>
      {last && last.turn === g.turn && last.attackerSide === side && <CombatResult r={last} />}
      {p.attackTarget ? <AttackPlanner {...p} kind="attack" /> : <p className="hint"><Ico name="swords" size={14} />{cap(actVerb(p))} a red hex</p>}
      {canDisengage && (
        <div className="row">
          <Button label={`Disengage from ${h}`} size="sm" tooltip="Roll to pull the units in this hex back one hex; they may not attack this phase." onClick={() => p.dispatch({ type: 'disengage', hex: h })} />
        </div>
      )}
    </>
  );
}

function AttackPlanner(p: Props & { kind: 'attack' | 'autoDs' | 'invasion' }) {
  const g = p.game;
  const side = g.activeSide;
  const t = p.attackTarget!;
  let eligible = eligibleAttackers(g, t);
  if (p.kind === 'invasion') eligible = eligible.filter((id) => def(id).formation === 'Commando Bde' && g.units[id].tacHexes === 1 && !g.units[id].stopped);
  const chosen = [...p.attackers];
  const nations = new Set(chosen.map((id) => supportNation(id)));
  const airKeys = [...nations].map((n) => `${n}-air`).filter((k) => g.support.ready.includes(k));
  const navalKeys = [...nations].map((n) => `${n}-naval`).filter((k) => g.support.ready.includes(k));
  const asus = p.kind === 'attack' && chosen.length ? readyAsusFor(g, side, t, chosen) : [];
  const mafs = chosen.length > 1 ? mafOptions(chosen) : [];
  const o = p.odds;
  const set = (patch: Partial<SupportPick>) => p.setSupport({ ...p.support, ...patch });
  const title = p.kind === 'autoDs' ? 'Auto DS (overrun) against' : 'Attack on';
  return (
    <>
      <p>
        {title} <b>{t}</b>: {unitsAt(g, t).filter((u) => sideOf(u) !== side).map((u) => def(u.id).name).join(', ')}
      </p>
      <div>
        {eligible.map((id) => (
          <div key={id} className="unitrow">
            <CheckboxInput label={`${def(id).name} (${def(id).division ?? 'independent'})`} value={p.attackers.has(id)}
              onChange={(on) => {
                const s = new Set(p.attackers);
                if (on) s.add(id);
                else s.delete(id);
                p.setAttackers(s);
              }} />
            <span className="vals">{values(g.units[id]).attack}{g.units[id].halfEff || g.units[id].outOfSupply ? '½' : ''}</span>
          </div>
        ))}
      </div>
      {p.kind === 'attack' && (
        <>
          {mafs.length > 1 && (
            <Selector label="Main Assault Force" size="sm" width="100%" value={p.support.maf ?? ''} onChange={(v) => set({ maf: v || undefined })}
              options={[{ value: '', label: 'best' }, ...mafs.map((m) => ({ value: m, label: g.units[m] ? def(m).name : m }))]} />
          )}
          <div className="row">
            <CheckboxInput label={`Air (${airKeys.join(', ') || 'none ready'})`} isDisabled={!airKeys.length} value={!!p.support.air} onChange={(on) => set({ air: on })} />
            {side === 'Allied' && (
              <CheckboxInput label={`Naval${!inNavalRange(t) ? ' (out of range)' : navalKeys.length ? '' : ' (none ready)'}`} isDisabled={!navalKeys.length || !inNavalRange(t)}
                value={!!p.support.naval} onChange={(on) => set({ naval: on, battleships: on && p.support.battleships })} />
            )}
            {side === 'Allied' && g.turn >= BATTLESHIPS_TURN && g.support.battleships > 0 && (
              <CheckboxInput label="Valiant/Warspite (+1 DRM)" isDisabled={!p.support.naval} value={!!p.support.battleships} onChange={(on) => set({ battleships: on })} />
            )}
          </div>
          {asus.map((u) => (
            <CheckboxInput key={u.id} label={`${def(u.id).name} (${def(u.id).asu} artillery)`} value={!!p.support.asus?.includes(u.id)}
              onChange={(on) => set({ asus: on ? [...(p.support.asus ?? []), u.id] : (p.support.asus ?? []).filter((x) => x !== u.id) })} />
          ))}
        </>
      )}
      {o && <OddsView o={o} game={g} autoDsNote={p.kind === 'autoDs'} />}
      <div className="row">
        <Button label={p.kind === 'autoDs' ? 'Overrun!' : 'Attack!'} size="sm" variant="primary" isDisabled={!o?.ok || (p.kind === 'autoDs' && !o.autoDs)} onClick={() => {
            if (p.onAttack) return p.onAttack();
            const a: Action = p.kind === 'autoDs'
              ? { type: 'autoDs', target: t, attackers: chosen }
              : { type: 'attack', target: t, attackers: chosen, ...(p.kind === 'attack' ? p.support : {}) };
            if (p.dispatch(a)) {
              p.setAttackTarget(null);
              p.setAttackers(new Set());
              p.setSupport(NO_SUPPORT);
            }
          }} />
        <Button label="Cancel" size="sm" onClick={() => p.setAttackTarget(null)} />
      </div>
    </>
  );
}

function OddsView({ o, game: g, autoDsNote }: { o: OddsInfo; game: GameState; autoDsNote?: boolean }) {
  return (
    <div className="result-box">
      {o.ok ? (
        <>
          <div className="odds">
            {o.attack} vs {o.defense}
            {o.defenseNote ? ` (${o.defenseNote})` : ''} → {o.defense ? columnLabel(o.baseIndex) : 'no defense'} → <b>{o.autoDs ? 'Auto DS' : columnLabel(o.finalIndex)}</b>
            {o.drm ? ` (DRM ${o.drm > 0 ? '+' : ''}${o.drm})` : ''}
          </div>
          {o.maf && <div className="muted">Main Assault Force: {g.units[o.maf] ? def(o.maf).name : o.maf} (others halved)</div>}
          <ul className="shiftlist">
            {o.shifts.map((s, i) => (
              <li key={i}>{s.reason}: {s.shift > 0 ? `+${s.shift} right` : `${s.shift} left`}</li>
            ))}
          </ul>
          {!o.autoDs && (
            <div className="muted">
              Outcomes by die roll: {[1, 2, 3, 4, 5, 6].map((r) => parseCell(RULES.combat.crt[String(Math.max(1, Math.min(6, r + o.drm)))][o.finalIndex]).result).join(' / ')}
            </div>
          )}
          {autoDsNote && !o.autoDs && <div className="muted">An Auto DS needs 10-1 or better.</div>}
        </>
      ) : (
        <span className="muted">{o.reason}</span>
      )}
    </div>
  );
}

function RetreatChoiceControls(p: Props) {
  const g = p.game;
  const rq = g.retreatQueue![0];
  const last = g.combats[g.combats.length - 1];
  return (
    <>
      {last && last.turn === g.turn && <CombatResult r={last} />}
      <h3>Retreat</h3>
      <p className="hint"><Ico name="retreat" size={14} />{rq.distance} from {rq.from} · now {rq.options[rq.current].end}</p>
      <div className="row">
        {rq.options.map((o, i) => (
          <Button key={i} label={`${o.intoArea ? `Entry Area ${o.intoArea}` : o.end}${i === rq.current ? ' (keep)' : ''}`} size="sm" variant={i === rq.current ? 'primary' : 'secondary'} onClick={() => p.dispatch({ type: 'retreatChoice', index: i })} />
        ))}
      </div>
    </>
  );
}

function AdvanceControls(p: Props) {
  const g = p.game;
  const pa = g.pendingAdvance!;
  const last = g.combats.find((c) => c.id === pa.combatId);
  const ids = Object.keys(pa.maxByUnit).filter((id) => g.units[id]?.where.kind === 'map');
  return (
    <>
      {last && <CombatResult r={last} />}
      <h3>Advance{pa.limited ? ' · vacated hex' : ''}</h3>
      <p className="hint"><Ico name="advance" size={14} />Tick units, then a violet hex</p>
      {ids.map((id) => (
        <div key={id} className="unitrow">
          <CheckboxInput label={def(id).name} value={p.advanceSel.includes(id)}
            onChange={(on) => p.setAdvanceSel(on ? [...p.advanceSel, id] : p.advanceSel.filter((x) => x !== id))} />
          <span className="vals">up to {pa.maxByUnit[id]} hex{pa.maxByUnit[id] > 1 ? 'es' : ''}</span>
        </div>
      ))}
      {!ids.length && <p className="muted">No units left to advance.</p>}
      {pa.btAllowed && !pa.started && ids.length > 0 && (
        <>
          <h3>Breakthrough</h3>
          <Tip title="Breakthrough group" pos="below" lines={['Spends its advance moving (1/hex) and attacking (1/attack)', 'No artillery, air or naval support', 'Turning away from the vacated hex costs 1']}>
            <p className="hint"><Ico name="breakthrough" size={14} />One stack may break through first</p>
          </Tip>
          <div className="row">
            <Button label={`Form group in ${pa.vacated} (1 hex)`} size="sm" isDisabled={!p.advanceSel.length} onClick={() => p.dispatch({ type: 'btStart', unitIds: p.advanceSel, form: 'vacated' }) && p.setAdvanceSel([])} />
            <Button label="Ticked stack is the group" size="sm" isDisabled={!p.advanceSel.length || new Set(p.advanceSel.map((id) => (g.units[id].where as { hex: HexId }).hex)).size !== 1} onClick={() => p.dispatch({ type: 'btStart', unitIds: p.advanceSel, form: 'stack' }) && p.setAdvanceSel([])} />
          </div>
        </>
      )}
    </>
  );
}

function BreakthroughControls(p: Props) {
  const g = p.game;
  const b = g.breakthrough!;
  const ids = groupUnits(g, b);
  const t = p.attackTarget && breakthroughTargets(g).includes(p.attackTarget) ? p.attackTarget : null;
  const last = g.combats[g.combats.length - 1];
  return (
    <>
      {last && last.turn === g.turn && <CombatResult r={last} />}
      <h3>Breakthrough <span className="h3-stat"><Ico name="boot" size={13} />{b.left}</span></h3>
      <p className="hint"><Ico name="breakthrough" size={14} />Violet: move · red: attack{b.freeHex ? ` · ${b.freeHex} free` : ''}</p>
      {ids.map((id) => (
        <UnitRow key={id} u={g.units[id]}
          extra={ids.length > 1 ? <Button label="Drop off" size="sm" tooltip="Leave the group and stop here" onClick={() => p.dispatch({ type: 'btDrop', unitIds: [id] })} /> : undefined} />
      ))}
      {t && (
        <>
          <p>
            Breakthrough attack on <b>{t}</b>: {unitsAt(g, t).filter((u) => sideOf(u) !== g.activeSide).map((u) => def(u.id).name).join(', ')}
          </p>
          {p.odds && <OddsView o={p.odds} game={g} />}
          <div className="row">
            <Button label="Breakthrough attack!" size="sm" variant="primary" isDisabled={!p.odds?.ok} onClick={() => (p.onAttack ? p.onAttack() : p.dispatch({ type: 'btAttack', target: t }) && p.setAttackTarget(null))} />
            <Button label="Cancel" size="sm" onClick={() => p.setAttackTarget(null)} />
          </div>
        </>
      )}
    </>
  );
}

function CombatResult({ r }: { r: CombatReport }) {
  const key = r.result.replace(/ Adv \d+$/, '').replace(/\/\d.*$/, '');
  const color = /^(DS|DR4)/.test(key) ? 'big' : key === 'A1' ? 'bad' : /^(EX|A1\/)/.test(key) ? 'mixed' : 'good';
  return (
    <div className={`result-box combat-result ${r.attackerSide === 'Allied' ? 's-allied' : 's-german'}`}>
      <div className="cr-head">
        {r.breakthrough ? 'Breakthrough attack' : `${r.attackerSide} attack`} · <b>{place(r.defenderHex)}</b>
      </div>
      <div className="cr-line">
        {r.roll ? (
          <span className="cr-odds">{r.defense > 0 ? oddsText(r.finalColumn) : 'no defense'} · roll {r.roll}{r.drm ? ` +${r.drm}` : ''}</span>
        ) : (
          <span className="cr-odds">no roll needed</span>
        )}
        <span className={`cr-result ${color}`}>{resultHeadline(r.result)}</span>
      </div>
      {r.notes.length > 0 && (
        <ul className="cr-notes">
          {r.notes.map((n, i) => <li key={i}><RichText text={n} /></li>)}
        </ul>
      )}
      <div className="log-detail">{attackDetail(r)}{r.dd ? ` Determined Defense: ${r.dd.column} column, roll ${r.dd.roll}${r.dd.drm ? ` ${r.dd.drm > 0 ? '+' : ''}${r.dd.drm}` : ''} → ${r.dd.result}.` : ''}</div>
      <div className="log-detail">{key}: {RULES.combat.results[key] ?? ''}</div>
    </div>
  );
}

function SelectedHexInfo(p: Props) {
  const g = p.game;
  const h = p.selectedHex;
  if (!h) return null;
  const d = MAP.hexes[h];
  const us = unitsAt(g, h);
  const sp = stackPoints(us.map((u) => u.id), g);
  return (
    <>
      <h3>
        Hex {h}
        {us.length > 0 && (
          <span className={`tag${sp > RULES.stackingLimit ? ' red' : ''}`} style={{ marginLeft: 8 }}
            title="Stacking is checked at the end of the movement phase; excess units are eliminated.">
            stacking {sp}/{RULES.stackingLimit}
          </span>
        )}
      </h3>
      <p className="muted">
        {d.terrain}
        {d.city ? ` · ${d.city}` : d.town ? ` · ${d.town}` : ''}
        {d.vp ? ` · ${d.vp} VP held by ${g.control[h] ?? 'German'}` : ''}
        {d.sector8 ? ' · 8th Army sector' : ''}
        {g.cityBattle[h] ? ' · City Battle' : ''}
      </p>
      {us.map((u) => (
        <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)} />
      ))}
    </>
  );
}

function RecentLog({ game, n, onFocus, onMore }: { game: GameState; n: number; onFocus?: (h: HexId) => void; onMore: () => void }) {
  // The last few entries, with the phase headers they belong to.
  const recent: GameState['log'] = [];
  let count = 0;
  for (let i = game.log.length - 1; i >= 0 && count < n; i--) {
    recent.unshift(game.log[i]);
    if (game.log[i].kind !== 'phase') count++;
  }
  return (
    <>
      <h3 className="recent-head">
        Recent events
        <Button label="Full log ›" size="sm" variant="ghost" onClick={onMore} />
      </h3>
      <LogList entries={recent} onFocus={onFocus} compact />
    </>
  );
}

// ------------------------------------------------------------------ other tabs

function OffMapPanel(p: Props) {
  const g = p.game;
  const groups: [string, (u: UnitState) => boolean][] = [
    ['Floating reserve', (u) => u.where.kind === 'reserve'],
    ['Follow-up wave', (u) => u.where.kind === 'followUp'],
    ['At sea (2-turn transfer)', (u) => u.where.kind === 'atSea'],
    ['Landing boxes', (u) => u.where.kind === 'landing'],
    ['At entry areas / awaiting airdrop', (u) => u.where.kind === 'entry'],
    ['Future reinforcements', (u) => u.where.kind === 'pending'],
    ['Eliminated', (u) => u.where.kind === 'eliminated'],
    ['Represented by a remnant', (u) => u.where.kind === 'remnantHeld'],
    ['Withdrawn / removed', (u) => u.where.kind === 'removed'],
  ];
  const whereNote = (u: UnitState) => {
    switch (u.where.kind) {
      case 'pending': return `T${u.where.turn} ${u.where.at}`;
      case 'entry': return u.where.area;
      case 'eliminated': return u.where.permanent ? 'permanent' : '';
      case 'removed': return u.where.reason;
      case 'landing': return u.where.beach;
      case 'followUp': return u.where.corps;
      case 'atSea': return `→ ${u.where.port}`;
      default: return '';
    }
  };
  return (
    <>
      {(['Allied', 'German'] as const).map((side) => (
        <div key={side}>
          <h3>{side}</h3>
          {groups.map(([label, f]) => {
            const list = Object.values(g.units).filter((u) => sideOf(u) === side && f(u));
            if (!list.length) return null;
            return (
              <div key={label}>
                <div className="muted">{label}</div>
                {list.map((u) => (
                  <UnitRow key={u.id} u={u} onClick={() => p.setSelectedUnit(u.id)} selected={u.id === p.selectedUnit}
                    extra={<span className="muted">{whereNote(u)}</span>} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

const CELL_BG: Record<string, string> = { y: 'rgba(230, 190, 60, 0.35)', r: 'rgba(200, 60, 50, 0.35)' };

function TablesPanel() {
  const c = RULES.combat;
  const m = RULES.movement;
  const dice = ['1', '2', '3', '4', '5', '6'];
  return (
    <>
      <h3>Combat results table</h3>
      <div className="tablewrap">
        <table className="crt">
          <thead>
            <tr>
              <th>Die</th>
              {c.columns.map((x) => <th key={x}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {dice.map((r) => (
              <tr key={r}>
                <th>{r}</th>
                {c.crt[r].map((x, i) => {
                  const cell = parseCell(x);
                  return <td key={i} style={{ background: CELL_BG[cell.color] }}>{cell.result}{cell.adv ? <sup>{cell.adv}</sup> : null}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Superscript: advance after combat. Yellow: −1 on a Determined Defense. Red: no Determined Defense. Odds below 1-3 are not allowed; 10-1
        or better is an automatic DS.
      </p>
      <ul className="shiftlist">
        {Object.entries(c.results).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}
      </ul>
      <h3>Determined Defense table</h3>
      <table className="crt">
        <thead>
          <tr><th>Roll</th><th>Clear</th><th>Other</th><th>City</th></tr>
        </thead>
        <tbody>
          {RULES.dd.table.Clear.map((_, i) => (
            <tr key={i}>
              <th>{i + 1}{i === 6 ? '+' : ''}</th>
              {(['Clear', 'Other', 'City'] as const).map((col) => <td key={col}>{RULES.dd.table[col][i].replace('|', ' or ')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Attacker/defender step losses; H hold, D delay, P partial (City Battle), no letter: the stand fails. DRMs: defensive support +1, elite
        lead unit +1, low-quality lead −1, yellow cell −1; at most +2 (+3 with Valiant/Warspite).
      </p>
      <h3>Column shifts</h3>
      <ul className="shiftlist">
        <li>Attacker: tank superiority +1, elite +1, air +1, division artillery +1, corps artillery or naval gunfire +1</li>
        <li>Defender: tank superiority −1, air −1, rain −1</li>
        <li>The Main Assault Force (one division plus one attachment) attacks at full strength; all other attackers are halved. Strengths cap at 20.</li>
        <li>Infantry types and recon double on defense in hills, marsh and cities; any defender doubles if every attacker is across a river.</li>
      </ul>
      <h3>Movement costs (infantry / vehicles)</h3>
      <ul className="shiftlist">
        {Object.entries(m.terrain).map(([k, v]) => <li key={k}>{k}: {v.inf} / {v.mech}</li>)}
        <li>Major road {m.majorRoad.inf} / ⅓ (Allied vehicles in the 8th Army sector {m.alliedMechRoadIn8thSector}); minor road {m.minorRoad.inf} / ½</li>
        <li>Pass +{m.pass.inf} / +{m.pass.mech}; river +{m.riverInf} for infantry; leaving an enemy zone of control +{m.exitEzoc}</li>
        <li>Mountain hexsides (infantry) and rivers (vehicles) only on the first hex of a tactical move, leaving the unit half-effective.</li>
      </ul>
      <h3>Other tables</h3>
      <ul className="shiftlist">
        <li>Invasion (advance per die roll 1-6): Rangers {RULES.invasion.Rangers.join(' ')}; Uncle {RULES.invasion.Uncle.join(' ')}; others {RULES.invasion.Other.join(' ')} (−1: the box loses a step)</li>
        <li>Airdrop: {RULES.airdrop.table.map((t, i) => `${i === 0 ? '≤' : ''}${t.max === 99 ? '5+' : t.max} ${t.result}`).join(', ')}; city/marsh/mountain {RULES.airdrop.cityMarshMountainDrm}, enemy ZOC {RULES.airdrop.ezocDrm}</li>
        <li>Disengagement (1-6): {dice.map((d) => RULES.disengagement.table[d]).join(' ')}; all vehicles +{RULES.disengagement.mechDrm}</li>
        <li>Variable strength (1-6): {RULES.variableStrength.join(' ')}</li>
        <li>Isolation attrition: step lost on {RULES.isolation.lossOn.join(', ')}; +{RULES.isolation.cityOrCorpsDrm} with supply line to a friendly city or corps artillery, Allies +{RULES.isolation.alliedClearWeatherDrm} in clear weather</li>
        <li>Rally: succeeds on {RULES.rally.success.join(', ')}; +{RULES.rally.cityDrm} in a beachhead or city, elite +{RULES.rally.eliteDrm}, low quality {RULES.rally.lowQualityDrm}</li>
        <li>Landing points: {RULES.landingPoints.perTurn} per turn; cost by stacking points 0-3+: {RULES.landingPoints.costBySp.join(' ')}</li>
      </ul>
      <h3>Weather</h3>
      <ul className="shiftlist">
        {RULES.weather.track.map((w) => (
          <li key={w.box}>
            {w.box} {w.name}: air [{w.air.join(',') || '-'}], naval [{w.naval.join(',') || '-'}], supply A{w.alliedSupply}
            {w.alliedPortBonus ? '(+1 Salerno port)' : ''} G{w.germanSupply}
          </li>
        ))}
      </ul>
      <h3>Victory benchmarks</h3>
      <p className="muted">
        {Object.entries(RULES.benchmarks).map(([t, v]) => `T${t}: ${v}`).join(' · ')}. From turn 4 the Allies win automatically at benchmark +5 (or 20
        VP) and lose at benchmark −5.
      </p>
    </>
  );
}

function EditorPanel(p: Props) {
  const h = p.selectedHex;
  const [, force] = useState(0);
  const confirm = useConfirm();
  const tools = (
    <>
      {confirm.dialog}
      <p className="muted">
        Correct the transcribed map against your copy: click a hex to edit its terrain, features and hexsides. {overrideCount()} edits stored.
        The painted map is redrawn after each edit.
      </p>
      <div className="row">
        <Button label="Export map.json" size="sm" onClick={() => downloadText('map.json', exportMapJson())} />
        <Button label="Reset edits" size="sm" onClick={async () => { if (await confirm.ask({ title: 'Discard all map edits?', description: 'Every edit stored in this browser is removed and the page reloads.', actionLabel: 'Discard and reload', destructive: true })) { clearOverrides(); location.reload(); } }} />
        <Button label="Close editor" size="sm" onClick={() => { p.setEditorOn(false); p.setTab('play'); }} />
      </div>
    </>
  );
  if (!h) return tools;
  const d: HexData = MAP.hexes[h];
  const save = (nd: HexData) => {
    editHex(h, nd);
    p.bumpMap();
    force((x) => x + 1);
  };
  const saveSide = (k: string, nd: HexsideData) => {
    editHexside(k, nd);
    p.bumpMap();
    force((x) => x + 1);
  };
  return (
    <>
      {tools}
      <h3>Hex {h}</h3>
      <VStack gap={2}>
        <Selector label="Terrain" size="sm" width="100%" value={d.terrain} onChange={(v) => save({ ...d, terrain: v as Terrain })}
          options={['clear', 'hill', 'marsh', 'sea'].map((t) => ({ value: t, label: t }))} />
        <TextInput label="City" size="sm" width="100%" value={d.city ?? ''} onChange={(v) => save({ ...d, city: v || undefined })} />
        <TextInput label="Town" size="sm" width="100%" value={d.town ?? ''} onChange={(v) => save({ ...d, town: v || undefined })} />
        <HStack gap={2}>
          <NumberInput label="VP" size="sm" min={0} max={9} value={d.vp ?? 0} onChange={(v) => save({ ...d, vp: v || undefined })} />
          <NumberInput label="Port" size="sm" min={0} max={9} value={d.port?.capacity ?? 0}
            onChange={(v) => save({ ...d, port: v ? { ...(d.port ?? {}), capacity: v } : undefined })} />
        </HStack>
        <CheckboxInput label="8th Army sector" value={!!d.sector8} onChange={(on) => save({ ...d, sector8: on || undefined })} />
      </VStack>
      <h3>Hexsides</h3>
      {neighbors(h).filter((n) => MAP.hexes[n]).map((n) => {
        const k = sideKey(h, n);
        const s = MAP.hexsides[k] ?? {};
        return (
          <div key={n} className="row">
            <span style={{ width: 44 }}>→{n}</span>
            <CheckboxInput label="river" size="sm" value={!!s.river} onChange={(on) => saveSide(k, { ...s, river: on })} />
            <CheckboxInput label="mtn" size="sm" value={!!s.mountain} onChange={(on) => saveSide(k, { ...s, mountain: on })} />
            <CheckboxInput label="pass" size="sm" value={!!s.pass} onChange={(on) => saveSide(k, { ...s, pass: on })} />
            <Selector label="Road" isLabelHidden size="sm" value={s.road ?? ''} onChange={(v) => saveSide(k, { ...s, road: (v || undefined) as HexsideData['road'] })}
              options={[{ value: '', label: 'no road' }, { value: 'minor', label: 'minor road' }, { value: 'major', label: 'major road' }]} />
          </div>
        );
      })}
      <p className="muted">Edits apply immediately and are stored in this browser. Export map.json from Setup to keep them permanently.</p>
    </>
  );
}

