/**
 * Shared domain types for the Crypto Dashboard server
 * Phase 1: Market data, indicators, and streaming
 */

// ─── MARKET DATA ──────────────────────────────────────────────────────────────

export interface Kline {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteAssetVolume: number;
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

export type StreamDataType = 'kline' | 'orderBook' | 'trade';

export interface StreamData {
  symbol: string;
  dataType: StreamDataType;
  data: Kline | OrderBook | Trade;
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
