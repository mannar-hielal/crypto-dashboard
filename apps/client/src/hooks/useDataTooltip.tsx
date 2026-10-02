/**
 * `data-tooltip` hover tooltips for every descendant of a container — one delegated listener, no
 * per-element state. Mark an element `data-tooltip="text"` (optional `data-tooltip-delay="ms"`,
 * default 1500) and render the returned node anywhere in the container's component.
 *
 * Placement: `right` (vertical toolbars — LeftToolbar) or `bottom-end` (below, right edges aligned —
 * for controls near the right edge of a horizontal bar, so the tooltip never leaves the viewport).
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { bg, fontSize } from '@/lib/tokens';

export type TooltipPlacement = 'right' | 'bottom-end';

interface TooltipState {
  text: string;
  rect: DOMRect;
}

const DEFAULT_DELAY_MS = 1500;
const GAP_PX = 10;

export function useDataTooltip(
  containerRef: RefObject<HTMLElement | null>,
  placement: TooltipPlacement
): ReactNode {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastEl: HTMLElement | null = null;

    const onMouseOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
      if (!el) {
        if (lastEl) {
          lastEl = null;
          clearTimeout(timeoutRef.current);
          setTooltip(null);
        }
        return;
      }
      if (el === lastEl) return;
      lastEl = el;
      const text = el.getAttribute('data-tooltip') || '';
      const delay = Number(el.getAttribute('data-tooltip-delay')) || DEFAULT_DELAY_MS;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setTooltip({ text, rect: el.getBoundingClientRect() });
      }, delay);
    };

    const onMouseLeave = () => {
      lastEl = null;
      clearTimeout(timeoutRef.current);
      setTooltip(null);
    };

    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('mouseleave', onMouseLeave);
    return () => {
      container.removeEventListener('mouseover', onMouseOver);
      container.removeEventListener('mouseleave', onMouseLeave);
      clearTimeout(timeoutRef.current);
    };
  }, [containerRef]);

  if (!tooltip) return null;

  const { rect, text } = tooltip;
  const position =
    placement === 'right'
      ? {
          top: rect.top + rect.height / 2,
          left: rect.right + GAP_PX,
          transform: 'translateY(-50%)',
        }
      : { top: rect.bottom + GAP_PX, right: window.innerWidth - rect.right };

  return createPortal(
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-[1000] rounded-md border border-white/8 px-2 py-1 font-semibold text-white/80 shadow-xl ${
        placement === 'right' ? 'whitespace-nowrap' : 'max-w-64'
      }`}
      style={{ ...position, fontSize: fontSize.xs10, background: bg.surface }}
    >
      {text}
    </div>,
    document.body
  );
}
