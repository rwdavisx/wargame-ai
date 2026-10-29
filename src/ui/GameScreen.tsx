// The battle screen: map, HUD, command panel and the AI loop.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PORTRAIT_PHONE, usePhone } from './usePhone';
import { BATTLESHIPS_TURN, MAP, RULES } from '../engine/data';
import { adjacentForCombat, advanceDestinations, computeOdds, entryAreasOf, inNavalRange, readyAsusFor } from '../engine/combat';
import { breakthroughMoves, breakthroughPlan, breakthroughTargets, groupUnits } from '../engine/breakthrough';
import { actingSide, entryReach, IllegalAction, landingHexes, withAction } from '../engine/game';
import { neighbors, type HexId } from '../engine/hex';
import { allowedModes, cannotMove, entryModes, legalDestinations, pathTo, type Reach } from '../engine/movement';
import type { Action, GameState, MoveMode, Side, UnitState } from '../engine/types';
import { canStack, def, goodOrder, hexOf, other, sideOf, supportNation, unitsAt, values } from '../engine/units';
import { createHeuristicAi, type AiPlayer } from '../ai/heuristic';
import { createClaudeAi } from '../ai/claude';
import { MapView, type BattleMark, type Highlight } from './MapView';
import { ActionBar, type AttackKind } from './ActionBar';
import { Sidebar } from './Sidebar';
import { BattleScreen, NO_INSET, type BattleInset, type PlannedAttack } from './combat/BattleScreen';
import { CombatPopup, EventFeed, GameOverScreen, PauseMenu, PhaseBanner, TopBar, UnitCard } from './hud';
import { lpCost } from '../engine/game';
import { SettingsModal } from './SettingsModal';
import type { TerrainImage } from './render/terrain';
import { sfx } from './sound';
import type { Settings } from './storage';
import { effectiveMode, eligibleAttackers, NO_SUPPORT, type SupportPick } from './play';
import { moveLeft, stackText, unitFlags, useQol } from './qol';
import { Recap } from './Recap';
import { movementAllowance } from '../engine/movement';

export const dateOf = (turn: number) => `${8 + turn} September 1943`;

// What the map shows of the player's own plans while a battle panel is open: nothing.
const NO_HIGHLIGHTS = new Map<HexId, Highlight>();
const NO_IDS = new Set<string>();
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
  const phone = usePhone(PORTRAIT_PHONE);
  const touch = usePhone('(pointer: coarse)');
  const small = usePhone();
  // With a mouse, right-click moves and attacks unless Settings asks for left-click to do everything.
  const rightClick = !touch && settings.mouseControls !== 'classic';
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 820px), (max-height: 520px)').matches);
  const [focus, setFocus] = useState<{ hex: HexId; n: number } | null>(null);
  const focusOn = (hex: HexId) => setFocus((f) => ({ hex, n: (f?.n ?? 0) + 1 }));
  const [endArmed, setEndArmed] = useState(false);
  useEffect(() => {
    if (!endArmed) return;
    const t = setTimeout(() => setEndArmed(false), 4000);
    return () => clearTimeout(t);
  }, [endArmed]);
  // On a touch screen the first tap on a destination previews it; a second tap carries it out.
  const [confirmHex, setConfirmHex] = useState<HexId | null>(null);
  useEffect(() => setConfirmHex(null), [selectedUnit, moveMode, advanceSel, game.phase, game.activeSide]);

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

  // The defender answers a Determined Defense choice even during the other side's turn.
  const acting = actingSide(game);
  const controller = settings.controllers[acting];
  const humanTurn = controller === 'human' && game.phase !== 'gameOver';

  // ---------------------------------------------------------------- the battle screen
  // The player's own attack until it is rolled and read; then every enemy attack on the player's units, one at a time.
  const [battle, setBattle] = useState<PlannedAttack | null>(null);
  const [combatSeen, setCombatSeen] = useState(game.combats.length);
  const [viewing, setViewing] = useState<number | null>(null);
  const [aiGate, setAiGate] = useState<number | null>(null);
  const prevGame = useRef(game);
  useEffect(() => {
    prevGame.current = game;
  }, [game]);
  const beforeCombat = useRef(new Map<number, Record<string, UnitState>>());
  const stepCombats = settings.combatDice !== 'quick';
  const incoming = stepCombats
    ? game.combats.slice(Math.min(combatSeen, game.combats.length)).find((c) => humanSides.includes(other(c.attackerSide)) && !humanSides.includes(c.attackerSide)) ?? null
    : null;
  // Remember the units as they stood before an enemy attack, to show what it cost.
  if (incoming && !beforeCombat.current.has(incoming.id) && prevGame.current.combats.length < incoming.id) beforeCombat.current.set(incoming.id, prevGame.current.units);
  const pdHuman = !!game.pendingDefense && settings.controllers[game.pendingDefense.defenderSide] === 'human' && game.phase !== 'gameOver';
  const candidate = incoming?.id ?? (pdHuman ? game.pendingDefense!.combatId : null);
  const viewerId = battle ? null : viewing ?? candidate;
  const viewerOpen = !!battle || viewerId !== null;
  useEffect(() => {
    if (!battle && viewing === null && candidate !== null) setViewing(candidate);
  }, [battle, viewing, candidate]);
  // The battle panel docks beside the map: its battle is marked on the map and framed clear of the panel.
  const [battleInset, setBattleInset] = useState<BattleInset>(NO_INSET);
  const battleRep = viewerId !== null ? game.combats.find((c) => c.id === viewerId) ?? null : null;
  const battleKey = battle ? `plan:${battle.target}` : battleRep ? `combat:${battleRep.id}` : null;
  const battleMark = useRef<BattleMark | null>(null);
  if (!battleKey) battleMark.current = null;
  else if (battleMark.current?.key !== battleKey) {
    // Where the attackers stood when the fight began (before any losses or advance).
    const units = battle ? game.units : beforeCombat.current.get(battleRep!.id) ?? game.units;
    const from = (battle ? battle.attackers : battleRep!.attackers).map((id) => (units[id] ? hexOf(units[id]) : null)).filter((h): h is HexId => !!h);
    battleMark.current = { key: battleKey, target: battle ? battle.target : battleRep!.defenderHex, from: [...new Set(from)] };
  }
  // The computer never acts under the battle screen, except to answer the defense decision it is shown making.
  const halted = paused || menu !== 'none' || (viewerOpen && (aiGate === null || aiGate !== game.pendingDefense?.combatId));

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
  // After a won attack, pick every unit that can advance (within the stacking limit) so the destinations show at once.
  const advanceKey = game.pendingAdvance ? `${game.pendingAdvance.combatId}|${game.pendingAdvance.vacated}|${Object.keys(game.pendingAdvance.maxByUnit).join(',')}` : '';
  useEffect(() => {
    const pa = game.pendingAdvance;
    if (!pa || !humanTurn || game.breakthrough) {
      setAdvanceSel([]);
      return;
    }
    const ids = Object.keys(pa.maxByUnit).filter((id) => game.units[id]?.where.kind === 'map' && pa.maxByUnit[id] > 0);
    const pick: string[] = [];
    let sp = 0;
    for (const id of ids) {
      if (sp + def(id).sp > RULES.stackingLimit) continue;
      const trial = [...pick, id].map((x) => advanceDestinations(game, pa, x));
      const [first, ...rest] = trial;
      if (![...first.keys()].some((h) => rest.every((d) => d.has(h)))) continue;
      pick.push(id);
      sp += def(id).sp;
    }
    setAdvanceSel(pick);
  }, [advanceKey, humanTurn]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // On the invasion turn only Commandos that still have an advance left may attack (Salerno).
        if (g.phase === 'invasion' && (def(u.id).formation !== 'Commando Bde' || u.tacHexes !== 1 || u.stopped)) continue;
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
    // Cost against the allowance, and the stacking the destination would have.
    const label = mode === 'tactical' ? `${r.hexes} HEX` : `${+r.cost.toFixed(1)}/${mode ? movementAllowance(game, selUnit, mode) : '?'} MP`;
    return { path, label: `${r.stop ? `${label} · STOP` : label} · ${stackText(game, hover, [selUnit.id])}` };
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

  // ---------------------------------------------------------------- attacks
  const attackKind: AttackKind = game.breakthrough ? 'breakthrough' : game.phase === 'movement' ? 'autoDs' : game.phase === 'invasion' ? 'invasion' : 'attack';
  const clearAttack = () => {
    setAttackTarget(null);
    setAttackers(new Set());
    setSupport(NO_SUPPORT);
  };
  const executeAttack = () => {
    if (!attackTarget || !odds?.ok) return;
    const ids = [...attackers];
    const a: Action = attackKind === 'breakthrough'
      ? { type: 'btAttack', target: attackTarget }
      : attackKind === 'autoDs'
        ? { type: 'autoDs', target: attackTarget, attackers: ids }
        : { type: 'attack', target: attackTarget, attackers: ids, ...(attackKind === 'attack' ? support : {}) };
    if (attackKind === 'autoDs' && !odds.autoDs) return;
    if (battle) return;
    if (stepCombats) {
      // Open the battle screen; the attack is resolved when the player rolls.
      const who = attackKind === 'breakthrough' && game.breakthrough ? breakthroughPlan(game, attackTarget).attackers : ids;
      setBattle({ action: a, odds, target: attackTarget, attackers: who });
      sfx.click();
      return;
    }
    if (dispatch(a)) {
      clearAttack();
      setSelectedUnit(null);
      setHover(null);
    }
  };
  const rollAttack = () => {
    if (!battle) return null;
    const next = dispatch(battle.action);
    if (next) {
      clearAttack();
      setSelectedUnit(null);
      setHover(null);
      setCombatSeen(next.combats.length);
    }
    return next;
  };
  // Every unit that may join an attack on `hex` (on turn 1, only the Commandos that got ashore cleanly).
  const attackPool = (hex: HexId) => {
    const ids = eligibleAttackers(game, hex);
    return game.phase === 'invasion' ? ids.filter((id) => def(id).formation === 'Commando Bde' && game.units[id].tacHexes === 1 && !game.units[id].stopped) : ids;
  };
  const planAttack = (hex: HexId) => {
    setAttackTarget(hex);
    if (!game.breakthrough) {
      const ids = attackPool(hex);
      // With one of the attackers selected first, the attack starts with just its stack; otherwise everyone joins.
      const sel = selectedUnit && ids.includes(selectedUnit) && game.phase === 'combat' ? game.units[selectedUnit] : null;
      const selHex = sel?.where.kind === 'map' ? sel.where.hex : null;
      setAttackers(new Set(selHex ? ids.filter((id) => hexOf(game.units[id]) === selHex) : ids));
      setSupport(NO_SUPPORT);
    }
    setSelectedUnit(null);
    setTab('play');
    sfx.select();
  };
  const cancelAll = () => {
    if (confirmHex) setConfirmHex(null);
    else if (attackTarget) clearAttack();
    else if (selectedUnit || selectedHex) {
      setSelectedUnit(null);
      setSelectedHex(null);
    } else return false;
    return true;
  };

  // ---------------------------------------------------------------- map clicks
  // An enemy hex the active side may attack now (or the Breakthrough Group's next target).
  const attackableAt = (hex: HexId) => {
    if (game.breakthrough) return breakthroughTargets(game).includes(hex);
    return ['combat', 'movement', 'invasion'].includes(game.phase) && !game.pendingAdvance && !game.pendingDefense &&
      highlights.get(hex)?.kind === 'attack' && unitsAt(game, hex).some((u) => sideOf(u) !== game.activeSide);
  };
  const onHexClick = (hex: HexId, e?: { touch: boolean }) => {
    if (viewerOpen) return; // with a battle open the map only pans and zooms
    // With right-click controls a mouse left-click on the map only selects and inspects.
    const inspect = rightClick && !!e && !e.touch;
    const clickAct0 = clickActions.get(hex);
    if (e?.touch && humanTurn && clickAct0 && !editorOn && confirmHex !== hex) {
      // First tap on a destination: preview it; the action bar asks for confirmation.
      setConfirmHex(hex);
      sfx.click();
      return;
    }
    setConfirmHex(null);
    setSelectedHex(hex);
    if (editorOn) {
      setTab('editor');
      setPanelOpen(true);
      return;
    }
    const here = unitsAt(game, hex);
    const clickAct = clickActions.get(hex);
    if (humanTurn && clickAct && !inspect) {
      const next = dispatch(clickAct);
      if (touch) setHover(null);
      if (next && clickAct.type === 'advance') setSelectedHex(null);
      if (next && (clickAct.type === 'move' || clickAct.type === 'enter' || clickAct.type === 'land')) {
        const u = next.units[clickAct.unitId];
        if (u.stopped || u.where.kind !== 'map') {
          setSelectedUnit(null);
          setSelectedHex(null);
        }
      }
      return;
    }
    if (humanTurn && !inspect && attackableAt(hex)) {
      // Selecting the planned target a second time attacks it.
      if (attackTarget === hex) executeAttack();
      else planAttack(hex);
      return;
    }
    // With an attack lined up, a stack that can join it goes in or out of the attack.
    if (humanTurn && attackTarget && !game.breakthrough) {
      const pool = attackPool(attackTarget);
      const joinable = here.filter((u) => pool.includes(u.id)).map((u) => u.id);
      if (joinable.length) {
        const allIn = joinable.every((id) => attackers.has(id));
        setAttackers((cur) => {
          const next = new Set(cur);
          for (const id of joinable) if (allIn) next.delete(id); else next.add(id);
          return next;
        });
        sfx.click();
        return;
      }
    }
    const own = here.filter((u) => sideOf(u) === game.activeSide);
    if (own.length) {
      const idx = own.findIndex((u) => u.id === selectedUnit);
      setSelectedUnit(own[(idx + 1) % own.length].id);
      if (attackTarget) clearAttack();
      sfx.select();
      return;
    }
    setSelectedUnit(here[0]?.id ?? null);
    if (!here.length && attackTarget) clearAttack();
  };
  // Mouse right-click (right-click controls): act on a destination or an enemy in reach, otherwise back out.
  const onHexRightClick = (hex: HexId) => {
    if (viewerOpen) return;
    if (humanTurn && !editorOn && (clickActions.has(hex) || attackableAt(hex))) onHexClick(hex);
    else cancelAll();
  };
  // The selected unit's own hex reads as a unit to select, not as a destination.
  const hoverCursor = !hover || touch || !humanTurn || editorOn || viewerOpen ? undefined
    : clickActions.has(hover) && !(selUnit?.where.kind === 'map' && selUnit.where.hex === hover) ? 'move'
      : attackableAt(hover) ? 'crosshair'
        : unitsAt(game, hover).some((u) => sideOf(u) === game.activeSide) ? 'pointer' : undefined;

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
      const flags = unitFlags(game, u);
      lines.push(`${def(u.id).name}  ${def(u.id).asu ? `art. range ${def(u.id).asuRange}` : `${v.attack}-${v.defense}-${v.move}`}${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
    }
    if (unitsAt(game, hover).length) lines.push(`Stacking ${stackText(game, hover)}`);
    // With one of your units selected: what the stack here would come to if it moved or landed here.
    if (selUnit && sideOf(selUnit) === game.activeSide && hexOf(selUnit) !== hover && highlights.has(hover) && highlights.get(hover)?.kind !== 'attack') {
      lines.push(`With ${def(selUnit.id).name}: ${stackText(game, hover, [selUnit.id])}`);
    }
    const hl = highlights.get(hover);
    const act = touch ? 'Tap' : rightClick ? 'Right-click' : 'Click';
    if (hl?.kind === 'attack' && humanTurn && !viewerOpen) lines.push(attackTarget === hover ? `${act} again to attack` : `${act} to plan an attack`);
    return lines.join('\n');
  }, [hover, game, highlights, humanTurn, touch, rightClick, attackTarget, selUnit, viewerOpen]);

  // ---------------------------------------------------------------- the action bar
  const side = game.activeSide;
  // Units that have not moved and have somewhere to go.
  const readyUnits = useMemo(() => {
    if (!(game.phase === 'movement' || game.phase === 'invasion') || !humanTurn || game.pendingAdvance || game.breakthrough) return [];
    return Object.values(game.units)
      .filter((u) => sideOf(u) === game.activeSide && u.where.kind === 'map' && !cannotMove(game, u) && u.mpSpent === null && !u.stopped)
      .filter((u) => {
        const mode = effectiveMode(game, u.id, 'normal');
        return !!mode && [...legalDestinations(game, u.id, mode).keys()].some((h) => h !== hexOf(u));
      })
      // Fighting units first, garrisons and artillery last; west to east within each group.
      .sort((a, b) => Number(!!def(a.id).asu || def(a.id).cat === 'garrison') - Number(!!def(b.id).asu || def(b.id).cat === 'garrison') ||
        (hexOf(a) ?? '').localeCompare(hexOf(b) ?? ''));
  }, [game, humanTurn]);
  const waitingUnits = game.phase === 'movement' && humanTurn
    ? Object.values(game.units).filter((u) => sideOf(u) === side && (u.where.kind === 'reserve' || u.where.kind === 'followUp' ||
      (u.where.kind === 'atSea' && u.where.since < game.turn) || (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop'))))
    : [];
  const drops = game.phase === 'initial' && humanTurn
    ? Object.values(game.units).filter((u) => sideOf(u) === side && u.where.kind === 'entry' && u.where.area.startsWith('airdrop'))
    : [];
  const targets = humanTurn && !game.pendingAdvance && !game.pendingDefense && !game.retreatQueue?.length
    ? [...highlights.entries()].filter(([, h]) => h.kind === 'attack').map(([h]) => h).sort()
    : [];

  const qol = useQol({ game, humanTurn, humanSides, settings, setSettings, readyUnits, targets, selected: selUnit });

  const selectNext = (list: { id: string }[]) => {
    if (!list.length) return;
    const i = list.findIndex((u) => u.id === selectedUnit);
    const u = game.units[list[(i + 1) % list.length].id];
    clearAttack();
    setConfirmHex(null);
    setHover(null);
    setSelectedUnit(u.id);
    if (u.where.kind === 'map') {
      setSelectedHex(u.where.hex);
      focusOn(u.where.hex);
    } else {
      const land = u.where.kind === 'entry' && !u.where.area.startsWith('airdrop')
        ? MAP.entryAreas[u.where.area]?.hexes[0]
        : landingHexes(game, u.id)[0];
      if (land) focusOn(land);
    }
    sfx.select();
  };
  const nextTarget = () => {
    if (!targets.length) return;
    const i = attackTarget ? targets.indexOf(attackTarget) : -1;
    const h = targets[(i + 1) % targets.length];
    planAttack(h);
    focusOn(h);
  };
  const next = game.phase === 'combat' || (game.breakthrough && targets.length)
    ? { label: 'Next target', count: targets.length, onClick: nextTarget }
    : game.phase === 'initial'
      ? { label: 'Next drop', count: drops.length, onClick: () => selectNext(drops) }
      : { label: 'Next unit', count: readyUnits.length, onClick: () => selectNext(readyUnits) };

  const advanceTargets = [...clickActions.entries()].filter(([, a]) => a.type === 'advance').map(([h]) => h);
  const noneAdvanced = !!game.pendingAdvance && !game.pendingAdvance.started &&
    Object.keys(game.pendingAdvance.maxByUnit).some((id) => game.units[id]?.where.kind === 'map');
  const endWarn = game.pendingAdvance
    ? noneAdvanced ? 'No unit has advanced yet. Press again to stay put, or pick units and a violet hex.' : ''
    : readyUnits.length
    ? `${readyUnits.length} unit${readyUnits.length === 1 ? ' has' : 's have'} not moved yet.`
    : game.phase === 'combat' && targets.length && !game.combats.some((c) => c.turn === game.turn && c.attackerSide === side)
      ? 'You have not attacked this phase.'
      : drops.length ? 'Airborne units are still waiting to drop.' : '';
  const endLabel = game.breakthrough ? 'Stop the group' : game.pendingAdvance ? (noneAdvanced ? 'Stay put' : 'Finish advance') : `End ${game.phase === 'invasion' ? 'invasion' : game.phase}`;
  const endPhase = () => {
    if (endWarn && !endArmed && !game.breakthrough) {
      setEndArmed(true);
      sfx.click();
      return;
    }
    setEndArmed(false);
    clearAttack();
    setSelectedUnit(null);
    dispatch({ type: 'endPhase' });
  };
  useEffect(() => setEndArmed(false), [phaseKey, game.seq]);

  // The selected own unit: movement modes and a one-line status.
  const mineSel = selUnit && sideOf(selUnit) === side && humanTurn ? selUnit : null;
  // How the player selects (selVerb) and how they move or attack (verb) with this pointer.
  const selVerb = touch ? 'Tap' : 'Click';
  const verb = touch ? 'Tap' : rightClick ? 'Right-click' : 'Click';
  const verbL = verb.toLowerCase();
  let unitNote = '';
  let modes: MoveMode[] = [];
  if (mineSel) {
    if (mineSel.where.kind === 'map') {
      const why = game.phase === 'movement' || game.phase === 'invasion' ? cannotMove(game, mineSel) : null;
      if (game.phase === 'movement' || game.phase === 'invasion') {
        modes = why ? [] : game.phase === 'invasion' ? ['tactical'] : allowedModes(game, mineSel);
        const r = confirmHex && reach?.get(confirmHex);
        unitNote = why ? `Cannot move: ${why}.`
          : `${mineSel.mpSpent === null ? 'Ready to move' : moveLeft(game, mineSel) ? `${moveLeft(game, mineSel)} left` : `${+mineSel.mpSpent.toFixed(1)} MP used`} · ${verbL} a blue or amber hex${r ? '' : ''}`;
      } else if (game.phase === 'combat') {
        unitNote = targets.length ? `${verb} a red hex to attack it.` : 'No enemy within reach.';
      } else unitNote = `${def(mineSel.id).formation} · ${def(mineSel.id).cat}`;
    } else if (mineSel.where.kind === 'reserve' || mineSel.where.kind === 'followUp' || mineSel.where.kind === 'atSea') {
      unitNote = `Waiting to land (${lpCost(mineSel.id)} LP, ${game.landingPoints} left): ${verbL} a blue beach or port.`;
    } else if (mineSel.where.kind === 'entry') {
      unitNote = mineSel.where.area.startsWith('airdrop') ? `Airborne: ${verbL} a blue hex to drop.` : `In entry area ${mineSel.where.area}: ${verbL} a blue hex to enter.`;
      if (!mineSel.where.area.startsWith('airdrop') && game.phase === 'movement') modes = entryModes(game, mineSel);
    }
  }
  const shownMode: MoveMode = modes.includes(moveMode) ? moveMode : modes.includes('tactical') ? 'tactical' : modes[0] ?? 'normal';

  // A tapped destination waiting for its second tap.
  let confirm: { title: string; button: string } | null = null;
  const ca = confirmHex ? clickActions.get(confirmHex) : undefined;
  if (confirmHex && ca && humanTurn) {
    const name = 'unitId' in ca && ca.unitId ? def(ca.unitId).name : '';
    const r = reach?.get(confirmHex);
    const cost = r ? (effectiveMode(game, mineSel?.id ?? '', moveMode) === 'tactical' ? ` · ${r.hexes} hex${r.hexes > 1 ? 'es' : ''}` : ` · ${+r.cost.toFixed(1)} MP`) : '';
    confirm = ca.type === 'move' ? { title: `Move ${name} to ${confirmHex}${cost}${r?.stop ? ' (must stop)' : ''}`, button: 'Move here' }
      : ca.type === 'land' ? { title: `${game.phase === 'initial' ? 'Drop' : 'Land'} ${name} at ${confirmHex}`, button: game.phase === 'initial' ? 'Drop here' : 'Land here' }
        : ca.type === 'enter' ? { title: `Enter the map at ${confirmHex} with ${name}`, button: 'Enter here' }
          : ca.type === 'advance' ? { title: `Advance ${advanceSel.length} unit${advanceSel.length > 1 ? 's' : ''} to ${confirmHex}`, button: 'Advance' }
            : ca.type === 'btMove' ? { title: `Move the Breakthrough Group to ${confirmHex}`, button: 'Move group' }
              : ca.type === 'retreatChoice' ? { title: `Retreat to ${confirmHex}`, button: 'Retreat here' }
                : { title: `Confirm ${confirmHex}`, button: 'Confirm' };
  }

  // The planned attack, with the support that can join it.
  let attackInfo: React.ComponentProps<typeof ActionBar>['attack'] = null;
  if (attackTarget && humanTurn && !game.pendingDefense && !game.pendingAdvance) {
    const chosen = [...attackers];
    const nations = new Set(chosen.map((id) => supportNation(id)));
    const air = attackKind === 'attack' && [...nations].some((n) => game.support.ready.includes(`${n}-air`));
    const navalReady = [...nations].some((n) => game.support.ready.includes(`${n}-naval`));
    const naval = attackKind === 'attack' && side === 'Allied' && navalReady && inNavalRange(attackTarget);
    const enemy = unitsAt(game, attackTarget).filter((u) => sideOf(u) !== side);
    const place = MAP.hexes[attackTarget]?.city ?? MAP.hexes[attackTarget]?.town;
    attackInfo = {
      kind: attackKind,
      target: attackTarget,
      targetName: place ?? `hex ${attackTarget}`,
      defenders: enemy.length,
      odds,
      count: attackKind === 'breakthrough' && game.breakthrough ? groupUnits(game, game.breakthrough).length : chosen.length,
      support,
      setSupport,
      air,
      naval,
      navalNote: 'Naval gunfire from the task force off the coast',
      ships: naval && game.turn >= BATTLESHIPS_TURN && game.support.battleships > 0,
      asuIds: attackKind === 'attack' && chosen.length ? readyAsusFor(game, side, attackTarget, chosen).map((u) => u.id) : [],
      pool: attackKind === 'breakthrough' ? [] : attackPool(attackTarget),
      chosen: attackers,
      toggle: (id: string) => setAttackers((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }),
    };
  }

  const advance = game.pendingAdvance && humanTurn && !game.breakthrough
    ? {
      ids: Object.keys(game.pendingAdvance.maxByUnit).filter((id) => game.units[id]?.where.kind === 'map'),
      sel: advanceSel,
      toggle: (id: string) => setAdvanceSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
      limited: !!game.pendingAdvance.limited,
      breakthrough: !!game.pendingAdvance.btAllowed && !game.pendingAdvance.started,
      /** With a single destination (usually the vacated hex) one button does it. */
      only: advanceTargets.length === 1 && advanceSel.length ? advanceTargets[0] : null,
      onAdvance: (h: HexId) => onHexClick(h),
    }
    : null;

  const phasePrompt = (): { title: string; sub: string } => {
    if (game.retreatQueue?.length) {
      const rq = game.retreatQueue[0];
      return { title: 'Choose where your units retreat', sub: `${verb} a highlighted hex, or keep ${rq.options[rq.current].end}.` };
    }
    if (game.pendingDefense) return { title: 'Your units are under attack', sub: 'Fall back or make a stand: choose on the battle screen.' };
    if (game.breakthrough) {
      const b = game.breakthrough;
      return { title: `Breakthrough Group · ${b.left} hex${b.left === 1 ? '' : 'es'} left`, sub: `${verb} a violet hex to move or a red hex to attack.` };
    }
    switch (game.phase) {
      case 'invasion': return { title: 'Invasion: the troops are ashore', sub: `Units with advance left may move (Next unit).${targets.length ? ` ${verb} the red hex at Salerno to send in the Commandos.` : ''}` };
      case 'initial': return { title: `${side} initial phase`, sub: drops.length ? `Airborne drops waiting: use Next drop.` : 'Replacements and artillery are under Details.' };
      case 'movement': return { title: `${side} movement`, sub: readyUnits.length ? `${readyUnits.length} unit${readyUnits.length === 1 ? '' : 's'} ready. ${selVerb} a unit, or use Next unit.` : 'All units have moved.' };
      case 'combat': return { title: `${side} combat`, sub: targets.length ? `${targets.length} enem${targets.length === 1 ? 'y' : 'ies'} in reach. ${verb} a red hex to plan an attack.` : 'No enemy within reach.' };
      default: return { title: `${side} ${game.phase}`, sub: '' };
    }
  };
  const extra: { label: string; onClick: () => void; primary?: boolean }[] = [];
  if (game.retreatQueue?.length && humanTurn) {
    const rq = game.retreatQueue[0];
    extra.push({ label: `Keep ${rq.options[rq.current].end}`, primary: true, onClick: () => dispatch({ type: 'retreatChoice', index: rq.current }) });
  }
  const toggleDetails = () => {
    if (panelOpen && tab === (humanTurn ? 'play' : 'log')) setPanelOpen(false);
    else {
      setTab(humanTurn ? 'play' : 'log');
      setPanelOpen(true);
    }
  };
  const showEnd = humanTurn && !game.pendingDefense && !game.retreatQueue?.length && game.phase !== 'gameOver';

  // ---------------------------------------------------------------- keyboard
  const keys = useRef({ cancelAll, executeAttack, endPhase, undo, next, modes, setMoveMode, confirm: () => confirmHex && onHexClick(confirmHex), hasConfirm: !!confirm, hasAttack: !!attackInfo, showEnd });
  keys.current = { cancelAll, executeAttack, endPhase, undo, next, modes, setMoveMode, confirm: () => confirmHex && onHexClick(confirmHex), hasConfirm: !!confirm, hasAttack: !!attackInfo, showEnd };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const k = keys.current;
      if (e.key === 'Escape') {
        if (!k.cancelAll()) setMenu((m) => (m === 'none' ? 'pause' : 'none'));
        return;
      }
      if (menu !== 'none') return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (t && t.tagName === 'BUTTON') return; // the focused button handles it
        e.preventDefault();
        if (k.hasConfirm) k.confirm();
        else if (k.hasAttack) k.executeAttack();
        else if (e.key === ' ' && k.showEnd) k.endPhase();
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'Tab') {
        e.preventDefault();
        if (k.next.count) k.next.onClick();
      } else if ((e.key === 'z' || e.key === 'Z') && !e.altKey) {
        e.preventDefault();
        k.undo();
      } else if (/^[1-5]$/.test(e.key) && k.modes[Number(e.key) - 1]) {
        k.setMoveMode(k.modes[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const cardUnit = selUnit ?? (selectedHex ? unitsAt(game, selectedHex)[0] ?? null : null);
  const showDefense = viewerOpen;

  return (
    <div className={`game${panelOpen ? ' panel-open' : ' panel-closed'}${viewerOpen ? ' battle-open' : ''}`}>
      <MapView
        state={game}
        terrain={terrain}
        version={mapVersion}
        settings={settings}
        highlights={viewerOpen ? NO_HIGHLIGHTS : highlights}
        selectedHex={viewerOpen ? null : selectedHex}
        selectedUnitId={selectedUnit}
        attackTarget={viewerOpen ? null : attackTarget}
        attackers={viewerOpen ? NO_IDS : new Set([...attackers, ...advanceSel])}
        preview={viewerOpen ? null : preview}
        battle={battleMark.current}
        viewInset={battleInset}
        aiActive={!humanTurn}
        humanSides={humanSides}
        onHexClick={(h, e) => onHexClick(h, e)}
        onCancel={() => !viewerOpen && cancelAll()}
        onHexRightClick={rightClick ? onHexRightClick : undefined}
        cursor={hoverCursor}
        focus={focus}
        onHover={setHover}
        hoverText={touch && attackTarget && !viewerOpen ? null : hoverText}
        qol={qol.map}
      />
      <TopBar game={game} settings={settings} setSettings={setSettings} humanTurn={humanTurn} acting={acting}
        onMenu={() => setMenu('pause')} onSettings={() => setMenu('settings')} aiStatus={humanTurn ? '' : aiStatus} />
      {game.phase !== 'gameOver' && <PhaseBanner game={game} humanSides={humanSides} />}
      <EventFeed game={game} onFocus={focusOn} humanSides={humanSides} />
      <Recap game={game} humanSides={humanSides} onJump={(h) => { focusOn(h); qol.pulse(h); }} />
      <ActionBar
        game={game}
        humanTurn={humanTurn}
        acting={acting}
        touch={touch}
        rightClick={rightClick}
        aiStatus={aiStatus}
        paused={paused}
        setPaused={setPaused}
        confirm={confirm}
        onConfirm={() => confirmHex && onHexClick(confirmHex)}
        onCancelConfirm={() => setConfirmHex(null)}
        unit={mineSel}
        unitNote={unitNote}
        modes={modes}
        moveMode={shownMode}
        setMoveMode={setMoveMode}
        onDeselect={() => { setSelectedUnit(null); setSelectedHex(null); }}
        attack={attackInfo}
        onAttack={executeAttack}
        onCancelAttack={clearAttack}
        advance={advance}
        prompt={phasePrompt()}
        next={humanTurn && !game.pendingAdvance && !game.pendingDefense && !game.retreatQueue?.length ? next : null}
        reserves={waitingUnits.length ? { count: waitingUnits.length, onClick: () => selectNext(waitingUnits) } : null}
        extra={extra}
        onDetails={toggleDetails}
        detailsOpen={panelOpen && tab === (humanTurn ? 'play' : 'log')}
        canUndo={history.length > 0}
        onUndo={undo}
        end={showEnd ? { label: endLabel, armed: endArmed, warn: endWarn, onClick: endPhase } : null}
      />
      <aside className={`command${panelOpen ? '' : ' closed'}`}>
        <button className="command-toggle" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? 'Hide orders' : 'Show orders'}>
          {phone ? '▾ Close' : panelOpen ? '›' : '‹'}
        </button>
        <Sidebar
          game={game}
          acting={acting}
          settings={settings}
          setSettings={setSettings}
          tab={tab}
          setTab={(t) => { setTab(t); setPanelOpen(true); }}
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
          onAttack={executeAttack}
          onFocusHex={(h) => { focusOn(h); if (phone) setPanelOpen(false); }}
        />
      </aside>
      {cardUnit && !showDefense && !(small && mineSel && cardUnit.id === mineSel.id) && (
        <UnitCard game={game} unit={cardUnit} hex={selectedHex} onSelect={(id) => setSelectedUnit(id)} onClose={() => { setSelectedUnit(null); setSelectedHex(null); }} />
      )}
      {game.phase !== 'gameOver' && !viewerOpen && <CombatPopup game={game} humanSides={humanSides} speed={settings.animSpeed} />}
      {viewerOpen && (
        <BattleScreen key={battle ? 'plan' : `combat-${viewerId}`} game={game} settings={settings} humanSides={humanSides} plan={battle} combatId={viewerId}
          startAt={stepCombats ? 'intro' : 'decide'} before={viewerId !== null ? beforeCombat.current.get(viewerId) : undefined}
          onRoll={rollAttack} dispatch={dispatch} onAiGate={setAiGate} quick={!stepCombats} onFootprint={setBattleInset}
          onClose={(id) => {
            setBattle(null);
            setViewing(null);
            setAiGate(null);
            if (id !== null) setCombatSeen((n) => Math.max(n, id));
          }} />
      )}
      {toast && <div className="toast">{toast}</div>}
      {game.phase === 'gameOver' && !overDismissed && (
        <GameOverScreen game={game} humanSides={humanSides} onReview={() => setOverDismissed(true)} onMenu={onQuit} />
      )}
      {menu === 'pause' && (
        <PauseMenu game={game} onResume={() => setMenu('none')} onSettings={() => setMenu('settings')} onQuit={onQuit} onLoad={(g) => { setMenu('none'); setCombatSeen(g.combats.length); onLoad(g); }}
          onRules={() => { setMenu('none'); setTab('crt'); setPanelOpen(true); }} />
      )}
      {menu === 'settings' && (
        <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setMenu('none')} inGame
          editorOn={editorOn} setEditorOn={(b) => { setEditorOn(b); if (b) { setTab('editor'); setPanelOpen(true); } }} />
      )}
    </div>
  );
}
