import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BuySellView } from '@/guide/BuySellView';
import type { LessonQuestion } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

// A made-up question: the plan decides the answer (owner's visual Q&A, 2026-11-16)
const q: LessonQuestion = {
  format: 'buy-sell',
  plan: 'Your plan: buy if a day closes above $41,000. Today it closed at $42,300.',
  question: 'What does your plan say to do?',
  options: ['Buy', 'Sell'],
  correct: 0,
  explain: 'Your plan said buy on a close above $41,000, and that is what happened.',
  chart: {
    symbol: 'BTCUSDT',
    end: '2024-01-23',
    bars: 40,
    markers: [],
    freezeAt: '2024-01-10',
    label: 'Bitcoin daily candles',
    fallback: 'etf',
  },
};

const side = (name: 'buy' | 'sell') =>
  document.querySelector<HTMLButtonElement>(guideSelector('lesson.side', name))!;

afterEach(cleanup);

describe('BuySellView', () => {
  it('should show the plan, then Buy and Sell as two buttons with their words', () => {
    render(<BuySellView q={q} answer={undefined} onAnswer={() => {}} />);
    expect(screen.getByText(q.plan!)).toBeTruthy();
    expect(side('buy').textContent).toContain('Buy');
    expect(side('sell').textContent).toContain('Sell');
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('should answer with the index of the side clicked', () => {
    const onAnswer = vi.fn();
    render(<BuySellView q={q} answer={undefined} onAnswer={onAnswer} />);
    fireEvent.click(side('sell'));
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  it('should say Right. and the Why when the plan was followed, and lock both buttons', () => {
    render(<BuySellView q={q} answer={0} onAnswer={() => {}} />);
    const status = document.querySelector('[role="status"]')!;
    expect(status.textContent).toBe(`Right. ${q.explain}`);
    expect(side('buy').disabled).toBe(true);
    expect(side('sell').disabled).toBe(true);
    expect(screen.getByLabelText('right answer')).toBeTruthy();
    // The side not picked, with no mark, is dimmed so the tick reads first
    expect(side('sell').className).toMatch(/unpicked/);
    expect(side('buy').className).not.toMatch(/unpicked/);
  });

  it('should say Not quite. and mark only the wrong pick, never pointing at the right side', () => {
    render(<BuySellView q={q} answer={1} onAnswer={() => {}} onRetry={() => {}} />);
    expect(document.querySelector('[role="status"]')!.textContent).toMatch(
      `Not quite. ${q.explain}`
    );
    expect(side('sell').querySelector('[aria-label="your pick, not quite"]')).toBeTruthy();
    // Try again still asks (owner 2026-11-17): the right side carries no mark and isn't dimmed
    expect(side('buy').querySelector('[aria-label="right answer"]')).toBeNull();
    expect(side('buy').className).not.toMatch(/unpicked/);
    expect(side('sell').className).not.toMatch(/unpicked/);
  });

  it('should caption the reveal of a frozen chart only after the answer', () => {
    const { rerender } = render(<BuySellView q={q} answer={undefined} onAnswer={() => {}} />);
    expect(screen.queryByText(/What happened next/)).toBeNull();
    rerender(<BuySellView q={q} answer={0} onAnswer={() => {}} />);
    expect(screen.getByText(/What happened next \(the plan doesn.t depend on it\)/)).toBeTruthy();
  });

  it('should move between Buy and Sell with the arrow keys', () => {
    render(<BuySellView q={q} answer={undefined} onAnswer={() => {}} />);
    side('buy').focus();
    fireEvent.keyDown(side('buy'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(side('sell'));
    fireEvent.keyDown(side('sell'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(side('buy'));
  });

  it('should offer Try again after a wrong pick, and none after a right one (owner 2026-11-17)', () => {
    const retry = vi.fn();
    render(<BuySellView q={q} answer={1} onAnswer={() => {}} onRetry={retry} />);
    fireEvent.click(document.querySelector(guideSelector('lesson.retry'))!);
    expect(retry).toHaveBeenCalledTimes(1);
    cleanup();
    render(<BuySellView q={q} answer={0} onAnswer={() => {}} onRetry={retry} />);
    expect(document.querySelector(guideSelector('lesson.retry'))).toBeNull();
  });

  it('should show the right side after a wrong pick where there is no Try again (one scored go)', () => {
    render(<BuySellView q={q} answer={1} onAnswer={() => {}} />);
    expect(side('buy').querySelector('[aria-label="right answer"]')).toBeTruthy();
  });

  it('should keep what happened next hidden after a wrong pick until the answer is right', () => {
    const chartQ = { ...q, chart: { ...(q.chart ?? {}), freezeAt: '2024-01-10' } } as typeof q;
    const { rerender } = render(
      <BuySellView q={chartQ} answer={1} onAnswer={() => {}} onRetry={() => {}} />
    );
    expect(screen.queryByText(/What happened next/)).toBeNull();
    rerender(<BuySellView q={chartQ} answer={0} onAnswer={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/What happened next/)).toBeTruthy();
  });
});
