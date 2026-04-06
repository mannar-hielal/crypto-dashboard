/**
 * Shared server-side constants.
 *
 * Single source of truth for allowed symbols — imported by both the Bybit
 * plugin (for WS subscriptions) and the market routes (for REST/WS allowlist
 * validation). Keeping them in sync here prevents drift where a symbol is
 * allowed via REST but never subscribed for live data (or vice-versa).
 */

export const ALLOWED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
] as const;

export type AllowedSymbol = (typeof ALLOWED_SYMBOLS)[number];
