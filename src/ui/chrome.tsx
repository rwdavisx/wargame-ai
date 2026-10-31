// The interface's own furniture: round gilt medallion buttons, tooltips that carry the detail the screen leaves
// out, the Greek key band that edges the top bar, and the stat readouts (an icon and a number).
import type { ReactNode } from 'react';
import { Ico } from './icons';

/** Hover (or keyboard focus) detail for whatever it wraps: a title in capitals and a few short lines. */
export function Tip({ title, lines, children, pos = 'below', className }: {
  title?: ReactNode; lines?: ReactNode[]; children: ReactNode; pos?: 'below' | 'above' | 'left' | 'right'; className?: string;
}) {
  const has = !!title || !!lines?.some(Boolean);
  return (
    <span className={`has-tip${className ? ` ${className}` : ''}`}>
      {children}
      {has && (
        <span className={`tip tip-${pos}`} role="tooltip">
          {title && <b>{title}</b>}
          {lines?.filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}
        </span>
      )}
    </span>
  );
}

/** A round gilt-rimmed icon button. `badge` shows a count on its rim; `size` lg is the end-phase seal. */
export function Medal({ icon, label, onClick, active, disabled, badge, size = 'md', tone, tip, keyHint, pos, className }: {
  icon: string; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; badge?: number | string; size?: 'sm' | 'md' | 'lg';
  tone?: 'gold' | 'red' | 'olive'; tip?: ReactNode[]; keyHint?: string; pos?: 'below' | 'above' | 'left' | 'right'; className?: string;
}) {
  const px = size === 'lg' ? 30 : size === 'sm' ? 16 : 20;
  return (
    <Tip title={keyHint ? <>{label} <kbd>{keyHint}</kbd></> : label} lines={tip} pos={pos ?? 'above'}>
      <button type="button" className={`medal ${size}${active ? ' on' : ''}${tone ? ` ${tone}` : ''}${className ? ` ${className}` : ''}`}
        aria-label={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled} onClick={onClick}>
        <Ico name={icon} size={px} />
        {badge !== undefined && badge !== 0 && <i className="medal-badge">{badge}</i>}
      </button>
    </Tip>
  );
}

/** An icon with a number beside it, the way a strategy game shows a resource. */
export function Stat({ icon, value, sub, tone, className }: { icon: string; value: ReactNode; sub?: ReactNode; tone?: string; className?: string }) {
  return (
    <span className={`stat${tone ? ` ${tone}` : ''}${className ? ` ${className}` : ''}`}>
      <Ico name={icon} size={18} />
      <b>{value}</b>
      {sub !== undefined && <small>{sub}</small>}
    </span>
  );
}

/** The Greek key (meander) band, as on Roman mosaics: a gilt line along an edge. */
export function Meander({ height = 8, className }: { height?: number; className?: string }) {
  const id = `meander-${height}`;
  return (
    <svg className={`meander${className ? ` ${className}` : ''}`} width="100%" height={height} aria-hidden preserveAspectRatio="none">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={height * 1.5} height={height}>
          <path d={`M0 ${height - 1}h${height * 1.5}M${height * 0.12} ${height - 1}V1h${height * 1.05}v${height * 0.62}h-${height * 0.62}V${height * 0.4}`}
            fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="square" />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}

/** A small engraved rule with a lozenge in the middle, between a heading and what follows. */
export function Rule({ className }: { className?: string }) {
  return (
    <div className={`rule${className ? ` ${className}` : ''}`} aria-hidden>
      <i /><b /><i />
    </div>
  );
}

/** A menu entry: an icon in a gilt ring and a name in Roman capitals. */
export function MenuButton({ icon, label, onClick, primary, danger }: { icon: string; label: string; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button className={`menu-btn${primary ? ' primary' : ''}${danger ? ' danger' : ''}`} onClick={onClick}>
      <span className="menu-ring"><Ico name={icon} size={18} /></span>
      <span className="menu-label">{label}</span>
      <Ico name="chevronRight" size={16} className="menu-go" />
    </button>
  );
}
