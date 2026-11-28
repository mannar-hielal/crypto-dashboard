import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import React from 'react';

import {
  BEGINNER_FAQ,
  COINS,
  GROUPS,
  PATH_CARDS,
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
    render(React.createElement(StartLink, { cta: BEGINNER_FAQ[0]!.cta!, live: false }));
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

  it('should load the coin logos at once (a sliding ribbon would show blanks), with a size, from our own files', () => {
    const { container } = render(React.createElement(CoinRibbon));
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(COINS.length * 2);
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBeNull();
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

describe('Timeline', () => {
  afterEach(cleanup);

  it('should list the milestones as an ordered list', () => {
    render(React.createElement(Timeline));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(TIMELINE.length);
  });
});

describe('the chapter claims on the pages', () => {
  it('should say each chapter ends with a checkpoint, as each now has one (owner 2026-11-28)', async () => {
    const { CHAPTERS } = await import('@/learn/path');
    const { FEATURES_FAQ } = await import('@/lib/landingContent');
    const hasCheckpoint = CHAPTERS.map(
      (c) => c.status === 'open' && c.nodes.some((n) => n.kind === 'checkpoint')
    );
    expect(hasCheckpoint).toEqual([true, true]);
    const answers = [...BEGINNER_FAQ, ...FEATURES_FAQ].map((q) => q.answer);
    const mentions = answers.filter((a) => /checkpoint/i.test(a));
    expect(mentions.length).toBeGreaterThan(0);
    for (const a of mentions) {
      expect(a).toMatch(/Each chapter ends with a checkpoint/);
      expect(a).not.toMatch(/Chapter 1 ends with/);
    }
  });
});

describe('the lesson and chapter facts on the pages', () => {
  it('should pin the lesson count to the lessons themselves (review 2026-11-22)', async () => {
    const { LESSONS } = await import('@/guide/lessons');
    const { CHAPTERS } = await import('@/learn/path');
    const { FEATURES_FAQ } = await import('@/lib/landingContent');
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
    const { FEATURES_FAQ } = await import('@/lib/landingContent');
    const { FLIP_CARDS } = await import('@/lib/howItWorksContent');
    const titles = FLIP_CARDS.map((f) => f.title);
    expect(titles).toContain(`${INTERVALS.length} timeframes`);
    expect(titles).toContain(`${INDICATOR_CATALOG.length} indicators`);
    const copy = JSON.stringify([FLIP_CARDS, FEATURES_FAQ, BEGINNER_FAQ]);
    expect(copy).toContain(`${MAX_LEVERAGE}x`);
    expect(copy).toContain(`$${STARTING_BALANCE.toLocaleString('en-US')}`);
  });
});

describe('the table’s column order', () => {
  it('should keep the competitor groups in one fixed order, which every row’s marks follow (review 2026-11-22)', () => {
    expect(GROUPS.map((g) => g.id)).toEqual([
      'exchange',
      'charting',
      'games',
      'journals',
      'bots',
      'prop',
    ]);
    for (const row of TABLE_ROWS) expect(row.groups, row.id).toHaveLength(GROUPS.length);
  });
});

describe('the card screenshots and the pretend money (owner 2026-11-22)', () => {
  afterEach(cleanup);

  it('should fade a real capture behind both faces of each flip card, as decoration', async () => {
    const { FlipCards } = await import('../FlipCards');
    const { FLIP_CARDS } = await import('@/lib/howItWorksContent');
    const { container } = render(React.createElement(FlipCards));
    expect(container.querySelectorAll('li')).toHaveLength(FLIP_CARDS.length);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(FLIP_CARDS.length * 2);
    for (const img of imgs) {
      // Decorative: the words say it all; sized, and loaded late
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('width')).toBeTruthy();
      expect(img.getAttribute('height')).toBeTruthy();
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });

  it('should keep both faces of a flip card in the page and turn it over on a tap', async () => {
    const { FlipCards } = await import('../FlipCards');
    const { FLIP_CARDS } = await import('@/lib/howItWorksContent');
    render(React.createElement(FlipCards));
    // The front's figure and the back's words are both readable by a screen reader and a crawler
    for (const c of FLIP_CARDS) expect(screen.getByText(c.text)).not.toBeNull();
    const first = screen.getAllByRole('button')[0]!;
    // A tap turns the card (where there is no hover); with a mouse, hover decides. Both faces stay in the
    // page, so the button carries no pressed state
    expect(first.hasAttribute('aria-pressed')).toBe(false);
    const press = (type: string) =>
      fireEvent(
        first,
        Object.assign(new MouseEvent('pointerdown', { bubbles: true }), { pointerType: type })
      );
    expect(first.getAttribute('data-flipped')).toBe('false');
    // A mouse click does nothing (hover decides)
    press('mouse');
    fireEvent.click(first);
    expect(first.getAttribute('data-flipped')).toBe('false');
    // A finger's tap turns the card, and a second tap turns it back
    press('touch');
    fireEvent.click(first);
    expect(first.getAttribute('data-flipped')).toBe('true');
    press('touch');
    fireEvent.click(first);
    expect(first.getAttribute('data-flipped')).toBe('false');
  });

  it('should give each "not" card a stop sign, and the text', async () => {
    const { NotCards } = await import('../NotCards');
    const { NOT_THIS } = await import('@/lib/howItWorksContent');
    const { container } = render(React.createElement(NotCards));
    expect(container.querySelectorAll('li')).toHaveLength(NOT_THIS.length);
    expect(container.querySelectorAll('li svg[aria-hidden="true"]')).toHaveLength(NOT_THIS.length);
    for (const n of NOT_THIS) expect(screen.getByText(n.text)).not.toBeNull();
  });

  it('should show where the pretend money lives: the panel with its balance, a coin, and the reset window', async () => {
    const { PretendMoney } = await import('../PretendMoney');
    const { PRETEND_MONEY } = await import('@/lib/landingContent');
    const { container } = render(React.createElement(PretendMoney));
    expect(screen.getByRole('heading', { name: PRETEND_MONEY.title })).not.toBeNull();
    expect(screen.getByText(PRETEND_MONEY.callout)).not.toBeNull();
    // The two screenshots say what they show; the coin is a drawing
    expect(screen.getByRole('img', { name: PRETEND_MONEY.panelAlt })).not.toBeNull();
    expect(screen.getByRole('img', { name: PRETEND_MONEY.resetAlt })).not.toBeNull();
    expect(container.querySelector('svg[aria-hidden="true"]')?.textContent).toMatch(/PRETEND/);
    expect(PRETEND_MONEY.panelAlt).toMatch(/\$10,000\.00/);
    expect(PRETEND_MONEY.resetText).toMatch(/twice/);
  });
});
