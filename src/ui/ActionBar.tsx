// The command bar along the bottom of the battle screen: what is in hand (an icon or the selected counter), one
// short line on what to do, icon buttons for the orders, and the gilt seal that ends the phase.
import { useEffect, useRef } from 'react';
import { columnLabel, type OddsInfo } from '../engine/combat';
import type { HexId } from '../engine/hex';
import type { GameState, MoveMode, Side, UnitState } from '../engine/types';
import { def, values } from '../engine/units';
import { TokenIcon } from './render/units';
import type { SupportPick } from './play';
import { Ico } from './icons';
import { Medal, Tip } from './chrome';

export type AttackKind = 'attack' | 'autoDs' | 'invasion' | 'breakthrough';

export const MODE_LABEL: Record<MoveMode, string> = {
  normal: 'Normal', extended: 'Extended', tactical: 'Tactical', truck: 'Truck', truckExtended: 'Truck + Ext',
};
const MODE_HINT: Record<MoveMode, string> = {
  normal: 'Full move; stops in enemy ZOC',
  extended: '+3 MP; never into enemy ZOC',
  tactical: '1–2 hexes, any terrain',
  truck: 'MA 5 on trucks; no attack',
  truckExtended: 'Trucks + Extended',
};

export interface ActionBarProps {
  game: GameState;
  humanTurn: boolean;
  acting: Side;
  touch: boolean;
  /** Mouse with right-click controls: right-click moves and attacks. */
  rightClick: boolean;
  aiStatus: string;
  paused: boolean;
  setPaused: (b: boolean) => void;

  /** A destination tapped once on a touch screen, waiting for confirmation. */
  confirm: { title: string; button: string } | null;
  onConfirm: () => void;
  onCancelConfirm: () => void;

  /** The selected own unit, its movement modes and its status. */
  unit: UnitState | null;
  unitNote: string;
  modes: MoveMode[];
  moveMode: MoveMode;
  setMoveMode: (m: MoveMode) => void;
  onDeselect: () => void;
  /** Orders for the selected unit: stand still this phase, or sleep until woken. */
  orders: { holding: boolean; sleeping: boolean; onHold: () => void; onSleep: () => void; onWake: () => void } | null;

  /** The planned attack. */
  attack: {
    kind: AttackKind;
    target: HexId;
    targetName: string;
    defenders: number;
    odds: OddsInfo | null;
    count: number;
    support: SupportPick;
    setSupport: (s: SupportPick) => void;
    air: boolean;
    naval: boolean;
    navalNote: string;
    ships: boolean;
    asuIds: string[];
    /** Every unit that may join the attack, the ones in it, and a toggle. */
    pool: string[];
    chosen: Set<string>;
    toggle: (id: string) => void;
  } | null;
  onAttack: () => void;
  onCancelAttack: () => void;

  /** Advance after combat. */
  advance: { ids: string[]; sel: string[]; toggle: (id: string) => void; limited: boolean; breakthrough: boolean; only: HexId | null; onAdvance: (h: HexId) => void } | null;

  /** What the phase asks for when nothing is selected, with its icon. */
  prompt: { title: string; sub: string; icon?: string };
  next: { label: string; count: number; onClick: () => void } | null;
  reserves: { count: number; onClick: () => void } | null;
  extra: { label: string; onClick: () => void; primary?: boolean; icon?: string }[];

  onDetails: () => void;
  detailsOpen: boolean;
  canUndo: boolean;
  onUndo: () => void;
  /** `checks`: things to look at before the phase ends, shown (and each jumped to) while End is armed. */
  end: { label: string; armed: boolean; warn: string; onClick: () => void; checks?: { text: string; hex: HexId }[]; onCheck?: (hex: HexId) => void } | null;
}

function oddsText(o: OddsInfo): string {
  if (!o.ok) return '—';
  if (o.autoDs) return 'DS';
  return o.defense ? columnLabel(o.finalIndex) : '—';
}

const MODE_ICON: Record<MoveMode, string> = { normal: 'boot', extended: 'advance', tactical: 'hex', truck: 'truck', truckExtended: 'truck' };

/** The bar's left end: an icon (or the selected unit's counter) in a gilt ring. */
function Context({ icon, unit, tone }: { icon?: string; unit?: UnitState | null; tone?: string }) {
  return (
    <div className={`cmd-ctx${tone ? ` ${tone}` : ''}`}>
      {unit ? <TokenIcon unit={unit} size={44} /> : <Ico name={icon ?? 'quill'} size={26} />}
    </div>
  );
}

function Prompt({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="cmd-prompt">
      <div className="cmd-title">{title}</div>
      {sub && <div className="cmd-sub">{sub}</div>}
      {children}
    </div>
  );
}

export function ActionBar(p: ActionBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Panels above the bar (unit card, phone order sheet) sit on its measured height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const key = (k: string) => (p.touch ? undefined : k);
  const pick = p.touch ? 'Tap' : 'Click';
  const g = p.game;
  // The end-phase seal, at the bar's right end.
  const seal = (label: string, onClick: () => void, opts: { armed?: boolean; tip?: string; tone?: 'gold' | 'red' | 'olive'; icon?: string } = {}) => (
    <div className={`cmd-seal${opts.armed ? ' armed' : ''}`}>
      <Medal icon={opts.icon ?? 'hourglass'} label={label} size="lg" tone={opts.tone} onClick={onClick} keyHint={key('Space')} tip={opts.tip ? [opts.tip] : undefined} />
      <span className="cmd-seal-cap">{label}</span>
    </div>
  );

  let body: React.ReactNode;
  if (!p.humanTurn) {
    body = (
      <>
        <Context icon="radio" tone="enemy" />
        <Prompt title={g.phase === 'gameOver' ? 'Battle over' : `${p.acting} ${g.pendingDefense ? 'deciding' : 'moving'}`} sub={p.aiStatus || undefined} />
        {g.phase !== 'gameOver' && (
          <div className="cmd-buttons">
            <Medal icon={p.paused ? 'play' : 'pause'} label={p.paused ? 'Resume' : 'Pause'} active={p.paused} onClick={() => p.setPaused(!p.paused)} />
            <Medal icon="log" label="Log" active={p.detailsOpen} onClick={p.onDetails} />
          </div>
        )}
      </>
    );
  } else if (p.confirm) {
    body = (
      <>
        <Context icon="target" />
        <Prompt title={p.confirm.title} sub="Tap again to confirm" />
        <div className="cmd-buttons">
          <Medal icon="close" label="Cancel" onClick={p.onCancelConfirm} />
        </div>
        {seal(p.confirm.button, p.onConfirm, { icon: 'check', tone: 'olive' })}
      </>
    );
  } else if (p.attack) {
    const a = p.attack;
    const o = a.odds;
    const sup = a.support;
    const set = (patch: Partial<SupportPick>) => a.setSupport({ ...sup, ...patch });
    const allAsus = a.asuIds.length > 0 && a.asuIds.every((id) => sup.asus?.includes(id));
    const blocked = !a.count || !o?.ok || (a.kind === 'autoDs' && !o.autoDs);
    const why = !a.count && a.pool.length ? `${pick} units to add them` : o && !o.ok ? o.reason : a.kind === 'autoDs' && o && !o.autoDs ? 'Overrun needs 10–1' : '';
    body = (
      <>
        <Tip title="Odds" pos="above" lines={o?.ok ? [`${o.attack} against ${o.defense}${o.defenseNote ? ` (${o.defenseNote})` : ''}`, ...o.shifts.map((sh) => `${sh.reason} ${sh.shift > 0 ? '+' : ''}${sh.shift}`), o.drm ? `Die ${o.drm > 0 ? '+' : ''}${o.drm}` : ''] : []}>
          <div className={`cmd-odds${o?.ok ? '' : ' bad'}`}>
            <b>{o ? oddsText(o) : '…'}</b>
            {o?.ok && <span><Ico name="swords" size={12} />{o.attack}<Ico name="shield" size={12} />{o.defense}</span>}
          </div>
        </Tip>
        <Prompt title={<>{a.kind === 'autoDs' ? 'Overrun' : a.kind === 'breakthrough' ? 'Breakthrough' : 'Attack'} <em>{a.targetName}</em></>} sub={why || undefined}>
          <div className="cmd-chips">
            {a.pool.map((id) => {
              const on = a.chosen.has(id);
              return (
                <Tip key={id} title={def(id).name} lines={[on ? 'Attacking' : 'Left out']} pos="above">
                  <button className={`token-btn${on ? ' on' : ' off'}`} aria-pressed={on} aria-label={def(id).name} onClick={() => a.toggle(id)}>
                    <TokenIcon unit={p.game.units[id]} size={32} />
                  </button>
                </Tip>
              );
            })}
            {a.kind === 'attack' && (a.air || a.naval || a.asuIds.length > 0) && <span className="cmd-chip-sep" />}
            {a.kind === 'attack' && a.air && <Medal icon="plane" label="Air support" size="sm" active={sup.air} tip={['+1 to the defense roll']} onClick={() => set({ air: !sup.air })} />}
            {a.kind === 'attack' && a.naval && <Medal icon="ship" label="Naval gunfire" size="sm" active={sup.naval} tip={[a.navalNote || '+1 to the defense roll']} onClick={() => set({ naval: !sup.naval, battleships: !sup.naval && sup.battleships })} />}
            {a.kind === 'attack' && a.ships && sup.naval && <Medal icon="battleship" label="Valiant & Warspite" size="sm" active={sup.battleships} tip={['+1 more']} onClick={() => set({ battleships: !sup.battleships })} />}
            {a.kind === 'attack' && a.asuIds.length > 0 && (
              <Medal icon="artillery" label="Artillery" size="sm" badge={a.asuIds.length} active={allAsus} onClick={() => set({ asus: allAsus ? [] : [...a.asuIds] })} />
            )}
          </div>
        </Prompt>
        <div className="cmd-buttons">
          <Medal icon="close" label="Cancel" keyHint={key('Esc')} onClick={p.onCancelAttack} />
          {g.phase !== 'invasion' && <Medal icon="army" label="Units" onClick={p.onDetails} />}
        </div>
        <div className="cmd-seal">
          <Medal icon="swords" label={a.kind === 'autoDs' ? 'Overrun' : 'Attack'} size="lg" tone="red" disabled={blocked} keyHint={key('Enter')} onClick={p.onAttack} />
          <span className="cmd-seal-cap">{a.kind === 'autoDs' ? 'Overrun' : 'Attack'}</span>
        </div>
      </>
    );
  } else if (p.advance) {
    const ad = p.advance;
    body = (
      <>
        <Context icon="advance" />
        <Prompt title={ad.limited ? 'Advance · vacated hex' : 'Advance'} sub={!ad.ids.length ? 'No units left' : !ad.sel.length ? `${pick} who advances` : ad.only ? `Into ${ad.only}` : 'Pick a violet hex'}>
          <div className="cmd-chips">
            {ad.ids.map((id) => (
              <Tip key={id} title={def(id).name} pos="above">
                <button className={`token-btn${ad.sel.includes(id) ? ' on' : ''}`} aria-label={def(id).name} onClick={() => ad.toggle(id)}>
                  <TokenIcon unit={p.game.units[id]} size={36} />
                </button>
              </Tip>
            ))}
          </div>
        </Prompt>
        <div className="cmd-buttons">
          {ad.breakthrough && <Medal icon="breakthrough" label="Breakthrough group" onClick={p.onDetails} />}
          {ad.only && <Medal icon="advance" label={`Advance into ${ad.only}`} tone="olive" onClick={() => ad.onAdvance(ad.only!)} />}
        </div>
        {p.end && seal(p.end.armed ? 'Stay put?' : p.end.label, p.end.onClick, { armed: p.end.armed, icon: 'pin' })}
      </>
    );
  } else {
    const u = p.unit;
    const v = u ? values(u) : null;
    body = (
      <>
        {u ? <Context unit={u} /> : <Context icon={p.prompt.icon ?? 'quill'} />}
        {u && v ? (
          <Prompt title={def(u.id).name} sub={p.unitNote}>
            {p.modes.length > 1 && (
              <div className="cmd-chips">
                {p.modes.map((m, i) => (
                  <Medal key={m} icon={MODE_ICON[m]} label={MODE_LABEL[m]} size="sm" active={p.moveMode === m} keyHint={key(String(i + 1))} tip={[MODE_HINT[m]]}
                    onClick={() => p.setMoveMode(m)} />
                ))}
              </div>
            )}
          </Prompt>
        ) : (
          <Prompt title={p.prompt.title} sub={p.prompt.sub} />
        )}
        <div className="cmd-buttons">
          {u && <Medal icon="close" label="Deselect" keyHint={key('Esc')} onClick={p.onDeselect} />}
          {p.orders && (p.orders.sleeping ? (
            <Medal icon="bell" label="Wake" tip={['Needs orders again']} onClick={p.orders.onWake} />
          ) : (
            <>
              {!p.orders.holding && <Medal icon="pin" label="Hold" keyHint={key('H')} tip={['Stand still this phase']} onClick={p.orders.onHold} />}
              <Medal icon="sleep" label="Sleep" keyHint={key('F')} tip={['Hold until woken or the enemy is near']} onClick={p.orders.onSleep} />
            </>
          ))}
          {p.extra.map((x) => <Medal key={x.label} icon={x.icon ?? 'check'} label={x.label} tone={x.primary ? 'olive' : undefined} onClick={x.onClick} />)}
          {p.reserves && p.reserves.count > 0 && <Medal icon="landing" label="Land" badge={p.reserves.count} onClick={p.reserves.onClick} />}
          {p.next && p.next.count > 0 && <Medal icon="next" label={p.next.label} badge={p.next.count} keyHint={key('N')} onClick={p.next.onClick} />}
          <Medal icon="quill" label="Orders" active={p.detailsOpen} onClick={p.onDetails} />
          <Medal icon="undo" label="Undo" keyHint={key('Z')} disabled={!p.canUndo} onClick={p.onUndo} />
        </div>
        {p.end && seal(p.end.armed ? 'End anyway?' : p.end.label, p.end.onClick, { armed: p.end.armed, tip: p.end.warn || undefined })}
      </>
    );
  }
  return (
    <div ref={ref} className={`cmd gilt${p.humanTurn ? '' : ' waiting'}`}>
      {p.end?.armed && (p.end.warn || !!p.end.checks?.length) && (
        <div className="cmd-warn">
          <div className="cmd-warn-head"><Ico name="warning" size={16} />{p.end.warn}</div>
          {!!p.end.checks?.length && (
            <ul>
              {p.end.checks.map((c, i) => (
                <li key={i}><button onClick={() => p.end?.onCheck?.(c.hex)}><Ico name="target" size={14} />{c.text}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="cmd-row">{body}</div>
    </div>
  );
}
