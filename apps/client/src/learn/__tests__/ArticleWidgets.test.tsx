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
