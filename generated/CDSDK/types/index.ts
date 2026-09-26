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

// ─── Paper trading (BYBIT_PARITY_PLAN BP-1: executed on the server) ───────────
//
// Money, prices and quantities are decimal strings (the server keeps them as Decimal); times are
// Unix ms. The client converts to numbers for display only.

export type PaperOrderSide = 'buy' | 'sell';
export type PaperPositionSide = 'long' | 'short';
export type PaperPendingType = 'limit' | 'stop';
export type PaperOrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type PaperOrderStatus = 'filled' | 'cancelled' | 'rejected';
export type PaperExitLeg = 'take-profit' | 'stop-loss';
export type PaperSound = 'placed' | 'queued' | 'filled' | 'profit' | 'loss';

export interface PaperAccountDTO {
  balance: string;
  realizedPnl: string;
  leverage: number;
  /**
   * Account version after this state / change. Every committed change bumps it by one, so a
   * client ignores anything not newer than what it has — an HTTP response and the WebSocket push
   * of the same change, or a late response after a newer push.
   */
  version: number;
}

export interface PaperPositionDTO {
  id: string;
  symbol: string;
  side: PaperPositionSide;
  quantity: string;
  entryPrice: string;
  /** Margin reserved at entry */
  entryUsdtAmount: string;
  openedAt: number;
  takeProfit?: string;
  stopLoss?: string;
}

export interface PaperPendingOrderDTO {
  id: string;
  symbol: string;
  side: PaperOrderSide;
  type: PaperPendingType;
  usdtAmount: string;
  triggerPrice: string;
  qty: string;
  /** Leverage captured at placement — the fill uses it */
  leverage: number;
  takeProfit?: string;
  stopLoss?: string;
  placedAt: number;
}

export interface PaperOrderDTO {
  id: string;
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  qty: string;
  limitPrice?: string;
  stopPrice?: string;
  fillPrice?: string;
  status: PaperOrderStatus;
  commission: string;
  margin?: string;
  placingTime: number;
  closingTime: number;
  rejectionReason?: string;
}

export interface PaperTradeDTO {
  id: string;
  symbol: string;
  side: PaperPositionSide;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  /** Gross PnL (price move only) */
  pnl: string;
  openedAt: number;
  closedAt: number;
}

export interface PaperJournalEntryDTO {
  id: string;
  time: number;
  text: string;
  isUserNote: boolean;
  /** Net realized PnL on close entries */
  pnl?: string;
}

export interface PaperBalanceEventDTO {
  id: string;
  time: number;
  balanceBefore: string;
  balanceAfter: string;
  pnl: string;
  action: string;
}

/** Full account view — GET /api/paper/state and the private WS `snapshot`. Lists newest first. */
export interface PaperStateDTO {
  account: PaperAccountDTO;
  positions: PaperPositionDTO[];
  pendingOrders: PaperPendingOrderDTO[];
  orders: PaperOrderDTO[];
  trades: PaperTradeDTO[];
  journal: PaperJournalEntryDTO[];
  balanceEvents: PaperBalanceEventDTO[];
}

/**
 * What one engine action changed. List fields are newest first (index 0 = top of the list).
 * Applying the same delta twice is harmless: everything is keyed by id.
 */
export interface PaperDeltaDTO {
  account: PaperAccountDTO;
  positionsUpsert: PaperPositionDTO[];
  positionsRemove: string[];
  pendingUpsert: PaperPendingOrderDTO[];
  pendingRemove: string[];
  orders: PaperOrderDTO[];
  trades: PaperTradeDTO[];
  balanceEvents: PaperBalanceEventDTO[];
  journal: PaperJournalEntryDTO[];
  journalEdits: { id: string; text: string }[];
  /** Account reset — clear every list before applying */
  reset?: boolean;
}

/** Response of every mutating /api/paper endpoint. */
export interface PaperActionResponse<R> {
  result: R;
  delta: PaperDeltaDTO;
  sound?: PaperSound;
}

/** Discriminated union — what the server sends over the private /api/paper/ws. */
export type WsPaperMessage =
  | { type: 'snapshot'; state: PaperStateDTO }
  | { type: 'delta'; delta: PaperDeltaDTO; sound?: PaperSound };

/** First (and re-auth) message the client sends over /api/paper/ws. */
export interface WsPaperAuthMessage {
  type: 'auth';
  token: string;
}

// ─── Paper trading requests (intent only — the server picks prices) ──────────

export interface PlaceOrderRequest {
  symbol: string;
  side: PaperOrderSide;
  type: 'market' | PaperPendingType;
  usdtAmount: string;
  /** Required for limit / stop */
  triggerPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
}

export interface EditPendingOrderRequest {
  triggerPrice: string;
  usdtAmount: string;
  takeProfit: string | null;
  stopLoss: string | null;
}

export interface UpdatePositionExitsRequest {
  takeProfit: string | null;
  stopLoss: string | null;
}

export interface SetLeverageRequest {
  leverage: number;
}

export interface JournalNoteRequest {
  text: string;
}
