/**
 * Shared domain types for the Crypto Dashboard server
 * Phase 1: Market data, indicators, and streaming
 */

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

export interface TickerData {
  symbol: string;
  lastPrice: number;
  bid: number;
  ask: number;
}

export type StreamDataType = 'kline' | 'orderBook' | 'trade' | 'ticker';

export interface StreamData {
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
