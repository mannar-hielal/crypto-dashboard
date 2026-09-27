/**
 * BP-5 C (O6): risk-limit tier facts from the bundled snapshot — the leverage modal's tier line and
 * the Positions row's MMR hover. Must agree with the server (bybitSpec.tierFor / positionCap).
 */

import { describe, it, expect } from 'vitest';
import { riskTierInfo, riskTierLabel } from '@/lib/positionMath';

describe('riskTierInfo / riskTierLabel', () => {
  it('BTCUSDT: a small position is in tier 1, and the cap at 10× is 100,000,000 USDT', () => {
    const info = riskTierInfo('BTCUSDT', 5_000, 10);
    expect(info).toMatchObject({ tierNo: 1, mmr: 0.0033, limit: 300_000, cap: 100_000_000 });
    expect(riskTierLabel(info!)).toBe('Risk-limit tier 1 (up to 300,000 USDT) · MMR 0.33%');
  });

  it('BNBUSDT: a 20,000 USDT position is in tier 2 (its tier 1 ends at 10,000)', () => {
    expect(riskTierInfo('BNBUSDT', 20_000, 10)).toMatchObject({ tierNo: 2, limit: 50_000 });
    // The boundary belongs to the lower tier, as on the server (value ≤ limit)
    expect(riskTierInfo('BNBUSDT', 10_000, 10)?.tierNo).toBe(1);
  });

  it('is null for a symbol with no tier snapshot', () => {
    expect(riskTierInfo('FOOUSDT', 1, 10)).toBeNull();
  });
});

describe('crossOrderLiqEstimate (BP-5 E)', () => {
  it('estimates where the account MM rate reaches 100% for the position the order leaves', async () => {
    const { accountFiguresEstimate, riskTiersFor } = await import('@crypto-dashboard/sdk');
    const { crossOrderLiqEstimate } = await import('@/lib/positionMath');
    // An empty cross account of 600 USDT; buy 0.1 BTC at 50,000, 10× (open fee 2.75)
    const liq = crossOrderLiqEstimate(
      { balance: 600, positions: [], pendingOrders: [] },
      () => null,
      { symbol: 'BTCUSDT', side: 'long', qty: 0.1, price: 50_000, leverage: 10, openFee: 2.75 }
    );
    expect(liq).toBeGreaterThan(44_100);
    expect(liq).toBeLessThan(45_000);
    // At that mark the account is exactly at its maintenance margin
    const at = accountFiguresEstimate(
      597.25,
      [
        {
          side: 'long',
          qty: 0.1,
          entryPrice: 50_000,
          leverage: 10,
          mark: liq as number,
          tiers: riskTiersFor('BTCUSDT'),
        },
      ],
      0
    );
    expect(at.mmRate).toBeCloseTo(1, 6);
  });

  it('is not estimated for an order that reduces or flips the position', async () => {
    const { crossOrderLiqEstimate } = await import('@/lib/positionMath');
    const long = {
      id: 'p',
      category: 'linear' as const,
      symbol: 'BTCUSDT',
      side: 'long' as const,
      quantity: 0.1,
      entryPrice: 50_000,
      entryUsdtAmount: 500,
      leverage: 10,
      entryFee: 2.75,
      closeFeeReserve: 2.475,
      extraMargin: 0,
      liqPrice: null,
      bustPrice: null,
      positionIM: 502.475,
      positionMM: null,
      cumFunding: 0,
      openedAt: 1,
    };
    expect(
      crossOrderLiqEstimate({ balance: 100, positions: [long], pendingOrders: [] }, () => null, {
        symbol: 'BTCUSDT',
        side: 'short',
        qty: 0.05,
        price: 50_000,
        leverage: 10,
        openFee: 1,
      })
    ).toBeNull();
  });
});
