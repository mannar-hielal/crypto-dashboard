/**
 * Guide anchors — one stable name per user-facing control, set on the element as
 * `data-guide="<area>.<control>[.<variant>]"` (docs/TEST_IMPLEMENTATION_PLAN.md F1).
 *
 * One vocabulary for three readers: Playwright (e2e), RTL tests and the guided tour. Names describe
 * what the control means to the user, never how it looks. Row-level controls keep a static name and
 * put the row's identity in `data-guide-key` (`positions.row` + `linear:BTCUSDT`).
 *
 * Anchors ship to production (the tour needs them): never put user data in a name or a key.
 * Renaming one breaks tours — add the new name, migrate, then remove the old one.
 */

// ─── Registry ────────────────────────────────────────────────────────────────
export const GUIDE_ANCHORS = [
  // auth
  'auth.register.username',
  'auth.register.email',
  'auth.register.password',
  'auth.register.submit',
  'auth.register.field-error',
  'auth.login.email',
  'auth.login.password',
  'auth.login.submit',
  'auth.login.error',
  'auth.login.forgot-link',
  'auth.forgot.email',
  'auth.forgot.submit',
  'auth.forgot.message',
  'auth.reset.password',
  'auth.reset.submit',
  'auth.verify.status',
  'auth.unverified.resend',
  'auth.unverified.sign-out',
  // nav
  'nav.user-menu',
  'nav.settings',
  'nav.sign-out',
  'nav.trade-menu',
  'nav.trade-menu.option',
  // settings
  'settings.username.input',
  'settings.username.save',
  'settings.email.input',
  'settings.email.save',
  'settings.password.current',
  'settings.password.new',
  'settings.password.save',
  'settings.export',
  'settings.delete',
  'settings.delete.confirm',
  'settings.delete.cancel',
  'settings.close',
  // symbolbar
  'symbolbar.symbol-picker',
  'symbolbar.symbol-option',
  'symbolbar.trade-toggle',
  'symbolbar.funding',
  'symbolbar.mark',
  'symbolbar.index',
  // layout
  'layout.picker',
  'layout.option',
  'layout.sync',
  // chart
  'chart.type-menu',
  'chart.mark-line',
  // pane
  'pane',
  'pane.header.symbol',
  'pane.header.symbol-option',
  'pane.header.interval-picker',
  'pane.header.interval',
  'pane.header.price',
  'pane.header.change',
  'pane.header.dot',
  'pane.chart',
  // trade
  'trade.market.spot',
  'trade.market.perp',
  'trade.leverage-chip',
  'trade.side.sell',
  'trade.side.buy',
  'trade.spread',
  'trade.type.market',
  'trade.type.limit',
  'trade.type.stop',
  'trade.price',
  'trade.amount',
  'trade.amount-unit',
  'trade.size-step',
  'trade.exits.toggle',
  'trade.tp.enable',
  'trade.tp.price',
  'trade.tp.source',
  'trade.sl.enable',
  'trade.sl.price',
  'trade.sl.source',
  'trade.reduce-only',
  'trade.close-on-trigger',
  'trade.preview.cost',
  'trade.preview.fees',
  'trade.preview.liq',
  'trade.warning',
  'trade.error',
  'trade.submit',
  'trade.sl-confirm',
  'trade.sl-confirm.anyway',
  'trade.close-panel',
  // leverage
  'leverage.mode',
  'leverage.input',
  'leverage.preview',
  'leverage.tier-info',
  'leverage.error',
  'leverage.confirm',
  // account
  'account.tab',
  'account.tab.badge',
  'account.summary.balance',
  'account.summary.equity',
  'account.summary.upnl',
  'account.summary.mm-rate',
  'account.sound',
  'account.settings',
  'account.collapse',
  'account.maximize',
  'account.columns',
  // acct-settings
  'acct-settings.modal',
  'acct-settings.name',
  'acct-settings.fees',
  'acct-settings.reset',
  'acct-settings.done',
  'acct-settings.close',
  'acct-settings.backdrop',
  'acct-settings.error',
  // positions
  'positions.row',
  'positions.row.pnl',
  'positions.row.mark',
  'positions.row.liq',
  'positions.row.tp',
  'positions.row.sl',
  'positions.row.funding',
  'positions.row.edit-exits',
  'positions.row.adjust-margin',
  'positions.row.close',
  // assets
  'assets.row',
  'assets.row.free',
  'assets.row.locked',
  'assets.row.avg-cost',
  'assets.row.upnl',
  'assets.row.sell',
  'assets.row.tpsl',
  // closed-pnl
  'closed-pnl.row',
  'closed-pnl.value',
  'closed-pnl.exit-type',
  // orders
  'orders.subtab',
  'orders.subtab.count',
  'orders.row',
  'orders.row.status',
  'orders.row.cancel',
  'orders.row.edit',
  // order-history
  'order-history.row',
  'order-history.row.type',
  'order-history.row.status',
  'order-history.row.fill-price',
  'order-history.row.commission',
  // balance-history
  'balance-history.row',
  // journal
  'journal.entry',
  'journal.entry.pnl',
  'journal.add-note',
  'journal.note-input',
  // pos-edit
  'pos-edit.tp',
  'pos-edit.sl',
  'pos-edit.warning',
  'pos-edit.confirm',
  // order-edit
  'order-edit.price',
  'order-edit.qty',
  'order-edit.confirm',
  // margin
  'margin.mode',
  'margin.amount',
  'margin.max',
  'margin.preview',
  'margin.confirm',
  // spot-exits
  'spot-exits.qty',
  'spot-exits.tp',
  'spot-exits.sl',
  'spot-exits.confirm',
  // notice
  'notice.cross-margin',
  'notice.cross-margin.switch',
  'notice.liquidation-intro',
  'notice.liquidation',
  'notice.dismiss',
] as const;

export type GuideAnchor = (typeof GUIDE_ANCHORS)[number];

const KNOWN: ReadonlySet<string> = new Set(GUIDE_ANCHORS);

/** True when `name` is a registered anchor (for data read at runtime, e.g. a tour file). */
export function isGuideAnchor(name: string): name is GuideAnchor {
  return KNOWN.has(name);
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export type GuideProps =
  | { 'data-guide': GuideAnchor }
  | { 'data-guide': GuideAnchor; 'data-guide-key': string };

/**
 * Props to spread onto the control: `<button {...guide('trade.submit')}>`, or for a row
 * `<tr {...guide('positions.row', 'linear:BTCUSDT')}>`. Always use this, never a raw string.
 */
export function guide(anchor: GuideAnchor, key?: string): GuideProps {
  return key === undefined
    ? { 'data-guide': anchor }
    : { 'data-guide': anchor, 'data-guide-key': key };
}

/** The CSS selector for an anchor (and optional row key) — for tests and the tour overlay. */
export function guideSelector(anchor: GuideAnchor, key?: string): string {
  return key === undefined
    ? `[data-guide="${anchor}"]`
    : `[data-guide="${anchor}"][data-guide-key="${key.replace(/["\\]/g, '\\$&')}"]`;
}
