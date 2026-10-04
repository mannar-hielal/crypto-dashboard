/**
 * The drawing tools' popup menu (toolbar flyouts, magnet, Remove, cursor, right-click on a
 * drawing). TradingView-style rows: icon, label, a dimmed shortcut on the right, a check on the
 * chosen one. Accessible: `role="menu"` with `menuitem` / `menuitemradio` rows, focus on the
 * chosen (or first) row when it opens, ↑ / ↓ / Home / End to move, Esc or Tab to close (focus goes
 * back to the button that opened it), a click outside closes it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './DrawingMenu.module.css';

export type MenuEntry =
  | { type: 'header'; id: string; label: string }
  | { type: 'separator'; id: string }
  | {
      type: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      /** Shown dimmed on the right, e.g. "⌥T" */
      shortcut?: string;
      /** Set on the rows of a choice (tool, magnet strength): a radio row, checked or not */
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      /** Extra attributes on the row (data-guide anchors) */
      attrs?: Record<string, string>;
    };

interface DrawingMenuProps {
  /** The menu's accessible name */
  label: string;
  entries: readonly MenuEntry[];
  /** Viewport position of the menu's top-left corner */
  position: { left: number; top: number };
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Puts the focus back on Esc / Tab (on the button that opened the menu) */
  returnFocus?: () => void;
}

/** Room kept between the menu and the viewport's bottom edge */
const VIEWPORT_MARGIN_PX = 8;

function rowsOf(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"],[role="menuitemradio"]')
  ).filter((b) => !b.disabled);
}

export function DrawingMenu({
  label,
  entries,
  position,
  onSelect,
  onClose,
  returnFocus,
}: DrawingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(position.top);

  // Kept inside the viewport: a long flyout opened low on the screen moves up
  useLayoutEffect(() => {
    const h = menuRef.current?.offsetHeight ?? 0;
    const maxTop = window.innerHeight - h - VIEWPORT_MARGIN_PX;
    setTop(Math.max(VIEWPORT_MARGIN_PX, Math.min(position.top, maxTop)));
  }, [position.top, entries.length]);

  // Focus the chosen row, else the first
  useEffect(() => {
    const rows = rowsOf(menuRef.current);
    const chosen = rows.find((r) => r.getAttribute('aria-checked') === 'true');
    (chosen ?? rows[0])?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  function close() {
    onClose();
    returnFocus?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const rows = rowsOf(menuRef.current);
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowDown') next = rows[(i + 1) % rows.length];
    else if (e.key === 'ArrowUp') next = rows[(i - 1 + rows.length) % rows.length];
    else if (e.key === 'Home') next = rows[0];
    else if (e.key === 'End') next = rows.at(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation(); // the chart's Escape (disarm the tool) stays out of it
      close();
      return;
    } else return;
    e.preventDefault();
    next?.focus();
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={{ left: position.left, top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry) => {
        if (entry.type === 'separator') {
          return <div key={entry.id} role="separator" className={styles.separator} />;
        }
        if (entry.type === 'header') {
          return (
            <div key={entry.id} role="presentation" className={styles.header}>
              {entry.label}
            </div>
          );
        }
        const radio = entry.checked !== undefined;
        return (
          <button
            key={entry.id}
            type="button"
            role={radio ? 'menuitemradio' : 'menuitem'}
            aria-checked={radio ? entry.checked : undefined}
            disabled={entry.disabled}
            tabIndex={-1}
            className={`${styles.item}${entry.checked ? ` ${styles.checked}` : ''}${
              entry.danger ? ` ${styles.danger}` : ''
            }`}
            onClick={() => onSelect(entry.id)}
            {...entry.attrs}
          >
            <span className={styles.icon} aria-hidden="true">
              {entry.icon}
            </span>
            <span className={styles.label}>{entry.label}</span>
            {entry.shortcut && <kbd className={styles.shortcut}>{entry.shortcut}</kbd>}
            <span className={styles.check} aria-hidden="true">
              {entry.checked ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
