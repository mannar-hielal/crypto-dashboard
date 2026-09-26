/**
 * The server charges from bybitSpec.ts; the client estimates from generated/CDSDK/spec/bybit.ts.
 * The server build can't import SDK runtime code, so this keeps the two copies identical.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/client';
import * as sdk from '../../../../../generated/CDSDK/spec/bybit.js';
import {
  FEE_RATES,
  LEGACY_FEE_RATE,
  checkOrderSize,
  fallbackRules,
  floorToStep,
  isOnTick,
} from '../bybitSpec.js';
import { MAX_LEVERAGE, STARTING_BALANCE } from '../engine/index.js';
import { ALLOWED_SYMBOLS } from '../../constants.js';

describe('bybitSpec', () => {
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
});
