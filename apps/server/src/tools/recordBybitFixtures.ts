/**
 * Records the Bybit fixtures the fake feed serves (docs/TRADING_TEST_PLAN.md A5) from Bybit's public
 * mainnet API — no key needed:
 *
 *   pnpm --filter @crypto-dashboard/server record:bybit
 *
 * Writes `fixtures/bybit/recorded.json`: instruments-info (Spot and USDT Perpetual), risk-limit tiers,
 * a tickers + best-level order book snapshot per market, the last funding rows, one page of each
 * kline source, and one WebSocket message of every topic the app subscribes to. The fake feed starts
 * from these prices; the shape tests compare the fake's answers with them. Re-record when the
 * spec-drift check reports a change (or the file is older than 180 days).
 */

/* eslint-disable security/detect-object-injection -- a local test tool: keys are recorded-fixture or
   command-line fields, and it never runs inside the app */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { ALLOWED_SYMBOLS } from '../constants.js';

const REST = 'https://api.bybit.com';
const WS = 'wss://stream.bybit.com/v5/public';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/bybit/recorded.json');
const log = pino({ name: 'recordBybitFixtures' });

type Json = Record<string, unknown>;

async function get(path: string, params: Record<string, string>): Promise<Json> {
  const url = `${REST}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = (await res.json()) as { retCode: number; retMsg: string; result: Json };
  if (body.retCode !== 0) throw new Error(`${path}: ${body.retMsg}`);
  return body.result;
}

const list = (result: Json) => (result.list as Json[] | undefined) ?? [];

/** The first message of every topic within `ms`, per category. */
function sampleStream(category: 'spot' | 'linear', topics: string[], ms: number): Promise<Json> {
  return new Promise((resolveSamples, reject) => {
    const samples: Json = {};
    const ws = new WebSocket(`${WS}/${category}`);
    const done = () => {
      ws.close();
      resolveSamples(samples);
    };
    const timer = setTimeout(done, ms);
    ws.onopen = () => ws.send(JSON.stringify({ op: 'subscribe', args: topics }));
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket ${category} failed`));
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as Json;
      const topic = msg.topic as string | undefined;
      const kind = topic?.split('.').slice(0, -1).join('.');
      if (kind && !(kind in samples)) samples[kind] = msg;
      if (Object.keys(samples).length === topics.length) {
        clearTimeout(timer);
        done();
      }
    };
  });
}

async function main(): Promise<void> {
  const symbols = [...ALLOWED_SYMBOLS];
  const recorded: Json = { recordedAt: new Date().toISOString(), source: REST };

  // One symbol per request, as the app asks (a whole category is paged at 500)
  const instruments: Json = {};
  for (const category of ['spot', 'linear']) {
    const rows: Json[] = [];
    for (const symbol of symbols) {
      rows.push(...list(await get('/v5/market/instruments-info', { category, symbol })));
    }
    instruments[category] = rows;
  }
  recorded.instruments = instruments;

  const riskLimit: Json = {};
  const tickers: Json = { spot: {}, linear: {} };
  const orderbook: Json = {};
  const funding: Json = {};
  for (const symbol of symbols) {
    riskLimit[symbol] = list(await get('/v5/market/risk-limit', { category: 'linear', symbol }));
    for (const category of ['spot', 'linear'] as const) {
      const [ticker] = list(await get('/v5/market/tickers', { category, symbol }));
      (tickers[category] as Json)[symbol] = ticker;
    }
    const book = await get('/v5/market/orderbook', { category: 'spot', symbol, limit: '1' });
    orderbook[symbol] = { a: book.a, b: book.b };
    funding[symbol] = list(
      await get('/v5/market/funding/history', { category: 'linear', symbol, limit: '3' })
    );
  }
  recorded.riskLimit = riskLimit;
  recorded.tickers = tickers;
  recorded.orderbook = { spot: orderbook };
  recorded.fundingHistory = funding;

  const kline: Json = {};
  for (const [source, path] of [
    ['last', '/v5/market/kline'],
    ['mark', '/v5/market/mark-price-kline'],
    ['index', '/v5/market/index-price-kline'],
  ] as const) {
    kline[source] = list(
      await get(path, { category: 'linear', symbol: 'BTCUSDT', interval: '1', limit: '3' })
    );
  }
  recorded.kline = kline;

  recorded.ws = {
    spot: await sampleStream(
      'spot',
      ['kline.1.BTCUSDT', 'tickers.BTCUSDT', 'orderbook.1.BTCUSDT'],
      15_000
    ),
    linear: await sampleStream('linear', ['kline.1.BTCUSDT', 'tickers.BTCUSDT'], 15_000),
  };

  // A fixed path inside the repo (no input reaches it)

  mkdirSync(dirname(OUT), { recursive: true });

  writeFileSync(OUT, `${JSON.stringify(recorded, null, 2)}\n`);
  log.info({ out: OUT, symbols: symbols.length }, 'Bybit fixtures recorded');
}

main().catch((err: unknown) => {
  log.error({ err }, 'Recording failed');
  process.exitCode = 1;
});
