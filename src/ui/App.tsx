import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP, SCENARIOS } from '../engine/data';
import { advanceDestinations, computeOdds } from '../engine/combat';
import { actingSide, alliedVp, benchmark, currentWeather, entryReach, IllegalAction, landingHexes, newGame, withAction } from '../engine/game';
import { neighbors, type HexId } from '../engine/hex';
import { legalDestinations } from '../engine/movement';
import type { Action, GameState, MoveMode, Side } from '../engine/types';
import { canStack, def, goodOrder, sideOf, unitsAt, values } from '../engine/units';
import { createHeuristicAi, type AiPlayer } from '../ai/heuristic';
import { createClaudeAi } from '../ai/claude';
import { MapView, type Highlight } from './MapView';
import { Sidebar } from './Sidebar';
import { autosave, loadAutosave, loadSettings, saveSettings, type Settings } from './storage';
import { effectiveMode, eligibleAttackers, NO_SUPPORT, type SupportPick } from './play';

export const dateOf = (turn: number) => `${8 + turn} Sept 1943`;

const UNDOABLE = new Set(['move', 'enter', 'land', 'changeArea', 'fullRetreat', 'replace', 'readyAsu']);

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadAutosave() ?? newGame('campaign'));
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selectedHex, setSelectedHex] = useState<HexId | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>('normal');
  const [attackTarget, setAttackTarget] = useState<HexId | null>(null);
  const [attackers, setAttackers] = useState<Set<string>>(new Set());
  const [support, setSupport] = useState<SupportPick>(NO_SUPPORT);
  const [advanceSel, setAdvanceSel] = useState<string[]>([]);
  const [hover, setHover] = useState<HexId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>('');
  const [mapVersion, setMapVersion] = useState(0);
  const [editorOn, setEditorOn] = useState(false);
  const [tab, setTab] = useState('play');
  const [overDismissed, setOverDismissed] = useState(false);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  useEffect(() => autosave(game), [game]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // The defender answers a Determined Defense choice even during the other side's turn.
  const acting = actingSide(game);
  const controller = settings.controllers[acting];
  const humanTurn = controller === 'human' && game.phase !== 'gameOver';

  // ---------------------------------------------------------------- AI players
  const aiRef = useRef<Record<string, AiPlayer>>({});
  const aiFor = useCallback(
    (side: Side): AiPlayer => {
      const kind = settings.controllers[side];
      const key = `${side}:${kind}:${settings.claudeModel}`;
      if (!aiRef.current[key]) {
        aiRef.current[key] =
          kind === 'claude'
            ? createClaudeAi({ apiKey: settings.claudeApiKey, model: settings.claudeModel, onStatus: setAiStatus })
            : createHeuristicAi();
      }
      return aiRef.current[key];
    },
    [settings.controllers, settings.claudeApiKey, settings.claudeModel],
  );

  useEffect(() => {
    if (humanTurn || paused || game.phase === 'gameOver') return;
    let cancelled = false;
    const seq = game.seq;
    const timer = setTimeout(async () => {
      try {
        const ai = aiFor(acting);
        const a = await ai.nextAction(game);
        if (cancelled) return;
        setGame((g) => {
          if (g.seq !== seq) return g;
          try {
            return withAction(g, a);
          } catch (e) {
            setAiStatus(`AI proposed an illegal action (${(e as Error).message}); skipping it.`);
            const fallback: Action = g.pendingDefense
              ? { type: 'defend', choice: 'retreat' }
              : g.pendingAdvance
                ? { type: 'advance', unitIds: [] }
                : { type: 'endPhase' };
            return withAction(g, fallback);
          }
        });
      } catch (e) {
        if (!cancelled) {
          setPaused(true);
          setToast(`AI error: ${(e as Error).message}`);
        }
      }
    }, settings.aiDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [game, acting, humanTurn, paused, settings.aiDelayMs, aiFor]);

  // Clear transient selection when the phase or side changes.
  const phaseKey = `${game.turn}|${game.activeSide}|${game.phase}`;
  useEffect(() => {
    setAttackTarget(null);
    setAttackers(new Set());
    setSupport(NO_SUPPORT);
    setSelectedUnit(null);
    setAdvanceSel([]);
    setHistory([]);
  }, [phaseKey]);
  const advanceKey = game.pendingAdvance ? `${game.pendingAdvance.combatId}|${game.pendingAdvance.vacated}` : '';
  useEffect(() => setAdvanceSel([]), [advanceKey]);

  // ---------------------------------------------------------------- human actions
  const dispatch = useCallback(
    (a: Action) => {
      try {
        const next = withAction(game, a);
        if (UNDOABLE.has(a.type)) setHistory((h) => [...h.slice(-30), game]);
        else setHistory([]);
        setGame(next);
        return next;
      } catch (e) {
        if (e instanceof IllegalAction || e instanceof Error) setToast(e.message);
        return null;
      }
    },
    [game],
  );

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setGame(prev);
    setSelectedUnit(null);
  };

  const startNew = (scenario: string) => {
    const g = newGame(scenario);
    aiRef.current = {};
    setHistory([]);
    setGame(g);
    setSelectedHex(null);
    setSelectedUnit(null);
    setPaused(false);
    setOverDismissed(false);
  };

  // ---------------------------------------------------------------- highlights and click actions
  const selUnit = selectedUnit ? game.units[selectedUnit] : null;
  const { highlights, clickActions } = useMemo(() => {
    const m = new Map<HexId, Highlight>();
    const act = new Map<HexId, Action>();
    if (!humanTurn) return { highlights: m, clickActions: act };
    const g = game;
    if (g.pendingDefense) {
      m.set(g.pendingDefense.hex, { color: '#d0574a', label: 'defend' });
      return { highlights: m, clickActions: act };
    }
    if (g.pendingAdvance) {
      const pa = g.pendingAdvance;
      m.set(pa.vacated, { color: '#9b59b6', label: 'vacated' });
      if (advanceSel.length) {
        const [first, ...rest] = advanceSel.map((id) => advanceDestinations(g, pa, id));
        for (const [h, path] of first) {
          if (rest.some((d) => !d.has(h))) continue;
          m.set(h, { color: '#9b59b6', label: String(path.length) });
          act.set(h, { type: 'advance', unitIds: advanceSel, to: h });
        }
      }
      return { highlights: m, clickActions: act };
    }
    const mine = selUnit && sideOf(selUnit) === g.activeSide ? selUnit : null;
    if (mine && g.phase === 'initial' && mine.where.kind === 'entry' && mine.where.area.startsWith('airdrop')) {
      for (const h of landingHexes(g, mine.id)) {
        m.set(h, { color: '#3b82c4', label: 'drop' });
        act.set(h, { type: 'land', unitId: mine.id, to: h });
      }
    }
    if (mine && (g.phase === 'movement' || g.phase === 'invasion')) {
      if (mine.where.kind === 'map') {
        const mode = effectiveMode(g, mine.id, moveMode);
        if (mode) {
          for (const [h, r] of legalDestinations(g, mine.id, mode)) {
            m.set(h, { color: r.stop ? '#e7a53b' : '#5aa469', label: mode === 'tactical' ? `${r.hexes}h` : String(+r.cost.toFixed(1)) });
            act.set(h, { type: 'move', unitId: mine.id, to: h, mode });
          }
        }
      } else if (mine.where.kind === 'reserve' || mine.where.kind === 'followUp') {
        for (const h of landingHexes(g, mine.id)) {
          // Orange: landing here would overstack the hex (fix it before the phase ends).
          m.set(h, canStack(g, h, [mine.id]) ? { color: '#3b82c4', label: 'land' } : { color: '#e7a53b', label: 'full' });
          act.set(h, { type: 'land', unitId: mine.id, to: h });
        }
      } else if (mine.where.kind === 'entry' && !mine.where.area.startsWith('airdrop')) {
        const mode: MoveMode = g.turn === 1 && g.activeSide === 'Allied' ? 'tactical' : moveMode === 'extended' || moveMode === 'truck' ? moveMode : 'normal';
        for (const [h, r] of entryReach(g, mine.id, mode)) {
          m.set(h, { color: r.stop ? '#e7a53b' : '#3b82c4', label: String(+r.cost.toFixed(1)) });
          act.set(h, { type: 'enter', unitId: mine.id, to: h, mode });
        }
      }
    }
    if (g.phase === 'combat' || g.phase === 'movement' || g.phase === 'invasion') {
      // Enemy hexes that can be attacked (or overrun with an Auto DS in the movement phase).
      for (const u of Object.values(g.units)) {
        if (u.where.kind !== 'map' || sideOf(u) !== g.activeSide || u.attacked || !goodOrder(u) || def(u.id).asu) continue;
        if (g.phase === 'invasion' && def(u.id).formation !== 'Commando Bde') continue;
        for (const n of neighbors(u.where.hex)) {
          if (!m.has(n) && unitsAt(g, n).some((x) => sideOf(x) !== g.activeSide)) m.set(n, { color: '#d0574a' });
        }
      }
    }
    return { highlights: m, clickActions: act };
  }, [game, selUnit, moveMode, humanTurn, advanceSel]);

  const odds = useMemo(() => {
    if (!attackTarget || !['combat', 'movement', 'invasion'].includes(game.phase) || game.pendingAdvance || game.pendingDefense) return null;
    const ids = [...attackers];
    if (game.phase === 'movement') return computeOdds(game, { target: attackTarget, attackers: ids }, { autoDs: true });
    if (game.phase === 'invasion') return computeOdds(game, { target: attackTarget, attackers: ids });
    return computeOdds(game, { target: attackTarget, attackers: ids, ...support });
  }, [game, attackTarget, attackers, support]);

  // ---------------------------------------------------------------- map clicks
  const onHexClick = (hex: HexId) => {
    setSelectedHex(hex);
    if (editorOn) {
      setTab('editor');
      return;
    }
    const here = unitsAt(game, hex);
    const clickAct = clickActions.get(hex);
    if (humanTurn && clickAct) {
      const next = dispatch(clickAct);
      if (next && clickAct.type === 'advance') setAdvanceSel([]);
      if (next && (clickAct.type === 'move' || clickAct.type === 'enter' || clickAct.type === 'land')) {
        const u = next.units[clickAct.unitId];
        if (u.stopped || u.where.kind !== 'map') setSelectedUnit(null);
      }
      return;
    }
    const canAttack = ['combat', 'movement', 'invasion'].includes(game.phase) && !game.pendingAdvance && !game.pendingDefense;
    if (humanTurn && canAttack && highlights.get(hex)?.color === '#d0574a' && here.some((u) => sideOf(u) !== game.activeSide)) {
      setAttackTarget(hex);
      let ids = eligibleAttackers(game, hex);
      if (game.phase === 'invasion') ids = ids.filter((id) => def(id).formation === 'Commando Bde');
      setAttackers(new Set(ids));
      setSupport(NO_SUPPORT);
      setTab('play');
      return;
    }
    const own = here.filter((u) => sideOf(u) === game.activeSide);
    if (own.length) {
      const idx = own.findIndex((u) => u.id === selectedUnit);
      setSelectedUnit(own[(idx + 1) % own.length].id);
      return;
    }
    setSelectedUnit(here[0]?.id ?? null);
  };

  // ---------------------------------------------------------------- hover info
  const hoverText = useMemo(() => {
    if (!hover) return null;
    const d = MAP.hexes[hover];
    if (!d) return null;
    const parts = [`${hover} ${d.terrain}`];
    if (d.city) parts.push(`city of ${d.city}`);
    else if (d.town) parts.push(d.town);
    if (d.vp) parts.push(`${d.vp} VP (${game.control[hover] ?? 'German'})`);
    if (d.port) parts.push(`port ${d.port.capacity}${d.port.restricted ? ' (no naval use)' : ''}`);
    if (d.airfield) parts.push('airfield');
    if (d.sector8) parts.push('8th Army sector');
    if (game.cityBattle[hover]) parts.push('City Battle');
    const beach = Object.entries(MAP.beaches).find(([, b]) => b.hex === hover);
    if (beach) parts.push(`${beach[0]} beach`);
    const us = unitsAt(game, hover);
    if (us.length) parts.push(us.map((u) => `${def(u.id).name} ${values(u).attack}-${values(u).defense}-${values(u).move}`).join(', '));
    const hl = highlights.get(hover);
    if (hl?.label && /^[\d.]+$/.test(hl.label)) parts.push(`cost ${hl.label}`);
    return parts.join(' · ');
  }, [hover, game, highlights]);

  const wb = currentWeather(game);
  const vp = alliedVp(game);
  const bm = benchmark(game.turn);
  const lastCombat = game.combats[game.combats.length - 1];

  return (
    <div className="app">
      <div className="topbar">
        <h1>Salerno ’43</h1>
        <span className="chip">{SCENARIOS[game.scenarioId]?.name}</span>
        <span className="chip">
          Turn {game.turn}/{game.lastTurn} · {dateOf(game.turn)}
        </span>
        <span className={`chip ${game.activeSide === 'Allied' ? 'allied' : 'german'}`}>
          {game.phase === 'gameOver' ? 'Game over' : `${game.activeSide} ${game.phase} phase`}
          {settings.controllers[game.activeSide] !== 'human' && game.phase !== 'gameOver' ? ' (AI)' : ''}
        </span>
        {game.pendingDefense && <span className="chip warn">{acting} must choose: retreat or Determined Defense</span>}
        <span className={`chip ${wb.rain ? 'warn' : ''}`}>
          Weather {wb.box}: {wb.name}
        </span>
        <span className="chip">
          Allied VP {vp}
          {bm !== null ? ` / benchmark ${bm}` : ''}
        </span>
        <span className="chip">
          Supply pts A {game.supplyPoints.Allied} · G {game.supplyPoints.German}
        </span>
        <span className="chip" title="Ready air and naval support markers">
          Support: {game.support.ready.join(' ') || 'none ready'}
          {game.turn >= 8 && game.support.battleships ? ` · Valiant/Warspite ×${game.support.battleships}` : ''}
        </span>
        {game.phase === 'movement' && game.activeSide === 'Allied' && <span className="chip">Landing points {game.landingPoints}</span>}
      </div>
      <div className="main">
        <MapView
          state={game}
          version={mapVersion}
          highlights={highlights}
          selectedHex={selectedHex}
          selectedUnitId={selectedUnit}
          attackTarget={attackTarget}
          attackers={new Set([...attackers, ...advanceSel])}
          lastCombatHex={lastCombat && lastCombat.turn === game.turn ? lastCombat.defenderHex : null}
          onHexClick={onHexClick}
          onHover={setHover}
          hoverText={hoverText}
          banner={
            settings.noticeDismissed ? null : (
              <div className="banner">
                Rules, tables and set-up follow your player aids and the living rules. Reduced-step values are estimates (−2/−2) until
                you enter the backs of your counters; a few advanced rules are not modelled yet (see README).
                <div>
                  <button onClick={() => setSettings({ ...settings, noticeDismissed: true })}>Got it</button>
                </div>
              </div>
            )
          }
        />
        <Sidebar
          game={game}
          acting={acting}
          settings={settings}
          setSettings={setSettings}
          tab={tab}
          setTab={setTab}
          humanTurn={humanTurn}
          dispatch={dispatch}
          undo={undo}
          canUndo={history.length > 0}
          selectedHex={selectedHex}
          selectedUnit={selectedUnit}
          setSelectedUnit={setSelectedUnit}
          moveMode={moveMode}
          setMoveMode={setMoveMode}
          attackTarget={attackTarget}
          setAttackTarget={setAttackTarget}
          attackers={attackers}
          setAttackers={setAttackers}
          support={support}
          setSupport={setSupport}
          advanceSel={advanceSel}
          setAdvanceSel={setAdvanceSel}
          odds={odds}
          paused={paused}
          setPaused={setPaused}
          aiStatus={aiStatus}
          startNew={startNew}
          loadGame={(g) => {
            aiRef.current = {};
            setHistory([]);
            setGame(g);
          }}
          editorOn={editorOn}
          setEditorOn={setEditorOn}
          bumpMap={() => setMapVersion((v) => v + 1)}
        />
      </div>
      {toast && <div className="toast">{toast}</div>}
      {game.phase === 'gameOver' && !overDismissed && (
        <div className="gameover" onClick={() => setOverDismissed(true)}>
          <div className="card">
            <h2>{game.winner === 'draw' ? 'Draw' : `${game.winner} victory`}</h2>
            <p>{game.victoryNote}</p>
            <p className="muted">Click anywhere to review the board, or start a new game from the Setup tab.</p>
          </div>
        </div>
      )}
    </div>
  );
}
