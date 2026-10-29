// The command bar along the bottom of the battle screen: says what to do next and holds the buttons for it.
import { useEffect, useRef } from 'react';
import { columnLabel, type OddsInfo } from '../engine/combat';
import type { HexId } from '../engine/hex';
import type { GameState, MoveMode, Side, UnitState } from '../engine/types';
import { def, values } from '../engine/units';
import { TokenIcon } from './render/units';
import type { SupportPick } from './play';

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
  end: { label: string; armed: boolean; warn: string; onClick: () => void } | null;
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

  const key = (k: string) => (p.touch ? null : <kbd>{k}</kbd>);
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
            <button onClick={() => p.setPaused(!p.paused)}>{p.paused ? '▶ Resume' : '❚❚ Pause'}</button>
            <button onClick={p.onDetails}>{p.detailsOpen ? 'Hide log' : 'Log'}</button>
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
          <button onClick={p.onCancelConfirm}>Cancel</button>
          <button className="primary big-action" onClick={p.onConfirm}>{p.confirm.button}</button>
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
            {o && !o.ok ? o.reason : a.kind === 'autoDs' && o && !o.autoDs ? 'An overrun needs 10-1 or better.'
              : `${a.count} attacker${a.count === 1 ? '' : 's'} vs ${a.defenders} defender${a.defenders === 1 ? '' : 's'}${o?.shifts.length ? ` · ${o.shifts.map((s) => `${s.reason} ${s.shift > 0 ? '+' : ''}${s.shift}`).join(', ')}` : ''} · ${p.touch ? 'tap' : 'click'} the target again to attack`}
          </div>
          {a.kind === 'attack' && (a.air || a.naval || a.asuIds.length > 0) && (
            <div className="ab-chips">
              {a.air && <button className={`chip-btn${sup.air ? ' on' : ''}`} onClick={() => set({ air: !sup.air })}>✈ Air +1 DD</button>}
              {a.naval && (
                <button className={`chip-btn${sup.naval ? ' on' : ''}`} title={a.navalNote} onClick={() => set({ naval: !sup.naval, battleships: !sup.naval && sup.battleships })}>
                  ⚓ Naval +1 DD
                </button>
              )}
              {a.ships && sup.naval && <button className={`chip-btn${sup.battleships ? ' on' : ''}`} onClick={() => set({ battleships: !sup.battleships })}>Valiant/Warspite +1</button>}
              {a.asuIds.length > 0 && (
                <button className={`chip-btn${allAsus ? ' on' : ''}`} onClick={() => set({ asus: allAsus ? [] : [...a.asuIds] })}>
                  Artillery ×{a.asuIds.length}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="ab-buttons">
          <button onClick={p.onCancelAttack}>Cancel</button>
          {g.phase !== 'invasion' && <button onClick={p.onDetails}>Units…</button>}
          <button className="primary big-action danger-action" disabled={!o?.ok || (a.kind === 'autoDs' && !o.autoDs)} onClick={p.onAttack}>
            {a.kind === 'autoDs' ? 'Overrun!' : 'Attack!'} {key('Enter')}
          </button>
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
              : !ad.sel.length ? 'Tap the units below to choose who advances.'
                : ad.only ? `Highlighted units advance into ${ad.only}. Tap a unit to leave it behind.`
                  : `${p.touch ? 'Tap' : 'Click'} a violet hex to advance the highlighted units there. Tap a unit to leave it behind.`}
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
          {ad.breakthrough && <button onClick={p.onDetails}>Breakthrough…</button>}
          {p.end && (
            <button className={ad.only ? `end-btn${p.end.armed ? ' armed' : ''}` : `primary end-btn${p.end.armed ? ' armed' : ''}`} onClick={p.end.onClick}>
              {p.end.armed ? 'Stay put?' : p.end.label}
            </button>
          )}
          {ad.only && <button className="primary big-action" onClick={() => ad.onAdvance(ad.only!)}>Advance into {ad.only}</button>}
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
                  <button key={m} className={`chip-btn${p.moveMode === m ? ' on' : ''}`} title={MODE_HINT[m]} onClick={() => p.setMoveMode(m)}>
                    {MODE_LABEL[m]} {key(String(i + 1))}
                  </button>
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
          {u && <button onClick={p.onDeselect} title="Deselect (Esc / right-click)">✕</button>}
          {p.extra.map((x) => <button key={x.label} className={x.primary ? 'primary' : ''} onClick={x.onClick}>{x.label}</button>)}
          {p.reserves && p.reserves.count > 0 && <button onClick={p.reserves.onClick}>Land ({p.reserves.count})</button>}
          {p.next && p.next.count > 0 && <button onClick={p.next.onClick}>{p.next.label} ›{key('N')}</button>}
          <button onClick={p.onDetails} className={p.detailsOpen ? 'on' : ''}>Details</button>
          <button onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Z)">↶ Undo</button>
          {p.end && (
            <button className={`primary end-btn${p.end.armed ? ' armed' : ''}`} onClick={p.end.onClick} title={p.end.warn}>
              {p.end.armed ? 'End anyway?' : p.end.label} {key('Space')}
            </button>
          )}
        </div>
      </>
    );
  }
  return (
    <div ref={ref} className={`action-bar${p.humanTurn ? '' : ' waiting'}`}>
      {p.end?.armed && <div className="ab-warn">{p.end.warn}</div>}
      <div className="ab-row">{body}</div>
    </div>
  );
}
