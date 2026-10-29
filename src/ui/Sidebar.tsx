import { useState } from 'react';
import { BATTLESHIPS_TURN, MAP, RULES } from '../engine/data';
import { columnLabel, inNavalRange, mafOptions, parseCell, readyAsusFor, type OddsInfo } from '../engine/combat';
import { applyAction, landingHexes, lpCost, navalDestinations, replPool } from '../engine/game';
import { neighbors, sideKey, type HexId } from '../engine/hex';
import { allowedModes, cannotMove } from '../engine/movement';
import { breakthroughTargets, groupUnits } from '../engine/breakthrough';
import { areaFriendly, supplyChecker } from '../engine/supply';
import type { Action, CombatReport, GameState, HexData, HexsideData, MoveMode, ReplPool, Side, Terrain, UnitState } from '../engine/types';
import { def, sideOf, stackPoints, stepsRemaining, supportNation, unitsAt, values } from '../engine/units';
import { clearOverrides, editHex, editHexside, exportMapJson, overrideCount } from './mapEditor';
import { downloadText, type Settings } from './storage';
import { TokenIcon } from './render/units';
import { eligibleAttackers, NO_SUPPORT, type SupportPick } from './play';

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
}


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
        {u.frozenUntil ? <span className="tag"> frozen to T{u.frozenUntil}</span> : null}
      </span>
      <span className="vals">{d.asu ? `range ${d.asuRange}` : `${v.attack}-${v.defense}-${v.move}`}</span>
      {extra}
    </div>
  );
}

export function Sidebar(p: Props) {
  const tabs: [string, string][] = [
    ['play', 'Orders'],
    ['units', 'Forces'],
    ['log', 'Log'],
    ['crt', 'Rules'],
  ];
  if (p.editorOn) tabs.push(['editor', 'Map editor']);
  return (
    <div className="sidebar">
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={p.tab === k ? 'active' : ''} onClick={() => p.setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel">
        {p.tab === 'play' && <PlayPanel {...p} />}
        {p.tab === 'units' && <OffMapPanel {...p} />}
        {p.tab === 'log' && <LogPanel game={p.game} />}
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
    return (
      <>
        <h3>
          {p.acting} AI is {g.pendingDefense ? 'choosing its defense' : `playing the ${g.phase} phase`}
        </h3>
        <p className="muted">{p.aiStatus || 'Watch the map; each move is logged.'}</p>
        <div className="row">
          <button onClick={() => p.setPaused(!p.paused)}>{p.paused ? 'Resume AI' : 'Pause AI'}</button>
        </div>
        <RecentLog game={g} n={8} />
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
        <h3>Your units are under attack</h3>
        <p className="muted">Decide in the dialog: retreat, or make a Determined Defense in {g.pendingDefense.hex}.</p>
        <SelectedHexInfo {...p} />
      </>
    );
  }
  const note = RULES.turnNotes[g.turn];
  return (
    <>
      {note && g.phase !== 'combat' && <p className="muted">Turn {g.turn}: {note}</p>}
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
      <RecentLog game={g} n={6} />
    </>
  );
}

function InvasionControls(p: Props) {
  return (
    <>
      <h3>Invasion phase</h3>
      <p className="muted">
        The assault waves have landed (see the log for each beach's invasion roll). Units that may still advance can move up to their remaining
        tactical hexes. The Commandos at Vietri may attack Salerno: click the red hex.
      </p>
      <SelectedUnitBox {...p} />
      {p.attackTarget && <AttackPlanner {...p} kind="invasion" />}
    </>
  );
}

function InitialControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const pools: ReplPool[] = side === 'German' ? ['German'] : ['US', 'BR'];
  const own = Object.values(g.units).filter((u) => sideOf(u) === side);
  const candidates = own.filter((u) => def(u.id).repl && !u.repl &&
    ((u.where.kind === 'map' && (u.stepsLost > 0 || !!u.represents)) ||
      (u.where.kind === 'eliminated' && !u.where.permanent && def(u.id).cat !== 'bh' && !def(u.id).isRemnant)));
  const fired = own.filter((u) => def(u.id).asu && def(u.id).cat !== 'nebelwerfer' && u.fired && u.where.kind === 'map');
  const drops = own.filter((u) => u.where.kind === 'entry' && u.where.area.startsWith('airdrop'));
  return (
    <>
      <h3>{side} initial phase</h3>
      <p className="muted">Reinforcements have arrived (see Off-map). Use replacements and ready artillery, then end the phase. Unused replacements are lost.</p>
      {drops.length > 0 && (
        <>
          <h3>Airborne drops</h3>
          <p className="muted">Select a unit, then click a blue hex to drop it. Units listed here must drop this turn if they can.</p>
          {drops.map((u) => (
            <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)}
              extra={<span className="muted">{landingHexes(g, u.id).length} hexes</span>} />
          ))}
        </>
      )}
      <h3>Replacements</h3>
      <p>
        {pools.map((k) => (
          <span key={k} className="chip" style={{ marginRight: 4 }}>
            {k}: {g.replacements[k].inf} inf · {g.replacements[k].special} special · {g.replacements[k].armor} armor
          </span>
        ))}
      </p>
      {candidates.length ? candidates.map((u) => <ReplaceRow key={u.id} {...p} u={u} />) : <p className="muted">No units can take replacements.</p>}
      <h3>Artillery ({g.supplyPoints[side]} supply points)</h3>
      {fired.length ? (
        fired.map((u) => (
          <UnitRow key={u.id} u={u}
            extra={<button disabled={g.supplyPoints[side] < 1} onClick={() => p.dispatch({ type: 'readyAsu', unitId: u.id })}>Ready (1 SP)</button>} />
        ))
      ) : (
        <p className="muted">No fired artillery to ready.</p>
      )}
      {side === 'German' && g.turn >= 16 && !g.abandoned8th && (
        <>
          <h3>8th Army sector</h3>
          {g.abandon8thDeclared ? (
            <p className="muted">Declared: the sector is abandoned in this turn's German Supply Phase.</p>
          ) : (
            <button className="danger"
              onClick={() => confirm('Abandon the 8th Army sector in the Supply Phase? German units there and in the east Entry Areas are lost, and Germans may never enter the sector again.') &&
                p.dispatch({ type: 'abandon8th' })}>
              Abandon the 8th Army sector
            </button>
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
    return <UnitRow u={u} extra={<button disabled={!have} onClick={() => p.dispatch({ type: 'replace', unitId: u.id })}>Add step ({d.repl})</button>} />;
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
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{offmap}</option>
            {areas.map((a) => <option key={a} value={a}>Entry Area {a}</option>)}
            {asuHexes.map((h) => <option key={h} value={h}>{h} (ASU hex)</option>)}
          </select>
          <button disabled={!have} onClick={() => p.dispatch({ type: 'replace', unitId: u.id, to: to || undefined })}>Return ({d.repl})</button>
        </span>
      } />
  );
}

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
    if (why) status = `Cannot move: ${why}.`;
    else status = `${sel.mpSpent === null ? 'Has not moved.' : `${+sel.mpSpent.toFixed(1)} MP used.`} Modes: ${allowedModes(g, sel).join(', ')}.`;
  } else if (sel.where.kind === 'reserve' || sel.where.kind === 'followUp') {
    status = `Waiting to land (${lpCost(sel.id)} LP): click a blue beach or port hex. A 2 or 3 LP unit can reach a capacity-1 port in two turns.`;
  } else if (sel.where.kind === 'atSea') {
    status = `At sea on a 2-turn transfer to ${sel.where.port}: it can land ${sel.where.since >= g.turn ? 'next turn' : 'now (click the blue hex)'}.`;
  } else if (sel.where.kind === 'entry') {
    status = sel.where.area.startsWith('airdrop') ? 'Airborne: drops in the initial phase.' : `In entry area ${sel.where.area}: click a blue hex to enter.`;
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
      <div className="muted">{d.formation} · {d.cat}{d.elite ? ' · elite' : ''}{d.tankRating ? ` · tank ${d.tankRating}` : ''}. {status}</div>
      <div className="row">
        {areaActions.map((a) => (
          <button key={(a as { area: string }).area} onClick={() => p.dispatch(a)}>
            Move into entry area {(a as { area: string }).area}
            {MAP.entryAreas[(a as { area: string }).area].vp ? ` (${MAP.entryAreas[(a as { area: string }).area].vp} VP)` : ''}
          </button>
        ))}
        {naval.length > 0 && <NavalPicker {...p} unitId={sel.id} options={naval} />}
        {canFullRetreat && (
          <button title="The unit falls back automatically when enemy units move next to it; it may not attack."
            onClick={() => p.dispatch({ type: 'fullRetreat', unitId: sel.id })}>
            Full Retreat
          </button>
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
      <select value={pick.to} onChange={(e) => setTo(e.target.value)}>
        {p.options.map((o) => (
          <option key={o.to} value={o.to}>{o.to === 'reserve' ? 'Floating Reserve' : `${o.to}${o.twoTurn ? ' (2 turns)' : ''}`}</option>
        ))}
      </select>
      <button onClick={() => p.dispatch({ type: 'naval', unitId: p.unitId, to: pick.to })}>Embark</button>
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
      <h3>{side} movement phase</h3>
      <p className="muted">
        Click one of your units, then a highlighted hex: blue it can reach, amber where it must stop. Hover a hex to see the route and its
        cost. Click a stack again to cycle through it, or a red enemy hex to plan an Auto DS overrun.
        {side === 'Allied' ? ` Landing points left: ${g.landingPoints}.` : ` Trucks used: ${g.trucksUsed}/2.`}
      </p>
      <div className="row">
        Mode:
        {modes.map((m) => (
          <button key={m} className={p.moveMode === m ? 'primary' : ''} title={MODE_HELP[m]} onClick={() => p.setMoveMode(m)}>
            {label(m)}
          </button>
        ))}
      </div>
      <SelectedUnitBox {...p} />
      {p.attackTarget && <AttackPlanner {...p} kind="autoDs" />}
      <h3>Waiting to enter ({waiting.length})</h3>
      {waiting.length ? (
        waiting.map((u) => (
          <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)}
            extra={<span className="muted">{u.where.kind === 'reserve' ? 'reserve' : u.where.kind === 'followUp' ? `follow-up ${u.where.corps}` :
              u.where.kind === 'atSea' ? `at sea → ${u.where.port}` : (u.where as { area: string }).area}</span>} />
        ))
      ) : (
        <p className="muted">None.</p>
      )}
    </>
  );
}

function CombatControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const last = g.combats[g.combats.length - 1];
  const h = p.selectedHex;
  const canDisengage = h && unitsAt(g, h).some((u) => sideOf(u) === side && !u.attacked && !u.repl && !def(u.id).asu && def(u.id).cat !== 'bh') &&
    neighbors(h).some((n) => unitsAt(g, n).some((x) => sideOf(x) !== side));
  return (
    <>
      <h3>{side} combat phase</h3>
      {last && last.turn === g.turn && last.attackerSide === side && <CombatResult r={last} />}
      {p.attackTarget ? <AttackPlanner {...p} kind="attack" /> : <p className="muted">Click a red enemy hex to plan an attack.</p>}
      {canDisengage && (
        <div className="row">
          <button title="Roll to pull the units in this hex back one hex; they may not attack this phase."
            onClick={() => p.dispatch({ type: 'disengage', hex: h })}>
            Disengage from {h}
          </button>
        </div>
      )}
    </>
  );
}

function supportLabel(id: string): string {
  return id.includes('-air') || id.includes('-naval') ? id.replace('-', ' ') : def(id).name;
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
          <label key={id} className="unitrow">
            <input type="checkbox" checked={p.attackers.has(id)}
              onChange={(e) => {
                const s = new Set(p.attackers);
                if (e.target.checked) s.add(id);
                else s.delete(id);
                p.setAttackers(s);
              }} />
            <span className="name">{def(id).name} <span className="muted">({def(id).division ?? 'independent'})</span></span>
            <span className="vals">{values(g.units[id]).attack}{g.units[id].halfEff || g.units[id].outOfSupply ? '½' : ''}</span>
          </label>
        ))}
      </div>
      {p.kind === 'attack' && (
        <>
          {mafs.length > 1 && (
            <div className="row">
              Main Assault Force
              <select value={p.support.maf ?? ''} onChange={(e) => set({ maf: e.target.value || undefined })}>
                <option value="">best</option>
                {mafs.map((m) => <option key={m} value={m}>{g.units[m] ? def(m).name : m}</option>)}
              </select>
            </div>
          )}
          <div className="row">
            <label>
              <input type="checkbox" disabled={!airKeys.length} checked={!!p.support.air} onChange={(e) => set({ air: e.target.checked })} /> Air
              ({airKeys.join(', ') || 'none ready'})
            </label>
            {side === 'Allied' && (
              <label>
                <input type="checkbox" disabled={!navalKeys.length || !inNavalRange(t)} checked={!!p.support.naval}
                  onChange={(e) => set({ naval: e.target.checked, battleships: e.target.checked && p.support.battleships })} /> Naval
                {!inNavalRange(t) ? ' (out of range)' : navalKeys.length ? '' : ' (none ready)'}
              </label>
            )}
            {side === 'Allied' && g.turn >= BATTLESHIPS_TURN && g.support.battleships > 0 && (
              <label>
                <input type="checkbox" disabled={!p.support.naval} checked={!!p.support.battleships} onChange={(e) => set({ battleships: e.target.checked })} />{' '}
                Valiant/Warspite (+1 DRM)
              </label>
            )}
          </div>
          {asus.map((u) => (
            <label key={u.id} className="row">
              <input type="checkbox" checked={!!p.support.asus?.includes(u.id)}
                onChange={(e) => set({ asus: e.target.checked ? [...(p.support.asus ?? []), u.id] : (p.support.asus ?? []).filter((x) => x !== u.id) })} />{' '}
              {def(u.id).name} ({def(u.id).asu} artillery)
            </label>
          ))}
        </>
      )}
      {o && <OddsView o={o} game={g} autoDsNote={p.kind === 'autoDs'} />}
      <div className="row">
        <button className="primary" disabled={!o?.ok || (p.kind === 'autoDs' && !o.autoDs)}
          onClick={() => {
            const a: Action = p.kind === 'autoDs'
              ? { type: 'autoDs', target: t, attackers: chosen }
              : { type: 'attack', target: t, attackers: chosen, ...(p.kind === 'attack' ? p.support : {}) };
            if (p.dispatch(a)) {
              p.setAttackTarget(null);
              p.setAttackers(new Set());
              p.setSupport(NO_SUPPORT);
            }
          }}>
          {p.kind === 'autoDs' ? 'Overrun!' : 'Attack!'}
        </button>
        <button onClick={() => p.setAttackTarget(null)}>Cancel</button>
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
      <h3>{rq.side}: choose where your units retreat</h3>
      <p className="muted">
        {rq.units.map((id) => def(id).name).join(', ')} retreat {rq.distance} hex{rq.distance > 1 ? 'es' : ''} from {rq.from}. They are now at{' '}
        {rq.options[rq.current].end}. Click another highlighted hex to retreat there instead (every option follows the retreat priorities and loses
        no more units), or keep the current one.
      </p>
      <div className="row">
        {rq.options.map((o, i) => (
          <button key={i} className={i === rq.current ? 'primary' : ''} onClick={() => p.dispatch({ type: 'retreatChoice', index: i })}>
            {o.intoArea ? `Entry Area ${o.intoArea}` : o.end}{i === rq.current ? ' (keep)' : ''}
          </button>
        ))}
      </div>
    </>
  );
}

/** The defender's decision, shown in a dialog over the map. */
export function DefensePanel({ game, acting, dispatch }: { game: GameState; acting: Side; dispatch: (a: Action) => GameState | null }) {
  return <DefenseControls {...({ game, acting, dispatch } as unknown as Props)} />;
}

function DefenseControls(p: Props) {
  const g = p.game;
  const pd = g.pendingDefense!;
  const rep = g.combats.find((c) => c.id === pd.combatId);
  const [support, setSupport] = useState<string>('');
  const [ships, setShips] = useState(false);
  const [prefer, setPrefer] = useState<'hold' | 'delay'>('hold');
  const [delay, setDelay] = useState(1);
  const canShips = pd.defenderSide === 'Allied' && support.endsWith('-naval') && g.support.battleships > 0 && g.turn >= BATTLESHIPS_TURN;
  return (
    <>
      <h3>{pd.defenderSide}: your units in {pd.hex} must retreat</h3>
      {rep && <CombatResult r={rep} />}
      <p>
        Retreat {pd.retreat} hex{pd.retreat > 1 ? 'es' : ''} and become disrupted, or make a Determined Defense to try to hold.
        {pd.yellow ? ' This result is a yellow cell: −1 on the Determined Defense roll.' : ''}
      </p>
      {pd.desperate && (
        <p className="warn">The stack cannot retreat without being destroyed: a Determined Defense here is a Desperate Defense (each failure costs a step and you roll again).</p>
      )}
      <div className="row">
        Defensive support (+1)
        <select value={support} onChange={(e) => setSupport(e.target.value)}>
          <option value="">none</option>
          {pd.supportOptions.map((o) => <option key={o} value={o}>{supportLabel(o)}</option>)}
        </select>
      </div>
      {canShips && (
        <label className="row">
          <input type="checkbox" checked={ships} onChange={(e) => setShips(e.target.checked)} /> Add Valiant/Warspite (+1 more)
        </label>
      )}
      <div className="row">
        If the result offers a choice:
        <select value={prefer} onChange={(e) => setPrefer(e.target.value as 'hold' | 'delay')}>
          <option value="hold">hold (take the step loss)</option>
          <option value="delay">delay (fall back, no step loss)</option>
        </select>
      </div>
      <div className="row" title="On a Delay result the defender falls back 1 to 3 hexes (its choice), is disrupted, and the attacker may only enter the vacated hex.">
        On a Delay, fall back
        <select value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n} hex{n > 1 ? 'es' : ''}</option>)}
        </select>
      </div>
      <div className="row">
        <button className="primary" onClick={() => p.dispatch({ type: 'defend', choice: 'dd', support: support || null, battleships: canShips && ships, prefer, delay })}>
          Determined Defense
        </button>
        <button onClick={() => p.dispatch({ type: 'defend', choice: 'retreat' })}>Retreat</button>
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
      <h3>Advance after combat{pa.limited ? ' (limited: vacated hex only)' : ''}</h3>
      <p className="muted">Tick the units that advance together, then click a violet hex. Units may advance separately. Finish when done.</p>
      {ids.map((id) => (
        <label key={id} className="unitrow">
          <input type="checkbox" checked={p.advanceSel.includes(id)}
            onChange={(e) => p.setAdvanceSel(e.target.checked ? [...p.advanceSel, id] : p.advanceSel.filter((x) => x !== id))} />
          <span className="name">{def(id).name}</span>
          <span className="vals">up to {pa.maxByUnit[id]} hex{pa.maxByUnit[id] > 1 ? 'es' : ''}</span>
        </label>
      ))}
      {!ids.length && <p className="muted">No units left to advance.</p>}
      {pa.btAllowed && !pa.started && ids.length > 0 && (
        <>
          <h3>Breakthrough Combat</h3>
          <p className="muted">
            This attack earned two or more hexes, so one stack may form a Breakthrough Group before anyone else advances. It spends its advance
            on moving (1 per hex) and on attacking (1 per attack, no artillery, air or naval support). Turning away from the vacated hex at the start
            costs 1. Tick the units, then form the group.
          </p>
          <div className="row">
            <button disabled={!p.advanceSel.length} onClick={() => p.dispatch({ type: 'btStart', unitIds: p.advanceSel, form: 'vacated' }) && p.setAdvanceSel([])}>
              Form group in {pa.vacated} (1 hex)
            </button>
            <button disabled={!p.advanceSel.length || new Set(p.advanceSel.map((id) => (g.units[id].where as { hex: HexId }).hex)).size !== 1}
              onClick={() => p.dispatch({ type: 'btStart', unitIds: p.advanceSel, form: 'stack' }) && p.setAdvanceSel([])}>
              Ticked stack is the group
            </button>
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
      <h3>Breakthrough Group at {b.hex}: {b.left} hex{b.left === 1 ? '' : 'es'} left</h3>
      <p className="muted">
        Click a violet hex to advance (the number is its cost) or a red hex to attack it.
        {b.freeHex ? ` The group may enter ${b.freeHex} for free${b.mayContinue ? ' and keep going' : ' and must then stop'}.` : ''}
        {!b.committed ? ' Turning away from the vacated hex costs 1 extra hex.' : ''}
      </p>
      {ids.map((id) => (
        <UnitRow key={id} u={g.units[id]}
          extra={ids.length > 1 ? <button title="Leave the group and stop here" onClick={() => p.dispatch({ type: 'btDrop', unitIds: [id] })}>Drop off</button> : undefined} />
      ))}
      {t && (
        <>
          <p>
            Breakthrough attack on <b>{t}</b>: {unitsAt(g, t).filter((u) => sideOf(u) !== g.activeSide).map((u) => def(u.id).name).join(', ')}
          </p>
          {p.odds && <OddsView o={p.odds} game={g} />}
          <div className="row">
            <button className="primary" disabled={!p.odds?.ok}
              onClick={() => p.dispatch({ type: 'btAttack', target: t }) && p.setAttackTarget(null)}>
              Breakthrough attack!
            </button>
            <button onClick={() => p.setAttackTarget(null)}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
}

function CombatResult({ r }: { r: CombatReport }) {
  const key = r.result.replace(/\/\d.*$/, '');
  return (
    <div className="result-box">
      <div>
        {r.attackerSide} attack on <b>{r.defenderHex}</b>: {r.attack} vs {r.defense} → {r.finalColumn}, roll <b>{r.roll}</b>
        {r.drm ? ` ${r.drm > 0 ? '+' : ''}${r.drm}` : ''}: <b>{r.result}</b>
      </div>
      <div className="muted">{RULES.combat.results[key] ?? ''}</div>
      {r.dd && <div>Determined Defense ({r.dd.column}): roll {r.dd.roll}{r.dd.drm ? ` ${r.dd.drm > 0 ? '+' : ''}${r.dd.drm}` : ''} → {r.dd.result}</div>}
      {r.notes.length > 0 && <div>{r.notes.join('; ')}</div>}
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

function RecentLog({ game, n }: { game: GameState; n: number }) {
  return (
    <>
      <h3>Recent events</h3>
      <div className="log">
        {game.log.slice(-n).reverse().map((l, i) => (
          <div key={i} className={l.kind}>{l.text}</div>
        ))}
      </div>
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

function LogPanel({ game }: { game: GameState }) {
  const [filter, setFilter] = useState('all');
  const list = game.log.filter((l) => filter === 'all' || l.kind === filter);
  return (
    <>
      <div className="row">
        {['all', 'combat', 'move', 'dice', 'victory'].map((f) => (
          <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="log">
        {list.slice().reverse().map((l, i) => (
          <div key={i} className={l.kind}>
            <span className="muted">T{l.turn} {l.side ?? ''} {l.phase}: </span>
            {l.text}
          </div>
        ))}
      </div>
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
        <li>Rally: succeeds on {RULES.rally.success.join(', ')}; +{RULES.rally.bhOrCityDrm} in a beachhead or city, elite +{RULES.rally.eliteDrm}, low quality {RULES.rally.lowQualityDrm}</li>
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
  const tools = (
    <>
      <p className="muted">
        Correct the transcribed map against your copy: click a hex to edit its terrain, features and hexsides. {overrideCount()} edits stored.
        The painted map is redrawn after each edit.
      </p>
      <div className="row">
        <button onClick={() => downloadText('map.json', exportMapJson())}>Export map.json</button>
        <button onClick={() => { if (confirm('Discard all map edits and reload?')) { clearOverrides(); location.reload(); } }}>Reset edits</button>
        <button onClick={() => { p.setEditorOn(false); p.setTab('play'); }}>Close editor</button>
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
      <div className="row">
        Terrain
        <select value={d.terrain} onChange={(e) => save({ ...d, terrain: e.target.value as Terrain })}>
          {['clear', 'hill', 'marsh', 'sea'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="row">
        City <input type="text" value={d.city ?? ''} onChange={(e) => save({ ...d, city: e.target.value || undefined })} />
      </div>
      <div className="row">
        Town <input type="text" value={d.town ?? ''} onChange={(e) => save({ ...d, town: e.target.value || undefined })} />
      </div>
      <div className="row">
        VP <input type="number" min={0} max={9} value={d.vp ?? 0} onChange={(e) => save({ ...d, vp: Number(e.target.value) || undefined })} />
        Port <input type="number" min={0} max={9} value={d.port?.capacity ?? 0}
          onChange={(e) => save({ ...d, port: Number(e.target.value) ? { ...(d.port ?? {}), capacity: Number(e.target.value) } : undefined })} />
        <label><input type="checkbox" checked={!!d.sector8} onChange={(e) => save({ ...d, sector8: e.target.checked || undefined })} /> 8th Army sector</label>
      </div>
      <h3>Hexsides</h3>
      {neighbors(h).filter((n) => MAP.hexes[n]).map((n) => {
        const k = sideKey(h, n);
        const s = MAP.hexsides[k] ?? {};
        return (
          <div key={n} className="row">
            <span style={{ width: 44 }}>→{n}</span>
            <label><input type="checkbox" checked={!!s.river} onChange={(e) => saveSide(k, { ...s, river: e.target.checked })} />river</label>
            <label><input type="checkbox" checked={!!s.mountain} onChange={(e) => saveSide(k, { ...s, mountain: e.target.checked })} />mtn</label>
            <label><input type="checkbox" checked={!!s.pass} onChange={(e) => saveSide(k, { ...s, pass: e.target.checked })} />pass</label>
            <select value={s.road ?? ''} onChange={(e) => saveSide(k, { ...s, road: (e.target.value || undefined) as HexsideData['road'] })}>
              <option value="">no road</option>
              <option value="minor">minor road</option>
              <option value="major">major road</option>
            </select>
          </div>
        );
      })}
      <p className="muted">Edits apply immediately and are stored in this browser. Export map.json from Setup to keep them permanently.</p>
    </>
  );
}

