import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Guide, GuideFigure } from '@/guide/art/Guide';
import { WORLD_DOTS, WORLD_DOTS_HEIGHT, WORLD_DOTS_WIDTH } from '@/guide/art/worldDots';
import { GuideAvatar, LessonArt } from '@/guide/LessonArt';
import { ART_LABELS, MOODS, type LessonArtId } from '@/guide/lessons';

const ARTS: LessonArtId[] = [
  'ledger',
  'bitcoin',
  'etf',
  'flashCrash',
  'staircase',
  'deepThin',
  'candleAnatomy',
  'swings',
  'checkCoin',
  'threePaths',
  'buySell',
  'closeToKeep',
  'shortGame',
  'alwaysOpen',
  'hashChain',
  'sealBroken',
  'friends',
  'lena',
  'zoe',
  'twoRoads',
  'coinRoad',
  'tollBooth',
  'tickerBadges',
  'shopRoad',
  'arcadeCredits',
  'shareCertificate',
  'ballotBox',
  'calmStormy',
  'stopCoin',
  'wobbleSteady',
  'steadyPeg',
  'cloakroom',
  'vaultDollar',
  'vaultCrypto',
  'vaultRule',
  'vaultCheck',
  'usdtPair',
  'parkProfit',
  'pegDip',
  'tooSweet',
  'mailboxWall',
  'keyRing',
  'slotAndKey',
  'walletJobs',
  'samGlass',
  'phoneSea',
  'bankHolds',
  'lockedCounter',
  'ownKeys',
  'noReset',
  'phraseCard',
  'phraseNever',
  'hotPhone',
  'coldDevice',
  'purseSafe',
];

/** The pictures drawn to tell most of their card (owner 2026-11-17): each says what it shows */
const TELLING: LessonArtId[] = [
  'staircase',
  'deepThin',
  'threePaths',
  'buySell',
  'closeToKeep',
  'shortGame',
  'alwaysOpen',
  'hashChain',
  'sealBroken',
  'friends',
  'lena',
  'zoe',
  'twoRoads',
  'coinRoad',
  'tollBooth',
  'tickerBadges',
  'shopRoad',
  'calmStormy',
  'wobbleSteady',
  'steadyPeg',
  'cloakroom',
  'vaultDollar',
  'vaultCrypto',
  'vaultRule',
  'vaultCheck',
  'usdtPair',
  'parkProfit',
  'pegDip',
  'keyRing',
  'slotAndKey',
  'walletJobs',
  'samGlass',
  'phoneSea',
  'lockedCounter',
  'phraseCard',
  'phraseNever',
  'hotPhone',
  'coldDevice',
  'purseSafe',
];

describe('the guides', () => {
  afterEach(() => cleanup());

  it('should put round glasses on either guide only when asked, in every mood (owner 2026-11-17)', () => {
    for (const who of ['tick', 'tock'] as const) {
      for (const mood of MOODS) {
        const { container, unmount } = render(<GuideFigure who={who} mood={mood} glasses />);
        const glasses = container.querySelector('[data-glasses]')!;
        // Two round frames, a bridge and two arms
        expect(glasses.querySelectorAll('circle')).toHaveLength(2);
        expect(glasses.querySelectorAll('path')).toHaveLength(3);
        unmount();
      }
      const { container } = render(<GuideFigure who={who} mood="smile" />);
      expect(container.querySelector('[data-glasses]')).toBeNull();
      cleanup();
    }
  });

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
      if (TELLING.includes(id)) {
        expect(svg.getAttribute('role'), id).toBe('img');
        expect(svg.getAttribute('aria-label'), id).toBe(ART_LABELS[id]);
        expect(svg.getAttribute('aria-hidden'), id).toBeNull();
      } else {
        expect(svg.getAttribute('aria-hidden'), id).toBe('true');
        expect(svg.getAttribute('aria-label'), id).toBeNull();
      }
      // The presenter points by default
      expect(svg.querySelector('[data-mood="wink"]')?.getAttribute('data-pose'), id).toBe('point');
      unmount();
    }
  });

  it('should give every telling picture a label that says what it shows (owner 2026-11-17)', () => {
    expect(Object.keys(ART_LABELS).sort()).toEqual([...ARTS].sort());
    for (const id of TELLING) expect(ART_LABELS[id]?.length ?? 0, id).toBeGreaterThan(40);
    // The pictures' own words, so the drawing alone carries the card
    const words = (id: LessonArtId) => render(<LessonArt id={id} />).container.textContent ?? '';
    expect(words('threePaths')).toMatch(/climbs.*up wins.*slides.*down wins.*sideways/);
    expect(words('buySell')).toMatch(/Buy: pay \$, get coin.*Sell: hand coin, get \$/);
    expect(words('closeToKeep')).toMatch(/on paper.*\+\$120\?.*Close.*\+\$120.*yours to keep/);
    expect(words('shortGame')).toMatch(/\$60.*\$40.*keep \$20/);
    expect(words('alwaysOpen')).toMatch(/Shop.*Crypto.*open 24\/7/);
    // Chapter 2, Lesson 5: the road scenes say who has their own road, and LINK is set apart
    expect(words('twoRoads')).toMatch(/Its own road.*Someone else’s road/);
    expect(words('coinRoad')).toMatch(/Its blockchain/);
    expect(words('tollBooth')).toMatch(/Fee.*paid in the coin/);
    expect(words('shopRoad')).toMatch(/Token.*house.*rules/);
    expect(words('calmStormy')).toMatch(/steady.*swings/);
    // Chapter 2, Lesson 6: the cloakroom scenes say what stands behind each ticket
    expect(words('cloakroom')).toMatch(/\$1 in.*ticket out.*cloakroom/);
    expect(words('vaultDollar')).toMatch(/counter.*real money/);
    expect(words('vaultCrypto')).toMatch(/counter.*extra crypto/);
    expect(words('vaultRule')).toMatch(/counter.*just a rule/);
    expect(words('usdtPair')).toMatch(/BTC.*USDT.*priced in.*1 BTC costs/);
    expect(words('pegDip')).toMatch(/\$1\.00 peg.*about \$0\.87.*drawn example/);
    // Chapter 2, Lesson 7: the wallet scenes carry their cards, and hot and cold have text tags
    expect(words('keyRing')).toMatch(/wallet = key ring.*the coins stay on the blockchain/);
    expect(words('slotAndKey')).toMatch(/address.*safe to share.*private key.*keep it secret/);
    expect(words('walletJobs')).toMatch(/see.*receive.*sign/);
    expect(words('samGlass')).toMatch(/Sam.*2 BTC.*he can look, not spend/);
    expect(words('phoneSea')).toMatch(/2 BTC still here.*no key to spend them/);
    expect(words('lockedCounter')).toMatch(/withdrawals frozen/);
    expect(words('phraseCard')).toMatch(/12 words, in order/);
    expect(words('phraseNever')).toMatch(/photo.*cloud.*email.*paper, offline, and no one else/);
    expect(words('hotPhone')).toMatch(/online/);
    expect(words('coldDevice')).toMatch(/offline.*the key never leaves/);
    expect(words('purseSafe')).toMatch(/hot.*a little, for today.*cold.*the rest, for later/);
    // The recovery phrase picture never shows real words: twelve numbers, no letters
    const phrase = render(<LessonArt id="phraseCard" />).container.textContent ?? '';
    expect(phrase.replace('12 words, in order', '')).toMatch(/^123456789101112$/);
    const badges = render(<LessonArt id="tickerBadges" />).container.textContent ?? '';
    expect(badges).toMatch(/BTC.*ETH.*SOL.*BNB.*XRP.*ADA.*AVAX.*DOGE.*LINK.*a token/);
    // The chain: each block's prev is the fingerprint of the block before it
    const chain = render(<LessonArt id="hashChain" />).container.textContent ?? '';
    expect(chain).toMatch(/#k7q2.*#k7q2.*#m4x9.*#m4x9/);
    // The broken seal: the edited block, and the links after it crossed out
    const seal = render(<LessonArt id="sealBroken" />).container;
    expect(seal.textContent).toMatch(/pays 5 → 9.*redo every block after/);
    expect([...seal.querySelectorAll('text')].filter((t) => t.textContent === '✕')).toHaveLength(2);
  });

  it('should show real coin logos, not plain ticker circles (owner 2026-11-20)', () => {
    const logos = (id: LessonArtId) =>
      render(<LessonArt id={id} />).container.querySelectorAll('image').length;
    expect(logos('tickerBadges')).toBe(9); // the eight coins and LINK
    expect(logos('usdtPair')).toBe(2); // BTC and USDT
    expect(logos('parkProfit')).toBe(1); // USDT
  });

  it('should draw no presenter when none is given (a chart card’s stand-in picture)', () => {
    const { container } = render(<LessonArt id="etf" />);
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
