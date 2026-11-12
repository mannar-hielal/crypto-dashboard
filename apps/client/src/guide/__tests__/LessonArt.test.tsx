import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Guide, GuideFigure } from '@/guide/art/Guide';
import { WORLD_DOTS, WORLD_DOTS_HEIGHT, WORLD_DOTS_WIDTH } from '@/guide/art/worldDots';
import { GuideAvatar, LessonArt } from '@/guide/LessonArt';
import { MOODS, type LessonArtId } from '@/guide/lessons';

const ARTS: LessonArtId[] = [
  'money',
  'notebook',
  'ledger',
  'mailbox',
  'queues',
  'tesla',
  'etf',
  'flashCrash',
  'staircase',
  'candleAnatomy',
  'swings',
  'checkCoin',
];

describe('the guides', () => {
  afterEach(() => cleanup());

  it('should draw every mood for both guides, each with its wick cue', () => {
    for (const who of ['tick', 'tock'] as const) {
      for (const mood of MOODS) {
        const { container, unmount } = render(
          <svg>
            <Guide who={who} mood={mood} />
          </svg>
        );
        const g = container.querySelector(`[data-mood="${mood}"]`)!;
        expect(g.getAttribute('data-guide-who'), `${who} ${mood}`).toBe(who);
        // A face: at least one eye or closed-eye arc, and a mouth
        expect(
          g.querySelectorAll('circle, path, ellipse').length,
          `${who} ${mood}`
        ).toBeGreaterThan(3);
        unmount();
      }
    }
  });

  it('should raise an arm to point or wave, and keep both down when standing', () => {
    const arms = (pose: 'stand' | 'point' | 'wave') => {
      const { container, unmount } = render(<GuideFigure who="tick" mood="smile" pose={pose} />);
      const g = container.querySelector(`[data-pose="${pose}"]`)!;
      const hands = g.querySelectorAll(':scope > circle').length;
      unmount();
      return hands;
    };
    expect(arms('stand')).toBe(0);
    expect(arms('point')).toBe(1);
    expect(arms('wave')).toBe(1);
  });

  it('should give dialogue lines a friendly face: Pulin smiling, Berwyn calm', () => {
    const { container } = render(
      <>
        <GuideAvatar who="tick" />
        <GuideAvatar who="tock" />
      </>
    );
    const moods = [...container.querySelectorAll('[data-mood]')].map((g) =>
      g.getAttribute('data-mood')
    );
    expect(moods).toEqual(['smile', 'calm']);
  });
});

describe('LessonArt', () => {
  afterEach(() => cleanup());

  it('should draw every picture, with its presenter standing in it', () => {
    for (const id of ARTS) {
      const { container, unmount } = render(
        <LessonArt id={id} presenter={{ who: 'tock', mood: 'wink' }} />
      );
      const svg = container.querySelector(`[data-lesson-art="${id}"]`)!;
      expect(svg.getAttribute('aria-hidden'), id).toBe('true');
      // The presenter points by default
      expect(svg.querySelector('[data-mood="wink"]')?.getAttribute('data-pose'), id).toBe('point');
      unmount();
    }
  });

  it('should draw the private key as the articles’ stamp on the mailbox card', () => {
    const { container } = render(
      <LessonArt id="mailbox" presenter={{ who: 'tock', mood: 'wink' }} />
    );
    expect(container.querySelectorAll('svg[data-stamp]')).toHaveLength(1);
  });

  it('should show the ledger, not coins, beside the phone and its recovery words', () => {
    const { container } = render(<LessonArt id="keyHolders" />);
    // Owner 2026-11-12: bitcoin has no coins; a balance is the ledger added up
    expect(container.textContent).toContain('the ledger');
    expect(container.textContent).toContain('your balance = the ledger, added up');
    expect(container.textContent).not.toMatch(/coins/);
  });

  it('should draw no presenter when none is given (a chart card’s stand-in picture)', () => {
    const { container } = render(<LessonArt id="tesla" />);
    expect(container.querySelector('[data-mood]')).toBeNull();
  });

  it('should spread the ledgers across a dotted world map', () => {
    const { container } = render(<LessonArt id="ledger" />);
    expect(WORLD_DOTS.length).toBeGreaterThan(900);
    for (const [x, y] of WORLD_DOTS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(WORLD_DOTS_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(WORLD_DOTS_HEIGHT);
    }
    // the dots, then 7 ledger copies, each with a halo
    expect(container.querySelectorAll('circle[r="1.25"]').length).toBe(WORLD_DOTS.length);
    expect(container.querySelectorAll('circle[r="11"]').length).toBe(7);
  });
});
