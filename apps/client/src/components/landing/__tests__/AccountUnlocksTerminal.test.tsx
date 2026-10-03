import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';

import { guideSelector } from '@/lib/guideAnchors';

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

import { AccountUnlocksTerminal } from '../AccountUnlocksTerminal';

const ROWS: [string, string][] = [
  ['orders', 'market · limit · stop'],
  ['exits', 'tp/sl · trigger last | mark | index'],
  ['perps', 'long/short · 1–10x · cross | isolated'],
  ['spot', 'buy · sell what you hold'],
  ['history', 'orders · closed p&l · balance log'],
  ['journal', 'notes on every trade'],
  ['engine', 'fills 24/7, tab open or not'],
];

describe('AccountUnlocksTerminal', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render the heading and the terminal command when mounted', () => {
    render(React.createElement(AccountUnlocksTerminal));
    expect(
      screen.getByRole('heading', { name: "The chart's free. So is the trading desk." })
    ).not.toBeNull();
    expect(screen.getByText('~/cryptopapertrade')).not.toBeNull();
    expect(screen.getByText(/account --create --free/)).not.toBeNull();
  });

  it('should render every unlock row as a key/value pair when mounted', () => {
    const { container } = render(React.createElement(AccountUnlocksTerminal));
    const keys = Array.from(container.querySelectorAll('dl dt')).map((dt) =>
      dt.textContent?.replace('✓', '')
    );
    const values = Array.from(container.querySelectorAll('dl dd')).map((dd) => dd.textContent);
    expect(keys).toEqual(ROWS.map(([k]) => k));
    expect(values).toEqual(ROWS.map(([, v]) => v));
  });

  it('should hide the decorative check marks from assistive tech when mounted', () => {
    const { container } = render(React.createElement(AccountUnlocksTerminal));
    const checks = Array.from(container.querySelectorAll('dt span'));
    expect(checks).toHaveLength(ROWS.length);
    for (const c of checks) expect(c.getAttribute('aria-hidden')).toBe('true');
  });

  it('should link the create-account button to /register when mounted', () => {
    const { container } = render(React.createElement(AccountUnlocksTerminal));
    const cta = container.querySelector(guideSelector('landing.unlocks.register'));
    expect(cta?.getAttribute('href')).toBe('/register');
    expect(within(cta as HTMLElement).getByText('Create free account →')).not.toBeNull();
    expect(screen.getByText('$10,000 virtual balance')).not.toBeNull();
  });
});
