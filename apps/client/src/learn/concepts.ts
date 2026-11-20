/**
 * The concept spine (owner 2026-10-23): one idea, one id. A concept carries its "peek" (one sentence
 * and a "Think of it as…" line, shown when a term is tapped in a lesson, and later behind "?" icons in
 * the trading UI) and the tours that practise it. Lessons only declare the concepts they use; the
 * links to the lessons are worked out from that (`graph.ts`), so they can't go stale. Since
 * 2026-11-18 a concept has no article: the Blog's articles stand apart from the lessons.
 *
 * One metaphor per idea, everywhere: SunCoin and Nora's notebook for the ledger, the mailbox for
 * addresses and keys, two queues meeting at one number for the price.
 *
 * Pure data: no React, so the tests can walk every concept.
 */

import { FREE, type Entitlement } from './access';

export const CONCEPT_IDS = [
  'money',
  'satoshi-nakamoto',
  'satoshi',
  'mining',
  'ledger',
  'blockchain',
  'node',
  'decentralized',
  'exchange',
  'order-book',
  'last-price',
  'spread',
  'liquidity',
  'candle',
  'hindsight',
  'volatility',
  'rug-pull',
  'slippage',
  'address',
  'private-key',
  'custody',
  'pseudonymous',
  // Chapter 2, Lesson 5 (2026-11-19)
  'coin',
  'token',
  'altcoin',
  'staking',
  // Chapter 2, Lesson 6 (2026-11-19)
  'stablecoin',
  'peg',
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

export function isConceptId(value: string): value is ConceptId {
  return (CONCEPT_IDS as readonly string[]).includes(value);
}

export interface Concept {
  id: ConceptId;
  /** The term as a heading: "Ledger" */
  term: string;
  /** One plain sentence */
  peek: string;
  /** Completes "Think of it as…" */
  think: string;
  access: Entitlement;
}

export const CONCEPTS: readonly Concept[] = [
  {
    id: 'money',
    term: 'Someone in charge',
    peek: 'Almost every kind of money depends on a government, a bank or a company that can print more or change the rules.',
    think: 'a game company setting the price of its tokens: fine until it changes its mind.',
    access: FREE,
  },
  {
    id: 'satoshi-nakamoto',
    term: 'Satoshi Nakamoto',
    peek: 'The name used by whoever published Bitcoin’s plan in October 2008. Nobody knows who it is.',
    think: 'an author who signed with a pen name, then disappeared.',
    access: FREE,
  },
  {
    id: 'satoshi',
    term: 'Satoshi',
    peek: 'The smallest unit of bitcoin: one bitcoin is 100,000,000 satoshis, so you never need to buy a whole coin.',
    think: 'a slice of pizza: you don’t have to buy the whole pizza.',
    // Moved from Bitcoin's story when its satoshis section went (review #278): buying a fraction
    access: FREE,
  },
  {
    id: 'mining',
    term: 'Mining',
    peek: 'Adding a new block to the blockchain by solving a hard puzzle, paid in new bitcoin and fees.',
    think: 'digging for gold, where the shovel is a computer.',
    access: FREE,
  },
  {
    id: 'ledger',
    term: 'Ledger',
    peek: 'A list of every payment, in order. Balances aren’t stored: they’re worked out by reading the list.',
    think: 'a notebook with one new line per payment, and nothing ever erased.',
    access: FREE,
  },
  {
    id: 'blockchain',
    term: 'Blockchain',
    peek: 'Bitcoin’s ledger: payments grouped into blocks, each sealed with a fingerprint of the one before.',
    think:
      'a stack of sealed envelopes, each stamped with the previous seal. Open one and the rest break.',
    access: FREE,
  },
  {
    id: 'node',
    term: 'Node',
    peek: 'A computer that keeps a full copy of the blockchain and checks every new payment against the rules.',
    // Owner 2026-11-12: the sceptical office worker, not Nora (Lesson 2 no longer leans on her)
    think: 'a sceptical office worker who checks every payment before filing it.',
    access: FREE,
  },
  {
    id: 'decentralized',
    term: 'Decentralized',
    peek: 'No single person or company can change the records alone: many independent computers must agree.',
    think: 'a group chat where the majority decides what really happened.',
    access: FREE,
  },
  {
    id: 'exchange',
    term: 'Exchange',
    peek: 'A company that matches people who want to buy with people who want to sell, and holds their funds while they trade.',
    think: 'a marketplace with a very fast auctioneer.',
    access: FREE,
  },
  {
    id: 'order-book',
    term: 'Order book',
    peek: 'The waiting lists of offers to buy and to sell, sorted by price.',
    think: 'two queues: buyers bidding up from below, sellers asking down from above.',
    access: FREE,
  },
  {
    id: 'last-price',
    term: 'Last price',
    peek: 'The price of the most recent deal. It’s what “the price” on your screen means.',
    think: 'the number where the two queues just met.',
    access: FREE,
  },
  {
    id: 'spread',
    term: 'Spread',
    peek: 'The gap between the best offer to buy (the bid) and the best offer to sell (the ask).',
    think: 'the space between the front of the two queues.',
    access: FREE,
  },
  {
    id: 'liquidity',
    term: 'Liquidity',
    peek: 'How many offers wait close to the price. More of them means you can trade without moving the price much.',
    think: 'a busy market versus a quiet one: in a busy one, a buyer is always near.',
    access: FREE,
  },
  {
    id: 'candle',
    term: 'Candle',
    peek: 'A summary of every deal in one slice of time: where the price opened, how high and low it went, and where it closed.',
    think: 'a day’s weather report, but for the price. It describes, it doesn’t forecast.',
    access: FREE,
  },
  {
    id: 'hindsight',
    term: 'Hindsight',
    peek: 'Knowing how a story ended makes the ending feel obvious. On the day, nobody knew.',
    think: 'watching a match when you already know the score.',
    access: FREE,
  },
  {
    id: 'volatility',
    term: 'Volatility',
    peek: 'How far and how fast a price swings. Crypto’s swings are big, in both directions.',
    think: 'the weather at sea: some days calm, some days stormy.',
    access: FREE,
  },
  {
    id: 'rug-pull',
    term: 'Rug pull',
    peek: 'When a coin’s creators take the buyers’ money and vanish, often after making the coin hard or impossible to sell.',
    think: 'a shop that takes everyone’s deposits, then locks its doors overnight.',
    access: FREE,
  },
  {
    id: 'slippage',
    term: 'Slippage',
    peek: 'The gap between the price you expected and the price you got, because your order ate into the queue.',
    think: 'arriving late at a sale: the cheap ones are gone, so the rest cost more.',
    access: FREE,
  },
  {
    id: 'address',
    term: 'Address',
    peek: 'Where bitcoin can be sent. Safe to share: anyone can pay into it, and no one can take anything out with it.',
    think: 'a mailbox slot.',
    access: FREE,
  },
  {
    id: 'private-key',
    term: 'Private key',
    peek: 'The secret that lets its holder spend what an address received. Whoever has it controls that bitcoin.',
    think: 'the only key to the mailbox.',
    access: FREE,
  },
  {
    id: 'custody',
    term: 'Custody',
    peek: 'Who holds the private keys: an exchange holding them for you, or you, in a wallet you control.',
    think: 'a coat check versus taking your coat home.',
    access: FREE,
  },
  {
    id: 'pseudonymous',
    term: 'Pseudonymous',
    peek: 'Every payment is public, but addresses carry no names. Hidden is not the same as invisible.',
    think: 'a party where everyone wears a mask, but everyone can see what each mask does.',
    access: FREE,
  },
  {
    id: 'coin',
    term: 'Coin',
    peek: 'The money of its own blockchain: it pays for that road’s upkeep and pays the people who keep it running.',
    think: 'the money of a road that belongs to it alone.',
    access: FREE,
  },
  {
    id: 'token',
    term: 'Token',
    peek: 'A crypto that has no blockchain of its own. It lives on another one, such as Ethereum, and follows that road’s rules.',
    think: 'a shop built along someone else’s road.',
    access: FREE,
  },
  {
    id: 'altcoin',
    term: 'Altcoin',
    peek: 'Short for “alternative coin”: any crypto that is not bitcoin.',
    think: 'every crypto except the first one.',
    access: FREE,
  },
  {
    id: 'staking',
    term: 'Staking',
    peek: 'Putting coins aside to help keep a blockchain safe, and earning a reward for it. The reward is not guaranteed.',
    think: 'helping keep the road safe, for a reward.',
    access: FREE,
  },
  {
    id: 'stablecoin',
    term: 'Stablecoin',
    peek: 'A token built to keep one steady price, usually one US dollar.',
    think: 'a ticket for a dollar kept in a cloakroom.',
    access: FREE,
  },
  {
    id: 'peg',
    term: 'Peg',
    peek: 'The steady price a stablecoin aims for. If it slips off, the coin has lost its peg.',
    think: 'the line it is meant to stay on.',
    access: FREE,
  },
];

export function getConcept(id: ConceptId): Concept {
  const concept = CONCEPTS.find((c) => c.id === id);
  if (!concept) throw new Error(`Unknown concept ${id}`);
  return concept;
}
