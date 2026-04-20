/**
 * useDocumentTitle
 *
 * Keeps document.title in sync with the active pane's live price.
 * Format: "▲ BTC/USDT 75,249.90 +1.96% · CryptoDash"
 *         "▼ BTC/USDT 75,249.90 −0.03% · CryptoDash"
 *
 * Uses the same 4-unconditional-useStore pattern as SymbolBar so hook
 * call count never changes regardless of activePane value.
 */

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1_000)
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/** "BTCUSDT" → "BTC/USDT" */
function splitSymbol(symbol: string): string {
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;
  return symbol;
}

const APP_NAME = 'CryptoDash';
const DEFAULT_TITLE = APP_NAME;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDocumentTitle() {
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);

  // 4 unconditional reads — hook count is always stable (mirrors SymbolBar pattern)
  const d0 = useStore(paneStores[0], (s) => ({ price: s.latestPrice, change: s.priceChange }));
  const d1 = useStore(paneStores[1], (s) => ({ price: s.latestPrice, change: s.priceChange }));
  const d2 = useStore(paneStores[2], (s) => ({ price: s.latestPrice, change: s.priceChange }));
  const d3 = useStore(paneStores[3], (s) => ({ price: s.latestPrice, change: s.priceChange }));

  const allData = [d0, d1, d2, d3] as const;
  const { price: latestPrice, change: priceChange } = allData[activePane];

  useEffect(() => {
    if (latestPrice === null) {
      document.title = DEFAULT_TITLE;
      return;
    }

    const isPositive = (priceChange ?? 0) >= 0;
    // ▲ green-style solid up-arrow / ▼ solid down-arrow — universally supported Unicode
    const arrow = isPositive ? '▲' : '▼';
    const priceStr = formatPrice(latestPrice);

    let pctStr = '';
    if (priceChange !== null) {
      const prevClose = latestPrice - priceChange;
      if (prevClose !== 0) {
        const pct = (priceChange / prevClose) * 100;
        const sign = pct >= 0 ? '+' : '−';
        pctStr = ` ${sign}${Math.abs(pct).toFixed(2)}%`;
      }
    }

    document.title = `${arrow} ${splitSymbol(symbol)} ${priceStr}${pctStr} · ${APP_NAME}`;

    // Restore on unmount (user navigates away from dashboard)
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [symbol, latestPrice, priceChange]);
}
