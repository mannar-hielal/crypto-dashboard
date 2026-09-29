/**
 * Step builders, so scenarios stay short and the same action reads the same everywhere (in a test,
 * in the doc's manual steps and in a tour bubble). Each takes optional overrides for the text or
 * the expectations of that use.
 */

import type { Expectation, StepDraft } from './scenario';

interface Extra {
  explain?: string;
  expect?: Expectation[];
  liveNote?: string;
}

const extra = (e: Extra) => ({
  ...(e.expect ? { expect: e.expect } : {}),
  ...(e.liveNote ? { liveNote: e.liveNote } : {}),
});

/** Switch the order form to Spot or USDT Perpetual. */
export function openMarket(market: 'spot' | 'linear', e: Extra = {}): StepDraft {
  return {
    action: 'click',
    anchor: market === 'spot' ? 'trade.market.spot' : 'trade.market.perp',
    explain:
      e.explain ??
      (market === 'spot'
        ? 'Spot means you buy the coin itself. There is no leverage and no shorting.'
        : 'USDT Perpetual lets you go long or short with leverage, settled in USDT.'),
    ...extra(e),
  };
}

export function chooseSide(side: 'buy' | 'sell', e: Extra = {}): StepDraft {
  return {
    action: 'click',
    anchor: side === 'buy' ? 'trade.side.buy' : 'trade.side.sell',
    explain:
      e.explain ??
      (side === 'buy'
        ? 'Buy fills at the best ask — the lowest price a seller accepts right now.'
        : 'Sell fills at the best bid — the highest price a buyer pays right now.'),
    ...extra(e),
  };
}

export function chooseType(type: 'market' | 'limit' | 'stop', e: Extra = {}): StepDraft {
  const explain = {
    market: 'A market order fills immediately at the best price.',
    limit: 'A limit order waits for your price, and fills there or better.',
    stop: 'A stop order waits until the price reaches your trigger, then fills at market.',
  }[type];
  return {
    action: 'click',
    anchor:
      type === 'market'
        ? 'trade.type.market'
        : type === 'limit'
          ? 'trade.type.limit'
          : 'trade.type.stop',
    explain: e.explain ?? explain,
    ...extra(e),
  };
}

/** Pick the amount unit (the coin or USDT), then type the amount. */
export function enterAmount(value: string, unit: 'coin' | 'usdt', e: Extra = {}): StepDraft[] {
  return [
    {
      action: 'click',
      anchor: 'trade.amount-unit',
      key: unit,
      explain:
        unit === 'coin'
          ? 'Choose to enter the size in the coin instead of USDT.'
          : 'Choose to enter the size as a USDT value.',
    },
    {
      action: 'type',
      anchor: 'trade.amount',
      value,
      explain: e.explain ?? 'Enter the size. The form shows what it costs before you commit.',
      ...extra(e),
    },
  ];
}

/** Turn on the take-profit and set its price. */
export function enableTp(price: string, e: Extra = {}): StepDraft[] {
  return [
    {
      action: 'click',
      anchor: 'trade.tp.enable',
      explain: 'A take-profit closes the position when the price reaches your target.',
    },
    {
      action: 'type',
      anchor: 'trade.tp.price',
      value: price,
      explain: e.explain ?? 'Set the take-profit price.',
      ...extra(e),
    },
  ];
}

/** Turn on the stop-loss and set its price. */
export function enableSl(price: string, e: Extra = {}): StepDraft[] {
  return [
    {
      action: 'click',
      anchor: 'trade.sl.enable',
      explain: 'A stop-loss closes the position if the price moves against you, capping the loss.',
    },
    {
      action: 'type',
      anchor: 'trade.sl.price',
      value: price,
      explain: e.explain ?? 'Set the stop-loss price.',
      ...extra(e),
    },
  ];
}

export function submit(e: Extra = {}): StepDraft {
  return {
    action: 'click',
    anchor: 'trade.submit',
    explain: e.explain ?? 'Send the order. The amount field clears when it is accepted.',
    ...extra(e),
  };
}

export type AccountTab =
  | 'positions'
  | 'assets'
  | 'closedpnl'
  | 'orders'
  | 'orderhistory'
  | 'balancehistory'
  | 'journal';

export function openTab(tab: AccountTab, e: Extra = {}): StepDraft {
  return {
    action: 'click',
    anchor: 'account.tab',
    key: tab,
    explain: e.explain ?? 'Open the tab to see the result.',
    ...extra(e),
  };
}

/** Set isolated margin at a leverage through the leverage chip. */
export function setIsolated(leverage: number, e: Extra = {}): StepDraft[] {
  return [
    {
      action: 'click',
      anchor: 'trade.leverage-chip',
      explain: 'The chip shows the margin mode and leverage. Open it to change them.',
    },
    {
      action: 'click',
      anchor: 'leverage.mode',
      key: 'isolated',
      explain: 'Isolated: only this position’s margin is at risk.',
    },
    {
      action: 'click',
      anchor: 'leverage.input',
      key: String(leverage),
      explain: `Use ${leverage}× leverage: the margin is the position value ÷ ${leverage}.`,
    },
    {
      action: 'click',
      anchor: 'leverage.confirm',
      explain: e.explain ?? 'Confirm the mode and leverage.',
      ...extra(e),
    },
  ];
}
