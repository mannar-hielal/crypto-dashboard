/**
 * Bybit instrument rules (qty step, tick size, minimums) for one market's symbol — for rounding
 * and hints in the order form (BYBIT_PARITY_PLAN BP-2). The server enforces the same rules.
 *
 * One request per market per page load, shared by every caller; a failed fetch is retried on the
 * next mount. Null until loaded (the form then shows unrounded estimates).
 */

import { useEffect, useState } from 'react';
import { marketApi, type Instrument, type MarketCategory } from '@crypto-dashboard/sdk';

// Bounded: one entry per market (2)
const cache = new Map<MarketCategory, Promise<Instrument[]>>();

function load(category: MarketCategory): Promise<Instrument[]> {
  let pending = cache.get(category);
  if (!pending) {
    pending = marketApi
      .getInstruments(category)
      .then((res) => res.instruments)
      .catch((err: unknown) => {
        cache.delete(category); // let a later mount retry
        throw err;
      });
    cache.set(category, pending);
  }
  return pending;
}

export function useInstrument(category: MarketCategory, symbol: string): Instrument | null {
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  useEffect(() => {
    let cancelled = false;
    load(category)
      .then((list) => {
        if (!cancelled) setInstrument(list.find((i) => i.symbol === symbol) ?? null);
      })
      .catch(() => {
        if (!cancelled) setInstrument(null);
      });
    return () => {
      cancelled = true;
    };
  }, [category, symbol]);
  return instrument;
}
