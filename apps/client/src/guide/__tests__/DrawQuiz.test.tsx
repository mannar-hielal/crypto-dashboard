import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { daySeconds } from '@/guide/lessonChartData';
import { guideSelector } from '@/lib/guideAnchors';
import type { LessonChartApi } from '@/guide/LessonChart';
import type { LessonQuestion } from '@/guide/lessons';

// The real chart needs a canvas: this stand-in lays 15 daily candles (8 to 22 April) out 30 px
// apart and gives each close a height, so the widget's maths runs without lightweight-charts.
const DAY = 86_400;
const T0 = daySeconds('2025-04-08');
const CLOSES = [100, 105, 112, 108, 104, 107, 115, 120, 118, 125, 130, 128, 135, 140, 150];
const bars = CLOSES.map((close, i) => ({
  time: T0 + i * DAY,
  open: close,
  high: close + 2,
  low: close - 2,
  close,
}));
const api = {
  chart: { timeScale: () => ({ timeToCoordinate: (t: number) => ((t - T0) / DAY) * 30 + 20 }) },
  series: { priceToCoordinate: (p: number) => 240 - p },
  bars,
} as unknown as LessonChartApi;

vi.mock('@/guide/LessonChart', () => ({
  LessonChart: ({ onReady }: { onReady?: (a: LessonChartApi) => void }) => {
    // Hand the widget the stand-in once, as the real chart does after laying out
    useEffect(() => {
      onReady?.(api);
    }, [onReady]);
    return <div data-testid="chart" />;
  },
}));

const { DrawQuiz } = await import('@/guide/DrawQuiz');

const q: LessonQuestion = {
  format: 'draw',
  chart: {
    symbol: 'BTCUSDT',
    end: '2025-04-22',
    bars: 15,
    markers: [],
    label: 'A test chart',
    fallback: 'swings',
  },
  draw: {
    buy: { date: '2025-04-08', price: 100, label: 'Buy' },
    sell: { date: '2025-04-22', price: 150, label: 'Sell' },
    hint: 'Start at the first candle.',
  },
  question: 'Draw the trade.',
  options: [],
  correct: 0,
  explain: 'A trade is a path.',
};

afterEach(cleanup);

const area = () => document.querySelector<HTMLElement>(guideSelector('lesson.draw-area'))!;
const check = () => document.querySelector<HTMLButtonElement>(guideSelector('lesson.check'))!;
const clear = () => document.querySelector<HTMLButtonElement>(guideSelector('lesson.draw-clear'))!;
const status = () =>
  [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).join(' ');

async function mount(onAnswer = vi.fn(), answer?: number) {
  const view = render(<DrawQuiz q={q} answer={answer} onAnswer={onAnswer} />);
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, onAnswer };
}

/** Walk the keyboard marker: n presses of ArrowRight, then Enter */
const keys = (...list: string[]) => {
  for (const key of list) fireEvent.keyDown(area(), { key });
};

describe('DrawQuiz (three tries)', () => {
  it('should show the answer after the third wrong check, with no Try again (owner 2026-11-18)', async () => {
    const onAnswer = vi.fn();
    function Harness() {
      const [answer, setAnswer] = useState<number | undefined>(undefined);
      return (
        <DrawQuiz
          q={q}
          answer={answer}
          onAnswer={(a) => {
            onAnswer(a);
            setAnswer(a);
          }}
          onRetry={() => setAnswer(undefined)}
        />
      );
    }
    render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    const wrongLine = () => {
      fireEvent.pointerDown(area(), { clientX: 20, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(area(), { clientX: 440, clientY: 10, pointerId: 1 });
      fireEvent.pointerUp(area(), { pointerId: 1 });
      fireEvent.click(check());
    };
    wrongLine();
    expect(onAnswer).toHaveBeenLastCalledWith(-1);
    expect(status()).toContain('Not quite.');
    fireEvent.click(screen.getByText('Try again'));
    wrongLine();
    expect(onAnswer).toHaveBeenLastCalledWith(-1);
    fireEvent.click(screen.getByText('Try again'));
    wrongLine();
    // The third miss unlocks the lesson as answered, says so, and offers no more tries
    expect(onAnswer).toHaveBeenLastCalledWith(0);
    expect(status()).toContain('That’s three tries.');
    expect(status()).not.toContain('Not quite.');
    expect(status()).toContain('A trade is a path.');
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

describe('DrawQuiz (Draw a line)', () => {
  it('should show the question, so the learner knows what to draw', async () => {
    await mount();
    expect(screen.getByText('Draw the trade.')).toBeTruthy();
  });

  it('should keep Check off for a tap or a tiny scribble, on only once the line runs across', async () => {
    await mount();
    fireEvent.pointerDown(area(), { clientX: 20, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 24, clientY: 141, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(check().disabled).toBe(true);
    fireEvent.pointerDown(area(), { clientX: 20, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 200, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(check().disabled).toBe(false);
  });

  it('should say both days are placed when Enter is pressed again, not ask for a later day', async () => {
    await mount();
    keys('Enter', ...Array(14).fill('ArrowRight'), 'Enter', 'Enter');
    expect(status()).toContain('Both days are placed');
  });

  it('should keep Check off until there is a line, and give the hint on request', async () => {
    await mount();
    expect(check().disabled).toBe(true);
    expect(screen.queryByText('Start at the first candle.')).toBeNull();
    fireEvent.click(document.querySelector(guideSelector('lesson.draw-hint'))!);
    expect(screen.getByText('Start at the first candle.')).toBeTruthy();
  });

  it('should answer right for a keyboard learner who places the buy and the sell on the right days', async () => {
    const { onAnswer } = await mount();
    keys('Enter'); // buy on the first day
    expect(status()).toContain('Buy placed on 8 April');
    keys(...Array(14).fill('ArrowRight'), 'Enter'); // sell on the last day
    expect(status()).toContain('Sell placed on 22 April');
    expect(check().disabled).toBe(false);
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith(0);
  });

  it('should answer -1 when the buy and sell are on the wrong days', async () => {
    const { onAnswer } = await mount();
    keys('ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter'); // buy too late
    keys('ArrowRight', 'ArrowRight', 'Enter'); // sell too early
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith(-1);
  });

  it('should refuse a sell on or before the buy day, asking for a later one', async () => {
    await mount();
    keys('ArrowRight', 'Enter', 'Enter');
    expect(status()).toContain('Move to a later day');
    expect(check().disabled).toBe(true);
  });

  it('should clear the line with the trash button, leaving Check off', async () => {
    await mount();
    keys('Enter', ...Array(14).fill('ArrowRight'), 'Enter');
    expect(check().disabled).toBe(false);
    fireEvent.click(clear());
    expect(check().disabled).toBe(true);
    expect(clear().disabled).toBe(true);
  });

  it('should take a freehand line drawn with a pointer, and grade it against the path', async () => {
    const { onAnswer } = await mount();
    const down = (x: number, y: number) =>
      fireEvent.pointerDown(area(), { clientX: x, clientY: y, pointerId: 1 });
    const move = (x: number, y: number) =>
      fireEvent.pointerMove(area(), { clientX: x, clientY: y, pointerId: 1 });
    // From the buy (x 20, close 100 → y 140) along the closes to the sell (x 440, close 150 → y 90)
    down(20, 140);
    bars.forEach((b, i) => move(i * 30 + 20, 240 - b.close));
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(check().disabled).toBe(false);
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith(0);
  });

  it('should answer -1 for a freehand line that ignores the path', async () => {
    const { onAnswer } = await mount();
    fireEvent.pointerDown(area(), { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 440, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith(-1);
  });

  it('should say Right. with the Why when answered right, and Not quite. with Try again when not', async () => {
    const view = await mount(vi.fn(), 0);
    expect(status()).toContain('Right.');
    expect(status()).toContain('A trade is a path.');
    expect(screen.getByText('Our path, dotted:')).toBeTruthy();
    view.unmount();
    function Harness() {
      const [answer, setAnswer] = useState<number | undefined>(-1);
      return (
        <DrawQuiz q={q} answer={answer} onAnswer={setAnswer} onRetry={() => setAnswer(undefined)} />
      );
    }
    render(<Harness />);
    expect(status()).toContain('Not quite.');
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
