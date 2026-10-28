// The battle screen: map, HUD, command panel and the AI loop.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP } from '../engine/data';
import { adjacentForCombat, advanceDestinations, computeOdds, entryAreasOf } from '../engine/combat';
import { breakthroughMoves, breakthroughPlan, breakthroughTargets } from '../engine/breakthrough';
import { actingSide, entryReach, IllegalAction, landingHexes, withAction } from '../engine/game';
import { neighbors, type HexId } from '../engine/hex';
import { entryModes, legalDestinations, pathTo, type Reach } from '../engine/movement';
import type { Action, GameState, MoveMode, Side } from '../engine/types';
import { canStack, def, goodOrder, sideOf, unitsAt, values } from '../engine/units';
import { createHeuristicAi, type AiPlayer } from '../ai/heuristic';
import { createClaudeAi } from '../ai/claude';
import { MapView, type Highlight } from './MapView';
import { DefensePanel, Sidebar } from './Sidebar';
import { CombatPopup, DefenseModal, EventFeed, GameOverScreen, PauseMenu, PhaseBanner, TopBar, UnitCard } from './hud';
import { SettingsModal } from './SettingsModal';
import type { TerrainImage } from './render/terrain';
import { sfx } from './sound';
import type { Settings } from './storage';
import { effectiveMode, eligibleAttackers, NO_SUPPORT, type SupportPick } from './play';

export const dateOf = (turn: number) => `${8 + turn} September 1943`;

const UNDOABLE = new Set(['move', 'enter', 'land', 'naval', 'changeArea', 'fullRetreat', 'replace', 'readyAsu', 'btMove', 'btDrop']);

interface Props {
  game: GameState;
  setGame: React.Dispatch<React.SetStateAction<GameState>>;
  settings: Settings;
  setSettings: (s: Settings) => void;
  terrain: TerrainImage;
  mapVersion: number;
  bumpMap: () => void;
  onQuit: () => void;
  onLoad: (g: GameState) => void;
}

export function GameScreen({ game, setGame, settings, setSettings, terrain, mapVersion, bumpMap, onQuit, onLoad }: Props) {
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
  const [editorOn, setEditorOn] = useState(false);
  const [tab, setTab] = useState('play');
  const [menu, setMenu] = useState<'none' | 'pause' | 'settings'>('none');
  const [overDismissed, setOverDismissed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const humanSides = useMemo(() => (['Allied', 'German'] as const).filter((sd) => settings.controllers[sd] === 'human'), [settings.controllers]);

  // Human players choose their own retreat destinations; each side's defensive air policy comes from Settings.
  useEffect(() => {
    const air = settings.defensiveAir;
    setGame((g) => {
      const o = g.options ?? {};
      if (JSON.stringify(o.chooseRetreats ?? []) === JSON.stringify(humanSides) && JSON.stringify(o.defensiveAir ?? {}) === JSON.stringify(air)) return g;
      return { ...g, options: { ...o, chooseRetreats: [...humanSides], defensiveAir: { ...air } } };
    });
  }, [humanSides, settings.defensiveAir, game.options, setGame]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (attackTarget) setAttackTarget(null);
        else if (selectedUnit) setSelectedUnit(null);
        else setMenu((m) => (m === 'none' ? 'pause' : 'none'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attackTarget, selectedUnit]);

  // The defender answers a Determined Defense choice even during the other side's turn.
  const acting = actingSide(game);
  const controller = settings.controllers[acting];
  const humanTurn = controller === 'human' && game.phase !== 'gameOver';
  const halted = paused || menu !== 'none';

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
    if (humanTurn || halted || game.phase === 'gameOver') return;
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
            const fallback: Action = g.retreatQueue?.length
              ? { type: 'retreatChoice', index: 0 }
              : g.pendingDefense
                ? { type: 'defend', choice: 'retreat' }
                : g.breakthrough
                  ? { type: 'btEnd' }
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
  }, [game, acting, humanTurn, halted, settings.aiDelayMs, aiFor, setGame]);

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
        if (a.type === 'endPhase') sfx.click();
        return next;
      } catch (e) {
        if (e instanceof IllegalAction || e instanceof Error) setToast(e.message);
        sfx.error();
        return null;
      }
    },
    [game, setGame],
  );

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setGame(prev);
    setSelectedUnit(null);
  };

  // ---------------------------------------------------------------- highlights and click actions
  const selUnit = selectedUnit ? game.units[selectedUnit] : null;
  const { highlights, clickActions, reach } = useMemo(() => {
    const m = new Map<HexId, Highlight>();
    const act = new Map<HexId, Action>();
    let reach: Map<HexId, Reach> | null = null;
    if (!humanTurn) return { highlights: m, clickActions: act, reach };
    const g = game;
    if (g.retreatQueue?.length) {
      const rq = g.retreatQueue[0];
      rq.options.forEach((o, i) => {
        if (o.intoArea) return;
        m.set(o.end, { color: '', kind: i === rq.current ? 'retreat' : 'land', label: i === rq.current ? 'HERE' : 'RETREAT' });
        act.set(o.end, { type: 'retreatChoice', index: i });
      });
      return { highlights: m, clickActions: act, reach };
    }
    if (g.pendingDefense) {
      m.set(g.pendingDefense.hex, { color: '', kind: 'attack', label: 'DEFEND' });
      return { highlights: m, clickActions: act, reach };
    }
    if (g.breakthrough) {
      const b = g.breakthrough;
      m.set(b.hex, { color: '', kind: 'advance', label: `${b.left} LEFT` });
      for (const [h, cost] of breakthroughMoves(g)) {
        m.set(h, { color: '', kind: 'advance', label: cost ? String(cost) : 'FREE' });
        act.set(h, { type: 'btMove', to: h });
      }
      for (const h of breakthroughTargets(g)) m.set(h, { color: '', kind: 'attack', label: 'ATTACK' });
      return { highlights: m, clickActions: act, reach };
    }
    if (g.pendingAdvance) {
      const pa = g.pendingAdvance;
      m.set(pa.vacated, { color: '', kind: 'advance', label: 'VACATED' });
      if (advanceSel.length) {
        const [first, ...rest] = advanceSel.map((id) => advanceDestinations(g, pa, id));
        for (const [h, path] of first) {
          if (rest.some((d) => !d.has(h))) continue;
          m.set(h, { color: '', kind: 'advance', label: String(path.length) });
          act.set(h, { type: 'advance', unitIds: advanceSel, to: h });
        }
      }
      return { highlights: m, clickActions: act, reach };
    }
    const mine = selUnit && sideOf(selUnit) === g.activeSide ? selUnit : null;
    if (mine && g.phase === 'initial' && mine.where.kind === 'entry' && mine.where.area.startsWith('airdrop')) {
      for (const h of landingHexes(g, mine.id)) {
        m.set(h, { color: '', kind: 'land', label: 'DROP' });
        act.set(h, { type: 'land', unitId: mine.id, to: h });
      }
    }
    if (mine && (g.phase === 'movement' || g.phase === 'invasion')) {
      if (mine.where.kind === 'map') {
        const mode = effectiveMode(g, mine.id, moveMode);
        if (mode) {
          reach = legalDestinations(g, mine.id, mode);
          for (const [h, r] of reach) {
            m.set(h, { color: '', kind: r.stop ? 'stop' : 'move' });
            act.set(h, { type: 'move', unitId: mine.id, to: h, mode });
          }
        }
      } else if (mine.where.kind === 'reserve' || mine.where.kind === 'followUp' || mine.where.kind === 'atSea') {
        for (const h of landingHexes(g, mine.id)) {
          // Amber: landing here would overstack the hex (fix it before the phase ends).
          m.set(h, canStack(g, h, [mine.id]) ? { color: '', kind: 'land', label: 'LAND' } : { color: '', kind: 'stop', label: 'FULL' });
          act.set(h, { type: 'land', unitId: mine.id, to: h });
        }
      } else if (mine.where.kind === 'entry' && !mine.where.area.startsWith('airdrop')) {
        const modes = entryModes(g, mine);
        const mode: MoveMode = modes.includes(moveMode) ? moveMode : modes.includes('normal') ? 'normal' : 'tactical';
        for (const [h, r] of entryReach(g, mine.id, mode)) {
          m.set(h, { color: '', kind: r.stop ? 'stop' : 'land', label: String(+r.cost.toFixed(1)) });
          act.set(h, { type: 'enter', unitId: mine.id, to: h, mode });
        }
      }
    }
    if (g.phase === 'combat' || g.phase === 'movement' || g.phase === 'invasion') {
      // Enemy hexes that can be attacked (or overrun with an Auto DS in the movement phase).
      for (const u of Object.values(g.units)) {
        if (sideOf(u) !== g.activeSide || u.attacked || !goodOrder(u) || def(u.id).asu) continue;
        if (g.phase === 'invasion' && def(u.id).formation !== 'Commando Bde') continue;
        // Units in an Entry Area that have not moved may attack the edge hexes of their area (21.3.4).
        const near = u.where.kind === 'map' ? neighbors(u.where.hex)
          : g.phase === 'combat' && u.where.kind === 'entry' && !u.stopped
            ? entryAreasOf(u.where.area).flatMap((a) => MAP.entryAreas[a]?.hexes ?? []).filter((h) => adjacentForCombat(g, u, h))
            : [];
        for (const n of near) {
          if (!m.has(n) && unitsAt(g, n).some((x) => sideOf(x) !== g.activeSide)) m.set(n, { color: '', kind: 'attack' });
        }
      }
    }
    return { highlights: m, clickActions: act, reach };
  }, [game, selUnit, moveMode, humanTurn, advanceSel]);

  const preview = useMemo(() => {
    if (!hover || !reach || !selUnit || selUnit.where.kind !== 'map') return null;
    const r = reach.get(hover);
    if (!r) return null;
    const path = pathTo(reach, hover);
    if (path[0] !== selUnit.where.hex) path.unshift(selUnit.where.hex);
    const mode = effectiveMode(game, selUnit.id, moveMode);
    const label = mode === 'tactical' ? `${r.hexes} HEX` : `${+r.cost.toFixed(1)} MP`;
    return { path, label: r.stop ? `${label} · STOP` : label };
  }, [hover, reach, selUnit, game, moveMode]);

  const odds = useMemo(() => {
    if (!attackTarget || game.pendingDefense) return null;
    if (game.breakthrough) return breakthroughTargets(game).includes(attackTarget) ? computeOdds(game, breakthroughPlan(game, attackTarget)) : null;
    if (!['combat', 'movement', 'invasion'].includes(game.phase) || game.pendingAdvance) return null;
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
      setPanelOpen(true);
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
    if (humanTurn && game.breakthrough && breakthroughTargets(game).includes(hex)) {
      setAttackTarget(hex);
      setTab('play');
      setPanelOpen(true);
      sfx.select();
      return;
    }
    const canAttack = ['combat', 'movement', 'invasion'].includes(game.phase) && !game.pendingAdvance && !game.pendingDefense && !game.breakthrough;
    if (humanTurn && canAttack && highlights.get(hex)?.kind === 'attack' && here.some((u) => sideOf(u) !== game.activeSide)) {
      setAttackTarget(hex);
      let ids = eligibleAttackers(game, hex);
      if (game.phase === 'invasion') ids = ids.filter((id) => def(id).formation === 'Commando Bde');
      setAttackers(new Set(ids));
      setSupport(NO_SUPPORT);
      setTab('play');
      setPanelOpen(true);
      sfx.select();
      return;
    }
    const own = here.filter((u) => sideOf(u) === game.activeSide);
    if (own.length) {
      const idx = own.findIndex((u) => u.id === selectedUnit);
      setSelectedUnit(own[(idx + 1) % own.length].id);
      sfx.select();
      return;
    }
    setSelectedUnit(here[0]?.id ?? null);
    if (!here.length) setAttackTarget(null);
  };

  // ---------------------------------------------------------------- hover info
  const hoverText = useMemo(() => {
    if (!hover) return null;
    const d = MAP.hexes[hover];
    if (!d) return null;
    const title = d.city ?? d.town ?? (d.terrain === 'sea' ? 'Sea' : d.terrain[0].toUpperCase() + d.terrain.slice(1));
    const facts = [hover, d.terrain === 'sea' ? '' : d.terrain];
    if (d.vp) facts.push(`${d.vp} VP · ${game.control[hover] ?? 'German'}`);
    if (d.port) facts.push(`port ${d.port.capacity}${d.port.restricted ? ' (mined)' : ''}`);
    if (d.airfield) facts.push('airfield');
    if (d.sector8) facts.push('8th Army sector');
    if (game.cityBattle[hover]) facts.push('City Battle');
    const beach = Object.entries(MAP.beaches).find(([, b]) => b.hex === hover);
    if (beach) facts.push(`${beach[0]} beach`);
    const lines = [title, facts.filter(Boolean).join(' · ')];
    for (const u of unitsAt(game, hover)) {
      const v = values(u);
      lines.push(`${def(u.id).name}  ${def(u.id).asu ? `art. range ${def(u.id).asuRange}` : `${v.attack}-${v.defense}-${v.move}`}${u.status !== 'good' ? ` · ${u.status}` : ''}`);
    }
    const hl = highlights.get(hover);
    if (hl?.kind === 'attack' && humanTurn) lines.push('Click to plan an attack');
    return lines.join('\n');
  }, [hover, game, highlights, humanTurn]);

  const cardUnit = selUnit ?? (selectedHex ? unitsAt(game, selectedHex)[0] ?? null : null);
  const showDefense = humanTurn && !!game.pendingDefense;

  return (
    <div className="game">
      <MapView
        state={game}
        terrain={terrain}
        version={mapVersion}
        settings={settings}
        highlights={highlights}
        selectedHex={selectedHex}
        selectedUnitId={selectedUnit}
        attackTarget={attackTarget}
        attackers={new Set([...attackers, ...advanceSel])}
        preview={preview}
        aiActive={!humanTurn}
        humanSides={humanSides}
        onHexClick={onHexClick}
        onHover={setHover}
        hoverText={hoverText}
      />
      <TopBar game={game} settings={settings} setSettings={setSettings} humanTurn={humanTurn} acting={acting}
        onMenu={() => setMenu('pause')} onSettings={() => setMenu('settings')} aiStatus={humanTurn ? '' : aiStatus} />
      {game.phase !== 'gameOver' && <PhaseBanner game={game} humanSides={humanSides} />}
      <EventFeed game={game} />
      {game.retreatQueue?.length && humanTurn ? (
        <div className="prompt">Choose where your retreating units go: click a highlighted hex, or keep the green one.</div>
      ) : null}
      <aside className={`command${panelOpen ? '' : ' closed'}`}>
        <button className="command-toggle" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? 'Hide orders' : 'Show orders'}>
          {panelOpen ? '›' : '‹'}
        </button>
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
          editorOn={editorOn}
          setEditorOn={setEditorOn}
          bumpMap={bumpMap}
        />
      </aside>
      {cardUnit && !showDefense && (
        <UnitCard game={game} unit={cardUnit} hex={selectedHex} onSelect={(id) => setSelectedUnit(id)} onClose={() => { setSelectedUnit(null); setSelectedHex(null); }} />
      )}
      {game.phase !== 'gameOver' && <CombatPopup game={game} humanSides={humanSides} />}
      {showDefense && (
        <DefenseModal>
          <DefensePanel game={game} acting={acting} dispatch={dispatch} />
        </DefenseModal>
      )}
      {toast && <div className="toast">{toast}</div>}
      {game.phase === 'gameOver' && !overDismissed && (
        <GameOverScreen game={game} humanSides={humanSides} onReview={() => setOverDismissed(true)} onMenu={onQuit} />
      )}
      {menu === 'pause' && (
        <PauseMenu game={game} onResume={() => setMenu('none')} onSettings={() => setMenu('settings')} onQuit={onQuit} onLoad={(g) => { setMenu('none'); onLoad(g); }}
          onRules={() => { setMenu('none'); setTab('crt'); setPanelOpen(true); }} />
      )}
      {menu === 'settings' && (
        <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setMenu('none')} inGame
          editorOn={editorOn} setEditorOn={(b) => { setEditorOn(b); if (b) { setTab('editor'); setPanelOpen(true); } }} />
      )}
    </div>
  );
}
