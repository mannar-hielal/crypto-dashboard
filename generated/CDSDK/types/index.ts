// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  emailVerifiedAt?: string | null;
  deletionRequestedAt?: string | null;
  termsAcceptedAt?: string | null;
  termsAcceptedIp?: string | null;
}

export interface Account {
  id: string;
  userId: string;
  totalBalance: string; // Prisma Decimal serialises to string in JSON
  availableBalance: string;
  unrealizedPnl: string;
  realizedPnl: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string;
}

// Returned by /register and /login
// accessToken is short-lived (15 min) — store in Zustand memory only, never localStorage
export interface AuthResponse {
  accessToken: string;
  user: User;
}

// Returned by /refresh
export interface RefreshResponse {
  accessToken: string;
}

export interface MeResponse {
  user: User & { account: Account | null };
}

// Returned by /forgot-password and /reset-password
export interface MessageResponse {
  message: string;
}

export interface ApiError {
  error: string;
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

export interface SubscriberInfo {
  id: string;
  email: string;
  status: 'pending' | 'verified' | 'unsubscribed';
  createdAt: string;
  verifiedAt: string | null;
}

export interface SubscribersResponse {
  subscribers: SubscriberInfo[];
  total: number;
}

// ─── Market ──────────────────────────────────────────────────────────────────

/**
 * Bybit market a pane reads its data from: `spot` = Spot, `linear` = USDT Perpetual
 * (BYBIT_PARITY_PLAN BP-0). Mirrors ALLOWED_CATEGORIES in apps/server/src/constants.ts.
 */
export type MarketCategory = 'spot' | 'linear';

export interface CandleBar {
  timestamp: number; // Unix ms — start of the candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteAssetVolume: number;
  confirm?: boolean; // true = candle closed; false = still forming
  interval?: string;
}

export interface IndicatorSnapshot {
  ema9: number | null;
  ema21: number | null;
  ema200: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  vwap: number | null;
}

export interface LiveBar {
  /** Optional: REST-built snapshots from older servers didn't carry it */
  category?: MarketCategory;
  symbol: string;
  interval: string; // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  kline: CandleBar;
  indicators: IndicatorSnapshot;
}

// Discriminated union — what the server sends over /api/market/ws
export type WsMessage =
  | { type: 'snapshot'; bars: LiveBar[] }
  | { type: 'bar'; bar: LiveBar }
  | ({ type: 'ticker' } & TickerMessage);

/**
 * Quote update for one symbol. Spot: lastPrice + best bid/ask (orderbook.1). Linear adds mark and
 * index price and funding. bid/ask are null until the first quote arrives.
 */
export interface TickerMessage {
  category: MarketCategory;
  symbol: string;
  lastPrice: number;
  bid: number | null;
  ask: number | null;
  markPrice?: number;
  indexPrice?: number;
  fundingRate?: number;
  /** Unix ms of the next funding settlement */
  nextFundingTime?: number;
  fundingIntervalHour?: number;
}

export interface CandleHistoryResponse {
  category: MarketCategory;
  symbol: string;
  interval: string;
  candles: CandleBar[];
}

/** Trading rules for one symbol in one market — from Bybit instruments-info, cached server-side. */
export interface Instrument {
  symbol: string;
  category: MarketCategory;
  /** Price increment */
  tickSize: number;
  /** Quantity increment (spot: basePrecision) */
  qtyStep: number;
  /** Minimum order quantity in the base coin */
  minOrderQty: number;
  /** Minimum order value in USDT (spot: minOrderAmt, linear: minNotionalValue) */
  minNotional: number;
  /** Bybit's max leverage (linear only) */
  maxLeverage: number | null;
  /** Funding interval in minutes (linear only) */
  fundingIntervalMin: number | null;
}

export interface InstrumentsResponse {
  category: MarketCategory;
  instruments: Instrument[];
}

/** One risk-limit tier of a USDT Perpetual symbol. */
export interface RiskLimitTier {
  id: number;
  /** Upper bound of position value (USDT) for this tier */
  riskLimitValue: number;
  /** Maintenance margin rate, e.g. 0.005 = 0.5% */
  maintenanceMarginRate: number;
  initialMarginRate: number;
  maxLeverage: number;
  /** USDT deducted from maintenance margin at this tier (0 for tier 1) */
  mmDeduction: number;
}

export interface RiskLimitResponse {
  symbol: string;
  tiers: RiskLimitTier[];
}

export interface UpdateUserResponse {
  user: User;
}

export interface SyncAccountResponse {
  id: string;
  totalBalance: string;
  availableBalance: string;
  unrealizedPnl: string;
  realizedPnl: string;
  lastReset: string;
  resetCount: number;
}

export interface SyncOrderResponse {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  orderType: string;
  quantity: string;
  limitPrice: string | null;
  stopPrice: string | null;
  takeProfit: string | null;
  stopLoss: string | null;
  status: string;
  filledQuantity: string;
  averageFilledPrice: string | null;
  margin: string;
  commission: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  filledAt: string | null;
  cancelledAt: string | null;
}

export interface SyncTradeResponse {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  quantity: string;
  executedPrice: string;
  entryPrice: string | null;
  totalCost: string;
  commission: string;
  pnl: string;
  pnlPercent: string;
  openedAt: string | null;
  executedAt: string;
}

export interface SyncPositionResponse {
  id: string;
  refId: string | null;
  symbol: string;
  side: string;
  quantity: string;
  entryPrice: string;
  margin: string;
  takeProfit: string | null;
  stopLoss: string | null;
  openedAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────────────

export interface CreateOrderRequest {
  refId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: string;
  limitPrice?: string;
  stopPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
  margin?: string;
}

export interface UpdateOrderRequest {
  status?: 'FILLED' | 'CANCELLED' | 'REJECTED';
  limitPrice?: string;
  stopPrice?: string;
  takeProfit?: string | null;
  stopLoss?: string | null;
  filledQuantity?: string;
  averageFilledPrice?: string;
  rejectionReason?: string;
  quantity?: string;
  margin?: string;
}

export interface CreateTradeRequest {
  refId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  executedPrice: string;
  entryPrice?: string;
  totalCost: string;
  commission?: string;
  pnl?: string;
  pnlPercent?: string;
  orderId?: string;
  openedAt?: string;
}

export interface CreatePositionRequest {
  refId?: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: string;
  entryPrice: string;
  margin: string;
  takeProfit?: string | null;
  stopLoss?: string | null;
}

export interface UpdatePositionRequest {
  quantity?: string;
  margin?: string;
  takeProfit?: string | null;
  stopLoss?: string | null;
}
