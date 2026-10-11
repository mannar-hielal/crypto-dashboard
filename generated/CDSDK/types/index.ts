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

// ─── Learn: guided tours ─────────────────────────────────────────────────────

/** Everything the account remembers about learning: the three tours and the welcome card */
export const LEARN_ITEM_IDS = [
  'primer',
  'buy-first-coin',
  'sell-and-review',
  'welcome-card',
] as const;
export type LearnItemId = (typeof LEARN_ITEM_IDS)[number];

/** `completed`: finished (never downgraded); `dismissed`: the learner closed the offer */
export type LearnStatus = 'completed' | 'dismissed';

export interface LearnProgressItem {
  itemId: LearnItemId;
  status: LearnStatus;
  updatedAt: string;
}

export interface LearnProgressResponse {
  items: LearnProgressItem[];
}

export interface SetLearnProgressRequest {
  status: LearnStatus;
}

// ─── Admin: retention metrics ────────────────────────────────────────────────

/** `count` of the `eligible` users — a window not yet fully elapsed leaves a user out of `eligible` */
export interface MetricsRate {
  eligible: number;
  count: number;
}

/** One weekly signup cohort (Monday 00:00 UTC start), aggregates only — never a user id or email */
export interface RetentionCohort {
  /** ISO date (YYYY-MM-DD) of the cohort's Monday, or `null` on the totals row */
  weekStart: string | null;
  signups: number;
  verified: number;
  /** A user-placed order within 7 days of signup */
  activated: MetricsRate;
  /** Median hours from signup to the first user-placed order, over the users who activated */
  medianHoursToFirstOrder: number | null;
  /** Active on a UTC day within days 1–7 / 8–14 / 22–28 after the signup day */
  activeWeek1: MetricsRate;
  activeWeek2: MetricsRate;
  activeWeek4: MetricsRate;
  /** Users who reset their account at least once */
  resetUsers: number;
  /** Of the users with a first order: those whose first order carried a stop-loss */
  firstOrderWithStopLoss: MetricsRate;
}

export interface RetentionMetricsResponse {
  generatedAt: string;
  windowWeeks: number;
  /** True when the user row cap cut the window short — the numbers are then a lower bound */
  truncated: boolean;
  /**
   * UTC date (YYYY-MM-DD) of the oldest recorded sign-in day, or null before any exists. Cohorts
   * older than this under-count return: their sign-ins were not recorded yet.
   */
  activityTrackedSince: string | null;
  totals: RetentionCohort;
  cohorts: RetentionCohort[];
}

// ─── Market ──────────────────────────────────────────────────────────────────

/**
 * Bybit market a pane reads its data from: `spot` = Spot, `linear` = USDT Perpetual
 * (APP_LOG Bybit Parity BP-0). Mirrors ALLOWED_CATEGORIES in apps/server/src/constants.ts.
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

// ─── Paper trading (APP_LOG Bybit Parity BP-1: executed on the server) ───────────
//
// Money, prices and quantities are decimal strings (the server keeps them as Decimal); times are
// Unix ms. The client converts to numbers for display only.
//
// BP-2: every record carries its market (`category`: 'spot' = Spot, 'linear' = USDT Perpetual).
// Rows from before BP-2 are 'linear' — that trading became USDT Perpetual.

export type PaperOrderSide = 'buy' | 'sell';
export type PaperPositionSide = 'long' | 'short';
/** take-profit / stop-loss: a spot TP / SL leg (a conditional sell protecting a coin balance) */
export type PaperPendingType = 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type PaperOrderType = 'market' | 'limit' | 'stop' | 'take-profit' | 'stop-loss';
export type PaperOrderStatus = 'filled' | 'cancelled' | 'rejected';
export type PaperExitLeg = 'take-profit' | 'stop-loss';
export type PaperSound = 'placed' | 'queued' | 'filled' | 'profit' | 'loss' | 'liquidation';
/** Bybit's execution type: a normal fill, or a liquidation at the bankruptcy price */
export type PaperExecType = 'Trade' | 'BustTrade' | 'Funding';

export interface PaperAccountDTO {
  balance: string;
  realizedPnl: string;
  /** Default USDT Perpetual leverage, for a symbol with no entry in `symbolLeverage` */
  leverage: number;
  /** USDT Perpetual leverage per symbol */
  symbolLeverage: Record<string, number>;
  /**
   * Bybit UTA margin mode, account-wide (BP-5 E): REGULAR_MARGIN = cross. Absent from a pre-BP-5
   * server (= isolated).
   */
  marginMode?: PaperMarginMode;
  /** Snapshot only: the account was isolated before cross existed — show the one-time notice */
  marginModeNotice?: boolean;
  /**
   * Account version after this state / change. Every committed change bumps it by one, so a
   * client ignores anything not newer than what it has — an HTTP response and the WebSocket push
   * of the same change, or a late response after a newer push.
   */
  version: number;
}

/**
 * A USDT Perpetual position — one per symbol (one-way mode). The margin figures follow Bybit's
 * isolated-margin maths and its v5 position field names (BP-3).
 */
export interface PaperPositionDTO {
  id: string;
  category: 'linear';
  symbol: string;
  side: PaperPositionSide;
  quantity: string;
  entryPrice: string;
  /** Initial margin: quantity × entry / leverage */
  entryUsdtAmount: string;
  leverage: number;
  /** 'cross' (BP-5 E): liqPrice / bustPrice are then absent — estimate them from the account */
  marginMode: 'isolated' | 'cross';
  /** Open fee charged */
  entryFee: string;
  /** Estimated close fee held with the margin (position margin = entryUsdtAmount + this) */
  closeFeeReserve: string;
  /*
   * BP-3 risk figures. Every BP-3 server sends them all, but they are optional: a server from
   * before BP-3 (rolling deploy) sends none. A missing figure is unknown — never read it as 0,
   * which would mean "can't be liquidated" / "no maintenance margin".
   */
  /** Margin added on top of IM (0 until add / remove margin exists) */
  extraMargin?: string;
  /** Mark price at or past which the position is liquidated; "0" = can't be liquidated (1× long) */
  liqPrice?: string;
  /** Price the position closes at when liquidated (its whole margin is lost there) */
  bustPrice?: string;
  /** Bybit positionIM: initial margin + fee to close + margin added by hand */
  positionIM?: string;
  /** Bybit positionMM: position value × MMR − deduction + fee to close */
  positionMM?: string;
  /** Maintenance margin rate of the position's risk-limit tier */
  mmr?: string;
  /** Funding settled on this position so far, signed as Bybit: positive = paid (BP-4; absent before) */
  cumFunding?: string;
  openedAt: number;
  takeProfit?: string;
  stopLoss?: string;
  /** Price each exit leg triggers on (BP-5 B); absent = LastPrice */
  tpTriggerBy?: PaperTriggerBy;
  slTriggerBy?: PaperTriggerBy;
}

/** Bybit's account margin mode (UTA): REGULAR_MARGIN = cross (BP-5 E) */
export type PaperMarginMode = 'ISOLATED_MARGIN' | 'REGULAR_MARGIN';

/** Bybit's `triggerBy`: the price a TP / SL or stop order triggers on (BP-5 B) */
export type PaperTriggerBy = 'LastPrice' | 'MarkPrice' | 'IndexPrice';

export interface PaperPendingOrderDTO {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: PaperOrderSide;
  type: PaperPendingType;
  /** Initial margin at the trigger price */
  usdtAmount: string;
  /**
   * What placing it set aside, returned in full on cancel: USDT for a perpetual order or a spot
   * buy, the locked coin quantity for a spot sell / TP / SL.
   */
  reserved: string;
  /** Spot TP / SL pair id: both legs share one coin lock; filling one cancels the other */
  ocoGroup?: string;
  triggerPrice: string;
  qty: string;
  /** Leverage captured at placement — the fill uses it */
  leverage: number;
  takeProfit?: string;
  stopLoss?: string;
  placedAt: number;
  /** A stop order's trigger source (BP-5 B); absent = LastPrice. A limit rests on the last price */
  triggerBy?: PaperTriggerBy;
  /** Trigger source of the TP / SL the fill attaches; absent = LastPrice */
  tpTriggerBy?: PaperTriggerBy;
  slTriggerBy?: PaperTriggerBy;
  /** Reduce-only: only shrinks the opposite position; reserves nothing and carries no TP / SL */
  reduceOnly?: boolean;
  /** Close-on-trigger (implies reduce-only) */
  closeOnTrigger?: boolean;
}

/** A spot coin balance (the USDT wallet is `account.balance`). */
export interface PaperSpotBalanceDTO {
  coin: string;
  /** Sellable now */
  free: string;
  /** Backing resting sell / TP / SL orders */
  locked: string;
  /** Average cost per coin in USDT, fees included */
  avgCost: string;
}

export interface PaperOrderDTO {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  qty: string;
  limitPrice?: string;
  stopPrice?: string;
  fillPrice?: string;
  status: PaperOrderStatus;
  /** Fee charged, in `feeAsset` */
  commission: string;
  /** Fee rate of a fill, e.g. "0.00055"; absent on cancel / reject rows */
  feeRate?: string;
  feeAsset?: string;
  /** True for a resting limit fill (maker fee), false for a taker fill */
  isMaker?: boolean;
  /** Initial margin and leverage of a USDT Perpetual entry fill */
  margin?: string;
  leverage?: number;
  placingTime: number;
  closingTime: number;
  rejectionReason?: string;
  /** 'CreateByLiq' = the system order that closed a liquidated position */
  createType?: 'CreateByLiq';
  /** Bybit order flags (BP-5 B) — present only when set */
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
  triggerBy?: PaperTriggerBy;
}

export interface PaperTradeDTO {
  id: string;
  category: MarketCategory;
  symbol: string;
  side: PaperPositionSide;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  /** Gross PnL (price move only) */
  pnl: string;
  openedAt: number;
  closedAt: number;
  /** 'BustTrade' = closed by liquidation at the bankruptcy price; absent = a normal close */
  execType?: PaperExecType;
  /** The closed part's share of the position's funding (+ = paid); Closed P&L is net of it (BP-4) */
  funding?: string;
  /*
   * BP-5 D — Bybit's Closed P&L (optional: a pre-BP-5 server sends none). closedPnl = pnl −
   * openFee − closeFee − funding. openFee is "0" on closes from before BP-5.
   */
  openFee?: string;
  closeFee?: string;
  closedPnl?: string;
  /** Bybit v5 names (position/closed-pnl), for API parity */
  avgEntryPrice?: string;
  avgExitPrice?: string;
  closedSize?: string;
}

/**
 * One funding settlement on one position (Bybit execution `execType = Funding`, BP-4). It moves
 * money, never the position.
 */
export interface PaperFundingDTO {
  id: string;
  symbol: string;
  side: PaperPositionSide;
  /** Position size at the funding timestamp */
  qty: string;
  /** Mark price at the funding timestamp */
  markPrice: string;
  /** Settled funding rate, e.g. "0.0001" */
  rate: string;
  /** qty × mark × rate, signed as Bybit's execFee: positive = paid, negative = received */
  fee: string;
  /** The funding timestamp (Unix ms) */
  time: number;
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
  spotBalances: PaperSpotBalanceDTO[];
  pendingOrders: PaperPendingOrderDTO[];
  orders: PaperOrderDTO[];
  trades: PaperTradeDTO[];
  journal: PaperJournalEntryDTO[];
  balanceEvents: PaperBalanceEventDTO[];
  /** Funding settlements, newest first (BP-4; absent from an older server) */
  fundings?: PaperFundingDTO[];
}

/**
 * What one engine action changed. List fields are newest first (index 0 = top of the list).
 * Applying the same delta twice is harmless: everything is keyed by id.
 */
export interface PaperDeltaDTO {
  account: PaperAccountDTO;
  positionsUpsert: PaperPositionDTO[];
  positionsRemove: string[];
  spotUpsert: PaperSpotBalanceDTO[];
  pendingUpsert: PaperPendingOrderDTO[];
  pendingRemove: string[];
  orders: PaperOrderDTO[];
  trades: PaperTradeDTO[];
  /** Funding settlements this change made (BP-4) */
  fundings?: PaperFundingDTO[];
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
/** Live price of a market the user holds or has orders on (for PnL of symbols no pane shows). */
export interface PaperPriceDTO {
  category: MarketCategory;
  symbol: string;
  last: number;
  /** USDT Perpetual mark price */
  mark?: number;
}

export type WsPaperMessage =
  | { type: 'snapshot'; state: PaperStateDTO }
  | { type: 'delta'; delta: PaperDeltaDTO; sound?: PaperSound }
  /** At most once a second, only prices that changed */
  | { type: 'prices'; items: PaperPriceDTO[] };

/** First (and re-auth) message the client sends over /api/paper/ws. */
export interface WsPaperAuthMessage {
  type: 'auth';
  token: string;
}

// ─── Paper trading requests (intent only — the server picks prices) ──────────

/**
 * Size is exactly one of `qty` (base coin) or `value` (USDT notional, converted at the fill /
 * trigger price).
 */
export interface PlaceOrderRequest {
  /** Defaults to 'linear' */
  category?: MarketCategory;
  symbol: string;
  side: PaperOrderSide;
  /** Spot takes market and limit only */
  type: 'market' | 'limit' | 'stop';
  qty?: string;
  value?: string;
  /** Required for limit / stop */
  triggerPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
  /** USDT Perpetual (BP-5 B): a stop order's trigger source (default LastPrice) */
  triggerBy?: PaperTriggerBy;
  /** What the attached TP / SL trigger on (default LastPrice) */
  tpTriggerBy?: PaperTriggerBy;
  slTriggerBy?: PaperTriggerBy;
  /** Only shrink the opposite position: capped at its size, no margin, no TP / SL */
  reduceOnly?: boolean;
  /** Close-on-trigger (implies reduceOnly) */
  closeOnTrigger?: boolean;
}

/** TP / SL on spot coins already held — locks `qty` of the free balance behind an OCO pair. */
export interface PlaceSpotExitsRequest {
  symbol: string;
  qty: string;
  takeProfit?: string;
  stopLoss?: string;
}

export interface EditPendingOrderRequest {
  triggerPrice: string;
  /** Size in the base coin (required; the server answers 400 without it) */
  qty?: string;
  takeProfit: string | null;
  stopLoss: string | null;
  /** BP-5 B: new trigger sources; absent = keep the order's */
  triggerBy?: PaperTriggerBy;
  tpTriggerBy?: PaperTriggerBy;
  slTriggerBy?: PaperTriggerBy;
}

export interface UpdatePositionExitsRequest {
  takeProfit: string | null;
  stopLoss: string | null;
  /** BP-5 B: what each leg triggers on; absent = keep the leg's */
  tpTriggerBy?: PaperTriggerBy;
  slTriggerBy?: PaperTriggerBy;
}

export interface SetLeverageRequest {
  leverage: number;
}

export interface JournalNoteRequest {
  text: string;
}
