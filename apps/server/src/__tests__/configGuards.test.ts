/**
 * config.ts guards for the test-only switches (docs/TRADING_TEST_PLAN.md A5): the fake-feed URL
 * overrides and the test hooks must never start in production, and are validated elsewhere.
 * Each case re-imports config.ts with its own environment; process.exit throws instead of exiting.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// A throwaway value: the hooks only need 16+ characters
const SECRET = 'x'.repeat(24);

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  try {
    const { config } = await import('../config.js');
    return { config, exited: false };
  } catch (err) {
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(err)).toContain('process.exit(1)');
    return { config: undefined, exited: true };
  }
}

const production = { NODE_ENV: 'production', CLIENT_URL: 'https://cryptopapertrade.com' };
const testOnly = {
  BYBIT_REST_URL: undefined,
  BYBIT_WS_URL: undefined,
  ENABLE_TEST_HOOKS: undefined,
  TEST_HOOKS_SECRET: undefined,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('config — test-only switches', () => {
  it('should start in production without any of them', async () => {
    const { exited, config } = await load({ ...testOnly, ...production });
    expect(exited).toBe(false);
    expect(config?.testHooks).toBe(false);
    expect(config?.bybitRestUrl).toBeUndefined();
  });

  it.each([
    ['BYBIT_REST_URL', 'http://localhost:4010'],
    ['BYBIT_WS_URL', 'ws://localhost:4010'],
    ['ENABLE_TEST_HOOKS', '1'],
    ['TEST_HOOKS_SECRET', SECRET],
    ['ENABLE_TEST_HOOKS', ''],
  ])('🔐 should refuse to start in production with %s set (%j)', async (name, value) => {
    const { exited } = await load({ ...testOnly, ...production, [name]: value });
    expect(exited).toBe(true);
  });

  it('should point the Bybit REST and WS seams at the fake feed outside production', async () => {
    const { exited, config } = await load({
      ...testOnly,
      BYBIT_REST_URL: 'http://localhost:4010/',
      BYBIT_WS_URL: 'ws://localhost:4010',
    });
    expect(exited).toBe(false);
    expect(config?.bybitRestUrl).toBe('http://localhost:4010/');
    expect(config?.bybitWsUrl).toBe('ws://localhost:4010');
    const { bybitRestBaseUrl } = await import('../services/BybitMarketInfo.js');
    expect(bybitRestBaseUrl()).toBe('http://localhost:4010');
  });

  it.each([
    ['BYBIT_REST_URL', 'ws://localhost:4010'],
    ['BYBIT_REST_URL', 'localhost:4010'],
    ['BYBIT_WS_URL', 'http://localhost:4010'],
    ['BYBIT_WS_URL', 'not a url'],
  ])('should refuse a malformed %s (%s)', async (name, value) => {
    const { exited } = await load({ ...testOnly, [name]: value });
    expect(exited).toBe(true);
  });

  it('🔐 should refuse the test hooks without a secret of at least 16 characters', async () => {
    expect((await load({ ...testOnly, ENABLE_TEST_HOOKS: '1' })).exited).toBe(true);
    expect(
      (await load({ ...testOnly, ENABLE_TEST_HOOKS: '1', TEST_HOOKS_SECRET: 'short' })).exited
    ).toBe(true);
    const { exited, config } = await load({
      ...testOnly,
      ENABLE_TEST_HOOKS: '1',
      TEST_HOOKS_SECRET: SECRET,
    });
    expect(exited).toBe(false);
    expect(config?.testHooks).toBe(true);
  });

  it('should leave the test hooks off unless ENABLE_TEST_HOOKS is exactly 1', async () => {
    const { config } = await load({
      ...testOnly,
      ENABLE_TEST_HOOKS: 'true',
      TEST_HOOKS_SECRET: SECRET,
    });
    expect(config?.testHooks).toBe(false);
  });
});
