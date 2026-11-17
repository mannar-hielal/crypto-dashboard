import { describe, expect, it } from 'vitest';
import { isGuideAnchor } from '@/lib/guideAnchors';
import {
  TOUR_IDS,
  TOURS,
  getTour,
  isTourId,
  PRACTICE_REVIEW_IDS,
  PRACTICE_REVIEWS,
  PRACTICE_TOURS,
  PRACTICE_TOUR_IDS,
  tourSteps,
  backIndex,
} from '@/guide/tours';

describe('tours', () => {
  it('should define every tour id once', () => {
    expect(TOURS.map((t) => t.id)).toEqual([...TOUR_IDS]);
    expect(isTourId('primer')).toBe(true);
    expect(isTourId('nope')).toBe(false);
  });

  for (const tour of [...TOURS, ...PRACTICE_TOURS, ...PRACTICE_REVIEWS]) {
    describe(tour.id, () => {
      it('should have at most five steps on each screen size (completion falls fast past five)', () => {
        for (const wide of [true, false]) {
          expect(tourSteps(tour, wide).length).toBeGreaterThan(0);
          expect(tourSteps(tour, wide).length).toBeLessThanOrEqual(5);
        }
      });

      it('should number its steps <id>.1, <id>.2, … in order, phone-only steps from 51', () => {
        // Phone-only steps numbered apart, so adding one never renumbers stored steps (2026-11-16)
        const main = tour.steps.filter((s) => s.screen !== 'phone');
        const phone = tour.steps.filter((s) => s.screen === 'phone');
        expect(main.map((s) => s.id)).toEqual(main.map((_, i) => `${tour.id}.${i + 1}`));
        expect(phone.map((s) => s.id)).toEqual(phone.map((_, i) => `${tour.id}.${51 + i}`));
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
        // A path tour chains to a path tour; a practice trade to its review (2026-11-17)
        if (tour.next) {
          expect(
            isTourId(tour.next) || (PRACTICE_REVIEW_IDS as readonly string[]).includes(tour.next)
          ).toBe(true);
        }
      });
    });
  }

  it('should end the primer alone, and chain buy-first-coin → sell-and-review', () => {
    expect(getTour('primer').next).toBeUndefined();
    expect(getTour('buy-first-coin').next).toBe('sell-and-review');
    expect(getTour('sell-and-review').next).toBeUndefined();
  });

  it('should teach going long, a position, closing it and taking a profit (the benchmark gaps)', () => {
    const buy = tourSteps(getTour('buy-first-coin'), true);
    const sell = tourSteps(getTour('sell-and-review'), true);
    expect(buy[0].text).toMatch(/Buy if you expect the price to rise, Sell to get out/);
    expect(buy[0].text).toMatch(/going long/);
    expect(buy.at(-1)!.text).toMatch(/You now hold a position: \$100 of Bitcoin, long/);
    expect(buy.at(-1)!.text).toMatch(/until you close it by selling/);
    expect(sell.map((s) => s.text).join(' ')).toMatch(/closes your position/);
    expect(sell.map((s) => s.text).join(' ')).toMatch(/taken a profit/);
  });

  it('should not assume the sell tour sells exactly $100 (a practice buy may come first)', () => {
    // Lesson 1's practice buy and its Try both buy $100 of Bitcoin (review 2026-11-16)
    const text = getTour('sell-and-review')
      .steps.map((st) => st.text)
      .join(' ');
    expect(text).not.toMatch(/\$100/);
    expect(text).toMatch(/Selling all of your Bitcoin closes your position/);
  });

  it('should have the buy tour type dollars, not coins', () => {
    const steps = getTour('buy-first-coin').steps;
    expect(steps.some((s) => s.anchor === 'trade.amount-unit' && s.key === 'usdt')).toBe(true);
    expect(steps.find((s) => s.kind === 'type')?.suggest).toBe('100');
  });

  it('should open the order form from the phone’s bar on a phone, and from the side button on a larger screen (owner 2026-11-16)', () => {
    for (const tour of [getTour('buy-first-coin'), ...PRACTICE_TOURS]) {
      expect(tourSteps(tour, false)[0].anchor, tour.id).toMatch(/^trade\.mobile\./);
      expect(tourSteps(tour, true)[0].anchor, tour.id).toMatch(/^trade\.side\./);
      expect(tour.phoneReady, tour.id).toBe(true);
    }
    // The primer's hover steps need a pointer: no phone path
    expect(getTour('primer').phoneReady).toBeUndefined();
  });

  it('should keep practice trades out of the saved, reported tours, and chain each to its review only', () => {
    expect(PRACTICE_TOURS.map((t) => t.id)).toEqual([...PRACTICE_TOUR_IDS]);
    expect(PRACTICE_REVIEWS.map((t) => t.id)).toEqual([...PRACTICE_REVIEW_IDS]);
    // Owner 2026-11-17: after the trade, a look at what just happened, then the lesson
    expect(PRACTICE_TOURS.map((t) => t.next)).toEqual([
      'review-buy',
      'review-long',
      'review-short',
    ]);
    for (const t of [...PRACTICE_TOURS, ...PRACTICE_REVIEWS]) expect(isTourId(t.id)).toBe(false);
    for (const t of PRACTICE_REVIEWS) {
      expect(t.next, t.id).toBeUndefined();
      expect(t.phoneReady, t.id).toBe(true);
      // On the practice trade's own page, and back to the lesson from its last step
      const from = PRACTICE_TOURS.find((p) => p.next === t.id)!;
      expect(t.startUrl, t.id).toBe(from.startUrl);
      expect(t.steps.at(-1)!.nextLabel, t.id).toBe('Back to the lesson');
    }
    // On Ethereum: one position per symbol, so a short on Bitcoin would only close the practice long
    expect(getTour('practice-long').startUrl).toBe('/dashboard/usdt/BTCUSDT');
    expect(getTour('practice-short').startUrl).toBe('/dashboard/usdt/ETHUSDT');
    expect(tourSteps(getTour('practice-short'), false)[0].anchor).toBe('trade.mobile.sell');
  });

  it('should go back past a phone step already done, and nowhere when only it is behind', () => {
    const phone = tourSteps(getTour('practice-buy'), false);
    const tap = phone[0].id; // Tap Buy / Long
    expect(backIndex(phone, 1, [tap])).toBeNull();
    expect(backIndex(phone, 1, [])).toBe(0); // not done in this run: it may be shown again
    expect(backIndex(phone, 2, [tap])).toBe(1);
    expect(backIndex(phone, 0, [])).toBeNull();
  });

  it('should show what each practice trade changed in the account panel (owner 2026-11-17)', () => {
    const where = (id: 'review-buy' | 'review-long' | 'review-short') =>
      getTour(id).steps.map((st) => [st.kind, st.anchor, st.key]);
    // The coin bought: the Assets tab, Bitcoin's row, its unrealized PnL
    expect(where('review-buy')).toEqual([
      ['click', 'account.tab', 'assets'],
      ['observe', 'assets.row', 'BTC'],
      ['observe', 'assets.row.upnl', 'BTC'],
    ]);
    // The open long and the open short: the Positions tab, the position's row
    expect(where('review-long')).toEqual([
      ['click', 'account.tab', 'positions'],
      ['observe', 'positions.row', 'linear:BTCUSDT'],
    ]);
    expect(where('review-short')).toEqual([
      ['click', 'account.tab', 'positions'],
      ['observe', 'positions.row', 'linear:ETHUSDT'],
    ]);
    expect(getTour('review-short').steps.at(-1)!.text).toMatch(/grows when the price falls/);
    // Fact check 2026-11-17: the fee in the coin and in Avg cost; PnL before the selling fee
    const buy = getTour('review-buy').steps.map((st) => st.text);
    expect(buy[1]).toBe(
      'This row is your Bitcoin. You paid $100; you hold a hair less (about $99.90 of Bitcoin) because Spot’s 0.1% fee is taken in the coin. Avg cost is what you paid per coin, fee included, so a hair above the price you bought at.'
    );
    expect(buy[2]).toMatch(
      /^Unrealized PnL is what you’d gain or lose if you sold right now, before the selling fee\. It changes/
    );
    // The long's P&L follows the Mark Price, not every tick
    const long = getTour('review-long').steps.at(-1)!.text;
    expect(long).toMatch(/Unrealized P&L moves with the Mark Price\./);
    for (const id of ['review-long', 'review-short'] as const)
      expect(getTour(id).steps.at(-1)!.text, id).not.toMatch(/every tick/);
    // The trade's last step says a look comes next, not that the lesson carries on
    for (const t of PRACTICE_TOURS)
      expect(t.steps.at(-1)!.text, t.id).toMatch(/Next, a quick look/);
  });
});
