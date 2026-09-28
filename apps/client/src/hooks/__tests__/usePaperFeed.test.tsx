/**
 * usePaperFeed tests (APP_LOG Bybit Parity BP-1) — the private paper-trading WebSocket.
 * A mock WebSocket stands in for the server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaperFeed } from '../usePaperFeed';
import { useAuthStore } from '@/store/authStore';
import { usePaperStore } from '@/store/paperStore';
import { emptyState } from '@/test/fakePaperApi';

const sounds = {
  playOrderPlaced: vi.fn(),
  playOrderQueued: vi.fn(),
  playOrderFilled: vi.fn(),
  playProfit: vi.fn(),
  playLoss: vi.fn(),
  playLiquidation: vi.fn(),
};
vi.mock('@/hooks/TradingSoundContext', () => ({ useSoundActions: () => sounds }));

vi.mock('@/lib/session', () => ({ refreshAccessToken: vi.fn(async () => 'fresh-token') }));

vi.mock('@crypto-dashboard/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@crypto-dashboard/sdk')>()),
  paperApi: (await import('@/test/fakePaperApi')).fakePaperApi,
}));

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close = vi.fn(() => {
    this.readyState = 3;
  });
  // Test helpers
  serverOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  serverSend(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const last = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

const delta = (version: number) => ({
  account: { balance: '9000', realizedPnl: '0', leverage: 1, symbolLeverage: {}, version },
  positionsUpsert: [],
  positionsRemove: [],
  spotUpsert: [],
  pendingUpsert: [],
  pendingRemove: [],
  orders: [],
  trades: [],
  balanceEvents: [],
  journal: [],
  journalEdits: [],
});

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
  Object.values(sounds).forEach((fn) => fn.mockClear());
  usePaperStore.getState().clear();
  useAuthStore.setState({
    accessToken: 'token-1',
    user: { id: 'user-1' } as never,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePaperFeed', () => {
  it('🔐 authenticates with the first message — never a token in the URL', () => {
    renderHook(() => usePaperFeed());
    const ws = last();
    expect(ws.url).not.toContain('token');
    ws.serverOpen();
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'auth', token: 'token-1' });
  });

  it('also loads the account over REST, in case the socket cannot connect', async () => {
    const { fakePaperApi } = await import('@/test/fakePaperApi');
    fakePaperApi.getState.mockClear();
    renderHook(() => usePaperFeed());
    await act(async () => undefined);
    expect(fakePaperApi.getState).toHaveBeenCalledTimes(1);
  });

  it('hydrates from the snapshot and applies deltas with the server’s sound', () => {
    renderHook(() => usePaperFeed());
    const ws = last();
    ws.serverOpen();
    act(() => ws.serverSend({ type: 'snapshot', state: emptyState() }));
    expect(usePaperStore.getState().isSyncing).toBe(false);

    act(() => ws.serverSend({ type: 'delta', delta: delta(1), sound: 'filled' }));
    expect(usePaperStore.getState().balance).toBe(9000);
    expect(sounds.playOrderFilled).toHaveBeenCalledTimes(1);
  });

  it('plays the distinct liquidation sound the server picks for a liquidation (BP-3)', () => {
    renderHook(() => usePaperFeed());
    const ws = last();
    ws.serverOpen();
    act(() => ws.serverSend({ type: 'snapshot', state: emptyState() }));
    act(() => ws.serverSend({ type: 'delta', delta: delta(1), sound: 'liquidation' }));
    expect(sounds.playLiquidation).toHaveBeenCalledTimes(1);
    expect(sounds.playLoss).not.toHaveBeenCalled();
  });

  it('re-sends auth on the open socket when the token is refreshed', () => {
    renderHook(() => usePaperFeed());
    const ws = last();
    ws.serverOpen();
    act(() => useAuthStore.setState({ accessToken: 'token-2' }));
    expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ type: 'auth', token: 'token-2' });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('reconnects with backoff after an unexpected close', () => {
    renderHook(() => usePaperFeed());
    last().serverOpen();
    act(() => last().serverClose(1006));
    expect(usePaperStore.getState().isSyncing).toBe(true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('after a 4401, reconnects right away once a fresh token arrives', async () => {
    const { refreshAccessToken } = await import('@/lib/session');
    vi.mocked(refreshAccessToken).mockResolvedValueOnce('fresh-token');
    renderHook(() => usePaperFeed());
    last().serverOpen();
    await act(async () => last().serverClose(4401));
    expect(refreshAccessToken).toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('after a 4401 with a failed refresh, backs off instead of reconnecting with the stale token', async () => {
    const { refreshAccessToken } = await import('@/lib/session');
    vi.mocked(refreshAccessToken).mockResolvedValueOnce(null).mockResolvedValueOnce('fresh-token');
    renderHook(() => usePaperFeed());
    last().serverOpen();
    await act(async () => last().serverClose(4401));
    expect(MockWebSocket.instances).toHaveLength(1); // no reconnect with the stale token
    await act(async () => vi.advanceTimersByTime(1_000)); // retry the refresh
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('retries the REST account load until the account is loaded', async () => {
    const { fakePaperApi } = await import('@/test/fakePaperApi');
    fakePaperApi.getState.mockClear();
    fakePaperApi.getState.mockRejectedValueOnce(new Error('Failed to fetch'));
    renderHook(() => usePaperFeed());
    await act(async () => undefined);
    expect(fakePaperApi.getState).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1_000));
    await vi.waitFor(() => expect(fakePaperApi.getState).toHaveBeenCalledTimes(2));
    expect(usePaperStore.getState().isSyncing).toBe(false);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(fakePaperApi.getState).toHaveBeenCalledTimes(2); // stops once loaded
  });

  it('🔐 clears the account and closes without reconnecting on sign-out', () => {
    const { rerender } = renderHook(() => usePaperFeed());
    const ws = last();
    ws.serverOpen();
    act(() => ws.serverSend({ type: 'snapshot', state: emptyState() }));
    act(() => useAuthStore.setState({ user: null, accessToken: null }));
    rerender();
    expect(ws.close).toHaveBeenCalled();
    expect(ws.onclose).toBeNull();
    expect(usePaperStore.getState().isSyncing).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
