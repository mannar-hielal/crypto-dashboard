import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

import { ArticleWidget } from '@/learn/ArticleWidgets';
import { guideSelector } from '@/lib/guideAnchors';

const status = () => screen.getByRole('status').textContent;
const click = (anchor: Parameters<typeof guideSelector>[0], key?: string) =>
  fireEvent.click(document.querySelector(guideSelector(anchor, key))!);

describe('the Many notebooks widgets', () => {
  beforeEach(() => {
    reduced = false;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should show a node’s three jobs as tiles', () => {
    render(<ArticleWidget id="node-jobs" />);
    expect(
      screen.getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)
    ).toEqual(['Store', 'Relay', 'Verify']);
  });

  it('should spread a payment ring by ring, 1 then 8 then 64', () => {
    vi.useFakeTimers();
    render(<ArticleWidget id="gossip" />);
    const lit = () => document.querySelectorAll('circle[class*="dotLit"]').length;
    expect(lit()).toBe(1);
    click('article.gossip.send');
    act(() => vi.advanceTimersByTime(800));
    expect(lit()).toBe(1 + 8);
    act(() => vi.advanceTimersByTime(800));
    expect(lit()).toBe(1 + 8 + 64);
    expect(screen.getByText(/64, then everyone/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy();
  });

  it('should light every ring at once with reduced motion', () => {
    reduced = true;
    render(<ArticleWidget id="gossip" />);
    click('article.gossip.send');
    expect(document.querySelectorAll('circle[class*="dotLit"]')).toHaveLength(1 + 8 + 64);
  });

  it('should add Sofia’s history up to 6, and reject a payment of 9', () => {
    render(<ArticleWidget id="balance-history" />);
    expect(screen.getByText('= 6')).toBeTruthy();
    click('article.balance.try');
    expect(status()).toBe('✗ Rejected by every node: 9 is more than 6.');
  });

  it('should pass Sofia’s stamp and catch both of Sam’s tricks', () => {
    render(<ArticleWidget id="stamp-check" />);
    expect(status()).toBe('Pick who stamps the payment.');
    const pose = () => document.querySelector('[data-pose]')!.getAttribute('data-pose');
    expect(pose()).toBe('rest');
    click('article.stamp.try', 'sofia');
    expect(status()).toMatch(/^✓ Matches Sofia’s checker/);
    expect(pose()).toBe('seat');
    expect(screen.getByLabelText('Sofia’s mark')).toBeTruthy();
    click('article.stamp.try', 'sam');
    expect(status()).toMatch(/^✗ Not Sofia’s mark/);
    expect(screen.getByLabelText('Sam’s mark')).toBeTruthy();
    expect(pose()).toBe('jam');
    click('article.stamp.try', 'edit');
    expect(status()).toMatch(/^✗ The mark no longer fits/);
    expect(screen.getByText('“Send 20 to Sam”')).toBeTruthy();
    expect(pose()).toBe('shift');
    expect(
      document
        .querySelector(guideSelector('article.stamp.try', 'edit'))!
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('should break every block after a changed line, and mend them on reset', () => {
    render(<ArticleWidget id="block-chain" />);
    const broken = () =>
      [...document.querySelectorAll('li[data-broken]')].map((li) => li.getAttribute('data-broken'));
    expect(broken()).toEqual(['false', 'false', 'false', 'false']);
    click('article.chain.change');
    expect(broken()).toEqual(['false', 'false', 'true', 'true']);
    expect(screen.getByText('Sofia → Leo 20')).toBeTruthy();
    click('article.chain.reset');
    expect(broken()).toEqual(['false', 'false', 'false', 'false']);
  });

  it('should flip a problem to its answer, with every answer always in the page', () => {
    render(<ArticleWidget id="nora-answered" />);
    expect(document.body.textContent).toContain('Tens of thousands of copies');
    const tile = document.querySelector(guideSelector('article.answer.tile', 'lose'))!;
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('false');
  });

  it('should set the address beside the key, with a rule for each', () => {
    render(<ArticleWidget id="address-key" />);
    const text = document.body.textContent;
    expect(text).toContain('✓ Share it: it’s safe.');
    expect(text).toContain('A real one is a long string such as bc1q…7f9a');
    expect(text).toContain('✗ Never share it, with anyone.');
    // The private key is the same stamp as in Many notebooks
    expect(document.querySelectorAll('svg[data-stamp]')).toHaveLength(1);
  });

  it('should show what each loss takes: a phone is fine, the words are not', () => {
    render(<ArticleWidget id="key-scenarios" />);
    const lost = () =>
      [...document.querySelectorAll('li[data-lost]')].map((li) => li.getAttribute('data-lost'));
    expect(lost()).toEqual(['false', 'false', 'false']);
    // Owner 2026-11-12: no coins pictured or named, as in Lesson 2: your bitcoin is ledger entries
    expect(document.body.textContent).toContain('Your bitcoin');
    expect(document.body.textContent).not.toMatch(/coins/i);
    click('article.scenario.try', 'phone');
    expect(lost()).toEqual(['true', 'false', 'false']);
    expect(status()).toMatch(/^✓ Type your recovery words/);
    click('article.scenario.try', 'all');
    expect(lost()).toEqual(['true', 'true', 'true']);
    expect(document.body.textContent).toContain('✗ locked forever');
    click('article.scenario.try', 'scam');
    expect(lost()).toEqual(['false', 'true', 'true']);
    expect(status()).toMatch(/^✗ A scam/);
    expect(document.body.textContent).not.toMatch(/coins/i);
  });

  it('should name Leo on every line of his address once an exchange links it', () => {
    render(<ArticleWidget id="public-ledger" />);
    const tags = () => [...document.querySelectorAll('td strong')].map((el) => el.textContent);
    expect(tags()).toEqual([]);
    click('article.ledger.link');
    expect(tags()).toEqual([' Leo', ' Leo', ' Leo']);
    expect(status()).toMatch(/traced to him/);
  });

  it('should sign step 2 of a payment with the stamp', () => {
    render(<ArticleWidget id="mailbox-steps" />);
    click('article.mailbox.step', '2');
    expect(document.body.textContent).toContain('stamps the payment with his private key');
    const stamp = () => document.querySelector('svg[data-stamp]')!.getAttribute('data-stamp');
    // Leo signs with his own stamp; the box then answers only to Emi's, a different one
    expect(stamp()).toBe('leo');
    click('article.mailbox.step', '3');
    expect(stamp()).not.toBe('leo');
  });

  it('should let Nora edit with nobody to check her in the lesson’s version (no copies yet)', () => {
    render(<ArticleWidget id="nora-edits" />);
    expect(document.querySelector(guideSelector('article.nora.amount'))).not.toBeNull();
    expect(document.querySelector(guideSelector('article.nora.copies'))).toBeNull();
    cleanup();
    render(<ArticleWidget id="nora-cheats" />);
    expect(document.querySelector(guideSelector('article.nora.copies'))).not.toBeNull();
  });
});

describe('the Bitcoin story timeline', () => {
  afterEach(() => cleanup());

  it('should set out the three dates in order, each with its picture', () => {
    render(<ArticleWidget id="bitcoin-timeline" />);
    const entries = screen.getAllByRole('listitem');
    expect(entries.map((li) => li.querySelector('strong')?.textContent)).toEqual([
      '31 October 2008',
      '3 January 2009',
      '22 May 2010',
    ]);
    // Block 0's real headline (owner 2026-11-12: moved here from Lesson 1's summary)
    expect(entries[1].textContent).toContain(
      'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks'
    );
    expect(entries[0].textContent).toContain('Satoshi Nakamoto');
    expect(
      entries.map((li) => li.querySelector('[data-picture]')?.getAttribute('data-picture'))
    ).toEqual(['paper', 'block', 'pizza']);
    expect(screen.getByAltText(/Laszlo Hanyecz/)).toBeTruthy();
  });
});

describe('the mining race', () => {
  afterEach(() => cleanup());

  it('should miss until one fingerprint starts 0000, then seal the block and pay the reward', () => {
    render(<ArticleWidget id="mining-race" />);
    const wins = () => document.querySelectorAll('li[data-win="true"]').length;
    expect(status()).toMatch(/Press Try a guess/);
    click('article.mining.guess');
    click('article.mining.guess');
    // No losing fingerprint ever looks like a win
    expect(wins()).toBe(0);
    for (const code of document.querySelectorAll('li code')) {
      expect(code.textContent).not.toMatch(/^0000/);
    }
    expect(status()).toMatch(/^Round 2: no fingerprint starts with 0000/);
    click('article.mining.guess');
    expect(wins()).toBe(1);
    expect(document.querySelector('li[data-win="true"] code')!.textContent).toMatch(/^0000/);
    expect(status()).toMatch(/^✓ Miner C found a fingerprint starting 0000/);
    expect(status()).toMatch(/3\.125 new bitcoin plus the fees/);
    expect(
      document.querySelector<HTMLButtonElement>('[data-guide="article.mining.guess"]')!.disabled
    ).toBe(true);
    click('article.mining.reset');
    expect(wins()).toBe(0);
    expect(status()).toMatch(/Press Try a guess/);
  });
});

describe('Lesson 3’s article widgets (2026-11-12)', () => {
  afterEach(() => cleanup());

  it('should sell into a busy and a thin queue, and stop at a limit', () => {
    render(<ArticleWidget id="eat-the-queue" />);
    // 6 coins: the thin queue is eaten down to 94
    expect(status()).toBe(
      'Thin queue: your 6 coins sold at 100, 99, 97, 97, 94, 94. The price on everyone’s screen is now 94.'
    );
    expect(document.body.textContent).toContain('slippage −6.00%');
    expect(document.body.textContent).toContain('slippage −0.01%'); // the busy queue barely moves
    const range = document.querySelector<HTMLInputElement>(guideSelector('article.queue.size'))!;
    fireEvent.change(range, { target: { value: '10' } });
    expect(range.getAttribute('aria-valuetext')).toBe('Sell 10 coins');
    expect(status()).toMatch(/now 90\.$/);
    click('article.queue.limit');
    expect(
      document.querySelector(guideSelector('article.queue.limit'))!.getAttribute('aria-pressed')
    ).toBe('true');
    expect(status()).toBe(
      'Thin queue: your 4 coins sold at 100, 99, 97, 97. The price on everyone’s screen is now 97. 6 wait unsold: a limit sets the worst price you accept.'
    );
  });

  it('should draw a candle deal by deal, colour it only at the close, then try another minute', () => {
    render(<ArticleWidget id="candle-builder" />);
    expect(status()).toBe(
      'Deal 1 of 6: 64,010. Open 64,010, high 64,010, low 64,010, close so far 64,010.'
    );
    for (let i = 0; i < 5; i++) click('article.candle.next');
    expect(status()).toMatch(/^▲ Closed higher than it opened: green\. That’s all a candle says\./);
    expect(status()).toMatch(/high 64,120, low 63,940, close 64,090/);
    click('article.candle.next'); // Try another minute
    for (let i = 0; i < 5; i++) click('article.candle.next');
    expect(status()).toMatch(/^▼ Closed lower than it opened: red\./);
    click('article.candle.reset');
    expect(status()).toMatch(/^Deal 1 of 6: 64,010/);
  });

  it('should show the same swing at every size, the loss always with a − sign', () => {
    render(<ArticleWidget id="swing-sizer" />);
    expect(status()).toBe('$100.00 became $67.13 at the low: −$32.87 (−32.9%).');
    click('article.swing.size', '1000');
    expect(status()).toBe('$1,000.00 became $671.30 at the low: −$328.70 (−32.9%).');
    click('article.swing.moment', 'close');
    expect(status()).toBe('$1,000.00 became $856.04 at the close: −$143.96 (−14.4%).');
    // No gain is ever shown in money
    expect(document.body.textContent).not.toMatch(/\+\$/);
  });

  it('should sort red flags from things that prove nothing, each with its why', () => {
    render(<ArticleWidget id="scam-check" />);
    expect(status()).toBe('Your call: red flag, or not?');
    // The three red flags first, each answered right
    for (let i = 0; i < 3; i++) {
      click('article.scam.flag', 'red');
      expect(status()).toMatch(/^✓ Red flag\./);
      click('article.scam.next');
    }
    // "Its price rose 80% this week." called a red flag: shown calmly, a dot, never a red ✗
    click('article.scam.flag', 'red');
    expect(status()).toMatch(/^• Not a red flag\. Not a red flag on its own, but no proof either/);
    expect(document.body.textContent).not.toContain('One is enough to walk away');
    for (let i = 0; i < 2; i++) {
      click('article.scam.next');
      click('article.scam.flag', 'not');
    }
    expect(document.body.textContent).toContain('3 red flags. One is enough to walk away.');
  });
});
