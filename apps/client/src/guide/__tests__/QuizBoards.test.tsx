import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MatchQuiz } from '@/guide/MatchQuiz';
import { OrderQuiz } from '@/guide/OrderQuiz';
import { shuffledOrder, type LessonQuestion } from '@/guide/lessons';
import { guideSelector } from '@/lib/guideAnchors';

afterEach(cleanup);

const el = (anchor: Parameters<typeof guideSelector>[0], key: number) =>
  document.querySelector<HTMLButtonElement>(guideSelector(anchor, String(key)))!;
const status = () => document.querySelector('[role="status"]')?.textContent;
const checkButton = () => document.querySelector<HTMLButtonElement>(guideSelector('lesson.check'))!;

describe('shuffledOrder', () => {
  it('should be the same on every call, a permutation, and never the right order', () => {
    for (let n = 2; n <= 6; n++) {
      for (const seed of ['a', 'Put the payment in order', 'Match each part']) {
        const order = shuffledOrder(n, seed);
        expect(order).toEqual(shuffledOrder(n, seed));
        expect([...order].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(order).not.toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });
});

// Made-up content: the widgets are tested apart from any lesson
const order: LessonQuestion = {
  format: 'order',
  question: 'Put the steps in order',
  steps: ['First', 'Second', 'Third'],
  options: [],
  correct: 0,
  explain: 'First comes first.',
};

describe('OrderQuiz (Drag and drop)', () => {
  it('should place a tapped step in the tapped slot, and only allow Check once every slot is full', () => {
    render(<OrderQuiz q={order} answer={undefined} onAnswer={() => {}} />);
    expect(checkButton().disabled).toBe(true);
    fireEvent.click(el('lesson.step', 1));
    expect(el('lesson.step', 1).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(el('lesson.slot', 0));
    expect(el('lesson.slot', 0).getAttribute('aria-label')).toBe('Slot 1: Second');
    // A placed step leaves the pool
    expect(document.querySelector(guideSelector('lesson.step', '1'))).toBeNull();
  });

  it('should send a filled slot’s step back to the pool when the slot is tapped', () => {
    render(<OrderQuiz q={order} answer={undefined} onAnswer={() => {}} />);
    fireEvent.click(el('lesson.step', 2));
    fireEvent.click(el('lesson.slot', 1));
    fireEvent.click(el('lesson.slot', 1));
    expect(el('lesson.slot', 1).getAttribute('aria-label')).toBe('Slot 2: empty');
    expect(el('lesson.step', 2)).toBeTruthy();
  });

  it('should answer 0 when every step is in its slot and 1 otherwise', () => {
    const right = vi.fn();
    render(<OrderQuiz q={order} answer={undefined} onAnswer={right} />);
    for (const i of [0, 1, 2]) {
      fireEvent.click(el('lesson.step', i));
      fireEvent.click(el('lesson.slot', i));
    }
    fireEvent.click(checkButton());
    expect(right).toHaveBeenCalledWith(0);
    cleanup();

    const wrong = vi.fn();
    render(<OrderQuiz q={order} answer={undefined} onAnswer={wrong} />);
    for (const [step, slot] of [
      [1, 0],
      [0, 1],
      [2, 2],
    ]) {
      fireEvent.click(el('lesson.step', step));
      fireEvent.click(el('lesson.slot', slot));
    }
    fireEvent.click(checkButton());
    expect(wrong).toHaveBeenCalledWith(1);
  });

  it('should take a dropped step into the slot it is dropped on', () => {
    render(<OrderQuiz q={order} answer={undefined} onAnswer={() => {}} />);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
    };
    fireEvent.dragStart(el('lesson.step', 0), { dataTransfer });
    fireEvent.drop(el('lesson.slot', 2), { dataTransfer });
    expect(el('lesson.slot', 2).getAttribute('aria-label')).toBe('Slot 3: First');
  });

  it('should show the right order and the result when an answered question is shown again', () => {
    render(<OrderQuiz q={order} answer={1} onAnswer={() => {}} />);
    expect(el('lesson.slot', 0).getAttribute('aria-label')).toBe('Slot 1: First, right');
    expect(status()).toBe('Not quite. First comes first.');
    expect(document.querySelector(guideSelector('lesson.check'))).toBeNull();
  });
});

const match: LessonQuestion = {
  format: 'match',
  question: 'Match each word to its meaning',
  pairs: [
    { term: 'Alpha', meaning: 'The first' },
    { term: 'Beta', meaning: 'The second' },
    { term: 'Gamma', meaning: 'The third' },
  ],
  options: [],
  correct: 0,
  explain: 'They go in order.',
};

describe('MatchQuiz (Match boxes)', () => {
  it('should pair a tapped term with the tapped meaning, both showing the pair’s number', () => {
    render(<MatchQuiz q={match} answer={undefined} onAnswer={() => {}} />);
    fireEvent.click(el('lesson.match-term', 0));
    fireEvent.click(el('lesson.match-meaning', 0));
    expect(el('lesson.match-term', 0).getAttribute('aria-label')).toBe('Alpha, pair 1');
    expect(el('lesson.match-meaning', 0).getAttribute('aria-label')).toBe('The first, pair 1');
    expect(el('lesson.match-term', 0).textContent).toContain('①');
  });

  it('should undo a pair when a paired box is tapped, and allow Check only when every term is paired', () => {
    render(<MatchQuiz q={match} answer={undefined} onAnswer={() => {}} />);
    fireEvent.click(el('lesson.match-term', 0));
    fireEvent.click(el('lesson.match-meaning', 1));
    fireEvent.click(el('lesson.match-term', 0));
    expect(el('lesson.match-term', 0).getAttribute('aria-label')).toBe('Alpha');
    expect(checkButton().disabled).toBe(true);
  });

  it('should answer 0 when every pair is right and 1 otherwise', () => {
    const right = vi.fn();
    render(<MatchQuiz q={match} answer={undefined} onAnswer={right} />);
    for (const i of [0, 1, 2]) {
      fireEvent.click(el('lesson.match-term', i));
      fireEvent.click(el('lesson.match-meaning', i));
    }
    fireEvent.click(checkButton());
    expect(right).toHaveBeenCalledWith(0);
    cleanup();

    const wrong = vi.fn();
    render(<MatchQuiz q={match} answer={undefined} onAnswer={wrong} />);
    for (const [t, m] of [
      [0, 1],
      [1, 0],
      [2, 2],
    ]) {
      fireEvent.click(el('lesson.match-term', t));
      fireEvent.click(el('lesson.match-meaning', m));
    }
    fireEvent.click(checkButton());
    expect(wrong).toHaveBeenCalledWith(1);
  });

  it('should move a meaning to the new term when it is paired again', () => {
    render(<MatchQuiz q={match} answer={undefined} onAnswer={() => {}} />);
    fireEvent.click(el('lesson.match-term', 0));
    fireEvent.click(el('lesson.match-meaning', 2));
    fireEvent.click(el('lesson.match-term', 1));
    fireEvent.click(el('lesson.match-meaning', 2));
    expect(el('lesson.match-term', 0).getAttribute('aria-label')).toBe('Alpha');
    expect(el('lesson.match-meaning', 2).getAttribute('aria-label')).toBe('The third, pair 2');
  });

  it('should show the right pairs and the result when an answered question is shown again', () => {
    render(<MatchQuiz q={match} answer={0} onAnswer={() => {}} />);
    expect(el('lesson.match-term', 1).getAttribute('aria-label')).toBe('Beta, pair 2, right');
    expect(screen.getByRole('status').textContent).toBe('Right. They go in order.');
  });
});
