import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';

import {
  BEGINNER_FAQ,
  COINS,
  GROUPS,
  PATH_CARDS,
  SHOTS,
  TABLE_ROWS,
  TIMELINE,
} from '@/lib/landingContent';
import { ComparisonTable } from '../ComparisonTable';
import { CoinRibbon } from '../CoinRibbon';
import { CandleSequence } from '../CandleSequence';
import { PathCards } from '../PathCards';
import { FaqList } from '../FaqList';
import { StartLink } from '../StartLink';
import { Timeline } from '../Timeline';
import { ShotShowcase } from '../ShotShowcase';

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

describe('ComparisonTable', () => {
  afterEach(cleanup);

  it('should have one column for us and one for each of the six groups, never a brand', () => {
    render(React.createElement(ComparisonTable));
    const headers = screen.getAllByRole('columnheader');
    // The empty corner, us, and six groups
    expect(headers).toHaveLength(8);
    for (const g of GROUPS)
      expect(screen.getByRole('columnheader', { name: g.label })).not.toBeNull();
    expect(GROUPS).toHaveLength(6);
  });

  it('should have one row per feature with a mark in every column', () => {
    render(React.createElement(ComparisonTable));
    const body = screen.getAllByRole('row').slice(1);
    expect(body).toHaveLength(TABLE_ROWS.length);
    for (const row of body) expect(within(row).getAllByRole('cell')).toHaveLength(7);
  });

  it('should say yes, sometimes or no in words for every mark, not by colour alone', () => {
    const { container } = render(React.createElement(ComparisonTable));
    const marks = container.querySelectorAll('[data-mark]');
    expect(marks.length).toBe(TABLE_ROWS.length * 7);
    for (const m of marks) {
      expect(m.textContent).toMatch(/^(Yes|Sometimes|No)$/);
      expect(m.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('should show our crosses on the three rows we keep small on purpose', () => {
    render(React.createElement(ComparisonTable));
    const lost = TABLE_ROWS.filter((r) => r.us === 'no');
    expect(lost.map((r) => r.id)).toEqual(['big-balance', 'many-coins', 'high-leverage']);
    expect(lost.every((r) => r.deliberate)).toBe(true);
    expect(screen.getAllByText('small on purpose')).toHaveLength(3);
    expect(screen.getByText(/Why small on purpose/)).not.toBeNull();
  });

  it('should tick every row that is not a deliberate loss for us', () => {
    for (const r of TABLE_ROWS.filter((x) => !x.deliberate)) expect(r.us).toBe('yes');
  });

  it('should not claim any roadmap feature as a row', () => {
    const text = TABLE_ROWS.map((r) => r.feature).join(' ');
    expect(text).not.toMatch(/replay|R-multiple|prop|funded|journal analytics/i);
  });

  it('should hide the blurred brand marks from assistive tech', () => {
    const { container } = render(React.createElement(ComparisonTable));
    const marks = container.querySelectorAll('thead span[aria-hidden="true"]');
    expect(marks.length).toBeGreaterThanOrEqual(7);
  });
});

describe('PathCards', () => {
  afterEach(cleanup);

  it('should link the chart path to /chart and the learning path to /register', () => {
    render(React.createElement(PathCards));
    expect(screen.getByRole('link', { name: 'Open the live chart' }).getAttribute('href')).toBe(
      '/chart'
    );
    expect(screen.getByRole('link', { name: 'Create a free account' }).getAttribute('href')).toBe(
      '/register'
    );
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
  });

  it('should show two or three bullets on each card', () => {
    for (const card of PATH_CARDS) {
      expect(card.bullets.length).toBeGreaterThanOrEqual(2);
      expect(card.bullets.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('FaqList and StartLink', () => {
  afterEach(cleanup);

  it('should end every answer in a Start here button that goes to the register or chart page', () => {
    render(
      React.createElement(FaqList, {
        items: BEGINNER_FAQ,
        live: true,
        anchor: 'landing.faq.start',
        defaultOpen: BEGINNER_FAQ.map((q) => q.id),
      })
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(BEGINNER_FAQ.length);
    for (const l of links) expect(l.textContent).toMatch(/^Start here/);
  });

  it('should point the button at the newsletter form before launch', () => {
    render(React.createElement(StartLink, { cta: BEGINNER_FAQ[0]!.cta, live: false }));
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('#newsletter');
    expect(link.textContent).toBe('Start here: get notified');
  });

  it('should cover the beginner worries the research found', () => {
    const ids = BEGINNER_FAQ.map((q) => q.id);
    for (const id of [
      'where-to-start',
      'real-money',
      'does-practice-work',
      'lose-money',
      'scams',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('should give no profit promise in any answer', () => {
    for (const q of BEGINNER_FAQ)
      expect(q.answer).not.toMatch(/guarantee|get rich|passive income/i);
  });
});

describe('CoinRibbon', () => {
  afterEach(cleanup);

  it('should list the nine coins the server allows, once for assistive tech', () => {
    render(React.createElement(CoinRibbon));
    const list = screen.getByRole('list', { name: 'The nine coins you can practise on' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(COINS.length);
    expect(COINS.map((c) => c.symbol)).toEqual([
      'BTC',
      'ETH',
      'SOL',
      'BNB',
      'XRP',
      'DOGE',
      'ADA',
      'AVAX',
      'LINK',
    ]);
  });

  it('should load coin logos lazily with a size, from our own files', () => {
    const { container } = render(React.createElement(CoinRibbon));
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(COINS.length * 2);
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('width')).toBe('36');
      expect(img.getAttribute('alt')).toBe('');
    }
  });
});

describe('CandleSequence', () => {
  afterEach(cleanup);

  it('should be decorative and draw 24 candles', () => {
    render(React.createElement(CandleSequence));
    const svg = screen.getByTestId('candle-sequence');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('rect')).toHaveLength(24);
  });
});

describe('Timeline and ShotShowcase', () => {
  afterEach(cleanup);

  it('should list the milestones as an ordered list', () => {
    render(React.createElement(Timeline));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(TIMELINE.length);
  });

  it('should give every screenshot alt text, a size and lazy loading', () => {
    const { container } = render(React.createElement(ShotShowcase));
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(SHOTS.length);
    for (const img of imgs) {
      expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(20);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('width')).not.toBeNull();
      expect(img.getAttribute('height')).not.toBeNull();
    }
  });
});
