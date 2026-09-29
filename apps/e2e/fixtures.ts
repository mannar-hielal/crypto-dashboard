/**
 * Test fixtures (docs/TEST_IMPLEMENTATION_PLAN.md F4):
 *   - `seededUser`: a new verified user per test, through the test hooks (F2);
 *   - `feed`: the fake Bybit feed's controls (F3);
 *   - `hooks`: the rest of the test hooks (account reset, email outbox).
 */

import { test as base, expect } from '@playwright/test';

/* eslint-disable no-empty-pattern -- Playwright reads a fixture's first parameter as a destructuring
   pattern to find its dependencies: `{}` is how a fixture says it needs none */
import { API_URL, FEED_URL, HOOKS_SECRET } from './env';

export interface SeededUser {
  userId: string;
  email: string;
  username: string;
  password: string;
}

export interface Feed {
  quote(
    category: 'spot' | 'linear',
    symbol: string,
    q: { bid?: number; ask?: number; last?: number; mark?: number; index?: number }
  ): Promise<void>;
  reset(): Promise<void>;
  /** Any control by name, e.g. ('funding', { symbol, rate, inSeconds }) */
  control(path: string, body: Record<string, unknown>): Promise<unknown>;
}

export interface Hooks {
  resetAccount(userId: string): Promise<void>;
  outbox(to: string): Promise<{ kind: string; url?: string }[]>;
}

const json = async (res: Response, what: string) => {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown>;
};

const hooksFetch = (path: string, init: RequestInit = {}) =>
  fetch(`${API_URL}/api/test${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-test-hooks-secret': HOOKS_SECRET },
    signal: AbortSignal.timeout(15_000),
  });

/** The cookie notice's "dismissed" flag (CookieBanner.tsx): its overlay would cover the order form */
const COOKIE_NOTICE_KEY = 'cd-cookie-notice-dismissed';

export const test = base.extend<{ seededUser: SeededUser; feed: Feed; hooks: Hooks }>({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), COOKIE_NOTICE_KEY);
    await use(page);
  },
  seededUser: async ({}, use) => {
    const res = await hooksFetch('/users', { method: 'POST', body: '{}' });
    await use((await json(res, 'seed user')) as SeededUser);
  },
  feed: async ({}, use) => {
    const control = async (path: string, body: Record<string, unknown>) =>
      json(
        await fetch(`${FEED_URL}/__control/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        }),
        `feed ${path}`
      );
    await use({
      quote: async (category, symbol, q) => {
        await control('quote', { category, symbol, ...q });
      },
      reset: async () => {
        await control('reset', {});
      },
      control,
    });
  },
  hooks: async ({}, use) => {
    await use({
      resetAccount: async (userId) => {
        await json(
          await hooksFetch(`/users/${userId}/reset`, { method: 'POST', body: '{}' }),
          'reset'
        );
      },
      outbox: async (to) =>
        (
          (await json(await hooksFetch(`/outbox?to=${encodeURIComponent(to)}`), 'outbox')) as {
            emails: { kind: string; url?: string }[];
          }
        ).emails,
    });
  },
});

export { expect };
