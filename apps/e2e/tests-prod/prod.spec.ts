/**
 * Read-only production checks (T5): the API is up, the public pages load without errors, the market
 * feed is live, and signed-out visitors are handled (test plan rows 19.3, 12.x freshness).
 */

import { expect, test } from '@playwright/test';

const API = process.env.PROD_API_URL ?? 'https://api.cryptopapertrade.com';

test('@prod the API is healthy', async ({ request }) => {
  const res = await request.get(`${API}/health`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok', environment: 'production' });
});

test('@prod [19.3] a signed-out visit loads cleanly: refresh answers 204, no console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const refresh = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh'));
  await page.goto('/');
  expect((await refresh).status()).toBe(204);
  await expect(page).toHaveTitle(/cryptopapertrade/i);
  expect(errors).toEqual([]);
});

test('@prod the login page renders its form; the dashboard sends a signed-out visitor there', async ({
  page,
}) => {
  await page.goto('/dashboard/usdt/BTCUSDT');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
});

test('@prod the market feed is live: recent 1m candles and a ticker within seconds', async ({
  request,
}) => {
  const res = await request.get(
    `${API}/api/market/candles?category=linear&symbol=BTCUSDT&interval=1m&limit=3`
  );
  expect(res.status()).toBe(200);
  const { candles } = (await res.json()) as { candles: { timestamp: number }[] };
  expect(candles).toHaveLength(3);
  // The newest candle is the one forming now (or the one just closed)
  expect(Date.now() - candles[2]!.timestamp).toBeLessThan(3 * 60_000);

  const ticker = await new Promise<{ lastPrice: number }>((resolve, reject) => {
    const ws = new WebSocket(
      `${API.replace(/^http/, 'ws')}/api/market/ws?category=linear&symbol=BTCUSDT&interval=1m`
    );
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('no ticker within 15 s'));
    }, 15_000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as { type: string; lastPrice?: number };
      if (msg.type === 'ticker' && typeof msg.lastPrice === 'number') {
        clearTimeout(timer);
        ws.close();
        resolve(msg as { lastPrice: number });
      }
    };
  });
  expect(ticker.lastPrice).toBeGreaterThan(0);
});
