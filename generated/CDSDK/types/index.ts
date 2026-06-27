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
  symbol: string;
  interval: string; // '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  kline: CandleBar;
  indicators: IndicatorSnapshot;
}

// Discriminated union — what the server sends over /api/market/ws
export type WsMessage =
  | { type: 'snapshot'; bars: LiveBar[] }
  | { type: 'bar'; bar: LiveBar }
  | { type: 'ticker'; symbol: string; lastPrice: number; bid: number; ask: number };

export interface CandleHistoryResponse {
  symbol: string;
  interval: string;
  candles: CandleBar[];
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
