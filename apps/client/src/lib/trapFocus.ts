import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Whether Tab can really reach it: in the tab order, shown, not inert (a Next still waiting for
 * its cold open is none of these) */
function tabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0 || el.closest('[inert], [aria-hidden="true"], [hidden]')) return false;
  // display: none or visibility: hidden, where the browser can tell (jsdom can't: it lays nothing out)
  return typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ visibilityProperty: true })
    : true;
}

/**
 * Tab stays inside a dialog while it's open: from the last control to the first and back. The
 * dialog itself (focused when it opens, `tabIndex={-1}`) counts as before the first. Only the two
 * ends are looked for, from each side.
 */
export function trapFocus(e: ReactKeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return;
  const all = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = all.find(tabbable);
  const last = all.findLast(tabbable);
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
