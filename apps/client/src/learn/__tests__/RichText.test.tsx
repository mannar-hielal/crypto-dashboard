import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RichText } from '@/learn/RichText';

describe('RichText', () => {
  afterEach(() => cleanup());

  it('should bold **runs** and keep everything else plain text, never HTML', () => {
    const { container } = render(<RichText text="A **ledger** is <b>a list</b>." />);
    expect(container.querySelector('strong')!.textContent).toBe('ledger');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('A ledger is <b>a list</b>.');
  });

  it('should set *italic* runs apart, and show no asterisks (owner 2026-11-17)', () => {
    const { container } = render(
      <RichText text="Buy **$100** of it *right now*, then **close** it." />
    );
    expect([...container.querySelectorAll('strong')].map((s) => s.textContent)).toEqual([
      '$100',
      'close',
    ]);
    expect(container.querySelector('em')!.textContent).toBe('right now');
    expect(container.textContent).not.toContain('*');
  });

  it('should hand each term to renderTerm, or show its label alone', () => {
    const { container } = render(
      <RichText
        text="Fast moves [[slippage]] and a **stop**."
        renderTerm={(label, concept) => <button data-concept={concept}>{label}</button>}
      />
    );
    expect(container.querySelector('button')!.dataset.concept).toBe('slippage');
    expect(container.querySelector('strong')!.textContent).toBe('stop');
    cleanup();
    const plain = render(<RichText text="A [[last deal|last-price]] here." />);
    expect(plain.container.textContent).toBe('A last deal here.');
    expect(plain.container.querySelector('button')).toBeNull();
  });
});
