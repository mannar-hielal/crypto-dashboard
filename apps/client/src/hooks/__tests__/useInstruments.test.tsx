/**
 * useInstrument unit tests — the SDK is mocked, so the result never depends on a server that
 * happens to be listening on the API port (a local dev server made the failure path go uncovered).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
    const { result } = renderHook(() => useInstrument('linear', 'ETHUSDT'));
    await waitFor(() => expect(getInstruments).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
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
    await waitFor(() => expect(getInstruments).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeNull();
    first.unmount();

    getInstruments.mockResolvedValueOnce({ category: 'linear', instruments: [BTC] });
    const second = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    await waitFor(() => expect(second.result.current).toEqual(BTC));
    expect(getInstruments).toHaveBeenCalledTimes(2);
  });

  it('should not update after unmount', async () => {
    let resolve: (v: unknown) => void = () => {};
    getInstruments.mockReturnValue(new Promise((r) => (resolve = r)));
    const useInstrument = await loadHook();
    const { result, unmount } = renderHook(() => useInstrument('linear', 'BTCUSDT'));
    unmount();
    resolve({ category: 'linear', instruments: [BTC] });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
