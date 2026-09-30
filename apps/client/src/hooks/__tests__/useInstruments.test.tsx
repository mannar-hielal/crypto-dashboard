/**
 * useInstrument unit tests — the SDK is mocked, so the result never depends on a server that
 * happens to be listening on the API port (a local dev server made the failure path go uncovered).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Instrument } from '@crypto-dashboard/sdk';

const getInstruments = vi.fn();

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  marketApi: { getInstruments: (...args: unknown[]) => getInstruments(...args) },
}));

const BTC: Instrument = {
  symbol: 'BTCUSDT',
  category: 'linear',
  tickSize: 0.1,
  qtyStep: 0.001,
  minOrderQty: 0.001,
  minNotional: 5,
  maxLeverage: 100,
  fundingIntervalMin: 480,
};

/** Let every pending promise (the fetch, its .then / .catch, the hook's) run to the end */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

// The hook caches per market for the page's lifetime: a fresh module per test
async function loadHook() {
  vi.resetModules();
  return (await import('@/hooks/useInstruments')).useInstrument;
}

describe('useInstrument', () => {
  beforeEach(() => getInstruments.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('should return the symbol’s instrument when the market loads', async () => {
    getInstruments.mockResolvedValue({ category: 'linear', instruments: [BTC] });
    const useInstrument = await loadHook();
    const { result } = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await waitFor(() => expect(result.current).toEqual(BTC));
  });

  it('should return null when the symbol is not in the market', async () => {
    getInstruments.mockResolvedValue({ category: 'linear', instruments: [BTC] });
    const useInstrument = await loadHook();
    const eth = renderHook(() => useInstrument('linear', 'ETHUSDT'));
    // A BTC hook on the same request loading proves the list arrived before ETH's null is read
    const btc = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await waitFor(() => expect(btc.result.current).toEqual(BTC));
    await settle();
    expect(eth.result.current).toBeNull();
  });

  it('should share one request per market across callers', async () => {
    getInstruments.mockResolvedValue({ category: 'linear', instruments: [BTC] });
    const useInstrument = await loadHook();
    const a = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    const b = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await waitFor(() => expect(a.result.current).toEqual(BTC));
    await waitFor(() => expect(b.result.current).toEqual(BTC));
    expect(getInstruments).toHaveBeenCalledTimes(1);
  });

  it('should return null and retry on the next mount when the fetch fails', async () => {
    getInstruments.mockRejectedValueOnce(new Error('offline'));
    const useInstrument = await loadHook();
    const first = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await settle();
    expect(first.result.current).toBeNull();
    first.unmount();

    getInstruments.mockResolvedValueOnce({ category: 'linear', instruments: [BTC] });
    const second = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await waitFor(() => expect(second.result.current).toEqual(BTC));
    expect(getInstruments).toHaveBeenCalledTimes(2);
  });

  it('should ignore a slower request for the market it no longer shows', async () => {
    const SPOT_BTC: Instrument = { ...BTC, category: 'spot', tickSize: 0.01 };
    let resolveLinear: (v: unknown) => void = () => {};
    getInstruments.mockImplementation((category: string) =>
      category === 'linear'
        ? new Promise((r) => (resolveLinear = r))
        : Promise.resolve({ category: 'spot', instruments: [SPOT_BTC] })
    );
    const useInstrument = await loadHook();
    const { result, rerender } = renderHook(
      ({ category }: { category: 'linear' | 'spot' }) => useInstrument(category, 'BTCUSDT'),
      { initialProps: { category: 'linear' as 'linear' | 'spot' } }
    );
    rerender({ category: 'spot' });
    await waitFor(() => expect(result.current).toEqual(SPOT_BTC));
    // The linear answer arrives late: the hook has moved on, so it must not overwrite spot's
    resolveLinear({ category: 'linear', instruments: [BTC] });
    await settle();
    expect(result.current).toEqual(SPOT_BTC);
  });
});
