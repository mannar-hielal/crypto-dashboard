/**
 * BP-5 G: the Bybit v5 adapter and the field comparison used by the manual testnet parity run.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import {
  diffFields,
  toBybitClosedPnl,
  toBybitFundingExecution,
  toBybitPosition,
  toBybitWallet,
} from '../bybitParity.js';
import { accountFigures, fallbackRiskTiers } from '../bybitSpec.js';

describe('Bybit v5 adapter (BP-5 G)', () => {
  it('maps a position onto position/list names ("" for an unset TP / SL, as Bybit)', () => {
    const p = toBybitPosition({
      id: 'p1',
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'long',
      quantity: '0.1',
      entryPrice: '50000',
      entryUsdtAmount: '500',
      leverage: 10,
      marginMode: 'isolated',
      entryFee: '2.75',
      closeFeeReserve: '2.475',
      liqPrice: '45148.99',
      bustPrice: '45000',
      positionIM: '502.475',
      positionMM: '18.975',
      openedAt: 1,
      stopLoss: '48000',
      slTriggerBy: 'MarkPrice',
    });
    expect(p).toMatchObject({
      side: 'Buy',
      size: '0.1',
      avgPrice: '50000',
      positionValue: '5000',
      leverage: '10',
      takeProfit: '',
      tpTriggerBy: '',
      stopLoss: '48000',
      slTriggerBy: 'MarkPrice',
      tpslMode: 'Full',
    });
  });

  it('maps a close onto position/closed-pnl names (the closing side)', () => {
    const c = toBybitClosedPnl({
      id: 't1',
      category: 'linear',
      symbol: 'BTCUSDT',
      side: 'long',
      quantity: '0.05',
      entryPrice: '50000',
      exitPrice: '51000',
      pnl: '50',
      openedAt: 1,
      closedAt: 2,
      openFee: '1.375',
      closeFee: '1.4025',
      closedPnl: '47.2225',
    });
    expect(c).toMatchObject({
      side: 'Sell',
      closedSize: '0.05',
      cumEntryValue: '2500',
      cumExitValue: '2550',
      closedPnl: '47.2225',
      execType: 'Trade',
    });
  });

  it('maps a funding settlement and the cross account figures', () => {
    expect(
      toBybitFundingExecution({
        id: 'f',
        symbol: 'BTCUSDT',
        side: 'short',
        qty: '0.1',
        markPrice: '50000',
        rate: '0.0001',
        fee: '-0.5',
        time: 3,
      })
    ).toMatchObject({ side: 'Sell', execType: 'Funding', execFee: '-0.5', execPrice: '50000' });
    const w = toBybitWallet(
      accountFigures(
        new Decimal(1_000),
        [
          {
            side: 'long',
            quantity: new Decimal('0.1'),
            entryPrice: new Decimal(50_000),
            leverage: 10,
            mark: new Decimal(49_000),
            tiers: fallbackRiskTiers('BTCUSDT'),
          },
        ],
        new Decimal(0)
      )
    );
    expect(w).toMatchObject({ totalMarginBalance: '900', totalPerpUPL: '-100' });
    expect(w.accountMMRate).toBe('0.0207'); // 18.5955 / 900
  });
});

describe('diffFields', () => {
  it('compares numbers within the tolerance and everything else exactly', () => {
    expect(
      diffFields(
        { size: '0.1', liqPrice: '45149', side: 'Buy' },
        { size: '0.100', liqPrice: '45148.995', side: 'Buy' },
        ['size', 'liqPrice', 'side']
      )
    ).toEqual([]);
    expect(
      diffFields({ liqPrice: '45149', side: 'Buy' }, { liqPrice: '45100', side: 'Sell' }, [
        'liqPrice',
        'side',
      ])
    ).toEqual([
      { field: 'liqPrice', bybit: '45149', paper: '45100' },
      { field: 'side', bybit: 'Buy', paper: 'Sell' },
    ]);
  });

  it('skips a field Bybit leaves blank (not reported for this account, e.g. bustPrice under UTA)', () => {
    expect(diffFields({ bustPrice: '' }, { bustPrice: '45000' }, ['bustPrice'])).toEqual([]);
  });

  it('still reports a paper field that is missing when Bybit leaves it blank', () => {
    expect(diffFields({ bustPrice: '' }, {}, ['bustPrice'])).toEqual([
      { field: 'bustPrice', bybit: '', paper: '(missing)' },
    ]);
  });

  it('reports a field missing on either side instead of skipping it', () => {
    expect(diffFields({ a: '1' }, {}, ['a'])).toEqual([
      { field: 'a', bybit: '1', paper: '(missing)' },
    ]);
  });
});
