/**
 * The dashboard's layout widths (`.claude/rules/design.md`, "Responsive layout"). One source for every
 * script that asks; the CSS media queries say the same widths (`TradeMenu.module.css`).
 */

/** Below `lg` (phones and tablets): no docked order form, `MobileTradeBar` opens it */
export const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';

/**
 * From `lg`: the order form docks beside the chart (the tours' desktop steps). Exactly the widths
 * the narrow query doesn't match: a zoomed 1023.5 px viewport is one or the other, never neither
 */
export const WIDE_LAYOUT_QUERY = `not all and ${NARROW_LAYOUT_QUERY}`;
