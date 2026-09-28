import type {
  EditPendingOrderRequest,
  JournalNoteRequest,
  PaperActionResponse,
  PaperExitLeg,
  PaperMarginMode,
  PaperStateDTO,
  PlaceOrderRequest,
  PlaceSpotExitsRequest,
  UpdatePositionExitsRequest,
} from '../types/index.js';

const BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const { headers, signal, ...rest } = init || {};

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    // Always enforce a 10s ceiling, but don't discard a caller-supplied signal
    // (e.g. an unmount AbortController) — abort on whichever fires first.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      ...(init?.body !== undefined && init.body !== null && { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    credentials: 'include',
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json()) as T;

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    // `status` lets callers tell an auth failure (401) from a transient one (network, 5xx)
    throw Object.assign(new Error(message), { status: res.status });
  }

  return data;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// ─── Paper API (APP_LOG Bybit Parity BP-1) ──────────────────────────────────────
//
// The server executes every trade. These calls send intent only (what to do); the server picks
// prices, computes fees and PnL, and answers with the resulting delta. The same delta is also
// pushed to every open tab over the private WebSocket (paperApi.wsUrl()).

export const paperApi = {
  /** Full account view: balance, positions, pending orders and recent history. */
  getState: (accessToken: string) => request<PaperStateDTO>('/api/paper/state', accessToken),

  /** Market / limit / stop order. `result` is the new position / order id, or null if rejected. */
  placeOrder: (body: PlaceOrderRequest, accessToken: string) =>
    request<PaperActionResponse<string | null>>(
      '/api/paper/orders',
      accessToken,
      json('POST', body)
    ),

  /** Spot TP / SL on coins already held. `result` is the OCO pair id. */
  placeSpotExits: (body: PlaceSpotExitsRequest, accessToken: string) =>
    request<PaperActionResponse<string | null>>(
      '/api/paper/spot/exits',
      accessToken,
      json('POST', body)
    ),

  cancelOrder: (orderId: string, accessToken: string) =>
    request<PaperActionResponse<boolean>>(
      `/api/paper/orders/${encodeURIComponent(orderId)}`,
      accessToken,
      { method: 'DELETE' }
    ),

  editOrder: (orderId: string, body: EditPendingOrderRequest, accessToken: string) =>
    request<PaperActionResponse<'ok' | 'rejected' | 'not-found'>>(
      `/api/paper/orders/${encodeURIComponent(orderId)}`,
      accessToken,
      json('PATCH', body)
    ),

  cancelOrderExit: (orderId: string, leg: PaperExitLeg, accessToken: string) =>
    request<PaperActionResponse<boolean>>(
      `/api/paper/orders/${encodeURIComponent(orderId)}/exits/${leg}`,
      accessToken,
      { method: 'DELETE' }
    ),

  updatePositionExits: (
    positionId: string,
    body: UpdatePositionExitsRequest,
    accessToken: string
  ) =>
    request<PaperActionResponse<boolean>>(
      `/api/paper/positions/${encodeURIComponent(positionId)}/tpsl`,
      accessToken,
      json('PATCH', body)
    ),

  /**
   * Add (positive) or reduce (negative) an isolated position's margin, as Bybit's add-margin
   * (BP-5). `margin` is a signed decimal string with at most 4 decimals. `result` is the position's
   * new extra margin (decimal string). Refused (422) in Bybit's wording.
   */
  adjustPositionMargin: (positionId: string, margin: string, accessToken: string) =>
    request<PaperActionResponse<string | null>>(
      `/api/paper/positions/${encodeURIComponent(positionId)}/margin`,
      accessToken,
      json('POST', { margin })
    ),

  cancelPositionExit: (positionId: string, leg: PaperExitLeg, accessToken: string) =>
    request<PaperActionResponse<boolean>>(
      `/api/paper/positions/${encodeURIComponent(positionId)}/exits/${leg}`,
      accessToken,
      { method: 'DELETE' }
    ),

  /** Close at the server's live price. `result` is the gross PnL (decimal string), or null. */
  closePosition: (positionId: string, accessToken: string) =>
    request<PaperActionResponse<string | null>>(
      `/api/paper/positions/${encodeURIComponent(positionId)}/close`,
      accessToken,
      { method: 'POST' }
    ),

  /**
   * USDT Perpetual leverage for one symbol. An open position and active orders on it are
   * re-margined at the new leverage (BP-3); refused (422) when the wallet can't cover the extra
   * margin, or when raising it would put the position past its liquidation price.
   */
  setSymbolLeverage: (symbol: string, leverage: number, accessToken: string) =>
    request<PaperActionResponse<number>>(
      `/api/paper/symbols/${encodeURIComponent(symbol)}/leverage`,
      accessToken,
      json('PATCH', { leverage })
    ),

  /**
   * Switch the account's margin mode (BP-5 E, Bybit set-margin-mode): REGULAR_MARGIN = cross.
   * Allowed with open positions when Bybit's checks pass; refused (422) with every reason listed.
   */
  setMarginMode: (marginMode: PaperMarginMode, accessToken: string) =>
    request<PaperActionResponse<PaperMarginMode>>(
      '/api/paper/account/margin-mode',
      accessToken,
      json('POST', { marginMode })
    ),

  /** Default leverage for symbols with no setting of their own (pre-BP-2 account leverage). */
  setLeverage: (leverage: number, accessToken: string) =>
    request<PaperActionResponse<number>>(
      '/api/paper/account/leverage',
      accessToken,
      json('PATCH', { leverage })
    ),

  resetAccount: (accessToken: string) =>
    request<PaperActionResponse<boolean>>('/api/paper/account/reset', accessToken, {
      method: 'POST',
    }),

  addNote: (body: JournalNoteRequest, accessToken: string) =>
    request<PaperActionResponse<string>>('/api/paper/journal', accessToken, json('POST', body)),

  editNote: (entryId: string, body: JournalNoteRequest, accessToken: string) =>
    request<PaperActionResponse<boolean>>(
      `/api/paper/journal/${encodeURIComponent(entryId)}`,
      accessToken,
      json('PATCH', body)
    ),

  /**
   * Private live-update WebSocket. 🔐 No token in the URL: after `open`, send
   * `{ type: 'auth', token }` (WsPaperAuthMessage) as the first message.
   */
  wsUrl: (): string => {
    const base = BASE_URL.replace(/^http/, 'ws'); // http → ws, https → wss
    return `${base}/api/paper/ws`;
  },
};
