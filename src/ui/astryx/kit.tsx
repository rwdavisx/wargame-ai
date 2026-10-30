// Small compositions of Astryx components the game's screens share.
import { useCallback, useState, type ReactNode } from 'react';
import { AlertDialog, Heading, SelectableCard, Text, VStack } from '@astryxdesign/core';

/** One choice among several (a scenario, a side, a difficulty), as a selectable card. */
export function ChoiceCard({ selected, onSelect, title, meta, text, icon, label }: {
  selected: boolean; onSelect: () => void; title: ReactNode; meta?: ReactNode; text?: ReactNode; icon?: ReactNode; label?: string;
}) {
  return (
    <SelectableCard label={label ?? (typeof title === 'string' ? title : 'Choice')} isSelected={selected} onChange={() => onSelect()} padding={3} className="choice-card">
      <VStack gap={1}>
        {icon}
        <Heading level={4} className="choice-title">{title}</Heading>
        {meta && <Text type="label" color="accent">{meta}</Text>}
        {text && <Text color="secondary" display="block">{text}</Text>}
      </VStack>
    </SelectableCard>
  );
}

/** A section label in the gold, letter-spaced style of the game's headings. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Heading level={3} className="section-label">{children}</Heading>;
}

interface ConfirmRequest {
  title: string;
  description: string;
  actionLabel: string;
  cancelLabel?: string | null;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Asks the player to confirm (or acknowledge) something in an Astryx alert dialog instead of the browser's own pop-up.
 * Render `dialog` somewhere in the component; `ask` resolves true when the action is chosen.
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((o: Omit<ConfirmRequest, 'resolve'>) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), []);
  const dialog = req ? (
    <AlertDialog isOpen title={req.title} description={req.description} actionLabel={req.actionLabel}
      cancelLabel={req.cancelLabel === null ? undefined : req.cancelLabel ?? 'Cancel'} actionVariant={req.destructive ? 'destructive' : 'primary'}
      onAction={() => { req.resolve(true); setReq(null); }}
      onOpenChange={(open) => { if (!open) { req.resolve(false); setReq(null); } }} />
  ) : null;
  return { dialog, ask };
}
