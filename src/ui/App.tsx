import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP, SCENARIOS } from '../engine/data';
import { computeOdds } from '../engine/combat';
import { alliedVp, benchmark, currentWeather, IllegalAction, landingHexes, newGame, withAction } from '../engine/game';
import { neighbors, type HexId } from '../engine/hex';
import { entryDestinations, legalDestinations } from '../engine/movement';
import type { Action, GameState, MoveMode, Side } from '../engine/types';
import { def, isCombatUnit, sideOf, unitsAt, values } from '../engine/units';
import { createHeuristicAi, type AiPlayer } from '../ai/heuristic';
import { createClaudeAi } from '../ai/claude';
import { MapView, type Highlight } from './MapView';
import { Sidebar } from './Sidebar';
import { autosave, loadAutosave, loadSettings, saveSettings, type Settings } from './storage';

export const dateOf = (turn: number) => `${8 + turn} Sept 1943`;

const UNDOABLE = new Set(['move', 'enter', 'land', 'exitMap', 'replace', 'readyAsu']);

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadAutosave() ?? newGame('campaign'));
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selectedHex, setSelectedHex] = useState<HexId | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>('tactical');
  const [attackTarget, setAttackTarget] = useState<HexId | null>(null);
  const [attackers, setAttackers] = useState<Set<string>>(new Set());
  const [support, setSupport] = useState<{ air: boolean; naval: boolean; asus: string[] }>({ air: false, naval: false, asus: [] });
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

  const controller = settings.controllers[game.activeSide];
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
        const ai = aiFor(game.activeSide);
        const a = await ai.nextAction(game);
        if (cancelled) return;
        setGame((g) => {
          if (g.seq !== seq) return g;
          try {
            return withAction(g, a);
          } catch (e) {
            setAiStatus(`AI proposed an illegal action (${(e as Error).message}); ending its phase.`);
            return withAction(g, { type: 'endPhase' });
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
  }, [game, humanTurn, paused, settings.aiDelayMs, aiFor]);

  // Clear transient selection when the phase or side changes.
  const phaseKey = `${game.turn}|${game.activeSide}|${game.phase}`;
  useEffect(() => {
    setAttackTarget(null);
    setAttackers(new Set());
    setSupport({ air: false, naval: false, asus: [] });
    setSelectedUnit(null);
    setHistory([]);
  }, [phaseKey]);

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

  // ---------------------------------------------------------------- highlights
  const selUnit = selectedUnit ? game.units[selectedUnit] : null;
  const highlights = useMemo(() => {
    const m = new Map<HexId, Highlight>();
    if (!humanTurn) return m;
    if (game.phase === 'movement' && selUnit && sideOf(selUnit) === game.activeSide) {
      if (selUnit.where.kind === 'map') {
        for (const [h, r] of legalDestinations(game, selUnit.id, moveMode))
          m.set(h, { color: r.stop ? '#e7a53b' : '#5aa469', label: String(r.cost) });
      } else if (selUnit.where.kind === 'reserve' || (selUnit.where.kind === 'entry' && (selUnit.where.area === 'airdrop' || selUnit.where.area.startsWith('hex:')))) {
        for (const h of landingHexes(game, selUnit.id)) m.set(h, { color: '#3b82c4', label: 'land' });
      } else if (selUnit.where.kind === 'entry') {
        for (const [h, r] of entryDestinations(game, selUnit.id, selUnit.where.area, moveMode))
          m.set(h, { color: r.stop ? '#e7a53b' : '#3b82c4', label: String(r.cost) });
      }
    }
    if (game.phase === 'combat') {
      for (const u of Object.values(game.units)) {
        if (u.where.kind !== 'map' || sideOf(u) !== game.activeSide || !isCombatUnit(u) || u.attacked || u.disrupted) continue;
        for (const n of neighbors(u.where.hex)) {
          if (unitsAt(game, n).some((x) => sideOf(x) !== game.activeSide) && !m.has(n)) m.set(n, { color: '#d0574a' });
        }
      }
      if (game.pendingAdvance) m.set(game.pendingAdvance.hex, { color: '#9b59b6', label: 'advance?' });
    }
    return m;
  }, [game, selUnit, moveMode, humanTurn]);

  const odds = useMemo(() => {
    if (!attackTarget || game.phase !== 'combat') return null;
    return computeOdds(game, { target: attackTarget, attackers: [...attackers], ...support });
  }, [game, attackTarget, attackers, support]);

  // ---------------------------------------------------------------- map clicks
  const onHexClick = (hex: HexId) => {
    setSelectedHex(hex);
    if (editorOn) {
      setTab('editor');
      return;
    }
    const here = unitsAt(game, hex);
    if (humanTurn && game.phase === 'movement') {
      const hl = highlights.get(hex);
      if (selUnit && hl) {
        let a: Action;
        if (selUnit.where.kind === 'map') a = { type: 'move', unitId: selUnit.id, to: hex, mode: moveMode };
        else if (selUnit.where.kind === 'entry' && selUnit.where.area !== 'airdrop' && !selUnit.where.area.startsWith('hex:'))
          a = { type: 'enter', unitId: selUnit.id, to: hex, mode: moveMode };
        else a = { type: 'land', unitId: selUnit.id, to: hex };
        const next = dispatch(a);
        if (next && next.units[selUnit.id].mpSpent !== null && next.units[selUnit.id].mpSpent! >= 1e9) setSelectedUnit(null);
        return;
      }
      const own = here.filter((u) => sideOf(u) === game.activeSide);
      if (own.length) {
        const idx = own.findIndex((u) => u.id === selectedUnit);
        setSelectedUnit(own[(idx + 1) % own.length].id);
        return;
      }
      setSelectedUnit(null);
      return;
    }
    if (humanTurn && game.phase === 'combat' && !game.pendingAdvance) {
      if (here.some((u) => sideOf(u) !== game.activeSide)) {
        setAttackTarget(hex);
        const eligible = neighbors(hex)
          .flatMap((n) => unitsAt(game, n))
          .filter((u) => sideOf(u) === game.activeSide && isCombatUnit(u) && !u.attacked && !u.disrupted && !u.strategic && values(u).attack > 0);
        setAttackers(new Set(eligible.map((u) => u.id)));
        setSupport({ air: false, naval: false, asus: [] });
        setTab('play');
        return;
      }
    }
    const own = here.filter((u) => sideOf(u) === game.activeSide);
    setSelectedUnit(own[0]?.id ?? here[0]?.id ?? null);
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
    if (d.sector8) parts.push('8th Army sector');
    const beach = Object.entries(MAP.beaches).find(([, b]) => b.hex === hover);
    if (beach) parts.push(`${beach[0]} beach`);
    const us = unitsAt(game, hover);
    if (us.length) parts.push(us.map((u) => `${def(u.id).name} ${values(u).attack}-${values(u).defense}-${values(u).move}`).join(', '));
    const hl = highlights.get(hover);
    if (hl?.label && /^\d/.test(hl.label)) parts.push(`move cost ${hl.label}`);
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
          {controller !== 'human' && game.phase !== 'gameOver' ? ' (AI)' : ''}
        </span>
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
        <span className="chip">
          Air A[{game.support.Allied.air.join(',')}] G[{game.support.German.air.join(',')}] · Naval [{game.support.Allied.naval.join(',')}]
        </span>
      </div>
      <div className="main">
        <MapView
          state={game}
          version={mapVersion}
          highlights={highlights}
          selectedHex={selectedHex}
          selectedUnitId={selectedUnit}
          attackTarget={attackTarget}
          attackers={attackers}
          lastCombatHex={lastCombat && lastCombat.turn === game.turn ? lastCombat.defenderHex : null}
          onHexClick={onHexClick}
          onHover={setHover}
          hoverText={hoverText}
          banner={
            settings.bannerDismissed ? null : (
              <div className="banner">
                Map transcribed from your photos. Combat values, set-up and rule tables are provisional stand-ins until you enter the
                values from your own counters and player aids (see README).
                <div>
                  <button onClick={() => setSettings({ ...settings, bannerDismissed: true })}>Got it</button>
                </div>
              </div>
            )
          }
        />
        <Sidebar
          game={game}
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
