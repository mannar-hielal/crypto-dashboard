/**
 * Shared domain types for the cryptopapertrade.com server
 * Phase 1: Market data, indicators, and streaming
 */

import type { BybitCategory } from '../constants.js';

// ─── MARKET DATA ──────────────────────────────────────────────────────────────

export interface Kline {
  timestamp: number; // Unix ms — start of the candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteAssetVolume: number;
  confirm?: boolean; // true = candle closed/confirmed; false = still forming
  interval?: string; // e.g. "1", "5", "15", "60", "240", "D"
}

export interface OrderBook {
  symbol: string;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][]; // [price, quantity]
  timestamp: number;
}

export interface Trade {
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  timestamp: number;
}

// ─── STREAMING ────────────────────────────────────────────────────────────────

/**
 * Merged quote state for one symbol in one category. Spot builds it from `tickers` (lastPrice) +
 * `orderbook.1` (bid/ask); linear gets everything from `tickers`. bid/ask are null until the first
 * quote arrives, and the perp-only fields are undefined on spot.
 */
export interface TickerData {
  symbol: string;
  lastPrice: number;
  bid: number | null;
  ask: number | null;
  markPrice?: number;
  indexPrice?: number;
  fundingRate?: number;
  nextFundingTime?: number;
  fundingIntervalHour?: number;
}

export type StreamDataType = 'kline' | 'orderBook' | 'trade' | 'ticker';

export interface StreamData {
  category: BybitCategory;
  symbol: string;
  dataType: StreamDataType;
  data: Kline | OrderBook | Trade | TickerData;
  timestamp: number;
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────

export interface EMAValue {
  value: number;
  period: number;
  timestamp: number;
}

export interface MACDValue {
  value: number;
  macd: number;
  signal: number;
  histogram: number;
  timestamp: number;
}

export interface VWAPValue {
  value: number;
  vwap: number;
  cumVolume: number;
  timestamp: number;
}
