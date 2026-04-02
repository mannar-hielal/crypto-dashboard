/**
 * Candle Aggregator
 * Aggregates 1-minute klines into higher timeframes (5m, 15m, 1h, 4h, 1d)
 * Maintains an in-memory cache of open candles
 */

import { Kline } from '../types';

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// Conversion factors (in minutes)
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

/**
 * CandleAggregator takes 1-minute candles and produces
 * aggregated candles for multiple timeframes
 */
export class CandleAggregator {
  private state: Map<string, AggregatorState> = new Map(); // symbol -> state

  /**
   * Process a new 1-minute candle and generate aggregated candles
   * Returns a map of intervals to their latest candle (only if closed)
   */
  process(candle: Kline, symbol: string): Map<ChartInterval, Kline> {
    const result = new Map<ChartInterval, Kline>();

    if (!this.state.has(symbol)) {
      this.state.set(symbol, {
        openCandles: new Map(),
        history: new Map(),
      });
    }

    const state = this.state.get(symbol)!;
    const candleTime = candle.timestamp;

    // Process each interval
    for (const interval of Object.keys(INTERVAL_MINUTES) as ChartInterval[]) {
      if (interval === '1m') {
        // 1m candles are stored as-is, no aggregation needed
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

  /**
   * Get historical candles for a specific symbol and interval
   */
  getHistory(symbol: string, interval: ChartInterval, limit: number = 100): Kline[] {
    const state = this.state.get(symbol);
    if (!state) return [];

    const history = state.history.get(interval) || [];
    return history.slice(-limit);
  }

  /**
   * Get the currently open (incomplete) candle for an interval
   */
  getOpenCandle(symbol: string, interval: ChartInterval): OpenCandle | null {
    const state = this.state.get(symbol);
    if (!state) return null;

    return state.openCandles.get(interval) || null;
  }

  /**
   * Clear history for a specific symbol (e.g., at market reset)
   */
  clear(symbol: string): void {
    this.state.delete(symbol);
  }

  /**
   * Private: Aggregate incoming 1-min candles into higher timeframes
   */
  private aggregate(
    state: AggregatorState,
    interval: ChartInterval,
    incomingCandle: Kline,
    candleTime: number
  ): Kline | null {
    const intervalMinutes = INTERVAL_MINUTES[interval];
    const candelClosedTime = incomingCandle.timestamp; // When this 1-min candle closes
    const openCandleTime = this.getIntervalStart(candelClosedTime, intervalMinutes);

    let openCandle = state.openCandles.get(interval);

    // If we don't have an open candle, create one
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
      return null; // No closed candle yet
    }

    // Check if we've moved to a new interval period
    const currentPeriod = this.getIntervalStart(candelClosedTime, intervalMinutes);
    const openPeriod = openCandle.timestamp;

    if (currentPeriod !== openPeriod) {
      // Previous candle is closed, return it and start a new one
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

      // Start new candle
      const newCandle: OpenCandle = {
        timestamp: currentPeriod,
        open: incomingCandle.open,
        high: incomingCandle.high,
        low: incomingCandle.low,
        volume: incomingCandle.volume,
        quoteAssetVolume: incomingCandle.quoteAssetVolume,
        tradeCount: 1,
      };

      state.openCandles.set(interval, newCandle);
      return closedCandle;
    } else {
      // Still in the same period, update the open candle
      openCandle.high = Math.max(openCandle.high, incomingCandle.high);
      openCandle.low = Math.min(openCandle.low, incomingCandle.low);
      openCandle.volume += incomingCandle.volume;
      openCandle.quoteAssetVolume += incomingCandle.quoteAssetVolume;
      openCandle.tradeCount += 1;

      return null; // No closed candle yet
    }
  }

  /**
   * Private: Get the start timestamp of an interval period
   * E.g., for a 5-minute interval, "12:07" belongs to period starting at "12:05"
   */
  private getIntervalStart(timestamp: number, intervalMinutes: number): number {
    const date = new Date(timestamp);
    const minutes = date.getUTCMinutes();
    const startMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;

    date.setUTCMinutes(startMinutes, 0, 0); // Set to start of interval, clear seconds and ms
    return date.getTime();
  }

  /**
   * Private: Get the close price of the previous candle for a specific interval
   * Used when closing an aggregated candle
   */
  private getPreviousClosePrice(
    state: AggregatorState,
    interval: ChartInterval,
    candle Time: number
  ): number {
    const history = state.history.get(interval) || [];
    if (history.length > 0) {
      return history[history.length - 1].close;
    }

    // Fallback: use open price if no history
    return state.openCandles.get(interval)?.open || 0;
  }

  /**
   * Private: Store a closed candle in history
   */
  private storeCandle(state: AggregatorState, interval: ChartInterval, candle: Kline): void {
    if (!state.history.has(interval)) {
      state.history.set(interval, []);
    }

    const history = state.history.get(interval)!;

    // Prevent duplicates by checking the last stored candle
    if (history.length > 0 && history[history.length - 1].timestamp === candle.timestamp) {
      history[history.length - 1] = candle; // Update in place
    } else {
      history.push(candle);
    }

    // Keep only the last 500 candles per interval to manage memory
    if (history.length > 500) {
      history.splice(0, history.length - 500);
    }
  }
}

export default CandleAggregator;

