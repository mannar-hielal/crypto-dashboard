/**
 * Bybit instrument rules (qty step, tick size, minimums) for one market's symbol — for rounding
 * and hints in the order form (APP_LOG Bybit Parity BP-2). The server enforces the same rules.
 *
 * One request per market per page load, shared by every caller; a failed fetch is retried on the
 * next mount. Null until loaded (the form then shows unrounded estimates).
 */

import { useEffect, useState } from 'react';
import { marketApi, type Instrument, type MarketCategory } from '@crypto-dashboard/sdk';

// Bounded: one entry per market (2)
const cache = new Map<MarketCategory, Promise<Instrument[]>>();
// The same lists once loaded, for a synchronous read (bounded the same way)
const loaded = new Map<MarketCategory, Instrument[]>();

function load(category: MarketCategory): Promise<Instrument[]> {
  let pending = cache.get(category);
  if (!pending) {
    pending = marketApi
      .getInstruments(category)
      .then((res) => {
        loaded.set(category, res.instruments);
        return res.instruments;
      })
      .catch((err: unknown) => {
        cache.delete(category); // let a later mount retry
        throw err;
      });
    cache.set(category, pending);
  }
  return pending;
}

/** A symbol's rules if its market's list has already loaded (no request), else null */
export function cachedInstrument(category: MarketCategory, symbol: string): Instrument | null {
  return loaded.get(category)?.find((i) => i.symbol === symbol) ?? null;
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
