/**
 * Chart lines for positions and orders (BP-3) — which lines Bybit draws, which can be dragged.
 */

import { describe, it, expect } from 'vitest';
import { buildTradeLines, hitTestTradeLine, roundToTick } from '../tradeLines';
import type { PendingOrder, Position } from '@/store/paperStore';

const long: Position = {
  id: 'p1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'long',
  quantity: 0.1,
  entryPrice: 50_000,
  entryUsdtAmount: 500,
  leverage: 10,
  entryFee: 2.75,
  closeFeeReserve: 2.475,
  extraMargin: 0,
  liqPrice: 45_148.99,
  bustPrice: 45_000,
  positionIM: 502.475,
  positionMM: 18.975,
  cumFunding: 0,
  openedAt: 1,
  takeProfit: 55_000,
  stopLoss: 47_000,
};

const order = (o: Partial<PendingOrder>): PendingOrder => ({
  id: 'o1',
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  usdtAmount: 490,
  reserved: 495,
  triggerPrice: 49_000,
  qty: 0.1,
  leverage: 10,
  placedAt: 1,
  ...o,
});

const base = {
  category: 'linear' as const,
  symbol: 'BTCUSDT',
  positions: [long],
  pendingOrders: [order({ takeProfit: 52_000 })],
  mark: 50_421,
  showMark: true,
};

describe('buildTradeLines()', () => {
  it('draws the position’s entry (with live PnL at the mark), TP, SL, liquidation, orders and mark', () => {
    const lines = buildTradeLines(base);
    expect(lines.map((l) => [l.id, l.title, l.style])).toEqual([
      ['pos:p1:entry', 'Long 0.1  +$42.10', 'solid'],
      ['pos:p1:tp', 'TP', 'dashed'],
      ['pos:p1:sl', 'SL', 'dashed'],
      ['pos:p1:liq', 'Liq.', 'dashed'],
      ['ord:o1:price', 'Limit 0.1', 'dotted'],
      ['ord:o1:tp', 'TP', 'dotted'],
      ['mark', 'Mark', 'dotted'],
    ]);
  });

  it('only TP / SL and order prices can be dragged — not the entry, liquidation or mark', () => {
    const draggable = buildTradeLines(base)
      .filter((l) => l.drag)
      .map((l) => l.drag?.kind);
    expect(draggable).toEqual(['positionTp', 'positionSl', 'orderPrice', 'orderTp']);
  });

  it('only draws the pane’s own market and symbol', () => {
    expect(buildTradeLines({ ...base, symbol: 'ETHUSDT' })).toEqual([
      expect.objectContaining({ id: 'mark' }),
    ]);
    // Spot shows no perpetual position, only spot orders
    expect(buildTradeLines({ ...base, category: 'spot', mark: null })).toEqual([]);
  });

  it('a spot TP / SL leg is drawn but not draggable (placed or cancelled, never edited)', () => {
    const [leg] = buildTradeLines({
      ...base,
      category: 'spot',
      positions: [],
      mark: null,
      pendingOrders: [order({ category: 'spot', type: 'take-profit', side: 'sell' })],
    });
    expect(leg).toMatchObject({ title: 'TP 0.1' });
    expect(leg.drag).toBeUndefined();
  });

  it('hides the mark line when turned off, and draws no liquidation line for a 1× long', () => {
    const ids = buildTradeLines({
      ...base,
      showMark: false,
      positions: [{ ...long, liqPrice: 0 }],
    }).map((l) => l.id);
    expect(ids).not.toContain('mark');
    expect(ids).not.toContain('pos:p1:liq');
  });
});

describe('hitTestTradeLine()', () => {
  const lines = buildTradeLines(base);
  const at = (id: string, y: number) => ({ spec: lines.find((l) => l.id === id)!, y });

  it('picks the nearest draggable line within 5 px', () => {
    const hit = hitTestTradeLine([at('pos:p1:tp', 100), at('pos:p1:sl', 104)], 103);
    expect(hit?.id).toBe('pos:p1:sl');
  });

  it('ignores lines that can not be dragged, and lines too far away', () => {
    expect(hitTestTradeLine([at('pos:p1:entry', 100)], 100)).toBeNull();
    expect(hitTestTradeLine([at('pos:p1:tp', 100)], 110)).toBeNull();
  });
});

describe('roundToTick()', () => {
  it('rounds to the instrument tick', () => {
    expect(roundToTick(50_123.456, 0.1)).toBe(50_123.5);
    expect(roundToTick(0.123456, 0.0001)).toBe(0.1235);
    expect(roundToTick(123.456, null)).toBe(123.456);
  });
});
