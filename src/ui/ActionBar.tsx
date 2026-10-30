// The command bar along the bottom of the battle screen: says what to do next and holds the buttons for it.
import { useEffect, useRef } from 'react';
import { columnLabel, type OddsInfo } from '../engine/combat';
import type { HexId } from '../engine/hex';
import type { GameState, MoveMode, Side, UnitState } from '../engine/types';
import { def, values } from '../engine/units';
import { TokenIcon } from './render/units';
import type { SupportPick } from './play';
import { Button, Icon, Kbd, List, ListItem, ToggleButton } from '@astryxdesign/core';

export type AttackKind = 'attack' | 'autoDs' | 'invasion' | 'breakthrough';

export const MODE_LABEL: Record<MoveMode, string> = {
  normal: 'Normal', extended: 'Extended', tactical: 'Tactical', truck: 'Truck', truckExtended: 'Truck + Ext',
};
const MODE_HINT: Record<MoveMode, string> = {
  normal: 'Full movement; stops on entering an enemy zone of control',
  extended: '+3 MP, never into an enemy zone of control',
  tactical: 'One or two hexes over any terrain',
  truck: 'German infantry on trucks: MA 5 at mechanized rates, no attack this turn',
  truckExtended: 'Trucks plus Extended Movement',
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

  /** What the phase asks for when nothing is selected. */
  prompt: { title: string; sub: string };
  next: { label: string; count: number; onClick: () => void } | null;
  reserves: { count: number; onClick: () => void } | null;
  extra: { label: string; onClick: () => void; primary?: boolean }[];

  onDetails: () => void;
  detailsOpen: boolean;
  canUndo: boolean;
  onUndo: () => void;
  /** `checks`: things to look at before the phase ends, shown (and each jumped to) while End is armed. */
  end: { label: string; armed: boolean; warn: string; onClick: () => void; checks?: { text: string; hex: HexId }[]; onCheck?: (hex: HexId) => void } | null;
}

function oddsText(o: OddsInfo): string {
  if (!o.ok) return '—';
  if (o.autoDs) return 'AUTO DS';
  return o.defense ? columnLabel(o.finalIndex) : 'no defense';
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

  const key = (k: string) => (p.touch ? null : <Kbd keys={k} className="ab-kbd" />);
  // Selecting is a tap or click; moving and attacking may be a right-click.
  const pick = p.touch ? 'Tap' : 'Click';
  const act = p.touch ? 'tap' : p.rightClick ? 'right-click' : 'click';
  const g = p.game;

  let body: React.ReactNode;
  if (!p.humanTurn) {
    body = (
      <>
        <div className="ab-prompt">
          <div className="ab-title">{g.phase === 'gameOver' ? 'Battle over' : `${p.acting} ${g.pendingDefense ? 'is choosing a defense' : 'is moving'}`}</div>
          <div className="ab-sub">{p.aiStatus || 'The camera follows the computer. You can pause it at any time.'}</div>
        </div>
        {g.phase !== 'gameOver' && (
          <div className="ab-buttons">
            <Button label={p.paused ? '▶ Resume' : '❚❚ Pause'} onClick={() => p.setPaused(!p.paused)} />
            <Button label={p.detailsOpen ? 'Hide log' : 'Log'} onClick={p.onDetails} />
          </div>
        )}
      </>
    );
  } else if (p.confirm) {
    body = (
      <>
        <div className="ab-prompt">
          <div className="ab-title">{p.confirm.title}</div>
          <div className="ab-sub">Tap the hex again or press the button. Tap anywhere else to change your mind.</div>
        </div>
        <div className="ab-buttons">
          <Button label="Cancel" onClick={p.onCancelConfirm} />
          <Button label={p.confirm.button} variant="primary" size="lg" className="big-action" onClick={p.onConfirm} />
        </div>
      </>
    );
  } else if (p.attack) {
    const a = p.attack;
    const o = a.odds;
    const sup = a.support;
    const set = (patch: Partial<SupportPick>) => a.setSupport({ ...sup, ...patch });
    const allAsus = a.asuIds.length > 0 && a.asuIds.every((id) => sup.asus?.includes(id));
    body = (
      <>
        <div className="ab-odds">
          <div className={`ab-odds-num${o?.ok ? '' : ' bad'}`}>{o ? oddsText(o) : '…'}</div>
          <div className="ab-odds-sub">{o?.ok ? `${o.attack} vs ${o.defense}${o.defenseNote ? ` (${o.defenseNote})` : ''}${o.drm ? ` · DRM ${o.drm > 0 ? '+' : ''}${o.drm}` : ''}` : 'odds'}</div>
        </div>
        <div className="ab-prompt">
          <div className="ab-title">
            {a.kind === 'autoDs' ? 'Overrun' : a.kind === 'breakthrough' ? 'Breakthrough attack' : 'Attack'} {a.targetName}
          </div>
          <div className="ab-sub">
            {!a.count && a.pool.length ? `No attackers: ${pick.toLowerCase()} a unit below or one of your stacks on the map to add it.`
              : o && !o.ok ? o.reason : a.kind === 'autoDs' && o && !o.autoDs ? 'An overrun needs 10-1 or better.'
              : `${a.count} attacker${a.count === 1 ? '' : 's'} vs ${a.defenders} defender${a.defenders === 1 ? '' : 's'}${o?.shifts.length ? ` · ${o.shifts.map((s) => `${s.reason} ${s.shift > 0 ? '+' : ''}${s.shift}`).join(', ')}` : ''} · ${act} the target again to attack`}
          </div>
          {a.pool.length > 0 && (
            <div className="ab-chips ab-attackers" role="group" aria-label="Attackers">
              {a.pool.map((id) => {
                const on = a.chosen.has(id);
                const u = p.game.units[id];
                const where = u.where.kind === 'map' ? u.where.hex : 'entry area';
                return (
                  <button key={id} className={`token-btn${on ? ' on' : ' off'}`} aria-pressed={on}
                    title={`${def(id).name} (${where}): ${on ? 'attacking; ' + pick.toLowerCase() + ' to leave it out' : 'left out; ' + pick.toLowerCase() + ' to add it'}`}
                    onClick={() => a.toggle(id)}>
                    <TokenIcon unit={u} size={34} />
                  </button>
                );
              })}
            </div>
          )}
          {a.kind === 'attack' && (a.air || a.naval || a.asuIds.length > 0) && (
            <div className="ab-chips">
              {a.air && <ToggleButton label="✈ Air +1 DD" size="sm" isPressed={sup.air} onPressedChange={() => set({ air: !sup.air })} />}
              {a.naval && (
                <ToggleButton label="⚓ Naval +1 DD" size="sm" tooltip={a.navalNote} isPressed={sup.naval} onPressedChange={() => set({ naval: !sup.naval, battleships: !sup.naval && sup.battleships })} />
              )}
              {a.ships && sup.naval && <ToggleButton label="Valiant/Warspite +1" size="sm" isPressed={sup.battleships} onPressedChange={() => set({ battleships: !sup.battleships })} />}
              {a.asuIds.length > 0 && (
                <ToggleButton label={`Artillery ×${a.asuIds.length}`} size="sm" isPressed={allAsus} onPressedChange={() => set({ asus: allAsus ? [] : [...a.asuIds] })} />
              )}
            </div>
          )}
        </div>
        <div className="ab-buttons">
          <Button label="Cancel" onClick={p.onCancelAttack} />
          {g.phase !== 'invasion' && <Button label="Units…" onClick={p.onDetails} />}
          <Button label={a.kind === 'autoDs' ? 'Overrun!' : 'Attack!'} variant="destructive" size="lg" className="big-action danger-action"
            isDisabled={!a.count || !o?.ok || (a.kind === 'autoDs' && !o.autoDs)} onClick={p.onAttack}>
            {a.kind === 'autoDs' ? 'Overrun!' : 'Attack!'} {key('Enter')}
          </Button>
        </div>
      </>
    );
  } else if (p.advance) {
    const ad = p.advance;
    body = (
      <>
        <div className="ab-prompt">
          <div className="ab-title">Advance after combat{ad.limited ? ' (into the vacated hex)' : ''}</div>
          <div className="ab-sub">
            {!ad.ids.length ? 'No units left to advance.'
              : !ad.sel.length ? `${pick} the units below to choose who advances.`
                : ad.only ? `Highlighted units advance into ${ad.only}. ${pick} a unit to leave it behind.`
                  : `${act[0].toUpperCase()}${act.slice(1)} a violet hex to advance the highlighted units there. ${pick} a unit to leave it behind.`}
            {ad.breakthrough ? ' This attack also allows a Breakthrough Group (Breakthrough…).' : ''}
          </div>
          <div className="ab-chips">
            {ad.ids.map((id) => (
              <button key={id} className={`token-btn${ad.sel.includes(id) ? ' on' : ''}`} title={def(id).name} onClick={() => ad.toggle(id)}>
                <TokenIcon unit={p.game.units[id]} size={40} />
              </button>
            ))}
          </div>
        </div>
        <div className="ab-buttons">
          {ad.breakthrough && <Button label="Breakthrough…" onClick={p.onDetails} />}
          {p.end && (
            <Button label={p.end.armed ? 'Stay put?' : p.end.label} variant={ad.only ? 'secondary' : 'primary'} className={`end-btn${p.end.armed ? ' armed' : ''}`} onClick={p.end.onClick} />
          )}
          {ad.only && <Button label={`Advance into ${ad.only}`} variant="primary" size="lg" className="big-action" onClick={() => ad.onAdvance(ad.only!)} />}
        </div>
      </>
    );
  } else {
    const u = p.unit;
    body = (
      <>
        {u ? (
          <div className="ab-prompt">
            <div className="ab-title">
              {def(u.id).name} <span className="ab-vals">{values(u).attack}-{values(u).defense}-{values(u).move}</span>
            </div>
            <div className="ab-sub">{p.unitNote}</div>
            {p.modes.length > 1 && (
              <div className="ab-chips">
                {p.modes.map((m, i) => (
                  <ToggleButton key={m} label={MODE_LABEL[m]} size="sm" tooltip={MODE_HINT[m]} isPressed={p.moveMode === m} onPressedChange={() => p.setMoveMode(m)}>
                    {MODE_LABEL[m]} {key(String(i + 1))}
                  </ToggleButton>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="ab-prompt">
            <div className="ab-title">{p.prompt.title}</div>
            <div className="ab-sub">{p.prompt.sub}</div>
          </div>
        )}
        <div className="ab-buttons">
          {u && <Button label="✕" onClick={p.onDeselect} tooltip={p.rightClick ? 'Deselect (Esc, or right-click elsewhere)' : 'Deselect (Esc / right-click)'} />}
          {p.orders && (p.orders.sleeping ? (
            <Button label="⏰ Wake" className="order-btn" onClick={p.orders.onWake} tooltip="Wake this unit: it will need orders again" />
          ) : (
            <>
              {!p.orders.holding && <Button label="Hold" className="order-btn" onClick={p.orders.onHold} tooltip="Stand still for the rest of this phase (H)">Hold {key('H')}</Button>}
              <Button label="Sleep Zz" className="order-btn" onClick={p.orders.onSleep} tooltip="Hold position on later turns too, until woken or the enemy comes next to it (F)">Sleep Zz {key('F')}</Button>
            </>
          ))}
          {p.extra.map((x) => <Button key={x.label} label={x.label} variant={x.primary ? 'primary' : 'secondary'} onClick={x.onClick} />)}
          {p.reserves && p.reserves.count > 0 && <Button label={`Land (${p.reserves.count})`} onClick={p.reserves.onClick} />}
          {p.next && p.next.count > 0 && <Button label={`${p.next.label} ›`} onClick={p.next.onClick}>{p.next.label} ›{key('N')}</Button>}
          <Button label="Details" className={p.detailsOpen ? 'on' : ''} onClick={p.onDetails} />
          <Button label="↶ Undo" isDisabled={!p.canUndo} tooltip="Undo (Z)" onClick={p.onUndo} />
          {p.end && (
            <Button label={p.end.armed ? 'End anyway?' : p.end.label} variant="primary" className={`end-btn${p.end.armed ? ' armed' : ''}`} onClick={p.end.onClick}
              tooltip={p.end.warn || undefined}>
              {p.end.armed ? 'End anyway?' : p.end.label} {key('Space')}
            </Button>
          )}
        </div>
      </>
    );
  }
  return (
    <div ref={ref} className={`action-bar${p.humanTurn ? '' : ' waiting'}`}>
      {p.end?.armed && (
        <div className="ab-warn">
          {p.end.warn}
          {!!p.end.checks?.length && (
            <List density="compact" className="ab-checks">
              {p.end.checks.map((c, i) => (
                <ListItem key={i} label={c.text} startContent={<Icon icon="warning" color="warning" />} onClick={() => p.end?.onCheck?.(c.hex)} />
              ))}
            </List>
          )}
          {!!p.end.checks?.length && <div className="ab-checks-foot">Press End again to end the phase anyway.</div>}
        </div>
      )}
      <div className="ab-row">{body}</div>
    </div>
  );
}
