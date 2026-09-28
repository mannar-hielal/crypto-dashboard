/**
 * The server charges from bybitSpec.ts; the client estimates from generated/CDSDK/spec/bybit.ts.
 * The server build can't import SDK runtime code, so this keeps the two copies identical.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import * as sdk from '../../../../../generated/CDSDK/spec/bybit.js';
import {
  FALLBACK_RISK_TIERS,
  FEE_RATES,
  LEGACY_FEE_RATE,
  checkOrderSize,
  fallbackRiskTiers,
  fallbackRules,
  setLinearTickSource,
  feeToClose,
  floorToStep,
  isOnTick,
  markHitsLiquidation,
  positionCap,
  positionRisk,
  tierFor,
  accountFigures,
} from '../bybitSpec.js';
import { MAX_LEVERAGE, STARTING_BALANCE } from '../engine/index.js';
import { riskOf } from '../engine/margin.js';
import { ALLOWED_SYMBOLS } from '../../constants.js';

const D = (v: number | string) => new Decimal(v);

describe('bybitSpec', () => {
  it('the SDK copy of the linear price ticks matches the instrument snapshot', () => {
    for (const symbol of ALLOWED_SYMBOLS) {
      expect(sdk.linearTickSize(symbol), symbol).toBe(
        fallbackRules('linear', symbol).tickSize.toNumber()
      );
    }
  });

  it('rounds to the live tick when the plugin supplies one, else the snapshot', () => {
    const pos = {
      symbol: 'BTCUSDT',
      side: 'long' as const,
      quantity: D('0.1'),
      entryPrice: D(50_000),
      entryUsdtAmount: D(500),
      closeFeeReserve: D('2.475'),
      extraMargin: D(0),
    };
    expect(riskOf(pos, fallbackRiskTiers('BTCUSDT')).liqPrice.toString()).toBe('45149');
    setLinearTickSource((s) => (s === 'BTCUSDT' ? D(2) : undefined));
    try {
      expect(riskOf(pos, fallbackRiskTiers('BTCUSDT')).liqPrice.toString()).toBe('45150'); // 45,148.99… up to a tick of 2
    } finally {
      setLinearTickSource(undefined);
    }
  });

  it('the SDK rounds a liquidation price to the tick like the server', () => {
    expect(sdk.roundLiqToTick(45148.99, 'long', 0.1)).toBe(45149);
    expect(sdk.roundLiqToTick(54819.097, 'short', 0.1)).toBe(54819);
    expect(sdk.roundLiqToTick(45149, 'long', 0.1)).toBe(45149); // already on the tick
    expect(sdk.roundLiqToTick(0.123456, 'long', 0.00001)).toBe(0.12346);
    expect(sdk.roundLiqToTick(45148.99, 'long', 0)).toBe(45148.99); // unknown symbol
  });

  it('fee rates and account constants match the client copy in the SDK', () => {
    expect(sdk.FEE_RATES).toEqual(FEE_RATES);
    expect(sdk.LEGACY_FEE_RATE).toBe(LEGACY_FEE_RATE);
    expect(sdk.MAX_LEVERAGE).toBe(MAX_LEVERAGE);
    expect(sdk.STARTING_BALANCE).toBe(STARTING_BALANCE);
  });

  it('has fallback rules for every allowed symbol in both markets', () => {
    for (const category of ['spot', 'linear'] as const) {
      for (const symbol of ALLOWED_SYMBOLS) {
        const rules = fallbackRules(category, symbol);
        expect(rules.qtyStep.gt(0), `${category}:${symbol}`).toBe(true);
        expect(rules.tickSize.gt(0), `${category}:${symbol}`).toBe(true);
      }
    }
  });

  it('floorToStep truncates, never rounds up', () => {
    expect(floorToStep(new Decimal('0.1239'), new Decimal('0.001')).toString()).toBe('0.123');
    expect(floorToStep(new Decimal('7'), new Decimal('0')).toString()).toBe('7');
  });

  it('isOnTick', () => {
    expect(isOnTick(new Decimal('50000.1'), new Decimal('0.1'))).toBe(true);
    expect(isOnTick(new Decimal('50000.05'), new Decimal('0.1'))).toBe(false);
  });

  it('checkOrderSize uses the spot wording for spot', () => {
    const rules = fallbackRules('spot', 'BTCUSDT');
    expect(checkOrderSize('spot', rules, new Decimal('0.00001'), new Decimal(50_000))).toBe(
      'Order value exceeded lower limit (5 USDT)'
    );
  });

  it('the risk-limit tier snapshot matches the client copy and covers every allowed symbol', () => {
    expect(sdk.FALLBACK_RISK_TIERS).toEqual(FALLBACK_RISK_TIERS);
    for (const symbol of ALLOWED_SYMBOLS) {
      expect(fallbackRiskTiers(symbol).length, symbol).toBeGreaterThan(0);
    }
  });
});

describe('isolated margin — Bybit’s worked example (BP-3)', () => {
  // https://www.bybit.com/en/help-center/article/Liquidation-Price-Calculation-under-Isolated-Mode-Unified-Trading-Account
  // Long 1 BTC @ 40,000, 50×, MMR 0.5%, deduction 0, 3,000 USDT extra margin added by hand.
  const tiers = [{ riskLimitValue: D(2_000_000), mmr: D('0.005'), mmDeduction: D(0) }];
  const input = {
    side: 'long' as const,
    quantity: D(1),
    entryPrice: D(40_000),
    im: D(800),
    closeFeeReserve: feeToClose('long', D(1), D(40_000), 50),
    extraMargin: D(3_000),
  };

  it('fee to close = 1 × 40,000 × (1 − 1/50) × 0.055% = 21.56', () => {
    expect(input.closeFeeReserve.toString()).toBe('21.56');
  });

  it('IM 821.56, MM 221.56, liquidation price 36,380.25', () => {
    const risk = positionRisk(input, tiers);
    // The help centre's "IM" is the formula's IM + fee to close (821.56); the API's positionIM also
    // counts the 3,000 added by hand (testnet parity run, 2026-09-28)
    expect(risk.positionIM.minus(input.extraMargin).toString()).toBe('821.56');
    expect(risk.positionIM.toString()).toBe('3821.56');
    expect(risk.positionMM.toString()).toBe('221.56');
    expect(risk.liqPrice.toFixed(2)).toBe('36380.25');
  });

  it('without the extra margin: (40,000 − 800) / 0.995 ≈ 39,396.98; bankruptcy 39,200', () => {
    const risk = positionRisk({ ...input, extraMargin: D(0) }, tiers);
    expect(risk.liqPrice.toFixed(2)).toBe('39396.98');
    expect(risk.bustPrice.toString()).toBe('39200');
  });

  it('the client estimate matches the server maths', () => {
    const cases = [
      { side: 'long' as const, qty: 0.1, entry: 50_000, lev: 10, symbol: 'BTCUSDT' },
      { side: 'short' as const, qty: 0.1, entry: 50_000, lev: 10, symbol: 'BTCUSDT' },
      { side: 'long' as const, qty: 400, entry: 1.2, lev: 7, symbol: 'ADAUSDT' },
      { side: 'short' as const, qty: 30, entry: 610, lev: 3, symbol: 'BNBUSDT' },
    ];
    for (const c of cases) {
      const server = positionRisk(
        {
          side: c.side,
          quantity: D(c.qty),
          entryPrice: D(c.entry),
          im: D(c.qty).times(c.entry).div(c.lev),
          closeFeeReserve: feeToClose(c.side, D(c.qty), D(c.entry), c.lev),
          extraMargin: D(0),
          tickSize: fallbackRules('linear', c.symbol).tickSize,
        },
        fallbackRiskTiers(c.symbol)
      );
      const client = sdk.estimatePositionRisk(
        {
          side: c.side,
          qty: c.qty,
          entryPrice: c.entry,
          leverage: c.lev,
          tickSize: sdk.linearTickSize(c.symbol),
        },
        sdk.riskTiersFor(c.symbol)
      );
      // Both round to the same tick the same way: equal, not just close
      expect(client.liqPrice).toBe(server.liqPrice.toNumber());
      expect(client.liqPrice).toBeCloseTo(server.liqPrice.toNumber(), 6);
      expect(client.bustPrice).toBeCloseTo(server.bustPrice.toNumber(), 6);
      expect(client.positionMM).toBeCloseTo(server.positionMM.toNumber(), 6);
    }
  });

  it('picks the tier by position value (Bybit UTA moves positions between tiers)', () => {
    const bnb = fallbackRiskTiers('BNBUSDT');
    expect(tierFor(bnb, D(9_000)).mmr.toString()).toBe('0.0067');
    expect(tierFor(bnb, D(60_000)).mmr.toString()).toBe('0.0077');
    // past the last tier: the last one
    expect(tierFor(bnb, D(9e12)).mmr.toString()).toBe(bnb[bnb.length - 1].mmr.toString());
  });

  it('a liquidation price of 0 never liquidates', () => {
    expect(markHitsLiquidation('long', D(0), D(1))).toBe(false);
    expect(markHitsLiquidation('long', D(100), D(100))).toBe(true);
    expect(markHitsLiquidation('short', D(100), D(99))).toBe(false);
  });
});

describe('position cap by leverage (BP-5 C)', () => {
  it('is the risk limit of the highest tier that still allows the leverage', () => {
    // Live 2026-09-27: BTCUSDT allows 10× up to 100 M USDT, ETHUSDT up to 52 M (plan BP-5)
    expect(positionCap(fallbackRiskTiers('BTCUSDT'), 10)?.toString()).toBe('100000000');
    expect(positionCap(fallbackRiskTiers('ETHUSDT'), 10)?.toString()).toBe('52000000');
    // Lower leverage reaches no further than the table
    const bnb = fallbackRiskTiers('BNBUSDT');
    expect(positionCap(bnb, 1)?.gte(positionCap(bnb, 10) ?? 0)).toBe(true);
  });

  it('the client estimate matches', () => {
    for (const symbol of ALLOWED_SYMBOLS) {
      expect(sdk.positionCapEstimate(sdk.riskTiersFor(symbol), 10)).toBe(
        positionCap(fallbackRiskTiers(symbol), 10)?.toNumber() ?? null
      );
    }
  });

  it('the client tier index matches the server tierFor at and around every boundary (BP-5 C)', () => {
    for (const symbol of ALLOWED_SYMBOLS) {
      const tiers = fallbackRiskTiers(symbol);
      const est = sdk.riskTiersFor(symbol);
      for (const t of tiers) {
        for (const v of [t.riskLimitValue, t.riskLimitValue.plus(1)]) {
          expect(sdk.tierIndexEstimate(est, v.toNumber())).toBe(tiers.indexOf(tierFor(tiers, v)));
        }
      }
    }
  });
});

describe('cross account figures (BP-5 E) — server and client estimate agree', () => {
  const tiersB = fallbackRiskTiers('BTCUSDT');
  const tiersE = fallbackRiskTiers('ETHUSDT');
  const serverPos = (mark: number) => [
    {
      side: 'long' as const,
      quantity: new Decimal('0.1'),
      entryPrice: new Decimal(50_000),
      leverage: 10,
      mark: new Decimal(mark),
      tiers: tiersB,
    },
    {
      side: 'short' as const,
      quantity: new Decimal('2'),
      entryPrice: new Decimal(2_500),
      leverage: 5,
      mark: new Decimal(2_600),
      tiers: tiersE,
    },
  ];
  const clientPos = (mark: number) => [
    {
      side: 'long' as const,
      qty: 0.1,
      entryPrice: 50_000,
      leverage: 10,
      mark,
      tiers: sdk.riskTiersFor('BTCUSDT'),
    },
    {
      side: 'short' as const,
      qty: 2,
      entryPrice: 2_500,
      leverage: 5,
      mark: 2_600,
      tiers: sdk.riskTiersFor('ETHUSDT'),
    },
  ];

  it('the figures match', () => {
    const server = accountFigures(new Decimal(2_000), serverPos(48_000), new Decimal(30));
    const client = sdk.accountFiguresEstimate(2_000, clientPos(48_000), 30);
    const pairs: [number, Decimal][] = [
      [client.walletBalance, server.walletBalance],
      [client.unrealisedPnl, server.unrealisedPnl],
      [client.marginBalance, server.marginBalance],
      [client.totalIM, server.totalIM],
      [client.totalMM, server.totalMM],
      [client.available, server.available],
    ];
    for (const [c, sv] of pairs) expect(c).toBeCloseTo(sv.toNumber(), 8);
    expect(client.mmRate).toBeCloseTo(server.mmRate.toNumber(), 10);
  });

  it('at the estimated cross liquidation price the server MM rate is 100%', () => {
    const client = sdk.accountFiguresEstimate(2_000, clientPos(48_000), 0);
    const liq = sdk.crossLiqPriceEstimate(clientPos(48_000)[0], client);
    expect(liq).toBeGreaterThan(0);
    expect(liq).toBeLessThan(48_000);
    const at = accountFigures(new Decimal(2_000), serverPos(liq), new Decimal(0));
    expect(at.mmRate.toNumber()).toBeCloseTo(1, 6);
  });

  it('a margin balance of 0 or less gives an infinite rate (never divides by it)', () => {
    const f = accountFigures(new Decimal(-5_000), serverPos(50_000), new Decimal(0));
    expect(f.mmRate.isFinite()).toBe(false);
    expect(sdk.accountFiguresEstimate(-5_000, clientPos(50_000), 0).mmRate).toBe(Infinity);
  });
});
