/**
 * The numbers of the practice swap (chapter 2's practical stop after Lesson 9, owner 2026-11-28): all
 * made up, in memory, nothing on any chain. The pool is Lesson 9's (10 ETH and 20,000 USDC under the
 * constant-product rule), the pool fee 0.3% taken from what is put in, and every wallet request costs
 * the same small pretend network fee. Pure: no React, no store.
 */

export const POOL = { eth: 10, usdc: 20_000 } as const;
export const POOL_FEE_RATE = 0.003;
/** A pretend network fee for each signed request, paid in ETH (about $0.20 at the pool's price) */
export const NETWORK_FEE_ETH = 0.0001;
export const START_BALANCES = { usdc: 500, eth: 0.02 } as const;
export const SWAP_AMOUNTS = [100, 200] as const;
/** How far below the quote a swap may still settle: under that, a real one fails */
export const SLIPPAGE_LIMIT = 0.005;
export type SwapAmount = (typeof SWAP_AMOUNTS)[number];

export interface SwapQuote {
  /** USDC put in */
  pay: number;
  /** ETH that comes out */
  get: number;
  /** The pool fee, in USDC */
  poolFee: number;
  /** The share of the output lost to the swap's own move of the price, 0–1, fee aside */
  priceImpact: number;
  /** The least ETH the swap accepts (`SLIPPAGE_LIMIT` under `get`) */
  minimum: number;
}

/** What `pay` USDC buys from the pool, by x × y = k with the fee taken from the input */
export function quoteSwap(pay: number, pool: { eth: number; usdc: number } = POOL): SwapQuote {
  const poolFee = pay * POOL_FEE_RATE;
  const effective = pay - poolFee;
  const get = (pool.eth * effective) / (pool.usdc + effective);
  const before = pool.eth / pool.usdc; // ETH per USDC before the swap
  const priceImpact = 1 - get / effective / before;
  return { pay, get, poolFee, priceImpact, minimum: get * (1 - SLIPPAGE_LIMIT) };
}
