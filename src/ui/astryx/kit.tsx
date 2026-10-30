// Small compositions of Astryx components the game's screens share.
import type { ReactNode } from 'react';
import { Heading, SelectableCard, Text, VStack } from '@astryxdesign/core';

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
