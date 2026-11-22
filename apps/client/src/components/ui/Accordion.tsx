import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import styles from './Accordion.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccordionItem {
  id: string;
  question: string;
  /** What shows when the row is open */
  content: ReactNode;
}

interface AccordionProps {
  items: readonly AccordionItem[];
  /** The level of each row's heading: one below the section's own heading (h2 → 3) */
  headingLevel?: 3 | 4;
  /** Ids open from the start */
  defaultOpen?: readonly string[];
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * A disclosure list, built to the WAI-ARIA accordion pattern: each question is a button inside a
 * heading, with `aria-expanded` and `aria-controls`; Up / Down / Home / End move between the
 * buttons, Enter and Space toggle (a native button does that). Rows open independently. The panel
 * is `hidden` while closed, so its links leave the tab order.
 */
export function Accordion({ items, headingLevel = 3, defaultOpen = [] }: AccordionProps) {
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpen));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // Drop stale buttons when the list shrinks, so Up / Down / Home / End never land on a detached one
  useEffect(() => {
    buttons.current.length = Math.min(buttons.current.length, items.length);
  }, [items.length]);
  const Heading = `h${headingLevel}` as 'h3' | 'h4';

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const target =
      e.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <div className={styles.list}>
      {items.map((item, index) => {
        const isOpen = open.has(item.id);
        const buttonId = `${base}-${item.id}-button`;
        const panelId = `${base}-${item.id}-panel`;
        return (
          <div key={item.id} className={`${styles.row}${isOpen ? ` ${styles.rowOpen}` : ''}`}>
            <Heading className={styles.heading}>
              <button
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                id={buttonId}
                type="button"
                className={styles.button}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
              >
                <span className={styles.question}>{item.question}</span>
                <ChevronDown className={styles.chevron} aria-hidden="true" />
              </button>
            </Heading>
            <div id={panelId} className={styles.panel} hidden={!isOpen}>
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
