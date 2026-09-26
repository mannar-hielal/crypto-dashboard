/**
 * TradeMenu — the header's market menu ("Trade ▾"), like Bybit's (BYBIT_PARITY_PLAN BP-2).
 *
 * Switches the active pane between Spot and USDT Perpetual, keeping its symbol. On the dashboard
 * that also moves the URL (useMarketUrlSync); on the public /chart page it only switches the pane.
 *
 * Keyboard: Enter / Space / ArrowDown open it and focus the current market, ArrowUp / ArrowDown
 * move, Escape closes and returns focus to the trigger. A click outside closes it.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { MarketCategory } from '@crypto-dashboard/sdk';
import { useLayoutStore } from '@/store/layoutStore';
import { fontSize, zIndex } from '@/lib/tokens';
import { MARKETS } from '@/lib/marketRoutes';
import styles from './TradeMenu.module.css';

export function TradeMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const category = useLayoutStore((s) => (s.panes[s.activePane] ?? s.panes[0]).category);
  const currentIndex = Math.max(
    0,
    MARKETS.findIndex((m) => m.category === category)
  );

  // Focus the current market when the panel opens
  useEffect(() => {
    if (open) itemRefs.current[currentIndex]?.focus();
  }, [open, currentIndex]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(next: MarketCategory) {
    const { activePane, panes, setPaneMarket } = useLayoutStore.getState();
    const pane = panes[activePane] ?? panes[0];
    setPaneMarket(activePane, next, pane.symbol);
    close(true);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onPanelKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const focused = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = (focused + step + MARKETS.length) % MARKETS.length;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        style={{ fontSize: fontSize.xs }}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        Trade
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div
            className={styles.backdrop}
            style={{ zIndex: zIndex.dropdown - 1 }}
            onClick={() => close(false)}
            aria-hidden="true"
          />
          <ul
            id={panelId}
            className={styles.panel}
            style={{ zIndex: zIndex.dropdown }}
            aria-label="Markets"
            onKeyDown={onPanelKeyDown}
          >
            {MARKETS.map((m, i) => {
              const current = m.category === category;
              return (
                <li key={m.category}>
                  <button
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    className={styles.item}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => choose(m.category)}
                  >
                    <span className={styles.text}>
                      <span className={styles.title} style={{ fontSize: fontSize.xs }}>
                        {m.title}
                      </span>
                      <span className={styles.description} style={{ fontSize: fontSize.xs11 }}>
                        {m.description}
                      </span>
                    </span>
                    {current && <Check className={styles.check} size={14} aria-hidden="true" />}
                    <ChevronRight className={styles.arrow} size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
