import { useMemo } from 'react';

import { Accordion, type AccordionItem } from '@/components/ui/Accordion';
import type { FaqItem } from '@/lib/landingContent';
import type { GuideAnchor } from '@/lib/guideAnchors';
import { StartLink } from './StartLink';
import styles from './FaqList.module.css';

interface FaqListProps {
  items: readonly FaqItem[];
  live: boolean;
  anchor: GuideAnchor;
  /** Ids open from the start */
  defaultOpen?: readonly string[];
}

/** Questions as an accordion; each answer ends in its own "Start here" button */
export function FaqList({ items, live, anchor, defaultOpen }: FaqListProps) {
  const rows = useMemo<AccordionItem[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        question: item.question,
        content: (
          <>
            <p className={styles.answer}>{item.answer}</p>
            {item.cta && (
              <StartLink
                cta={item.cta}
                live={live}
                variant="text"
                anchor={anchor}
                anchorKey={item.id}
              />
            )}
          </>
        ),
      })),
    [items, live, anchor]
  );
  return <Accordion items={rows} {...(defaultOpen && { defaultOpen })} />;
}
