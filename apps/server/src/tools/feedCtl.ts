/**
 * `pnpm feed …` — move the fake Bybit feed's prices by hand, with the same controls the tests use
 * (docs/TRADING_TEST_PLAN.md A5, "The fake Bybit feed"). Talks to the fake on 127.0.0.1 (FAKE_BYBIT_PORT, default 4010).
 *
 *   pnpm feed quote spot BTCUSDT bid=49999.9 ask=50000        # last defaults to the ask
 *   pnpm feed quote linear BTCUSDT last=50000 mark=50010
 *   pnpm feed path linear BTCUSDT 50000,50500,51000 step=1000  # walk the price, one point a second
 *   pnpm feed funding BTCUSDT rate=0.0001 in=10                # next funding in 10 s
 *   pnpm feed klines linear BTCUSDT start=<ms> open=… high=… low=… close=… [source=mark]
 *   pnpm feed drop linear | pnpm feed stall spot ms=60000 | pnpm feed reset
 */

/* eslint-disable security/detect-object-injection -- a local test tool: keys are recorded-fixture or
   command-line fields, and it never runs inside the app */

import pino from 'pino';

const log = pino({ name: 'feed' });
const base = `http://127.0.0.1:${process.env.FAKE_BYBIT_PORT ?? 4010}/__control`;

/** `key=value` pairs → numbers (or strings for `source`). */
function pairs(args: string[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const arg of args) {
    const [k, v] = arg.split('=');
    if (!k || v === undefined) throw new Error(`expected key=value, got "${arg}"`);
    out[k] = k === 'source' ? v : Number(v);
    if (typeof out[k] === 'number' && !Number.isFinite(out[k]))
      throw new Error(`${k} is not a number`);
  }
  return out;
}

function body(argv: string[]): { path: string; payload: Record<string, unknown> } {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'quote': {
      const [category, symbol, ...kv] = rest;
      return { path: 'quote', payload: { category, symbol, ...pairs(kv) } };
    }
    case 'path': {
      const [category, symbol, points, ...kv] = rest;
      const { step = 1_000 } = pairs(kv);
      return {
        path: 'path',
        payload: { category, symbol, points: (points ?? '').split(',').map(Number), stepMs: step },
      };
    }
    case 'funding': {
      const [symbol, ...kv] = rest;
      const { rate, in: inSeconds, interval } = pairs(kv);
      return {
        path: 'funding',
        payload: { symbol, rate, inSeconds, ...(interval ? { intervalHour: interval } : {}) },
      };
    }
    case 'klines': {
      const [category, symbol, ...kv] = rest;
      const { source, ...candle } = pairs(kv);
      return {
        path: 'klines',
        payload: { category, symbol, ...(source ? { source } : {}), candles: [candle] },
      };
    }
    case 'drop':
      return { path: 'drop', payload: { category: rest[0] } };
    case 'stall': {
      const [category, ...kv] = rest;
      return { path: 'stall', payload: { category, ms: pairs(kv).ms } };
    }
    case 'reset':
      return { path: 'reset', payload: {} };
    default:
      throw new Error(`unknown command "${cmd ?? ''}" — see the header of tools/feedCtl.ts`);
  }
}

async function main(): Promise<void> {
  const { path, payload } = body(process.argv.slice(2));
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });
  const answer: unknown = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(answer));
  log.info({ command: path, answer }, 'Fake feed updated');
}

main().catch((err: unknown) => {
  log.error({ err }, 'Feed control failed');
  process.exitCode = 1;
});
