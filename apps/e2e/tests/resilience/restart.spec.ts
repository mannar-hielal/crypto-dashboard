/**
 * A crash and restart with prices moving in between (SC-13.2-3, row 13.2.4; SC-18-1, row 18.1), on
 * Spot ADAUSDT, against a second API server of its own (restartableServer.ts) — no browser: the
 * whole point is that nobody is watching. Before the crash: a resting limit buy @ 0.5 and a coin
 * with a take-profit @ 0.7. While the server is down, one 1m candle trades 0.49 – 0.72. After the
 * restart the engine backfills the gap: the limit fills once and the take-profit sells once.
 * Runs in its own project, after every browser project (playwright.config.ts).
 */

import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FEED_URL } from '../../env';
import { restartableServer } from '../../restartableServer';

/** The two fields of `PaperState` (generated/CDSDK) this spec reads */
interface PaperState {
  pendingOrders: { symbol: string }[];
  journal: { text: string }[];
}

const PORT = Number(process.env.E2E_RESTART_API_PORT ?? 3002);
// 🔐 Its own throwaway database (the name must end in _test): the main server's engine keeps its lease
const DATABASE_URL = (
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/crypto_dashboard_e2e_test'
).replace(/_test$/, '_restart_test');

const feed = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(`${FEED_URL}/__control/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`feed ${path}: HTTP ${res.status}`);
};

test('[13.2.4][18.1] after a crash, the gap is backfilled: the limit fills once and the TP sells once @resilience', async () => {
  test.setTimeout(240_000);
  const api = restartableServer(PORT, DATABASE_URL);
  try {
    await feed('quote', { category: 'spot', symbol: 'ADAUSDT', bid: 0.5999, ask: 0.6, last: 0.6 });
    await api.start();

    const user = (await api.hooks('/users')) as { email: string; password: string };
    const login = await fetch(`${api.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const call = async <T>(path: string, body?: unknown): Promise<T> => {
      const res = await fetch(`${api.url}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
      return (await res.json()) as T;
    };
    const order = { category: 'spot', symbol: 'ADAUSDT', side: 'buy' };
    await call('/api/paper/orders', { ...order, type: 'market', qty: '100', takeProfit: '0.7' });
    await call('/api/paper/orders', { ...order, type: 'limit', qty: '100', triggerPrice: '0.5' });

    // A tick for the engine to record (the fake feed only pushes on a control call; Bybit never
    // stops) — a changed price, since an unchanged ticker isn't passed on — then the 10 s lease
    // heartbeat that stores it as the last tick; then crash
    await feed('quote', {
      category: 'spot',
      symbol: 'ADAUSDT',
      bid: 0.6009,
      ask: 0.601,
      last: 0.601,
    });
    await new Promise((r) => setTimeout(r, 12_000));
    await api.crash();

    // The next minute: a candle of the minute the orders were placed in isn't used for them (the
    // engine can't tell whether its low came before or after the order)
    const minute = (Math.floor(Date.now() / 60_000) + 1) * 60_000;
    await new Promise((r) => setTimeout(r, minute - Date.now() + 1_000));
    await feed('klines', {
      category: 'spot',
      symbol: 'ADAUSDT',
      source: 'last',
      candles: [{ start: minute, open: 0.6, high: 0.72, low: 0.49, close: 0.6 }],
    });

    await api.start({ keepLease: true });
    // The crashed engine's lease expires (30 s), the new one takes over and backfills the gap
    await expect
      .poll(() => api.logs().includes('Backfilling price gap'), { timeout: 90_000 })
      .toBe(true);

    let state: PaperState | undefined;
    await expect
      .poll(
        async () => {
          state = await call<PaperState>('/api/paper/state');
          return state.pendingOrders.filter((o) => o.symbol === 'ADAUSDT').length;
        },
        { timeout: 30_000 }
      )
      .toBe(0);
    const texts = state!.journal.map((j) => j.text);
    expect(texts.filter((t) => /^Limit order filled — Buy ADAUSDT @ \$0\.5/.test(t))).toHaveLength(
      1
    );
    expect(texts.filter((t) => /^Auto-sold ADAUSDT — Take-Profit/.test(t))).toHaveLength(1);
  } finally {
    await api.crash();
    // The second server's output, for a failing run (its lines aren't in the web-server log)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Playwright's own output folder
    writeFileSync(test.info().outputPath('api.log'), api.logs());
  }
});
