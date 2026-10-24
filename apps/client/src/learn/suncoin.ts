/**
 * SunCoin, the notebook currency the first article teaches with (from the owner's demo): three
 * friends, Nora's notebook of payments, and balances worked out by reading it. Pure: the widgets
 * render it, the tests check the sums.
 */

export const PEOPLE = ['Emi', 'Leo', 'Sofia'] as const;
export type Person = (typeof PEOPLE)[number];

export interface NotebookLine {
  line: number;
  from: Person | 'Start';
  to: Person;
  amount: number;
  /** What happened, in a sentence */
  story: string;
}

export const NOTEBOOK: readonly NotebookLine[] = [
  {
    line: 1,
    from: 'Start',
    to: 'Emi',
    amount: 6,
    story: 'Nora hands out the first coins. Emi starts with 6.',
  },
  { line: 2, from: 'Start', to: 'Leo', amount: 4, story: 'Leo starts with 4.' },
  {
    line: 3,
    from: 'Start',
    to: 'Sofia',
    amount: 5,
    story: 'Sofia starts with 5. That’s 15 SunCoins in the whole world.',
  },
  {
    line: 4,
    from: 'Leo',
    to: 'Emi',
    amount: 3,
    story:
      'Leo buys Emi’s sticker pack for 3. He tells Nora, and she writes one line. Nothing physical moves.',
  },
  {
    line: 5,
    from: 'Sofia',
    to: 'Leo',
    amount: 2,
    story: 'Sofia buys a sketch from Leo for 2. Another line; nothing is rubbed out.',
  },
  {
    line: 6,
    from: 'Emi',
    to: 'Sofia',
    amount: 4,
    story:
      'Emi buys a concert ticket from Sofia for 4. Still 15 coins in all: none appeared or vanished.',
  },
];

export interface Balance {
  total: number;
  /** Each line that touched this person: + received, − paid */
  steps: { line: number; amount: number }[];
}

/** Every person's balance, worked out by reading the lines from the top */
export function balancesAfter(lines: readonly NotebookLine[]): Record<Person, Balance> {
  const out: Record<Person, Balance> = {
    Emi: { total: 0, steps: [] },
    Leo: { total: 0, steps: [] },
    Sofia: { total: 0, steps: [] },
  };
  for (const l of lines) {
    out[l.to].total += l.amount;
    out[l.to].steps.push({ line: l.line, amount: l.amount });
    if (l.from !== 'Start') {
      out[l.from].total -= l.amount;
      out[l.from].steps.push({ line: l.line, amount: -l.amount });
    }
  }
  return out;
}

/** All coins in the notebook: only "Start" lines create them, so a payment never changes this */
export function ledgerTotal(lines: readonly NotebookLine[]): number {
  return lines.filter((l) => l.from === 'Start').reduce((sum, l) => sum + l.amount, 0);
}

/** "Many notebooks": of five copies, how many still hold the true line (only Nora's was edited) */
export function copiesAgreeing(edited: boolean): number {
  return edited ? 4 : 5;
}
