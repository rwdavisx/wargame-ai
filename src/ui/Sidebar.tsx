import { useRef, useState } from 'react';
import { MAP, RULES, SCENARIOS } from '../engine/data';
import { columnLabel, inNavalRange, type OddsInfo } from '../engine/combat';
import { landingHexes } from '../engine/game';
import { distance, neighbors, sideKey, type HexId } from '../engine/hex';
import type { Action, GameState, HexData, HexsideData, MoveMode, Terrain, UnitState } from '../engine/types';
import { adjacentEnemy, def, sideOf, unitsAt, values } from '../engine/units';
import { clearOverrides, editHex, editHexside, exportMapJson, overrideCount } from './mapEditor';
import { downloadText, type Controller, type Settings } from './storage';

interface Props {
  game: GameState;
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
  support: { air: boolean; naval: boolean; asus: string[] };
  setSupport: (s: { air: boolean; naval: boolean; asus: string[] }) => void;
  odds: OddsInfo | null;
  paused: boolean;
  setPaused: (p: boolean) => void;
  aiStatus: string;
  startNew: (scenario: string) => void;
  loadGame: (g: GameState) => void;
  editorOn: boolean;
  setEditorOn: (b: boolean) => void;
  bumpMap: () => void;
}

function UnitRow({ u, selected, onClick, extra }: { u: UnitState; selected?: boolean; onClick?: () => void; extra?: React.ReactNode }) {
  const d = def(u.id);
  const v = values(u);
  return (
    <div className={`unitrow${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="tag" style={{ background: d.nation === 'GE' ? '#5d666b' : d.nation === 'US' ? '#4d5e2a' : '#8a7444' }}>{d.nation}</span>
      <span className="name">
        {d.name}
        {u.stepsLost > 0 && <span className="tag red"> reduced</span>}
        {u.disrupted && <span className="tag red"> disrupted</span>}
        {u.outOfSupply && <span className="tag yellow"> no supply</span>}
        {d.type === 'asu' && u.fired && <span className="tag yellow"> fired</span>}
        {u.frozenUntil ? <span className="tag"> frozen to T{u.frozenUntil}</span> : null}
      </span>
      <span className="vals">{d.type === 'asu' ? `range ${d.asuRange}` : `${v.attack}-${v.defense}-${v.move}`}</span>
      {extra}
    </div>
  );
}

export function Sidebar(p: Props) {
  const tabs: [string, string][] = [
    ['play', 'Play'],
    ['units', 'Off-map'],
    ['log', 'Log'],
    ['crt', 'Tables'],
    ['setup', 'Setup'],
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
        {p.tab === 'setup' && <SetupPanel {...p} />}
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
        <h3>{g.activeSide} AI is playing the {g.phase} phase</h3>
        <p className="muted">{p.aiStatus || 'Watch the map; each move is logged.'}</p>
        <div className="row">
          <button onClick={() => p.setPaused(!p.paused)}>{p.paused ? 'Resume AI' : 'Pause AI'}</button>
        </div>
        <RecentLog game={g} n={8} />
        <SelectedHexInfo {...p} />
      </>
    );
  }
  return (
    <>
      {g.phase === 'initial' && <InitialControls {...p} />}
      {g.phase === 'movement' && <MovementControls {...p} />}
      {g.phase === 'combat' && <CombatControls {...p} />}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => p.dispatch({ type: 'endPhase' })}>
          End {g.phase} phase
        </button>
        <button onClick={p.undo} disabled={!p.canUndo}>
          Undo
        </button>
      </div>
      <SelectedHexInfo {...p} />
      <RecentLog game={g} n={6} />
    </>
  );
}

function InitialControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const pools = side === 'German' ? (['German'] as const) : (['BR', 'US'] as const);
  const reduced = Object.values(g.units).filter(
    (u) => sideOf(u) === side && u.stepsLost > 0 && (u.where.kind === 'map' || u.where.kind === 'reserve'),
  );
  const fired = Object.values(g.units).filter((u) => sideOf(u) === side && def(u.id).type === 'asu' && u.fired && u.where.kind === 'map');
  return (
    <>
      <h3>{side} initial phase</h3>
      <p className="muted">Reinforcements have arrived (see Off-map). Use replacements and resupply artillery, then end the phase.</p>
      <p>
        Replacements:{' '}
        {pools.map((k) => (
          <span key={k} className="chip" style={{ marginRight: 4 }}>
            {k}: {g.replacements[k].inf} inf · {g.replacements[k].armor} armour · {g.replacements[k].any} any
          </span>
        ))}
      </p>
      {reduced.length ? (
        reduced.map((u) => {
          const blocked = u.where.kind === 'map' && (adjacentEnemy(g, u.where.hex, side) || u.outOfSupply);
          return (
            <UnitRow key={u.id} u={u} extra={<button disabled={blocked} onClick={() => p.dispatch({ type: 'replace', unitId: u.id })}>Replace</button>} />
          );
        })
      ) : (
        <p className="muted">No reduced units.</p>
      )}
      <h3>Artillery ({g.supplyPoints[side]} supply points)</h3>
      {fired.length ? (
        fired.map((u) => (
          <UnitRow key={u.id} u={u} extra={<button disabled={g.supplyPoints[side] < 1} onClick={() => p.dispatch({ type: 'readyAsu', unitId: u.id })}>Resupply</button>} />
        ))
      ) : (
        <p className="muted">All artillery support units are ready.</p>
      )}
    </>
  );
}

function MovementControls(p: Props) {
  const g = p.game;
  const side = g.activeSide;
  const sel = p.selectedUnit ? g.units[p.selectedUnit] : null;
  const waiting = Object.values(g.units).filter(
    (u) => sideOf(u) === side && (u.where.kind === 'reserve' || u.where.kind === 'entry'),
  );
  const onEdge = sel && sel.where.kind === 'map' ? Object.entries(MAP.entryAreas).find(([, ea]) => ea.hexes.includes((sel.where as { hex: HexId }).hex)) : null;
  return (
    <>
      <h3>{side} movement phase</h3>
      <p className="muted">
        Click one of your units, then a highlighted hex (green: free to continue, orange: enemy zone of control, you must stop; numbers are MP
        used). Click a stack again to cycle through it.
      </p>
      <div className="row">
        Mode:
        <button className={p.moveMode === 'tactical' ? 'primary' : ''} onClick={() => p.setMoveMode('tactical')}>Tactical</button>
        <button className={p.moveMode === 'strategic' ? 'primary' : ''} onClick={() => p.setMoveMode('strategic')}
          title="Double movement along roads only, never next to the enemy; the unit may not attack this turn.">
          Strategic
        </button>
      </div>
      {sel && (
        <div className="result-box">
          <UnitRow u={sel} />
          <div className="muted">
            {sel.where.kind === 'map'
              ? sel.mpSpent === null
                ? 'Has not moved.'
                : sel.mpSpent >= 1e9
                  ? 'Must stop (entered an enemy zone of control or landed).'
                  : `${sel.mpSpent} MP used.`
              : sel.where.kind === 'reserve'
                ? `In the floating reserve: ${landingHexes(g, sel.id).length} landing hexes available (blue).`
                : sel.where.kind === 'entry'
                  ? `Waiting at ${sel.where.area}. Click a blue hex to enter.`
                  : ''}
          </div>
          {onEdge && side === 'German' &&
            MAP.offmapLinks.filter((l) => (l.from === onEdge[0] || l.to === onEdge[0]) && (!l.side || l.side === 'GE')).map((l) => {
              const to = l.from === onEdge[0] ? l.to : l.from;
              return (
                <button key={to} onClick={() => p.dispatch({ type: 'exitMap', unitId: sel.id, area: to })}>
                  Move off-map to {to} ({l.turns} turn)
                </button>
              );
            })}
          {onEdge && side === 'Allied' && MAP.entryAreas[onEdge[0]].vp && (
            <button onClick={() => p.dispatch({ type: 'exitMap', unitId: sel.id, area: onEdge[0] })}>Exit via {onEdge[0]} (+{MAP.entryAreas[onEdge[0]].vp} VP)</button>
          )}
        </div>
      )}
      <h3>Waiting to enter ({waiting.length})</h3>
      {waiting.length ? (
        waiting.map((u) => (
          <UnitRow key={u.id} u={u} selected={u.id === p.selectedUnit} onClick={() => p.setSelectedUnit(u.id)}
            extra={<span className="muted">{u.where.kind === 'reserve' ? 'reserve' : (u.where as { area: string }).area}</span>} />
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
  if (g.pendingAdvance) {
    const pa = g.pendingAdvance;
    return <AdvanceControls {...p} hex={pa.hex} ids={pa.unitIds} max={pa.max} />;
  }
  const t = p.attackTarget;
  const eligible = t
    ? neighbors(t).flatMap((n) => unitsAt(g, n)).filter((u) => sideOf(u) === side && def(u.id).type !== 'asu')
    : [];
  const asus = t
    ? Object.values(g.units).filter((u) => u.where.kind === 'map' && sideOf(u) === side && def(u.id).type === 'asu' && !u.fired &&
        distance(u.where.hex, t) <= (def(u.id).asuRange ?? 0))
    : [];
  return (
    <>
      <h3>{side} combat phase</h3>
      {last && last.turn === g.turn && last.attackerSide === side && <CombatResult r={last} />}
      {!t ? (
        <p className="muted">Click a red-tinted enemy hex to plan an attack.</p>
      ) : (
        <>
          <p>
            Target <b>{t}</b>: {unitsAt(g, t).map((u) => def(u.id).name).join(', ')}
          </p>
          <div>
            {eligible.map((u) => {
              const can = !u.attacked && !u.disrupted && !u.strategic && values(u).attack > 0;
              return (
                <label key={u.id} className="unitrow">
                  <input type="checkbox" disabled={!can} checked={p.attackers.has(u.id)}
                    onChange={(e) => {
                      const s = new Set(p.attackers);
                      if (e.target.checked) s.add(u.id);
                      else s.delete(u.id);
                      p.setAttackers(s);
                    }} />
                  <span className="name">{def(u.id).name}{u.attacked ? ' (attacked)' : ''}</span>
                  <span className="vals">{values(u).attack}{u.outOfSupply ? '½' : ''}</span>
                </label>
              );
            })}
          </div>
          <div className="row">
            <label>
              <input type="checkbox" disabled={!g.support[side].air.length} checked={p.support.air}
                onChange={(e) => p.setSupport({ ...p.support, air: e.target.checked })} /> Air ({g.support[side].air.join(',') || 'none'})
            </label>
            {side === 'Allied' && (
              <label>
                <input type="checkbox" disabled={!g.support.Allied.naval.length || !inNavalRange(t)} checked={p.support.naval}
                  onChange={(e) => p.setSupport({ ...p.support, naval: e.target.checked })} /> Naval{!inNavalRange(t) ? ' (out of range)' : ''}
              </label>
            )}
          </div>
          {asus.map((u) => (
            <label key={u.id} className="row">
              <input type="checkbox" checked={p.support.asus.includes(u.id)}
                onChange={(e) =>
                  p.setSupport({ ...p.support, asus: e.target.checked ? [...p.support.asus, u.id] : p.support.asus.filter((x) => x !== u.id) })
                } /> {def(u.id).name}
            </label>
          ))}
          {p.odds && (
            <div className="result-box">
              {p.odds.ok ? (
                <>
                  <div className="odds">
                    {p.odds.attack} vs {p.odds.defense} → {columnLabel(p.odds.baseIndex)} → <b>{columnLabel(p.odds.finalIndex)}</b>
                    {p.odds.drm ? ` (DRM ${p.odds.drm > 0 ? '+' : ''}${p.odds.drm})` : ''}
                  </div>
                  <ul className="shiftlist">
                    {p.odds.shifts.map((s, i) => (
                      <li key={i}>{s.reason}: {s.shift > 0 ? `+${s.shift} right` : `${s.shift} left`}</li>
                    ))}
                  </ul>
                  <div className="muted">
                    Outcomes: {[1, 2, 3, 4, 5, 6].map((r) => RULES.combat.crt[String(Math.max(1, Math.min(6, r + p.odds!.drm)))][p.odds!.finalIndex]).join(' / ')}
                  </div>
                </>
              ) : (
                <span className="muted">{p.odds.reason}</span>
              )}
            </div>
          )}
          <div className="row">
            <button className="primary" disabled={!p.odds?.ok}
              onClick={() => {
                const next = p.dispatch({ type: 'attack', target: t, attackers: [...p.attackers], ...p.support });
                if (next) {
                  p.setAttackTarget(null);
                  p.setAttackers(new Set());
                  p.setSupport({ air: false, naval: false, asus: [] });
                }
              }}>
              Attack!
            </button>
            <button onClick={() => p.setAttackTarget(null)}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
}

function AdvanceControls(p: Props & { hex: HexId; ids: string[]; max: number }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const g = p.game;
  const last = g.combats[g.combats.length - 1];
  return (
    <>
      {last && <CombatResult r={last} />}
      <h3>Advance after combat into {p.hex}?</h3>
      <p className="muted">Choose up to {p.max} units.</p>
      {p.ids.filter((id) => g.units[id].where.kind === 'map').map((id) => (
        <label key={id} className="unitrow">
          <input type="checkbox" checked={chosen.includes(id)}
            onChange={(e) => setChosen(e.target.checked ? [...chosen, id].slice(0, p.max) : chosen.filter((x) => x !== id))} />
          <span className="name">{def(id).name}</span>
        </label>
      ))}
      <div className="row">
        <button className="primary" onClick={() => p.dispatch({ type: 'advance', unitIds: chosen })}>Advance</button>
        <button onClick={() => p.dispatch({ type: 'advance', unitIds: [] })}>Stay</button>
      </div>
    </>
  );
}

function CombatResult({ r }: { r: GameState['combats'][number] }) {
  return (
    <div className="result-box">
      <div>
        Attack on <b>{r.defenderHex}</b>: {r.attack} vs {r.defense} → {r.finalColumn}, roll <b>{r.roll}</b>
        {r.drm ? ` ${r.drm > 0 ? '+' : ''}${r.drm}` : ''}: <b>{r.result}</b>
      </div>
      <div className="muted">{RULES.combat.resultKey[r.result] ?? 'No effect'}</div>
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
  return (
    <>
      <h3>Hex {h}</h3>
      <p className="muted">
        {d.terrain}
        {d.city ? ` · ${d.city}` : d.town ? ` · ${d.town}` : ''}
        {d.vp ? ` · ${d.vp} VP held by ${g.control[h]}` : ''}
        {d.sector8 ? ' · 8th Army sector' : ''}
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
    ['At entry areas', (u) => u.where.kind === 'entry'],
    ['Moving off-map', (u) => u.where.kind === 'transit'],
    ['Future reinforcements', (u) => u.where.kind === 'pending'],
    ['Eliminated', (u) => u.where.kind === 'eliminated'],
    ['Exited / withdrawn', (u) => u.where.kind === 'exited' || u.where.kind === 'removed'],
  ];
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
                    extra={<span className="muted">
                      {u.where.kind === 'pending' ? `T${u.where.turn} ${u.where.at}` : u.where.kind === 'entry' ? u.where.area :
                        u.where.kind === 'transit' ? `→${u.where.to} T${u.where.arrive}` : ''}
                    </span>} />
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

function TablesPanel() {
  const c = RULES.combat;
  const m = RULES.movement;
  return (
    <>
      <h3>Combat results table (provisional)</h3>
      <table className="crt">
        <thead>
          <tr>
            <th>Die</th>
            {c.columns.map((x) => <th key={x}>{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {['1', '2', '3', '4', '5', '6'].map((r) => (
            <tr key={r}>
              <th>{r}</th>
              {c.crt[r].map((x, i) => <td key={i}>{x}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="shiftlist">
        {Object.entries(c.resultKey).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}
      </ul>
      <h3>Column shifts</h3>
      <ul className="shiftlist">
        <li>Defender in city or hill/marsh: {c.terrainShift.city} / {c.terrainShift.hill}</li>
        <li>All attackers across river: {c.allAcrossRiverShift}; across mountain hexsides: {c.allAcrossMountainShift}; through a pass: {c.allAcrossPassShift}</li>
        <li>Armour attacking a hex in clear terrain with no defending armour: +{c.armorShift}</li>
        <li>Air support +{c.airShift}, naval gunfire +{c.navalShift} (within {c.navalRange} hexes of the Gulf of Salerno), artillery +{c.asuShiftEach} each (max {c.asuMaxPerSide})</li>
        <li>Rain: {c.rainShift}</li>
      </ul>
      <h3>Movement costs</h3>
      <ul className="shiftlist">
        <li>Clear {m.terrainCost.clear}, hill {m.terrainCost.hill}, marsh {m.terrainCost.marsh} (vehicles {m.vehicleTerrainCost.marsh})</li>
        <li>River +{m.riverCost} (vehicles +{m.vehicleRiverCost}); mountain hexside +{m.mountainCost} (vehicles prohibited), pass +{m.passCost}</li>
        <li>Major road {m.majorRoadCost} (Allied in 8th Army sector {m.eighthArmyRoadCost}); minor road {m.minorRoadCost}</li>
        <li>Leaving an enemy zone of control +{m.exitZocCost}; no zone-to-zone moves; strategic movement ×{m.strategicMultiplier} on roads only</li>
      </ul>
      <h3>Weather</h3>
      <ul className="shiftlist">
        {RULES.weather.track.map((w) => (
          <li key={w.box}>
            {w.box} {w.name}: air [{w.air.join(',') || '-'}], naval [{w.naval.join(',') || 'none'}], supply A{w.alliedSupply}
            {w.alliedPortBonus ? '(+1 Salerno open)' : ''} G{w.germanSupply}
          </li>
        ))}
      </ul>
      <p className="muted">Edit data/rules.json to match the tables on your player aid cards.</p>
    </>
  );
}

function SetupPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scenario, setScenario] = useState('campaign');
  const s = p.settings;
  const setCtl = (side: 'Allied' | 'German', c: Controller) => p.setSettings({ ...s, controllers: { ...s.controllers, [side]: c } });
  return (
    <>
      <h3>Players</h3>
      {(['Allied', 'German'] as const).map((side) => (
        <div key={side} className="row">
          <span style={{ width: 60 }}>{side}</span>
          <select value={s.controllers[side]} onChange={(e) => setCtl(side, e.target.value as Controller)}>
            <option value="human">Human</option>
            <option value="heuristic">Computer (built-in AI)</option>
            <option value="claude">Claude (API key required)</option>
          </select>
        </div>
      ))}
      <div className="row">
        AI speed
        <input type="range" min={0} max={1500} step={50} value={s.aiDelayMs} onChange={(e) => p.setSettings({ ...s, aiDelayMs: Number(e.target.value) })} />
        <span className="muted">{s.aiDelayMs} ms/action</span>
      </div>
      <h3>Claude opponent</h3>
      <p className="muted">
        Optional. Claude plans each phase; the engine checks every order. Your key is kept only in this browser's local storage and sent only to
        api.anthropic.com.
      </p>
      <div className="row">
        <input type="password" placeholder="sk-ant-..." value={s.claudeApiKey} style={{ flex: 1 }}
          onChange={(e) => p.setSettings({ ...s, claudeApiKey: e.target.value.trim() })} />
      </div>
      <div className="row">
        Model
        <select value={s.claudeModel} onChange={(e) => p.setSettings({ ...s, claudeModel: e.target.value })}>
          <option value="claude-opus-5-5">Claude Opus 5.5</option>
          <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
          <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
        </select>
      </div>
      <h3>New game</h3>
      <div className="row">
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {Object.entries(SCENARIOS).map(([k, v]) => (
            <option key={k} value={k}>{v.name} ({v.lastTurn} turns)</option>
          ))}
        </select>
        <button className="danger" onClick={() => confirm('Abandon the current game?') && p.startNew(scenario)}>Start</button>
      </div>
      <p className="muted">{SCENARIOS[scenario]?.description}</p>
      <h3>Save / load</h3>
      <p className="muted">The game autosaves in this browser after every action.</p>
      <div className="row">
        <button onClick={() => downloadText(`salerno43-turn${p.game.turn}.json`, JSON.stringify(p.game))}>Export save</button>
        <button onClick={() => fileRef.current?.click()}>Import save</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              p.loadGame(JSON.parse(await f.text()) as GameState);
            } catch {
              alert('That file is not a saved game.');
            }
          }} />
      </div>
      <h3>Map editor</h3>
      <p className="muted">
        Correct the transcribed map against your copy: click a hex to edit its terrain, features and hexsides. {overrideCount()} edits stored.
      </p>
      <div className="row">
        <button onClick={() => { p.setEditorOn(!p.editorOn); p.setTab(p.editorOn ? 'setup' : 'editor'); }}>
          {p.editorOn ? 'Close editor' : 'Open editor'}
        </button>
        <button onClick={() => downloadText('map.json', exportMapJson())}>Export map.json</button>
        <button onClick={() => { if (confirm('Discard all map edits and reload?')) { clearOverrides(); location.reload(); } }}>Reset edits</button>
      </div>
    </>
  );
}

function EditorPanel(p: Props) {
  const h = p.selectedHex;
  const [, force] = useState(0);
  if (!h) return <p className="muted">Click a hex on the map to edit it.</p>;
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

