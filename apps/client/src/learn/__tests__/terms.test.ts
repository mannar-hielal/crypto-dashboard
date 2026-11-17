import { describe, expect, it } from 'vitest';
import { parseInline, parseTerms, plainText, termIds } from '@/learn/terms';

describe('terms', () => {
  it('should split text into plain runs and terms, with or without an explicit id', () => {
    expect(parseTerms('A shared [[ledger]], their [[last deal|last-price]].')).toEqual([
      { text: 'A shared ' },
      { text: 'ledger', concept: 'ledger' },
      { text: ', their ' },
      { text: 'last deal', concept: 'last-price' },
      { text: '.' },
    ]);
  });

  it('should leave text with no terms whole', () => {
    expect(parseTerms('No terms here.')).toEqual([{ text: 'No terms here.' }]);
    expect(parseTerms('')).toEqual([]);
  });

  it('should give the reader’s text and the ids', () => {
    const t = 'An [[exchange]] sets the [[last deal|last-price]]';
    expect(plainText(t)).toBe('An exchange sets the last deal');
    expect(termIds(t)).toEqual(['exchange', 'last-price']);
  });

  it('should read **bold** and *italic* runs, leaving a term’s label and a lone * alone', () => {
    expect(parseInline('Going **long** is *the* move: 2 * 3 [[candle]].')).toEqual([
      { text: 'Going ' },
      { text: 'long', bold: true },
      { text: ' is ' },
      { text: 'the', em: true },
      { text: ' move: 2 * 3 ' },
      { text: 'candle', concept: 'candle' },
      { text: '.' },
    ]);
    expect(plainText('Your **$1,000**, *right now*, a [[ledger]]')).toBe(
      'Your $1,000, right now, a ledger'
    );
  });
});
