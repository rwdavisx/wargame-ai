// The battle panel: every combat the player takes part in, one step at a time.
// It docks beside the map (on the right, or as a bottom sheet on a phone held
// upright) so the battlefield stays in view, and folds down to a slim strip.
// The odds and the six possible outcomes, the die, the result in plain words,
// the defender's choice (retreat or a Determined Defense), its roll, and what
// the fight cost each side. Nothing moves on until the player says so.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OddsInfo } from '../../engine/combat';
import type { HexId } from '../../engine/hex';
import type { Action, CombatReport, GameState, PendingDefense, Side, UnitState } from '../../engine/types';
import { def, other, sideOf, stepsRemaining } from '../../engine/units';
import { TokenIcon } from '../render/units';
import { unitName } from '../../engine/words';
import { sfx } from '../sound';
import type { Settings } from '../storage';
import { Die3D, Pips } from './Die';
import {
  cap, columnIndex, columnLabel, crtFaces, DD_KIND_LABEL, ddFaces, ddForecast, ddRolls, explainDd, explainResult, forceText, oddsWords,
  placeLong, placeName, RESULT_TITLE, resultAdvance, resultTitle, resultKey, resultTone, shipsAllowed, sideAdj, sideNoun, signed, supportLabel, type DdFace,
} from './model';
import './combat.css';
import { Badge, Button, Card, Collapsible, Heading, HStack, Kbd, NumberInput, SegmentedControl, SegmentedControlItem, Step, Stepper, Text, ToggleButton } from '@astryxdesign/core';

/** An attack the player has ordered but not yet rolled for. */
export interface PlannedAttack {
  action: Action;
  odds: OddsInfo;
  target: HexId;
  attackers: string[];
}

type Step = 'ready' | 'intro' | 'rolling' | 'result' | 'deciding' | 'aiChoice' | 'decide' | 'ddReady' | 'ddRolling' | 'ddResult' | 'retreated';

interface Props {
  game: GameState;
  settings: Settings;
  humanSides: Side[];
  /** The player's own attack, before the roll. */
  plan?: PlannedAttack | null;
  /** A combat already fought (an enemy attack on the player's units). */
  combatId?: number | null;
  /** Open straight at the defender's decision (quick dice). */
  startAt?: 'intro' | 'decide';
  /** Units as they stood before the combat, to tell what it cost. */
  before?: Record<string, UnitState>;
  onRoll?: () => GameState | null;
  dispatch: (a: Action) => GameState | null;
  /** Let the computer answer the defense decision of this combat (null: hold it). */
  onAiGate: (combatId: number | null) => void;
  onClose: (combatId: number | null) => void;
  quick?: boolean;
  /** Keep the map at the moment before a roll (true) until the die lands (false). */
  onHold?: (on: boolean) => void;
  /** How much of the map the panel covers, in screen pixels (for the camera). */
  onFootprint?: (inset: BattleInset) => void;
}

/** The part of the screen the battle panel covers: a band on the right, or along the bottom. */
export interface BattleInset { right: number; bottom: number }
export const NO_INSET: BattleInset = { right: 0, bottom: 0 };

/** Keys that move the map camera; they pass through to the map while the panel is open. */
const CAMERA_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', '+', '=', '-', '_']);

const KIND_TONE: Record<string, string> = { hold: 'hold', holdLoss: 'holdloss', partial: 'partial', delay: 'delay', fail: 'fail' };

export function BattleScreen(p: Props) {
  const { game, settings, humanSides, plan } = p;
  const speed = settings.animSpeed || 1;
  const [id, setId] = useState<number | null>(plan ? null : p.combatId ?? null);
  const [step, setStepRaw] = useState<Step>(plan ? 'ready' : p.startAt === 'decide' ? 'decide' : 'intro');
  const [throwKey, setThrowKey] = useState(0);
  const [ddKey, setDdKey] = useState(0);
  const [before] = useState(() => p.before ?? game.units);
  const [pdSnap, setPdSnap] = useState<PendingDefense | null>(() => (game.pendingDefense && game.pendingDefense.combatId === p.combatId ? game.pendingDefense : null));
  const [face, setFace] = useState<number | null>(null);
  const [decidedAt, setDecidedAt] = useState(0);
  const [support, setSupport] = useState<string | null>(null);
  const [ships, setShips] = useState(false);
  const [prefer, setPrefer] = useState<'hold' | 'delay'>('hold');
  const [delay, setDelay] = useState(1);
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  // Folded down to a strip to look at the map (for this battle only).
  const [collapsed, setCollapsed] = useState(false);
  const changed = useRef(Date.now());
  const setStep = (s: Step) => {
    changed.current = Date.now();
    setStepRaw(s);
  };

  const rep: CombatReport | null = id ? game.combats.find((c) => c.id === id) ?? null : null;
  const pending = !!rep && game.pendingDefense?.combatId === rep.id;
  useEffect(() => {
    if (pending && !pdSnap) setPdSnap(game.pendingDefense);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const pd = pending ? game.pendingDefense! : pdSnap;

  // ---------------------------------------------------------------- who, where, at what odds
  const attSide: Side = rep?.attackerSide ?? game.activeSide;
  const defSide = other(attSide);
  const target = rep?.defenderHex ?? plan!.target;
  const attackers = rep?.attackers ?? plan!.attackers;
  // Everyone who stood in the hex, including units the combat removed before the report listed them.
  const [startDefenders] = useState(() => Object.values(p.before ?? game.units)
    .filter((u) => u.where.kind === 'map' && u.where.hex === target && sideOf(u) === defSide).map((u) => u.id));
  const defenders = useMemo(() => [...new Set([...startDefenders, ...(rep?.defenders ?? [])])], [startDefenders, rep]);
  const o = plan?.odds;
  const attack = rep?.attack ?? o!.attack;
  const defense = rep?.defense ?? o!.defense;
  const baseCol = rep?.baseColumn ?? (o!.defense <= 0 ? 'no defense' : o!.baseIndex >= 9 ? `${o!.baseIndex - 1}-1` : columnLabel(o!.baseIndex));
  const finalCol = rep?.finalColumn ?? columnLabel(o!.finalIndex);
  const shifts = rep?.shifts ?? o!.shifts;
  const drm = rep?.drm ?? o!.drm;
  const noDie = rep ? rep.roll === 0 : plan!.action.type === 'autoDs';
  const kind = (rep?.breakthrough || plan?.action.type === 'btAttack') ? 'Breakthrough attack'
    : noDie && (rep?.phase === 'movement' || plan?.action.type === 'autoDs') ? 'Overrun'
      : (rep?.phase ?? game.phase) === 'invasion' ? 'Commando assault' : 'Assault';
  const place = placeName(target);

  // "You" for the player's side; side names in hot-seat or when watching.
  const mineAtt = humanSides.includes(attSide) && !humanSides.includes(defSide);
  const mineDef = humanSides.includes(defSide) && !humanSides.includes(attSide);
  const attWho = mineAtt ? 'your units' : sideNoun(attSide);
  const defWho = mineDef ? 'your units' : sideNoun(defSide);
  const attRoller = mineAtt ? 'You' : cap(sideNoun(attSide));
  const defRoller = mineDef ? 'You' : cap(sideNoun(defSide));
  const defHuman = settings.controllers[defSide] === 'human';

  const faces = crtFaces(columnIndex(finalCol), drm);
  const rolled = rep && rep.roll > 0 ? rep.roll : null;
  const rolledRow = rolled ? Math.min(6, rolled + drm) : null;
  const shown = step !== 'ready' && step !== 'intro' && step !== 'rolling';
  const key = rep ? resultKey(rep.result) : '';
  // Variable-strength defenders roll their strength when attacked.
  const hidden = (rep?.notes ?? []).filter((n) => / turns out to (have a defense strength|be a hollow position)/.test(n));
  const goneNote = rep?.notes.find((n) => n.startsWith('With nobody left to defend it'));
  const gone = !!goneNote;
  // Every defender destroyed by the stand.
  const wiped = !!rep?.dd && defenders.every((d) => game.units[d]?.where.kind !== 'map');
  const adv = rep ? resultAdvance(rep.result) : 0;

  const intro = `${mineAtt ? 'Your' : sideAdj(attSide)} ${forceText(attackers)} ${attackers.length === 1 ? 'attacks' : 'attack'} ${mineDef ? 'your' : `the ${sideAdj(defSide)}`} ${forceText(defenders)} in ${placeLong(target)}${noDie ? '' : ` at ${oddsWords(finalCol)}`}.`;

  // ---------------------------------------------------------------- the Determined Defense
  const forecast = useMemo(
    () => (pd && pending && defHuman ? ddForecast(game, pd, { support, ships, prefer, delay }) : null),
    [game, pd, pending, defHuman, support, ships, prefer, delay],
  );
  const rolls = rep ? ddRolls(rep) : [];
  const lastDd = rolls[rolls.length - 1];
  const doneFaces: DdFace[] | null = rep?.dd && pd
    ? ddFaces(rep.dd.column, rep.dd.drm, defHuman ? prefer : rep.dd.result.includes('H') ? 'hold' : 'delay',
      { retreat: pd.retreat, delay, desperate: pd.desperate, cityBattle: false, mine: mineDef })
    : null;
  const ddOutcomes = (() => {
    if (!pd) return [];
    let delays = 0;
    return rolls.map((r) => {
      const out = explainDd(r.pick, { retreat: pd.retreat, delay, desperate: pd.desperate, cityBattle: false, mine: mineDef, first: delays === 0 });
      if (r.pick.includes(' D')) delays++;
      return { ...r, ...out };
    });
  })();

  const lastOutcome = ddOutcomes[ddOutcomes.length - 1];
  const heldToDeath = wiped && lastOutcome?.kind !== 'fail';

  // ---------------------------------------------------------------- steps
  const roll = () => {
    if (!p.onRoll) return;
    p.onHold?.(true);
    const next = p.onRoll();
    if (!next) {
      p.onHold?.(false);
      return;
    }
    const r = next.combats[next.combats.length - 1];
    setId(r.id);
    if (next.pendingDefense?.combatId === r.id) setPdSnap(next.pendingDefense);
    if (r.roll === 0) reveal(r);
    else {
      setThrowKey((k) => k + 1);
      setStep('rolling');
    }
  };
  const reveal = (r: CombatReport | null = rep) => {
    setStep('result');
    const k = r ? resultKey(r.result) : '';
    sfx.boom(k === 'DS' || k === 'DR4');
  };
  const watchRoll = () => {
    if (noDie) reveal();
    else {
      setThrowKey((k) => k + 1);
      setStep('rolling');
    }
  };
  const toDefense = () => {
    if (defHuman) setStep('decide');
    else {
      // The other side's answer (and a Determined Defense roll) reaches the map only once its die has landed.
      p.onHold?.(true);
      setDecidedAt(Date.now());
      p.onAiGate(id);
      setStep('deciding');
    }
  };
  // The computer has answered: show its choice after a short beat.
  useEffect(() => {
    if (step !== 'deciding' || pending) return;
    const t = setTimeout(() => {
      p.onAiGate(null);
      setStep('aiChoice');
      sfx.radio();
    }, Math.max(0, 1200 * speed - (Date.now() - decidedAt)));
    return () => clearTimeout(t);
  }, [step, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => p.onAiGate(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // The die has landed (or there was none): let the map show what happened.
  useEffect(() => {
    const waiting = step === 'rolling' || step === 'ddRolling' || step === 'deciding' || (step === 'aiChoice' && !!rep?.dd);
    if (!waiting) p.onHold?.(false);
  }, [step, !!rep?.dd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => p.onHold?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const retreat = () => {
    if (forecast?.trapped.length && !confirmRetreat) {
      setConfirmRetreat(true);
      sfx.click();
      return;
    }
    if (p.dispatch({ type: 'defend', choice: 'retreat' })) {
      setStep('retreated');
      sfx.march();
    }
  };
  const canShips = pd ? shipsAllowed(game, pd, support) : false;
  const rollDd = () => {
    p.onHold?.(true);
    const next = p.dispatch({ type: 'defend', choice: 'dd', support, battleships: canShips && ships, prefer, delay });
    if (!next) {
      p.onHold?.(false);
      return;
    }
    if (p.quick) {
      setStep('ddResult');
      return;
    }
    setDdKey((k) => k + 1);
    setStep('ddRolling');
  };
  const close = () => p.onClose(id);

  const final = (step === 'result' && !pending && !pdSnap) || step === 'ddResult' || step === 'retreated' || (step === 'aiChoice' && !rep?.dd);
  type Btn = { label: string; run: () => void; disabled?: boolean };
  let primary: Btn | null = null;
  let secondary: Btn | null = null;
  switch (step) {
    case 'ready':
      if (mineAtt || !mineDef) {
        primary = { label: noDie ? 'Overrun!' : 'Roll the die', run: roll };
        secondary = { label: 'Cancel', run: () => p.onClose(null) };
      } else {
        // The computer's attack on the player: it is coming whatever happens; the player only watches the roll.
        primary = { label: noDie ? 'See the result ▶' : 'Watch their roll ▶', run: roll };
      }
      break;
    case 'intro':
      primary = { label: noDie ? 'See the result ▶' : `Watch ${mineAtt ? 'your' : 'their'} roll ▶`, run: watchRoll };
      break;
    case 'rolling':
      primary = { label: 'Rolling…', run: () => {}, disabled: true };
      break;
    case 'result':
      primary = pending || pdSnap
        ? { label: defHuman ? 'Your decision ▶' : 'Next ▶', run: pending ? toDefense : () => setStep('aiChoice') }
        : { label: 'Continue', run: close };
      break;
    case 'deciding':
      primary = { label: 'Waiting…', run: () => {}, disabled: true };
      break;
    case 'aiChoice':
      primary = rep?.dd ? { label: 'Watch their roll ▶', run: () => { setDdKey((k) => k + 1); setStep('ddRolling'); } } : { label: 'Continue', run: close };
      break;
    case 'ddReady':
      primary = { label: 'Roll the die', run: rollDd };
      secondary = { label: '◀ Back', run: () => setStep('decide') };
      break;
    case 'ddRolling':
      primary = { label: 'Rolling…', run: () => {}, disabled: true };
      break;
    case 'ddResult':
    case 'retreated':
      primary = { label: 'Continue', run: close };
      break;
  }
  // Ignore a press that lands right after a step change (a held key, a double tap).
  const press = (b: Btn | null) => {
    if (!b || b.disabled || Date.now() - changed.current < 350) return;
    b.run();
  };

  // ---------------------------------------------------------------- keyboard: Space/Enter go on, Esc only backs out where allowed
  const keyRef = useRef({ primary, secondary, step });
  keyRef.current = { primary, secondary, step };
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      const t = e.target as HTMLElement | null;
      // The map camera keys (arrows, WASD, +/-) still pan and zoom; nothing else reaches the game underneath.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && CAMERA_KEYS.has(e.key)) return;
      e.stopPropagation(); // the map and the action bar must not react underneath
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (k.step === 'ready' || k.step === 'ddReady') k.secondary?.run();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        // A focused button handles the key itself (but an outcome tile only explains, it never stands in for Roll).
        if (t && t.tagName === 'BUTTON' && t.closest('.cbx') && !t.closest('.cbx-faces')) return;
        e.preventDefault();
        press(k.primary);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== 'decide') primaryRef.current?.focus({ preventScroll: true });
  }, [step, collapsed]);

  // ---------------------------------------------------------------- the panel's footprint, for the camera
  const dockRef = useRef<HTMLDivElement>(null);
  const footprint = useRef(p.onFootprint);
  footprint.current = p.onFootprint;
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => {
      // offset* ignore the slide-in transform. Tall and to the right: a side panel; full width: a bottom sheet; else a strip.
      const W = window.innerWidth;
      const H = window.innerHeight;
      const side = el.offsetHeight > H * 0.6 && el.offsetLeft > W * 0.2;
      const sheet = !side && el.offsetLeft < 8 && el.offsetWidth > W * 0.9;
      footprint.current?.({ right: side ? Math.max(0, W - el.offsetLeft) : 0, bottom: sheet ? Math.max(0, H - el.offsetTop) : 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [collapsed]);
  useEffect(() => () => footprint.current?.(NO_INSET), []);

  // ---------------------------------------------------------------- render
  const pills = ['Odds', 'Roll', 'Result', ...(pdSnap || pending ? ['Defense', 'Outcome'] : [])];
  const pillAt = { ready: 0, intro: 0, rolling: 1, result: 2, deciding: 3, aiChoice: 3, decide: 3, ddReady: 3, ddRolling: 3, ddResult: 4, retreated: 4 }[step];
  const ddStage = step === 'ddReady' || step === 'ddRolling' || step === 'ddResult' || (step === 'aiChoice' && !!rep?.dd);
  const dieSize = 64;
  // What the folded strip says about where the battle stands.
  const stripStep = shown && rep && (step === 'result' || step === 'decide')
    ? resultTitle(rep.result)
    : step === 'ddResult' && rep?.dd ? `Stand: ${rep.dd.result}`
      : step === 'deciding' ? 'Deciding…'
        : step === 'aiChoice' ? (rep?.dd ? 'They stand' : 'They fall back')
          : step === 'retreated' ? 'You fall back'
            : step === 'ready' || step === 'intro' ? `${noDie ? 'Odds' : finalCol} · ${attack} v ${defense}` : pills[pillAt];
  // Folded, the strip still carries the step's button; at the decision it opens the choices.
  const stripPrimary: Btn | null = collapsed && !primary && step === 'decide' ? { label: 'Choose ▴', run: () => setCollapsed(false) } : primary;
  const toggle = () => setCollapsed((c) => !c);

  return (
    <div ref={dockRef} className={`cbx-dock ${attSide === 'Allied' ? 'att-allied' : 'att-german'}${collapsed ? ' collapsed' : ''}`}>
      <div className="cbx" role="dialog" aria-modal="false" aria-label={`${kind} on ${place}`}>
        <header className="cbx-head">
          <div className="cbx-kicker">
            {mineAtt ? 'Your ' : mineDef ? `${sideAdj(attSide)} ` : `${sideAdj(attSide)} `}{kind.toLowerCase()}{mineDef ? ' on your units' : ''} · day {rep?.turn ?? game.turn}
          </div>
          <h2 className="cbx-title">{place}</h2>
          {collapsed ? (
            <div className="cbx-strip-step">{pills[pillAt]}<span> · {stripStep}</span></div>
          ) : (
            <Stepper activeStep={pillAt} density="compact" label="Battle steps" className="cbx-steps">
              {pills.map((label, i) => <Step key={label} step={i} label={label} />)}
            </Stepper>
          )}
          <Button label={collapsed ? '▴ Battle' : '▾ Map'} size="sm" className="cbx-fold" aria-expanded={!collapsed} onClick={toggle}
            tooltip={collapsed ? 'Show the battle (V)' : 'Fold the panel to see the map (V)'} />
        </header>

        {/* Folded, the body stays mounted (a throw in progress must land) and only the die shows, in the strip. */}
        <div className="cbx-body">
        <section className="cbx-field">
          <Force side={attSide} role={mineAtt ? 'Your attack' : 'Attacker'} ids={attackers} strength={attack} label="attack" game={game} before={before} />
          <div className="cbx-center">
            <div className="cbx-odds" title={`${attack} against ${defense}`}>
              <span className="cbx-odds-label">{noDie ? 'odds' : 'column'}</span>
              <b>{noDie ? (kind === 'Overrun' ? '10-1+' : 'auto') : finalCol}</b>
              {!noDie && baseCol !== finalCol && <span className="cbx-odds-base">from {baseCol}</span>}
            </div>
            <div className={`cbx-die${ddStage ? ' dd' : ''}`}>
              {ddStage ? (
                <Die3D key="dd" value={step === 'ddRolling' || step === 'ddResult' ? rep?.dd?.roll ?? null : null} throwKey={p.quick ? 0 : ddKey} size={dieSize} speed={speed} tone="red"
                  onLanded={() => { setStep('ddResult'); sfx.boom(false); }} label={rep?.dd && step === 'ddResult' ? `Determined Defense die: ${rep.dd.roll}` : 'Determined Defense die'} />
              ) : noDie ? (
                <div className="cbx-nodie">NO ROLL</div>
              ) : (
                <Die3D key="atk" value={shown || step === 'rolling' ? rolled : null} throwKey={throwKey} size={dieSize} speed={speed}
                  onLanded={() => setTimeout(() => reveal(), 250 * speed)} label={rolled && shown ? `Combat die: ${rolled}` : 'Combat die'} />
              )}
            </div>
            <div className="cbx-die-cap">
              {ddStage ? (pd?.desperate ? 'Desperate Defense' : 'Determined Defense') : noDie ? '' : step === 'rolling' ? 'rolling…' : rolled && shown ? `rolled ${rolled}${drm ? ` ${signed(drm)}` : ''}` : drm ? `die ${signed(drm)}` : 'one die'}
            </div>
          </div>
          <Force side={defSide} role={mineDef ? 'Your units' : 'Defender'} ids={defenders} strength={defense} label="defense"
            note={!rep && o?.defenseNote ? `${o.defenseNote}?` : undefined} game={game} before={before} />
        </section>

        <section className="cbx-stage" aria-live="polite">
          {(step === 'ready' || step === 'intro' || step === 'rolling') && (
            <>
              <p className="cbx-say">{intro}</p>
              <OddsLine attack={attack} defense={defense} note={!rep ? o?.defenseNote : undefined} baseCol={baseCol} finalCol={finalCol} shifts={shifts} drm={drm} noDie={noDie} />
              {noDie ? (
                <p className="cbx-say small">{kind === 'Overrun' ? 'At 10 to 1 or better there is no die roll: the defenders are shattered automatically (DS).' : 'There is no die roll: the result is automatic.'}</p>
              ) : (
                <Outcomes faces={faces} drm={drm} lit={null} pick={face} onPick={setFace} att={attWho} dfn={defWho} />
              )}
            </>
          )}

          {shown && rep && !ddStage && step !== 'decide' && step !== 'deciding' && step !== 'aiChoice' && step !== 'retreated' && (
            <div className={`cbx-result tone-${resultTone(key)}`}>
              {!noDie && <Outcomes faces={faces} drm={drm} lit={rolled} pick={null} onPick={() => {}} att={attWho} dfn={defWho} compact />}
              <div className="cbx-verdict">
                <div className="cbx-stamp">{resultTitle(rep.result)}</div>
                <code>{rep.result}</code>
              </div>
              <p className="cbx-say">
                {hidden.map((h) => `${h} `)}
                {goneNote ? `${goneNote} `
                  : noDie ? 'Overrun! ' : `${attRoller} rolled a ${rolled}${drm ? `, ${signed(drm)} for the battleships, making ${rolledRow}` : ''}. `}
                {gone ? `${cap(attWho)} may advance up to ${adv} hexes.` : explainResult(key, attWho, defWho)}
                {!gone && !pending && !pdSnap && defenders.every((d) => game.units[d]?.where.kind !== 'map') ? ' The losses destroy the defenders: the hex is cleared.' : ''}
                {adv && !gone && !pending && !pdSnap ? ` If the hex is cleared, ${attWho} may advance up to ${adv} hex${adv > 1 ? 'es' : ''}.` : ''}
              </p>
              {pd && (
                <p className="cbx-say accent">
                  {defHuman
                    ? `${mineDef ? 'You' : cap(sideNoun(defSide))} must choose now: retreat ${pd.retreat} hexes, or stand and make a Determined Defense.`
                    : `${cap(sideNoun(defSide))} must now choose: retreat ${pd.retreat} hexes, or stand and fight.`}
                  {pd.yellow ? ' This is a yellow result, so a stand rolls at −1.' : ''}
                </p>
              )}
              {final && <Aftermath game={game} rep={rep} defenders={defenders} before={before} humanSides={humanSides} />}
            </div>
          )}

          {step === 'deciding' && (
            <div className="cbx-deciding">
              <div className="cbx-stamp">{cap(sideNoun(defSide))} are deciding<span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
              <p className="cbx-say">Retreat {pd?.retreat ?? 2} hexes, or hold and roll a Determined Defense?</p>
            </div>
          )}

          {step === 'aiChoice' && rep && (
            <div className="cbx-result">
              <div className="cbx-verdict">
                <div className="cbx-stamp">{rep.dd ? `${cap(sideNoun(defSide))} make a stand!` : `${cap(sideNoun(defSide))} fall back`}</div>
              </div>
              {rep.dd ? (
                <p className="cbx-say">
                  They choose a {pd?.desperate ? 'Desperate' : 'Determined'} Defense and roll a die to hold {placeLong(target)}
                  {supportUsed(rep) ? `, backed by ${supportUsed(rep)}` : ''}.
                </p>
              ) : (
                <>
                  <p className="cbx-say">They retreat {pd?.retreat ?? 2} hexes and become disrupted. {adv ? `${cap(attWho)} may advance into the hex.` : ''}</p>
                  <Aftermath game={game} rep={rep} defenders={defenders} before={before} humanSides={humanSides} />
                </>
              )}
            </div>
          )}

          {step === 'decide' && rep && (
            <div className={`cbx-verdict small tone-${resultTone(key)}`}>
              <div className="cbx-stamp">{resultTitle(rep.result)}</div>
              <code>{rep.result}</code>
              <p className="cbx-say small">{attRoller} rolled {noDie ? 'no die' : `a ${rolled}`}: {lower(explainResult(key, attWho, defWho))}</p>
            </div>
          )}
          {step === 'decide' && pd && forecast && (
            <Decision game={game} pd={pd} rep={rep} forecast={forecast} support={support} setSupport={(s) => { setSupport(s); if (!s?.endsWith('-naval')) setShips(false); }}
              ships={ships} setShips={setShips} canShips={canShips} prefer={prefer} setPrefer={setPrefer} delay={delay} setDelay={setDelay}
              confirmRetreat={confirmRetreat} onRetreat={retreat} onStand={() => setStep('ddReady')} />
          )}

          {step === 'ddReady' && forecast && pd && (
            <div className="cbx-ddready">
              <p className="cbx-say">
                {pd.desperate ? 'Desperate Defense' : 'Determined Defense'} on the <b>{forecast.column}</b> column
                {forecast.drm ? `, ${signed(forecast.drm)} to the roll` : ''}. Roll the die: here is what each number does.
              </p>
              <DdBar faces={forecast.faces} lit={null} legend />
              <Mods mods={forecast.mods} drm={forecast.drm} lead={forecast.lead} />
            </div>
          )}

          {(step === 'ddRolling' || step === 'ddResult') && rep && (
            <div className="cbx-result">
              {(forecast || doneFaces) && <DdBar faces={(step === 'ddResult' ? doneFaces : null) ?? forecast?.faces ?? doneFaces!} lit={step === 'ddResult' ? rep.dd?.roll ?? null : null} mine={mineDef} legend={step === 'ddRolling' && !mineDef} />}
              {step === 'ddRolling' && <p className="cbx-say">{defRoller} roll{defRoller === 'You' ? '' : 's'} for the Determined Defense…</p>}
              {step === 'ddResult' && lastDd && (
                <>
                  <div className={`cbx-verdict dd-${wiped ? 'fail' : KIND_TONE[lastOutcome?.kind ?? 'fail']}`}>
                    <div className="cbx-stamp">{heldToDeath ? 'Destroyed holding the hex' : wiped ? 'Wiped out' : finalDdTitle(rep, lastOutcome?.title)}</div>
                    <code>DD {rep.dd!.column} {rep.dd!.result}</code>
                  </div>
                  {ddOutcomes.length > 1 && (
                    <ol className="cbx-rolls">
                      {ddOutcomes.slice(0, -1).map((r, i) => (
                        <li key={i}><Pips n={r.roll} size={18} /> {r.title}: {r.detail}</li>
                      ))}
                    </ol>
                  )}
                  <p className="cbx-say">
                    {defRoller} rolled a {lastDd.roll}{lastDd.drm ? `, ${signed(lastDd.drm)} for modifiers, making ${Math.max(1, Math.min(7, lastDd.roll + lastDd.drm))}` : ''}:{' '}
                    {heldToDeath ? 'the hex is held, but the losses take the last of the defenders.'
                      : wiped ? 'the stand fails and the last of the defenders is destroyed.' : lower(lastOutcome?.detail ?? '')}
                  </p>
                  <Aftermath game={game} rep={rep} defenders={defenders} before={before} humanSides={humanSides} />
                </>
              )}
            </div>
          )}

          {step === 'retreated' && rep && (
            <div className="cbx-result">
              <div className="cbx-verdict"><div className="cbx-stamp">You fall back</div></div>
              <p className="cbx-say">Your units retreat {pd?.retreat ?? 2} hexes and become disrupted. No further steps are lost.</p>
              <Aftermath game={game} rep={rep} defenders={defenders} before={before} humanSides={humanSides} />
            </div>
          )}
        </section>
        </div>

        {(stripPrimary || secondary) && (
          <footer className="cbx-actions">
            {secondary && !collapsed && <Button label={secondary.label} size="lg" className="cbx-secondary" onClick={() => secondary!.run()} />}
            {stripPrimary && (
              <Button ref={primaryRef} label={stripPrimary.label} variant="primary" size="lg" className={`cbx-primary${step === 'ready' ? ' roll' : ''}`}
                isDisabled={stripPrimary.disabled} onClick={() => (stripPrimary === primary ? press(primary) : stripPrimary.run())}>
                {(step === 'ready' && !noDie) || step === 'ddReady' ? <><Pips n={5} size={20} /> {stripPrimary.label}</> : stripPrimary.label}
                {stripPrimary === primary && <Kbd keys={step === 'ready' || step === 'ddReady' ? 'Space' : 'Enter'} className="cbx-kbd" />}
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function supportUsed(rep: CombatReport): string {
  const m = rep.notes.map((x) => /^(.+) (?:fires in support of|supports) the defenders\.$/.exec(x)).find(Boolean);
  return m ? m[1] : '';
}

function finalDdTitle(rep: CombatReport, title?: string): string {
  if (rep.notes.includes('The defenders die holding their ground.')) return 'Destroyed holding the hex';
  return title ?? 'Determined Defense';
}

// ------------------------------------------------------------------ pieces

function Force({ side, role, ids, strength, label, note, game, before }: {
  side: Side; role: string; ids: string[]; strength: number; label: string; note?: string; game: GameState; before: Record<string, UnitState>;
}) {
  return (
    <div className={`cbx-force ${side === 'Allied' ? 'allied' : 'german'}`}>
      <div className="cbx-band"><span>{sideAdj(side)}</span><em>{role}</em></div>
      <div className={`cbx-units${ids.length > 4 ? ' many' : ''}`}>
        {ids.map((id) => {
          const u = game.units[id] ?? before[id];
          if (!u) return null;
          const gone = u.where.kind !== 'map' && u.where.kind !== 'entry';
          return (
            <span key={id} className={`cbx-unit${gone ? ' gone' : ''}`} title={`${def(id).name}${gone ? ' (destroyed)' : ''}`}>
              <TokenIcon unit={u} size={ids.length > 4 ? 30 : 38} />
            </span>
          );
        })}
      </div>
      <div className="cbx-str"><b>{strength}</b><span>{label}{note ? ` (${note})` : ''}</span></div>
    </div>
  );
}

function OddsLine({ attack, defense, note, baseCol, finalCol, shifts, drm, noDie }: {
  attack: number; defense: number; note?: string; baseCol: string; finalCol: string; shifts: { reason: string; shift: number }[]; drm: number; noDie: boolean;
}) {
  return (
    <HStack gap={1.5} wrap="wrap" className="cbx-oddsline">
      <Badge variant="neutral" label={`${attack} against ${defense}${note ? ` (${note})` : ''} = ${baseCol}`} />
      {shifts.map((s, i) => (
        <span key={i} title={s.shift > 0 ? 'Shifts the odds one column in the attacker\'s favour' : 'Shifts the odds one column in the defender\'s favour'}>
          <Badge variant={s.shift > 0 ? 'success' : 'error'} label={`${s.reason} ${s.shift > 0 ? '▶' : '◀'}`} />
        </span>
      ))}
      {!noDie && shifts.length > 0 && <Badge variant="neutral" label={`→ ${finalCol}`} />}
      {drm !== 0 && <span title="Added to the die roll"><Badge variant="success" label={`Battleships: die ${signed(drm)}`} /></span>}
    </HStack>
  );
}

function Outcomes({ faces, drm, lit, pick, onPick, att, dfn, compact }: {
  faces: ReturnType<typeof crtFaces>; drm: number; lit: number | null; pick: number | null; onPick: (n: number | null) => void; att: string; dfn: string; compact?: boolean;
}) {
  const sel = faces.find((f) => f.face === (lit ?? pick));
  return (
    <div className={`cbx-outcomes${compact ? ' compact' : ''}`}>
      {!compact && <div className="cbx-sub">What each roll would do{drm ? ` (die ${signed(drm)})` : ''} — {lit ? '' : 'tap one to read it'}</div>}
      <div className="cbx-faces" role="list">
        {faces.map((f) => (
          <button key={f.face} role="listitem" className={`cbx-face tone-${resultTone(f.key)}${lit === f.face ? ' lit' : ''}${lit && lit !== f.face ? ' dim' : ''}${pick === f.face ? ' pick' : ''}`}
            onClick={() => onPick(pick === f.face ? null : f.face)} title={`${RESULT_TITLE[f.key] ?? f.key}: ${explainResult(f.key, att, dfn)}`} tabIndex={compact ? -1 : 0}>
            <Pips n={f.face} size={compact ? 16 : 20} />
            <b>{f.key}</b>
            {!compact && <span className="cbx-face-name">{RESULT_TITLE[f.key] ?? ''}</span>}
            <span className="cbx-face-flags">
              {f.adv > 0 && <i title={`The attacker may advance up to ${f.adv} hexes`}>adv {f.adv}</i>}
              {f.color === 'y' && <i className="y" title="A Determined Defense against this result rolls at −1">stand −1</i>}
              {f.color === 'r' && <i className="r" title="No Determined Defense against this result">no stand</i>}
            </span>
          </button>
        ))}
      </div>
      {!compact && sel && (
        <p className="cbx-meaning">
          <b>{sel.face}{sel.row !== sel.face ? ` (counts as ${sel.row})` : ''}: {RESULT_TITLE[sel.key] ?? sel.key}.</b> {explainResult(sel.key, att, dfn)}
          {sel.adv > 0 ? ` A cleared hex lets the attacker advance up to ${sel.adv}.` : ''}
        </p>
      )}
    </div>
  );
}

/** The six Determined Defense outcomes as a bar, with the chances and (optionally) what each one means. */
export function DdBar({ faces, lit, legend, mine = true }: { faces: DdFace[]; lit: number | null; legend?: boolean; mine?: boolean }) {
  const count = (k: string[]) => faces.filter((f) => k.includes(f.kind)).length;
  const pct = (n: number) => `${Math.round((n / 6) * 100)}%`;
  const hold = count(['hold', 'holdLoss', 'partial']);
  const delay = count(['delay']);
  const fail = count(['fail']);
  return (
    <div className="dd-bar-wrap">
      <div className="dd-bar" role="list">
        {faces.map((f) => (
          <div key={f.face} role="listitem" className={`dd-seg ${KIND_TONE[f.kind]}${lit === f.face ? ' lit' : ''}${lit && lit !== f.face ? ' dim' : ''}`} title={`${f.face}: ${f.title}. ${f.detail}`}>
            <Pips n={f.face} size={16} />
            <b>{DD_KIND_LABEL[f.kind]}</b>
            {f.choice && <i>{mine ? 'your' : 'their'} pick</i>}
          </div>
        ))}
      </div>
      <div className="dd-odds">
        <span className="hold">Hold {pct(hold)}</span>
        {delay > 0 && <span className="delay">Delay {pct(delay)}</span>}
        <span className="fail">Fail {pct(fail)}</span>
      </div>
      {legend && (
        <ul className="dd-legend">
          {groups(faces).map((g) => (
            <li key={g.from} className={KIND_TONE[g.kind]}>
              <b>{g.from === g.to ? g.from : `${g.from}–${g.to}`}</b> {g.title}: {lower(g.detail)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Runs of die faces with the same outcome ("1–2 Stand fails …"). */
function groups(faces: DdFace[]) {
  const out: { from: number; to: number; kind: string; title: string; detail: string }[] = [];
  for (const f of faces) {
    const last = out[out.length - 1];
    if (last && last.title === f.title && last.detail === f.detail) last.to = f.face;
    else out.push({ from: f.face, to: f.face, kind: f.kind, title: f.title, detail: f.detail });
  }
  return out;
}

function Mods({ mods, drm, lead }: { mods: { label: string; value: number }[]; drm: number; lead: string | null }) {
  return (
    <HStack gap={1.5} wrap="wrap" className="dd-mods">
      {lead && <Badge variant="neutral" label={`Lead unit: ${def(lead).name}`} />}
      {mods.map((m) => <Badge key={m.label} variant={m.value > 0 ? 'success' : 'error'} label={`${m.label} ${signed(m.value)}`} />)}
      <Badge variant="info" label={`Die ${drm ? signed(drm) : '±0'}`} />
    </HStack>
  );
}

function Decision(p: {
  game: GameState; pd: PendingDefense; rep: CombatReport | null; forecast: ReturnType<typeof ddForecast>;
  support: string | null; setSupport: (s: string | null) => void; ships: boolean; setShips: (b: boolean) => void; canShips: boolean;
  prefer: 'hold' | 'delay'; setPrefer: (v: 'hold' | 'delay') => void; delay: number; setDelay: (n: number) => void;
  confirmRetreat: boolean; onRetreat: () => void; onStand: () => void;
}) {
  const { pd, forecast: f } = p;
  const trapped = f.trapped;
  const anyChoice = f.faces.some((x) => x.choice);
  const anyDelay = f.faces.some((x) => x.kind === 'delay');
  return (
    <div className="dfx" ref={(el) => {
      // The choice is the point of this step: bring it into view (on a phone it starts below the fold).
      if (el && !el.dataset.shown) {
        el.dataset.shown = '1';
        window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
    }}>
      <p className="cbx-say accent">Your units in {placeLong(pd.hex)} are being forced back. Retreat, or stand and fight?</p>
      <div className="dfx-cards">
        <Card padding={3} className={`dfx-card retreat${trapped.length ? ' warn' : ''}`}>
          <div className="dfx-card-head"><span className="dfx-icon" aria-hidden>⇦</span><Heading level={3}>Retreat {pd.retreat} hexes</Heading></div>
          <ul>
            <li>Your units fall back {pd.retreat} hexes and become disrupted.</li>
            <li>No step losses beyond the combat result.</li>
            <li>The enemy may advance into the hex.</li>
          </ul>
          {pd.desperate && (
            <p className="dfx-warn">
              {trapped.length
                ? `${trapped.map((id) => def(id).name).join(', ')} cannot retreat and would be destroyed.`
                : 'Retreating would leave your units cut off from supply.'}
              {' '}A stand here is a Desperate Defense.
            </p>
          )}
          <Button label={p.confirmRetreat ? `Retreat anyway (lose ${trapped.length} unit${trapped.length > 1 ? 's' : ''})` : `Retreat ${pd.retreat} hexes`}
            variant={p.confirmRetreat ? 'destructive' : 'secondary'} size="lg" width="100%" className="dfx-go" onClick={p.onRetreat} />
        </Card>
        <Card padding={3} className="dfx-card stand">
          <div className="dfx-card-head"><span className="dfx-icon" aria-hidden>⛨</span><Heading level={3}>{pd.desperate ? 'Desperate Defense' : 'Determined Defense'}</Heading></div>
          <p className="dfx-note">
            Stand in the hex and roll a die on the <b>{f.column}</b> column.
            {pd.desperate ? ' Each failure costs the lead unit a step and you roll again.' : ''}
          </p>
          <DdBar faces={f.faces} lit={null} legend />
          {(pd.supportOptions.length > 0 || p.canShips) && (
            <div className="dfx-row">
              <span className="dfx-label">Support (+1, one only)</span>
              <div className="dfx-chips">
                {pd.supportOptions.map((s) => (
                  <ToggleButton key={s} label={supportLabel(s)} isPressed={p.support === s} onPressedChange={() => p.setSupport(p.support === s ? null : s)} />
                ))}
                {p.canShips && <ToggleButton label="Valiant & Warspite +1" isPressed={p.ships} onPressedChange={() => p.setShips(!p.ships)} />}
              </div>
            </div>
          )}
          {anyChoice && (
            <div className="dfx-row">
              <span className="dfx-label">If the roll offers a choice</span>
              <SegmentedControl label="If the roll offers a choice" value={p.prefer} onChange={(v) => p.setPrefer(v as 'hold' | 'delay')}>
                <SegmentedControlItem value="hold" label="Hold" />
                <SegmentedControlItem value="delay" label="Delay" />
              </SegmentedControl>
              <span className="dfx-hint">{p.prefer === 'hold' ? 'Keep the hex and lose a step.' : 'Fall back a little, disrupted, with no step lost.'}</span>
            </div>
          )}
          {(anyDelay || anyChoice) && (
            <div className="dfx-row">
              <span className="dfx-label">On a Delay, fall back</span>
              <NumberInput label="Hexes to fall back on a Delay" isLabelHidden value={p.delay} min={1} max={3} step={1} width={120}
                onChange={(v) => p.setDelay(Math.max(1, Math.min(3, Math.round(v))))} />
            </div>
          )}
          <Mods mods={f.mods} drm={f.drm} lead={f.lead} />
          <Button label="Make a stand ▶" variant="primary" size="lg" width="100%" className="dfx-go" onClick={p.onStand} />
        </Card>
      </div>
    </div>
  );
}

const FATE_BADGE: Record<string, 'error' | 'warning' | 'success' | 'neutral'> = { red: 'error', amber: 'warning', green: 'success', plain: 'neutral' };

/** What the combat cost each side, unit by unit. */
function Aftermath({ game, rep, defenders, before, humanSides }: { game: GameState; rep: CombatReport; defenders: string[]; before: Record<string, UnitState>; humanSides: Side[] }) {
  const rows = [...rep.attackers.map((id) => ({ id, att: true })), ...defenders.map((id) => ({ id, att: false }))];
  const fate = (id: string, att: boolean): { text: string; tone: string }[] => {
    const now = game.units[id];
    const was = before[id];
    if (!now) return [];
    const out: { text: string; tone: string }[] = [];
    const reduced = rep.notes.map((n) => /^(.+) is worn down to a remnant \((.+)\)\.$/.exec(n)).find((m) => m && m[1] === unitName(id));
    if (now.where.kind === 'eliminated' || now.where.kind === 'removed') out.push({ text: reduced ? `Worn down to ${reduced[2]}` : 'Destroyed', tone: 'red' });
    else {
      const lost = was ? now.stepsLost - was.stepsLost : 0;
      if (lost > 0) out.push({ text: `Lost ${lost === 1 ? 'a step' : `${lost} steps`} (${stepsRemaining(now)} left)`, tone: 'red' });
      if (now.status === 'fullRetreat' && was?.status !== 'fullRetreat') out.push({ text: 'Full Retreat', tone: 'red' });
      else if (now.status === 'disrupted' && was?.status !== 'disrupted') out.push({ text: 'Disrupted', tone: 'amber' });
      const wh = was?.where.kind === 'map' ? was.where.hex : null;
      const nh = now.where.kind === 'map' ? now.where.hex : null;
      if (!att && nh && nh !== rep.defenderHex) out.push({ text: `Fell back to ${nh}`, tone: 'amber' });
      else if (att && nh && wh && nh !== wh) out.push({ text: `Advanced to ${nh}`, tone: 'green' });
    }
    if (!out.length) out.push({ text: 'No losses', tone: 'plain' });
    return out;
  };
  const youRetreat = game.retreatQueue?.length && humanSides.includes(game.retreatQueue[0].side);
  const youAdvance = game.pendingAdvance?.combatId === rep.id && humanSides.includes(rep.attackerSide);
  return (
    <div className="cbx-after">
      <div className="cbx-sub">What it cost</div>
      <ul className="cbx-fates">
        {rows.map(({ id, att }) => {
          const u = game.units[id] ?? before[id];
          if (!u) return null;
          return (
            <li key={id} className={att ? 'att' : 'def'}>
              <TokenIcon unit={u} size={28} />
              <span className="cbx-fate-name">{def(id).name}</span>
              <span className="cbx-fate-tags">{fate(id, att).map((t) => <Badge key={t.text} variant={FATE_BADGE[t.tone] ?? 'neutral'} label={t.text} />)}</span>
            </li>
          );
        })}
      </ul>
      {youRetreat ? <p className="cbx-say small">After you continue, pick where your units retreat to on the map (or keep the suggested hex).</p> : null}
      {youAdvance ? <p className="cbx-say small">After you continue, you may advance into {placeLong(rep.defenderHex)}: pick the units and a violet hex.</p> : null}
      {rep.notes.length > 0 && (
        <Collapsible className="cbx-notes" trigger={<Text type="label" color="secondary">Combat record</Text>}>
          <ul>{rep.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Collapsible>
      )}
    </div>
  );
}
