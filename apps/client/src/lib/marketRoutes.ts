/**
 * Market URLs of the trading dashboard (APP_LOG Bybit Parity BP-2), Bybit's scheme under /dashboard:
 *
 *   Spot            /dashboard/spot/BTC/USDT   (base / quote, like bybit.com/en/trade/spot/BTC/USDT)
 *   USDT Perpetual  /dashboard/usdt/BTCUSDT    (like bybit.com/en/trade/usdt/BTCUSDT)
 *
 * The URL always shows the active pane's market. Pure helpers — no router, no store.
 */

import type { MarketCategory } from '@crypto-dashboard/sdk';
import { SYMBOLS } from '@/lib/markets';

export const DASHBOARD_PATH = '/dashboard';

export interface Market {
  category: MarketCategory;
  symbol: string;
}

/** The markets we offer — Bybit's product names, never its brand (plan "Naming"). */
export const MARKETS: { category: MarketCategory; title: string; description: string }[] = [
  {
    category: 'spot',
    title: 'Spot',
    description: 'Buy and sell crypto with paper USDT. No leverage.',
  },
  {
    category: 'linear',
    title: 'USDT Perpetual',
    description: 'Go long or short with up to 10× leverage.',
  },
];

const QUOTE = 'USDT';
const KNOWN = new Set<string>(SYMBOLS.map((s) => s.symbol));

/** The base coin of an allow-listed USDT pair (BTCUSDT → BTC). */
function baseOf(symbol: string): string {
  return symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol;
}

/** The dashboard URL of a market. */
export function marketPath({ category, symbol }: Market): string {
  return category === 'spot'
    ? `${DASHBOARD_PATH}/spot/${baseOf(symbol)}/${QUOTE}`
    : `${DASHBOARD_PATH}/usdt/${symbol}`;
}

const SPOT_PATH = /^\/dashboard\/spot\/([A-Za-z0-9]{1,12})\/([A-Za-z]{1,8})\/?$/;
const USDT_PATH = /^\/dashboard\/usdt\/([A-Za-z0-9]{1,20})\/?$/;

/**
 * The market a dashboard URL names, or null when it names none we trade (unknown coin, a quote
 * other than USDT, a malformed path). Case-insensitive: `canonical` is the URL to show, so a
 * caller can replace a non-canonical one (e.g. /dashboard/spot/btc/usdt).
 */
export function parseMarketPath(pathname: string): (Market & { canonical: string }) | null {
  let market: Market | null = null;
  const spot = SPOT_PATH.exec(pathname);
  if (spot) {
    const [, base, quote] = spot;
    if (quote.toUpperCase() === QUOTE) {
      market = { category: 'spot', symbol: `${base.toUpperCase()}${QUOTE}` };
    }
  }
  const usdt = USDT_PATH.exec(pathname);
  if (usdt) market = { category: 'linear', symbol: usdt[1].toUpperCase() };
  if (!market || !KNOWN.has(market.symbol)) return null;
  return { ...market, canonical: marketPath(market) };
}

/**
 * 🔐 Where a sign-in may send the user back to: only a dashboard market URL we trade. Anything
 * else (another origin, `//evil.example`, an arbitrary path) is refused — no open redirect.
 */
export function safeReturnPath(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  return parseMarketPath(from)?.canonical ?? null;
}

/**
 * The page-transition key (App.tsx): one per page, not per URL. Every market URL is the same
 * dashboard, so switching market or symbol must not unmount it — charts, feeds and the order form
 * stay mounted.
 */
export function routeKey(pathname: string): string {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`)
    ? DASHBOARD_PATH
    : pathname;
}
