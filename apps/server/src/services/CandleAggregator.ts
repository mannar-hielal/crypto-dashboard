/**
 * Candle Aggregator
 * Aggregates 1-minute klines into higher timeframes (5m, 15m, 1h, 4h, 1d)
 * Maintains an in-memory cache of open candles
 */

import { Kline } from '../types';
import { logger } from '../logger.js';

const log = logger.child({ service: 'CandleAggregator' });

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const INTERVAL_MINUTES: Record<ChartInterval, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

interface OpenCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteAssetVolume: number;
  tradeCount: number;
}

interface AggregatorState {
  openCandles: Map<ChartInterval, OpenCandle>;
  history: Map<ChartInterval, Kline[]>;
}

export class CandleAggregator {
  private state: Map<string, AggregatorState> = new Map();

  // 🔐 Prevent unbounded memory growth — Phase 1 tracks 1 symbol, 10 is generous
  private static readonly MAX_SYMBOLS = 10;
  // 🔐 Same symbol validation as WebSocket manager
  private static readonly VALID_SYMBOL = /^[A-Z0-9]{3,20}$/;

  process(candle: Kline, symbol: string): Map<ChartInterval, Kline> {
    const result = new Map<ChartInterval, Kline>();

    // 🔐 Validate symbol format
    if (!CandleAggregator.VALID_SYMBOL.test(symbol)) {
      log.error({ symbol }, 'Invalid symbol');
      return result;
    }

    if (!this.state.has(symbol)) {
      // 🔐 Enforce symbol limit — prevents memory exhaustion
      if (this.state.size >= CandleAggregator.MAX_SYMBOLS) {
        log.error({ limit: CandleAggregator.MAX_SYMBOLS }, 'Symbol limit reached');
        return result;
      }
      this.state.set(symbol, {
        openCandles: new Map(),
        history: new Map(),
      });
    }

    const state = this.state.get(symbol)!;
    const candleTime = candle.timestamp;

    for (const interval of Object.keys(INTERVAL_MINUTES) as ChartInterval[]) {
      if (interval === '1m') {
        this.storeCandle(state, interval, candle);
        result.set(interval, candle);
      } else {
        const aggregated = this.aggregate(state, interval, candle, candleTime);
        if (aggregated) {
          result.set(interval, aggregated);
        }
      }
    }

    return result;
  }

  getHistory(symbol: string, interval: ChartInterval, limit: number = 100): Kline[] {
    const state = this.state.get(symbol);
    if (!state) return [];
    const history = state.history.get(interval) || [];
    return history.slice(-limit);
  }

  getOpenCandle(symbol: string, interval: ChartInterval): OpenCandle | null {
    const state = this.state.get(symbol);
    if (!state) return null;
    return state.openCandles.get(interval) || null;
  }

  clear(symbol: string): void {
    this.state.delete(symbol);
  }

  private aggregate(
    state: AggregatorState,
    interval: ChartInterval,
    incomingCandle: Kline,
    _candleTime: number
  ): Kline | null {
    const intervalMinutes = INTERVAL_MINUTES[interval];
    const candleClosedTime = incomingCandle.timestamp;
    const openCandleTime = this.getIntervalStart(candleClosedTime, intervalMinutes);

    let openCandle = state.openCandles.get(interval);

    if (!openCandle) {
      openCandle = {
        timestamp: openCandleTime,
        open: incomingCandle.open,
        high: incomingCandle.high,
        low: incomingCandle.low,
        volume: incomingCandle.volume,
        quoteAssetVolume: incomingCandle.quoteAssetVolume,
        tradeCount: 1,
      };
      state.openCandles.set(interval, openCandle);
      return null;
    }

    const currentPeriod = this.getIntervalStart(candleClosedTime, intervalMinutes);
    const openPeriod = openCandle.timestamp;

    if (currentPeriod !== openPeriod) {
      const closedCandle: Kline = {
        timestamp: openPeriod,
        open: openCandle.open,
        high: openCandle.high,
        low: openCandle.low,
        close: this.getPreviousClosePrice(state, interval, openPeriod),
        volume: openCandle.volume,
        quoteAssetVolume: openCandle.quoteAssetVolume,
      };

      this.storeCandle(state, interval, closedCandle);

      state.openCandles.set(interval, {
        timestamp: currentPeriod,
        open: incomingCandle.open,
        high: incomingCandle.high,
        low: incomingCandle.low,
        volume: incomingCandle.volume,
        quoteAssetVolume: incomingCandle.quoteAssetVolume,
        tradeCount: 1,
      });

      return closedCandle;
    } else {
      openCandle.high = Math.max(openCandle.high, incomingCandle.high);
      openCandle.low = Math.min(openCandle.low, incomingCandle.low);
      openCandle.volume += incomingCandle.volume;
      openCandle.quoteAssetVolume += incomingCandle.quoteAssetVolume;
      openCandle.tradeCount += 1;
      return null;
    }
  }

  private getIntervalStart(timestamp: number, intervalMinutes: number): number {
    const date = new Date(timestamp);
    const minutes = date.getUTCMinutes();
    const startMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;
    date.setUTCMinutes(startMinutes, 0, 0);
    return date.getTime();
  }

  private getPreviousClosePrice(
    state: AggregatorState,
    interval: ChartInterval,
    _candleTime: number
  ): number {
    const history = state.history.get(interval) || [];
    if (history.length > 0) {
      return history[history.length - 1].close;
    }
    return state.openCandles.get(interval)?.open || 0;
  }

  private storeCandle(state: AggregatorState, interval: ChartInterval, candle: Kline): void {
    if (!state.history.has(interval)) {
      state.history.set(interval, []);
    }

    const history = state.history.get(interval)!;

    if (history.length > 0 && history[history.length - 1].timestamp === candle.timestamp) {
      history[history.length - 1] = candle;
    } else {
      history.push(candle);
    }

    // Keep only last 500 candles per interval
    if (history.length > 500) {
      history.splice(0, history.length - 500);
    }
  }
}

export default CandleAggregator;
