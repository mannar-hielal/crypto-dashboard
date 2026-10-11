/**
 * SDK-typed fixtures for the SDK ↔ server contract test (F9). Type-checked by
 * `tsconfig.contract.json` (part of `pnpm type-check`), so each object is exactly what the SDK
 * type allows:
 *
 * - a request body `min*` holds only the SDK type's required fields — the test then proves every
 *   field the server requires is required by the SDK too;
 * - a request body `full*` and every response hold every field the SDK type declares, optional
 *   ones included — the test then proves the server accepts / sends each of them.
 *
 * When an SDK type gains a field, add it here: the test can only compare what the fixture holds.
 */

import type {
  AuthResponse,
  CandleHistoryResponse,
  EditPendingOrderRequest,
  InstrumentsResponse,
  JournalNoteRequest,
  MeResponse,
  MessageResponse,
  PaperActionResponse,
  PaperDeltaDTO,
  PaperStateDTO,
  PlaceOrderRequest,
  PlaceSpotExitsRequest,
  LearnProgressResponse,
  RefreshResponse,
  RetentionCohort,
  RetentionMetricsResponse,
  RiskLimitResponse,
  SubscribersResponse,
  UpdatePositionExitsRequest,
  UpdateUserResponse,
  User,
  authApi,
} from '@crypto-dashboard/sdk';

// ─── Requests ─────────────────────────────────────────────────────────────────

export const registerBody: Parameters<typeof authApi.register>[0] = {
  email: 'contract@example.test',
  username: 'contract_user',
  password: 'Contract 1 pass!',
  acceptedTerms: true,
};

export const minPlaceOrder: PlaceOrderRequest = { symbol: 'BTCUSDT', side: 'buy', type: 'market' };
export const fullPlaceOrder: Required<PlaceOrderRequest> = {
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  qty: '0.1',
  value: '5000',
  triggerPrice: '49000',
  takeProfit: '52000',
  stopLoss: '48000',
  triggerBy: 'LastPrice',
  tpTriggerBy: 'MarkPrice',
  slTriggerBy: 'IndexPrice',
  reduceOnly: false,
  closeOnTrigger: false,
};

export const minSpotExits: PlaceSpotExitsRequest = { symbol: 'BTCUSDT', qty: '0.1' };
export const fullSpotExits: Required<PlaceSpotExitsRequest> = {
  symbol: 'BTCUSDT',
  qty: '0.1',
  takeProfit: '52000',
  stopLoss: '48000',
};

export const minEditOrder: EditPendingOrderRequest = {
  triggerPrice: '49000',
  takeProfit: null,
  stopLoss: null,
};
export const fullEditOrder: Required<EditPendingOrderRequest> = {
  triggerPrice: '49000',
  qty: '0.1',
  takeProfit: '52000',
  stopLoss: '48000',
  triggerBy: 'LastPrice',
  tpTriggerBy: 'LastPrice',
  slTriggerBy: 'LastPrice',
};

export const minPositionExits: UpdatePositionExitsRequest = { takeProfit: null, stopLoss: null };
export const fullPositionExits: Required<UpdatePositionExitsRequest> = {
  takeProfit: '52000',
  stopLoss: '48000',
  tpTriggerBy: 'MarkPrice',
  slTriggerBy: 'LastPrice',
};

export const note: JournalNoteRequest = { text: 'contract' };

// ─── Responses ────────────────────────────────────────────────────────────────

const user: Required<User> = {
  id: 'u1',
  email: 'contract@example.test',
  username: 'contract_user',
  emailVerifiedAt: '2026-09-29T00:00:00.000Z',
  deletionRequestedAt: null,
  termsAcceptedAt: '2026-09-29T00:00:00.000Z',
  termsAcceptedIp: '203.0.113.7',
};

export const authResponse: AuthResponse = { accessToken: 'jwt', user };
export const refreshResponse: RefreshResponse = { accessToken: 'jwt' };
export const messageResponse: MessageResponse = { message: 'ok' };
export const updateUserResponse: UpdateUserResponse = { user };
export const meResponse: MeResponse = {
  user: {
    ...user,
    account: {
      id: 'a1',
      userId: 'u1',
      totalBalance: '10000',
      availableBalance: '10000',
      unrealizedPnl: '0',
      realizedPnl: '0',
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    },
  },
};

export const learnProgressResponse: LearnProgressResponse = {
  items: [{ itemId: 'primer', status: 'completed', updatedAt: '2026-10-11T00:00:00.000Z' }],
};

export const learnProgressItem = {
  item: { itemId: 'primer', status: 'completed', updatedAt: '2026-10-11T00:00:00.000Z' },
} as const;

const cohort: RetentionCohort = {
  weekStart: '2026-09-28',
  signups: 4,
  verified: 3,
  activated: { eligible: 4, count: 2 },
  medianHoursToFirstOrder: 1.5,
  activeWeek1: { eligible: 4, count: 1 },
  activeWeek2: { eligible: 0, count: 0 },
  activeWeek4: { eligible: 0, count: 0 },
  resetUsers: 1,
  firstOrderWithStopLoss: { eligible: 2, count: 1 },
};

export const retentionMetricsResponse: RetentionMetricsResponse = {
  generatedAt: '2026-10-11T00:00:00.000Z',
  windowWeeks: 12,
  truncated: false,
  activityTrackedSince: '2026-10-12',
  tourFunnel: [
    {
      itemId: 'primer',
      started: 3,
      completed: 2,
      steps: [{ stepId: 'primer.1', viewers: 3, closedHere: 1 }],
    },
  ],
  totals: { ...cohort, weekStart: null },
  cohorts: [cohort],
};

export const subscribersResponse: SubscribersResponse = {
  subscribers: [
    {
      id: 's1',
      email: 'sub@example.test',
      status: 'verified',
      createdAt: '2026-09-29T00:00:00.000Z',
      verifiedAt: '2026-09-29T00:00:00.000Z',
    },
  ],
  total: 1,
};

export const candlesResponse: CandleHistoryResponse = {
  category: 'spot',
  symbol: 'BTCUSDT',
  interval: '1m',
  candles: [
    {
      timestamp: 1_800_000_000_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 10,
      quoteAssetVolume: 15,
      confirm: true,
      interval: '1m',
    },
  ],
};

export const instrumentsResponse: InstrumentsResponse = {
  category: 'linear',
  instruments: [
    {
      symbol: 'BTCUSDT',
      category: 'linear',
      tickSize: 0.1,
      qtyStep: 0.001,
      minOrderQty: 0.001,
      minNotional: 5,
      maxLeverage: 100,
      fundingIntervalMin: 480,
    },
  ],
};

export const riskLimitResponse: RiskLimitResponse = {
  symbol: 'BTCUSDT',
  tiers: [
    {
      id: 1,
      riskLimitValue: 2_000_000,
      maintenanceMarginRate: 0.005,
      initialMarginRate: 0.01,
      maxLeverage: 100,
      mmDeduction: 0,
    },
  ],
};

// The paper state and delta: the route schemas leave them open (the server builds them from these
// same SDK types in trading/mappers.ts, which `tsc` checks); only the envelope is compared here
const account = {
  balance: '10000',
  realizedPnl: '0',
  leverage: 1,
  symbolLeverage: {},
  version: 1,
};

export const paperState: PaperStateDTO = {
  account,
  positions: [],
  spotBalances: [],
  pendingOrders: [],
  orders: [],
  trades: [],
  journal: [],
  balanceEvents: [],
};

const delta: PaperDeltaDTO = {
  account,
  positionsUpsert: [],
  positionsRemove: [],
  spotUpsert: [],
  pendingUpsert: [],
  pendingRemove: [],
  orders: [],
  trades: [],
  balanceEvents: [],
  journal: [],
  journalEdits: [],
};

export const action = <R>(result: R): Required<PaperActionResponse<R>> => ({
  result,
  delta,
  sound: 'placed',
});
