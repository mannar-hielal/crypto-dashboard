/**
 * Runs a guide scenario (apps/client/src/guide, docs/TEST_IMPLEMENTATION_PLAN.md F5) in the browser:
 * the preconditions, then every step and its expectations. The same scenario is the manual UI
 * reproduction in the plan and, later, a guided tour — so a green run means the tour's steps work.
 */

import { expect, type Page } from '@playwright/test';
import type { Expectation, Scenario, ScenarioStep } from '@guide/scenario';
import { guideSelector } from '@/lib/guideAnchors';
import type { Feed, Hooks, SeededUser } from '../fixtures';
import { API_URL } from '../env';

export interface ScenarioContext {
  user: SeededUser;
  feed: Feed;
  hooks: Hooks;
}

const locate = (page: Page, anchor: Parameters<typeof guideSelector>[0], key?: string) =>
  page.locator(guideSelector(anchor, key));

/** Sign in through the login form (the anchors a learner would use) and land on the dashboard. */
export async function signIn(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await locate(page, 'auth.login.email').fill(user.email);
  await locate(page, 'auth.login.password').fill(user.password);
  await locate(page, 'auth.login.submit').click();
  await page.waitForURL(/\/dashboard/);
}

/** An access token for API-side setup (the margin mode a precondition asks for). */
async function accessToken(user: SeededUser): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`login for setup: HTTP ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function check(page: Page, e: Expectation, step: string): Promise<void> {
  if ('url' in e) {
    await expect(page, step).toHaveURL(e.url);
    return;
  }
  const el = locate(page, e.anchor, e.key);
  if ('text' in e) {
    if (typeof e.text === 'string') await expect(el, step).toContainText(e.text);
    else await expect(el, step).toHaveText(e.text);
  } else if ('visible' in e) {
    if (e.visible) await expect(el, step).toBeVisible();
    else await expect(el, step).toHaveCount(0);
  } else if ('value' in e) {
    await expect(el, step).toHaveValue(e.value);
  } else if ('enabled' in e) {
    if (e.enabled) await expect(el, step).toBeEnabled();
    else await expect(el, step).toBeDisabled();
  }
}

async function act(page: Page, step: ScenarioStep, ctx: ScenarioContext): Promise<void> {
  const target = () => {
    if (!step.anchor) throw new Error(`${step.id}: ${step.action} needs an anchor`);
    return locate(page, step.anchor, step.key);
  };
  switch (step.action) {
    case 'navigate':
      await page.goto(step.value ?? '/');
      break;
    case 'click':
      await target().click();
      break;
    case 'type':
      await target().fill(step.value ?? '');
      break;
    case 'select':
      await target().selectOption(step.value ?? '');
      break;
    case 'observe':
      break;
    case 'control': {
      // "<control> <json body>", e.g. `quote {"category":"spot",...}`
      const [path, ...rest] = (step.value ?? '').split(' ');
      await ctx.feed.control(
        path ?? '',
        JSON.parse(rest.join(' ') || '{}') as Record<string, unknown>
      );
      break;
    }
  }
}

export async function runScenario(
  page: Page,
  scenario: Scenario,
  ctx: ScenarioContext
): Promise<void> {
  // Prices first, so the page opens on them
  for (const p of scenario.preconditions) {
    if (p.kind === 'quote') {
      await ctx.feed.quote(p.category, p.symbol, {
        bid: p.bid,
        ask: p.ask,
        last: p.ask,
        ...(p.mark !== undefined ? { mark: p.mark } : {}),
      });
    }
  }
  for (const p of scenario.preconditions) {
    if (p.kind === 'freshAccount') await ctx.hooks.resetAccount(ctx.user.userId);
    if (p.kind === 'signedIn' && p.marginMode) {
      const token = await accessToken(ctx.user);
      const res = await fetch(`${API_URL}/api/paper/account/margin-mode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ marginMode: p.marginMode }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`margin mode: HTTP ${res.status}`);
    }
  }
  if (scenario.preconditions.some((p) => p.kind === 'signedIn')) await signIn(page, ctx.user);
  await page.goto(scenario.startUrl);

  for (const step of scenario.steps) {
    await act(page, step, ctx);
    for (const e of step.expect ?? []) await check(page, e, `${step.id} (${step.explain})`);
  }
}
