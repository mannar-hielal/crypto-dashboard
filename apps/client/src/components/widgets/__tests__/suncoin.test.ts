import { describe, expect, it } from 'vitest';
import { balancesAfter, copiesAgreeing, ledgerTotal, NOTEBOOK } from '@/components/widgets/suncoin';

describe('SunCoin', () => {
  it('should work balances out by reading the notebook: Emi 5, Leo 3, Sofia 7, 15 in all', () => {
    const b = balancesAfter(NOTEBOOK);
    expect([b.Emi.total, b.Leo.total, b.Sofia.total]).toEqual([5, 3, 7]);
    expect(ledgerTotal(NOTEBOOK)).toBe(15);
    expect(b.Leo.steps).toEqual([
      { line: 2, amount: 4 },
      { line: 4, amount: -3 },
      { line: 5, amount: 2 },
    ]);
  });

  it('should start with nobody holding anything', () => {
    const b = balancesAfter([]);
    expect(b.Emi).toEqual({ total: 0, steps: [] });
  });

  it('should hide a cheat from the totals: an edited payment only moves coins', () => {
    const edited = NOTEBOOK.map((l) => (l.line === 4 ? { ...l, amount: 30 } : l));
    const b = balancesAfter(edited);
    expect(b.Leo.total).toBe(-24); // paid out coins he never had
    expect(ledgerTotal(edited)).toBe(15);
    expect(copiesAgreeing(true)).toBe(4);
    expect(copiesAgreeing(false)).toBe(5);
  });
});
