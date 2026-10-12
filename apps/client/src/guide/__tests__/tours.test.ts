import { describe, expect, it } from 'vitest';
import { isGuideAnchor } from '@/lib/guideAnchors';
import { TOUR_IDS, TOURS, getTour, isTourId } from '@/guide/tours';

describe('tours', () => {
  it('should define every tour id once', () => {
    expect(TOURS.map((t) => t.id)).toEqual([...TOUR_IDS]);
    expect(isTourId('primer')).toBe(true);
    expect(isTourId('nope')).toBe(false);
  });

  for (const tour of TOURS) {
    describe(tour.id, () => {
      it('should have at most five steps (completion falls fast past five)', () => {
        expect(tour.steps.length).toBeGreaterThan(0);
        expect(tour.steps.length).toBeLessThanOrEqual(5);
      });

      it('should number its steps <id>.1, <id>.2, … in order', () => {
        expect(tour.steps.map((s) => s.id)).toEqual(
          tour.steps.map((_, i) => `${tour.id}.${i + 1}`)
        );
      });

      it('should use registered anchors only and give every step text', () => {
        for (const s of tour.steps) {
          if (s.anchor) expect(isGuideAnchor(s.anchor), s.id).toBe(true);
          if (s.doneWhenEmpty) expect(isGuideAnchor(s.doneWhenEmpty), s.id).toBe(true);
          expect(s.text.trim().length, s.id).toBeGreaterThan(0);
        }
      });

      it('should point a click or type step at a control, and a quiz at a right answer', () => {
        for (const s of tour.steps) {
          if (s.kind === 'click' || s.kind === 'type') expect(s.anchor, s.id).toBeTruthy();
          if (s.kind === 'quiz') {
            expect(s.quiz, s.id).toBeTruthy();
            expect(s.quiz!.correct).toBeGreaterThanOrEqual(0);
            expect(s.quiz!.correct).toBeLessThan(s.quiz!.options.length);
          }
        }
      });

      it('should start on a dashboard path and chain only to a known tour', () => {
        expect(tour.startUrl).toMatch(/^\/dashboard\//);
        if (tour.next) expect(isTourId(tour.next)).toBe(true);
      });
    });
  }

  it('should chain primer → buy-first-coin → sell-and-review and end there', () => {
    expect(getTour('primer').next).toBe('buy-first-coin');
    expect(getTour('buy-first-coin').next).toBe('sell-and-review');
    expect(getTour('sell-and-review').next).toBeUndefined();
  });

  it('should have the buy tour type dollars, not coins', () => {
    const steps = getTour('buy-first-coin').steps;
    expect(steps.some((s) => s.anchor === 'trade.amount-unit' && s.key === 'usdt')).toBe(true);
    expect(steps.find((s) => s.kind === 'type')?.suggest).toBe('100');
  });
});
