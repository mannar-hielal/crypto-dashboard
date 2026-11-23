import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import styles from './PictureAccordion.module.css';

const HOVER_DELAY_MS = 120;

export interface AccordionItem {
  id: string;
  title: string;
  /** A real capture of the app behind the panel: decorative, the text says it all */
  image: { src: string; width: number; height: number };
  body: ReactNode;
}

/**
 * A vertical accordion of picture panels (owner 2026-11-23): the open panel grows, its picture zooms in
 * and the text sits on it. Hover, focus and tap all open a panel; the arrow keys move between them. The
 * text of a closed panel stays in the page (inert, so a screen reader skips it, a crawler still reads it).
 */
export function PictureAccordion({ items }: { items: readonly AccordionItem[] }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // A mouse opens a panel on hover; a finger only on tap (a touch fires no hover on purpose)
  // after a short pause, so a pointer passing over rows (scrolling the page) does not move them
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onEnter = (i: number, pointerType: string) => {
    clearTimeout(hover.current);
    if (pointerType === 'mouse') hover.current = setTimeout(() => setOpen(i), HOVER_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(hover.current), []);

  const onKey = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowDown'
        ? Math.min(i + 1, last)
        : e.key === 'ArrowUp'
          ? Math.max(i - 1, 0)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setOpen(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className={styles.list}>
      {items.map((it, i) => {
        const isOpen = i === open;
        const panelId = `${base}-p${i}`;
        return (
          <div
            key={it.id}
            className={styles.row}
            data-open={isOpen}
            onPointerEnter={(e) => onEnter(i, e.pointerType)}
            onPointerLeave={() => clearTimeout(hover.current)}
          >
            <img
              className={styles.image}
              src={it.image.src}
              width={it.image.width}
              height={it.image.height}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div className={styles.scrim} aria-hidden="true" />
            <h3 className={styles.heading}>
              <button
                type="button"
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(i)}
                onFocus={() => setOpen(i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className={styles.index} aria-hidden="true">
                  {i + 1}
                </span>
                {it.title}
              </button>
            </h3>
            <div id={panelId} className={styles.body} inert={!isOpen}>
              <div className={styles.bodyInner}>{it.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
