import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
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
import { guideSelector } from '@/lib/guideAnchors';
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
    const { container } = render(React.createElement(CandleSequence));
    const svg = container.querySelector(guideSelector('landing.candles'))!;
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

describe('the chapter claims on the pages', () => {
  it('should say only Chapter 1 ends with a checkpoint while only Chapter 1 has one (review 2026-11-22)', async () => {
    const { CHAPTERS } = await import('@/learn/path');
    const { FEATURES_FAQ } = await import('@/lib/landingContent');
    const hasCheckpoint = CHAPTERS.map(
      (c) => c.status === 'open' && c.nodes.some((n) => n.kind === 'checkpoint')
    );
    expect(hasCheckpoint).toEqual([true, false]);
    const answers = [...BEGINNER_FAQ, ...FEATURES_FAQ].map((q) => q.answer);
    const mentions = answers.filter((a) => /checkpoint/i.test(a));
    expect(mentions.length).toBeGreaterThan(0);
    for (const a of mentions) {
      expect(a).toMatch(/Chapter 1 ends with a checkpoint/);
      expect(a).not.toMatch(/Each chapter/);
    }
  });
});

describe('the lesson and chapter facts on the pages', () => {
  it('should pin the lesson previews and the lesson count to the lessons themselves (review 2026-11-22)', async () => {
    const { LESSONS } = await import('@/guide/lessons');
    const { CHAPTERS } = await import('@/learn/path');
    const { LESSON_PREVIEWS, FEATURES_FAQ } = await import('@/lib/landingContent');
    for (const p of LESSON_PREVIEWS) {
      const lesson = LESSONS.find((l) => l.number === p.number)!;
      expect(lesson, `lesson ${p.number}`).toBeDefined();
      // A shortened title still starts the real one's words
      expect(lesson.title.toLowerCase(), p.title).toContain(
        p.title
          .toLowerCase()
          .replace(/[?:].*$/, '')
          .trim()
          .split(' ')[0]
      );
    }
    const built = CHAPTERS.filter((c) => c.status === 'open').length;
    const answer = FEATURES_FAQ.find((q) => q.id === 'lessons')!.answer;
    const words = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    expect(answer).toContain(
      `${words[LESSONS.length - 1]} lessons in ${words[built - 1].toLowerCase()} chapters`
    );
  });
});

describe('the ribbon and the table, accessibility (review 2026-11-22)', () => {
  afterEach(cleanup);

  it('should let a visitor pause the coin ticker, by keyboard or touch', () => {
    render(React.createElement(CoinRibbon));
    const pause = screen.getByRole('button', { name: 'Pause the coin ticker' });
    // A toggle keeps one label, or its label swaps without aria-pressed: here the label swaps
    expect(pause.hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Play the coin ticker' })).not.toBeNull();
  });

  it('should name the table’s scroll region by its caption, once', () => {
    render(React.createElement(ComparisonTable));
    const region = screen.getByRole('region');
    const caption = document.getElementById(region.getAttribute('aria-labelledby')!);
    expect(caption?.tagName).toBe('CAPTION');
    expect(region.getAttribute('aria-label')).toBeNull();
  });
});

describe('the figures on the pages come from the app', () => {
  it('should keep the timeframes, indicators, leverage cap and balance equal to the app’s own (review 2026-11-22)', async () => {
    const { INTERVALS } = await import('@/lib/markets');
    const { INDICATOR_CATALOG } = await import('@/lib/indicators/catalog');
    const { MAX_LEVERAGE, STARTING_BALANCE } = await import('@crypto-dashboard/sdk');
    const { CHART_FEATURES, DESK_FEATURES, FEATURES_FAQ } = await import('@/lib/landingContent');
    const titles = CHART_FEATURES.map((f) => f.title);
    expect(titles).toContain(`${INTERVALS.length} timeframes`);
    expect(titles).toContain(`${INDICATOR_CATALOG.length} indicators`);
    const copy = JSON.stringify([DESK_FEATURES, FEATURES_FAQ, BEGINNER_FAQ]);
    expect(copy).toContain(`${MAX_LEVERAGE}x`);
    expect(copy).toContain(`$${STARTING_BALANCE.toLocaleString('en-US')}`);
  });
});
