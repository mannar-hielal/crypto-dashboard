import { useState, useId, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { X, ChevronUp, ChevronDown, Info, AlertTriangle } from 'lucide-react';
import { useStore } from 'zustand';
import { priceTickSize, type MarketCategory, type PaperTriggerBy } from '@crypto-dashboard/sdk';
import { useLayoutStore } from '@/store/layoutStore';
import { getLastKnownMarkPrice, paneStores } from '@/store/paneStore';
import { leverageFor, usePaperStore, type PlaceResult } from '@/store/paperStore';
import { MARKETS } from '@/lib/marketRoutes';
import { feeRatesLabel, floorToStep, maxQty, orderPreview } from '@/lib/orderMath';
import { useInstrument } from '@/hooks/useInstruments';
import { useOrderPrefillStore } from '@/store/orderPrefillStore';
import { bg, color, fontSize } from '@/lib/tokens';
import { guide, type GuideProps } from '@/lib/guideAnchors';
import { LeverageChip } from './LeverageChip';
import { LiquidationNotices } from './LiquidationNotices';
import {
  LIQUIDATION_EXPLAINER,
  crossAccountFigures,
  crossOrderLiqEstimate,
} from '@/lib/positionMath';
import { fmtMktPrice } from '@/lib/utils';
import { Toggle } from '@/components/ui/Toggle';
import { NumericInput } from '@/components/ui/NumericInput';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { TriggerBySelect } from '@/components/ui/TriggerBySelect';
import { OrderFlags } from './OrderFlags';
import { computeSLTPWarnings } from '@/lib/sltpSanity';
import { fmtSignedPct, fmtSignedUsd, fmtUsd } from '@/lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderSide = 'buy' | 'sell';
export type OrderTab = 'market' | 'limit' | 'stop';
/** Whether the amount is a base-coin quantity or a USDT value (Bybit's "by value") */
type QtyMode = 'units' | 'usd';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: OrderTab; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
];

/** Guide anchor of each order-type tab (F1) */
const TAB_ANCHORS = {
  market: 'trade.type.market',
  limit: 'trade.type.limit',
  stop: 'trade.type.stop',
} as const;

/** Spot takes market and limit orders only */
const SPOT_TABS = TABS.filter((t) => t.id !== 'stop');

/** Quick-fill buttons: share of the maximum the account can trade */
const SIZE_STEPS = [0, 25, 50, 75, 100] as const;

/** A grouped amount with no currency sign ("10,000.00"), for "Available … USDT" */
const fmtAmount = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── useOnlineStatus ──────────────────────────────────────────────────────────
// Tracks navigator.onLine reactively so the submit button re-renders on
// offline/online transitions without waiting for another state change.

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TradingPanelProps {
  onClose: () => void;
  /** Tab selected before the symbol changed — preserved across remounts */
  initialTab?: OrderTab;
  /** Called whenever the user switches tabs so the parent can persist the selection */
  onTabChange?: (tab: OrderTab) => void;
  /** Side (buy/sell) preserved across remounts — mirrors TV behaviour */
  initialSide?: OrderSide;
  /** Called whenever the user switches side so the parent can persist the selection */
  onSideChange?: (side: OrderSide) => void;
  /** Called after an order was placed (the mobile layout closes the full-screen form) */
  onPlaced?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradingPanel({
  onClose,
  initialTab = 'market',
  onTabChange,
  initialSide = 'buy',
  onSideChange,
  onPlaced,
}: TradingPanelProps) {
  const priceInputId = useId();

  // ── Store reads ───────────────────────────────────────────────────────────
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);
  const category = useLayoutStore((s) => s.panes[s.activePane].category);
  const isSpot = category === 'spot';
  const baseAsset = symbol.replace('USDT', '');
  const instrument = useInstrument(category, symbol);
  const qtyStep = instrument?.qtyStep ?? 0;
  /**
   * Decimals of the price tick (0.1 → 1, 0.00001 → 5), so prices read like Bybit's: the live rules,
   * else the SDK's tick snapshot for the market (Spot or USDT Perpetual). A symbol in neither
   * reads with 5 decimals under 1 (never `0.12` for a 0.12345 coin), else 2.
   */
  const priceTick = instrument?.tickSize || priceTickSize(category, symbol);

  const activePaneStore = paneStores[activePane];
  // Always subscribe unconditionally so prices/spread/order-info are never
  // blanked during the opacity/width fade-out animation on panel close.
  const latestPrice = useStore(activePaneStore, (s) => s.latestPrice);
  const isConnected = useStore(activePaneStore, (s) => s.isConnected);
  const isOnline = useOnlineStatus();

  const bid = useStore(activePaneStore, (s) => s.bid);
  const ask = useStore(activePaneStore, (s) => s.ask);

  const referencePrice = bid ?? latestPrice ?? 0;
  const priceDecimals = priceTick
    ? Math.max(0, Math.ceil(-Math.log10(priceTick) - 1e-9))
    : referencePrice > 0 && referencePrice < 1
      ? 5
      : 2;
  /** A price at the tick's decimals — Sell / Buy, the spread and the order label */
  const fmtTickPrice = (v: number) =>
    v.toLocaleString(undefined, {
      minimumFractionDigits: priceDecimals,
      maximumFractionDigits: priceDecimals,
    });

  // Disconnected (9.6, visual gate 2026-09-29): no quote is shown rather than a stale one — Sell,
  // Buy and the spread read `—` until the feed is back
  const quoteLive = isConnected && isOnline;
  // A crossed or locked book (bid ≥ ask, a momentary glitch) has no meaningful spread: `—` until
  // the quote is valid again (owner, Q4 2026-09-29)
  const spread = quoteLive && bid != null && ask != null && ask > bid ? ask - bid : null;

  const freeBalance = usePaperStore((s) => s.balance);
  const marginMode = usePaperStore((s) => s.marginMode);
  const positions = usePaperStore((s) => s.positions);
  const pendingOrders = usePaperStore((s) => s.pendingOrders);
  // What an order can use: the free USDT, or in cross (BP-5 E) the account's available balance —
  // margin balance − total IM at the live marks (unrealised profit counts, O5)
  const crossMode = !isSpot && marginMode === 'REGULAR_MARGIN';
  const balance = crossMode
    ? crossAccountFigures(
        { balance: freeBalance, positions, pendingOrders },
        (sym) => getLastKnownMarkPrice(sym) ?? null
      ).available
    : freeBalance;
  // Spot is 1× — leverage is a USDT Perpetual setting, per symbol
  const leverage = usePaperStore((s) => (isSpot ? 1 : leverageFor(s, symbol)));
  const coinFree = usePaperStore(
    (s) => s.spotBalances.find((h) => h.coin === baseAsset)?.free ?? 0
  );
  const placeOrder = usePaperStore((s) => s.placeOrder);
  // The symbol's open position (one-way mode) — the liquidation estimate includes it (BP-3)
  const openPosition = usePaperStore((s) =>
    isSpot ? undefined : s.positions.find((p) => p.symbol === symbol)
  );
  // Guards against a second submit while an order request is in flight
  const submittingRef = useRef(false);
  /** An order request is in flight — the submit button reads "Placing…" */
  const [placing, setPlacing] = useState(false);

  // ── Local state ───────────────────────────────────────────────────────────
  // Assets → Sell: a prefill request meant for this market and symbol, taken at mount (the form
  // remounts when the market or symbol changes, so this is where a Sell of another coin lands)
  const [initialPrefill] = useState(() => {
    const r = useOrderPrefillStore.getState().request;
    return r && r.category === category && r.symbol === symbol ? r : null;
  });
  const [side, setSide] = useState<OrderSide>(initialPrefill?.side ?? initialSide);
  // The panel stays mounted: a side chosen from outside (the mobile Buy / Sell bar) applies here too.
  // Adjusted while rendering when the prop changes (React's pattern; no effect)
  const [sideFromProps, setSideFromProps] = useState(initialSide);
  if (initialSide !== sideFromProps) {
    setSideFromProps(initialSide);
    setSide(initialSide);
  }
  // Spot has no stop orders: a remembered Stop tab opens as Market there
  const [tab, setTab] = useState<OrderTab>(
    category === 'spot' && initialTab === 'stop' ? 'market' : initialTab
  );
  const [qtyMode, setQtyMode] = useState<QtyMode>(initialPrefill ? 'units' : 'usd');
  const [qtyInput, setQtyInput] = useState(initialPrefill ? initialPrefill.qty.toString() : '');
  // Empty on every key-reset mount — displayPrice (below) falls back to latestPrice
  // so the field always reflects the new symbol's live price without useEffect.
  const [priceInput, setPriceInput] = useState('');
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpInput, setTpInput] = useState('');
  const [slInput, setSlInput] = useState('');
  const [exitsOpen, setExitsOpen] = useState(true);
  // BP-5 B (USDT Perpetual): what the TP / SL trigger on, and the reduce-only flags
  const [tpTriggerBy, setTpTriggerBy] = useState<PaperTriggerBy>('LastPrice');
  const [slTriggerBy, setSlTriggerBy] = useState<PaperTriggerBy>('LastPrice');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [closeOnTrigger, setCloseOnTrigger] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bypassWarning, setBypassWarning] = useState(false);
  /** True when a blocking SL/TP sanity modal is waiting for user confirmation */
  const [sltpConfirmPending, setSltpConfirmPending] = useState(false);
  /** Set to true after user explicitly confirms a suspicious SL/TP — skips the gate next call */
  const [sltpConfirmBypassed, setSltpConfirmBypassed] = useState(false);
  const executeAnim = useAnimation();

  // Consume the mount-time prefill, and take later ones for this market and symbol live
  useEffect(() => {
    if (initialPrefill) {
      useOrderPrefillStore.getState().clear();
      onSideChange?.(initialPrefill.side);
    }
    return useOrderPrefillStore.subscribe(({ request: r }) => {
      if (!r || r.category !== category || r.symbol !== symbol) return;
      useOrderPrefillStore.getState().clear();
      setSide(r.side);
      onSideChange?.(r.side);
      setQtyMode('units');
      setQtyInput(r.qty.toString());
      setFormError(null);
    });
  }, [initialPrefill, category, symbol, onSideChange]);

  // ── Derived values ────────────────────────────────────────────────────────

  /**
   * The price shown and used for Limit/Stop orders.
   * While the user hasn't typed anything (priceInput === ''), we compute a
   * default that mirrors TVP's behaviour: always start slightly on the
   * "pending" side of the market so the order queues rather than fills immediately.
   *
   *   Limit Buy  / Stop Sell → use bid  (below market) — fallback latestPrice × 0.9999
   *   Limit Sell / Stop Buy  → use ask  (above market) — fallback latestPrice × 1.0001
   *
   * Once the user types, their value takes over.
   */
  const displayPrice: string = (() => {
    if (priceInput !== '') return priceInput;
    if (tab === 'market' || latestPrice === null) return '';
    // Determine which side of the market this order should sit on when pending.
    const wantBelow = (tab === 'limit' && side === 'buy') || (tab === 'stop' && side === 'sell');
    const p = wantBelow
      ? bid != null
        ? bid
        : latestPrice * 0.9999
      : ask != null
        ? ask
        : latestPrice * 1.0001;
    return p.toFixed(priceDecimals);
  })();

  // A market order fills at the ask (buy) / bid (sell) on the server — preview and size it there,
  // so a 100% (Max) buy never costs more than the balance
  const execPrice =
    tab === 'market'
      ? ((side === 'buy' ? ask : bid) ?? latestPrice)
      : parseFloat(displayPrice) || null;

  /**
   * True when a limit/stop order price is already past the market, meaning it
   * will fill immediately rather than pend. Shows a non-blocking amber warning.
   *
   * Limit Buy  above market → fills immediately (normal Stop Buy territory)
   * Limit Sell below market → fills immediately (normal Stop Sell territory)
   * Stop  Buy  below market → fills immediately (already past trigger)
   * Stop  Sell above market → fills immediately (already past trigger)
   */
  const immediateWarning: { message: string; suggestion: string } | null = (() => {
    if (tab === 'market' || !execPrice || !latestPrice) return null;
    if (tab === 'limit') {
      // A limit that crosses the book fills now as a taker, at the ask / bid (BP-2)
      if (side === 'buy' && execPrice >= latestPrice)
        return {
          message: `Limit Buy price ($${execPrice.toLocaleString()}) is at or above market ($${latestPrice.toLocaleString()}) — this order fills now at the ask, as a taker.`,
          suggestion: isSpot
            ? 'Use a lower price to wait for the market to come down to it.'
            : 'Use a Stop Buy if you want to enter when price rises to this level.',
        };
      if (side === 'sell' && execPrice <= latestPrice)
        return {
          message: `Limit Sell price ($${execPrice.toLocaleString()}) is at or below market ($${latestPrice.toLocaleString()}) — this order fills now at the bid, as a taker.`,
          suggestion: isSpot
            ? 'Use a higher price to wait for the market to rise to it.'
            : 'Use a Stop Sell if you want to enter when price falls to this level.',
        };
    }
    if (tab === 'stop') {
      if (side === 'buy' && execPrice <= latestPrice)
        return {
          message: `Stop Buy price ($${execPrice.toLocaleString()}) is at or below market ($${latestPrice.toLocaleString()}) — this order will fill immediately.`,
          suggestion: 'Use a Limit Buy if you want to buy at a lower price.',
        };
      if (side === 'sell' && execPrice >= latestPrice)
        return {
          message: `Stop Sell price ($${execPrice.toLocaleString()}) is at or above market ($${latestPrice.toLocaleString()}) — this order will fill immediately.`,
          suggestion: 'Use a Limit Sell if you want to sell at a higher price.',
        };
    }
    return null;
  })();

  /** USDT value of the current qty input */
  const usdtAmount: number | null = (() => {
    const v = parseFloat(qtyInput);
    if (isNaN(v) || v <= 0) return null;
    if (qtyMode === 'usd') return v;
    if (execPrice) return v * execPrice;
    return null;
  })();

  /** Raw base-asset units (before lot rounding) */
  const rawUnits: number | null = (() => {
    if (!usdtAmount || !execPrice) return null;
    return usdtAmount / execPrice;
  })();

  /** Quantity rounded down to Bybit's qty step for this market (the server does the same). */
  const units: number | null = (() => {
    if (rawUnits === null) return null;
    return floorToStep(rawUnits, qtyStep);
  })();

  /**
   * Actual USD value that will be filled after lot rounding.
   * This is what TV shows as "Trade value" and what gets deducted from balance.
   */
  const actualUsdAmount: number | null = (() => {
    if (units === null || !execPrice) return null;
    return units * execPrice;
  })();

  /** Equivalent display (opposite of qtyMode) */
  const equivalent: string | null = (() => {
    if (qtyMode === 'usd' && units !== null) return `${units.toFixed(6)} ${baseAsset}`;
    if (qtyMode === 'units' && actualUsdAmount !== null) return fmtUsd(actualUsdAmount);
    return null;
  })();

  /** Estimated value, margin, fees and cost of the lot-rounded order (lib/orderMath) */
  const preview =
    units !== null && execPrice
      ? orderPreview({
          category,
          side,
          qty: units,
          price: execPrice,
          leverage,
          baseAsset,
          symbol,
          existing: openPosition,
          tickSize: instrument?.tickSize,
        })
      : null;
  /** What this order can use: USDT, or — for a spot sell — the free coins */
  const spotSell = isSpot && side === 'sell';
  /** A reduce-only / close-on-trigger perpetual order: no margin, no TP / SL (BP-5 B) */
  const reducing = !isSpot && (reduceOnly || (tab === 'stop' && closeOnTrigger));
  const cost = preview?.cost ?? null;
  const costPct = spotSell
    ? units !== null && coinFree > 0
      ? Math.min(100, (units / coinFree) * 100)
      : 0
    : cost !== null && balance > 0
      ? Math.min(100, (cost / balance) * 100)
      : 0;
  const costExceeds = spotSell
    ? units !== null && units > coinFree
    : cost !== null && cost > balance;
  const maxUnits = execPrice
    ? maxQty({
        category,
        side,
        price: execPrice,
        leverage,
        usdtAvailable: balance,
        coinFree,
        step: qtyStep,
      })
    : 0;

  /** Estimated P&L if TP is hit */
  const tpPnl: number | null = (() => {
    const tp = parseFloat(tpInput);
    if (!tpEnabled || isNaN(tp) || tp <= 0 || !execPrice || !units) return null;
    return side === 'buy' ? (tp - execPrice) * units : (execPrice - tp) * units;
  })();

  /** Estimated P&L if SL is hit */
  const slPnl: number | null = (() => {
    const sl = parseFloat(slInput);
    if (!slEnabled || isNaN(sl) || sl <= 0 || !execPrice || !units) return null;
    return side === 'buy' ? (sl - execPrice) * units : (execPrice - sl) * units;
  })();

  /** Format a P&L number as "+$X.XX · +X.XX%" */
  function formatPnl(pnl: number): string {
    const pct = usdtAmount ? (pnl / usdtAmount) * 100 : 0;
    return `${fmtSignedUsd(pnl)} · ${fmtSignedPct(pct)}`;
  }

  // ── SL/TP sanity warnings ────────────────────────────────────────────────
  const slWarnings = computeSLTPWarnings(
    slEnabled && !reducing ? parseFloat(slInput) : NaN,
    execPrice ?? 0,
    latestPrice ?? 0,
    'SL'
  );
  const tpWarnings = computeSLTPWarnings(
    tpEnabled && !reducing ? parseFloat(tpInput) : NaN,
    execPrice ?? 0,
    latestPrice ?? 0,
    'TP'
  );
  const hasSLTPWarning =
    slWarnings.typoWarning !== null ||
    slWarnings.largeDistanceWarning !== null ||
    tpWarnings.typoWarning !== null ||
    tpWarnings.largeDistanceWarning !== null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSideChange(s: OrderSide) {
    setSide(s);
    onSideChange?.(s);
    setFormError(null);
    setBypassWarning(false);
    setSltpConfirmPending(false);
    setSltpConfirmBypassed(false);
    // Reset typed price so the new default (bid for Buy, ask for Sell) takes over.
    setPriceInput('');
    setTpInput('');
    setSlInput('');
  }

  function handleTabChange(t: OrderTab) {
    setTab(t);
    onTabChange?.(t);
    setFormError(null);
    setBypassWarning(false);
    setSltpConfirmPending(false);
    setSltpConfirmBypassed(false);
    // Clear any manually typed price so displayPrice falls back to latestPrice
    // for the new tab — giving the user the current live price as the starting point.
    setPriceInput('');
  }

  function handleQtyMode(next: QtyMode) {
    if (next === qtyMode) return;
    // Convert the current input value to the other unit
    if (qtyInput && execPrice) {
      const v = parseFloat(qtyInput);
      if (!isNaN(v)) {
        if (next === 'units') {
          setQtyInput(floorToStep(v / execPrice, qtyStep).toString());
        } else {
          // actualUsdAmount already reflects rounded qty × price
          setQtyInput(
            actualUsdAmount !== null ? actualUsdAmount.toFixed(2) : (v * execPrice).toFixed(2)
          );
        }
      }
    }
    setQtyMode(next);
    setFormError(null);
  }

  /** Quick-fill a share of the maximum the account can trade, in the current unit. */
  function handleSizeStep(pct: number) {
    setFormError(null);
    if (!execPrice || pct === 0) {
      setQtyInput('');
      return;
    }
    const qty = floorToStep((maxUnits * pct) / 100, qtyStep);
    if (qty <= 0) {
      setQtyInput('');
      return;
    }
    setQtyInput(qtyMode === 'units' ? qty.toString() : (qty * execPrice).toFixed(2));
  }

  function handleMarketChange(next: MarketCategory) {
    if (next === category) return;
    // The form remounts for the new market (DashboardPage keys it by market)
    useLayoutStore.getState().setPaneMarket(activePane, next, symbol);
  }

  function validate(): { amount: number; units: number; tp?: number; sl?: number } | null {
    if (!execPrice || (tab === 'market' && (!isConnected || !isOnline))) {
      setFormError('Waiting for live price…');
      return null;
    }
    if (!usdtAmount) {
      setFormError(`Enter a ${qtyMode === 'usd' ? 'USD' : baseAsset} amount`);
      return null;
    }
    if (!actualUsdAmount || actualUsdAmount <= 0 || !units) {
      setFormError('Amount too small for minimum lot size');
      return null;
    }
    // Bybit's minimums for this market (the server checks them too)
    if (instrument && units < instrument.minOrderQty) {
      setFormError(`Minimum quantity is ${instrument.minOrderQty} ${baseAsset}`);
      return null;
    }
    if (instrument && actualUsdAmount < instrument.minNotional) {
      setFormError(`Minimum order value is ${instrument.minNotional} USDT`);
      return null;
    }
    if (spotSell && units > coinFree) {
      setFormError(`Not enough ${baseAsset} available (spot can't be sold short)`);
      return null;
    }
    // Reduce-only / close-on-trigger needs an opposite position to shrink (server: Bybit 110017)
    if (reducing) {
      const pos = positions.find((p) => p.category === 'linear' && p.symbol === symbol);
      if (!pos) {
        setFormError('Reduce-only needs an open position on this symbol to reduce');
        return null;
      }
      if ((pos.side === 'long') === (side === 'buy')) {
        setFormError(
          `Reduce-only can only reduce your ${pos.side} position — use ${pos.side === 'long' ? 'Sell' : 'Buy'}`
        );
        return null;
      }
    }
    // A reduce-only order closes: it holds no margin (the server caps it at the position)
    if (!spotSell && !reducing && (preview?.cost ?? Infinity) > balance) {
      setFormError('Insufficient balance');
      return null;
    }

    // Spot TP / SL protect what a buy receives — a spot sell has none
    const tp = !spotSell && !reducing && tpEnabled && tpInput ? parseFloat(tpInput) : undefined;
    const sl = !spotSell && !reducing && slEnabled && slInput ? parseFloat(slInput) : undefined;

    if (tp !== undefined) {
      if (isNaN(tp) || tp <= 0) {
        setFormError('Take-Profit must be a positive price');
        return null;
      }
      if (side === 'buy' && tp <= execPrice) {
        setFormError('Take-Profit must be above entry price for Long');
        return null;
      }
      if (side === 'sell' && tp >= execPrice) {
        setFormError('Take-Profit must be below entry price for Short');
        return null;
      }
    }
    if (sl !== undefined) {
      if (isNaN(sl) || sl <= 0) {
        setFormError('Stop-Loss must be a positive price');
        return null;
      }
      if (side === 'buy' && sl >= execPrice) {
        setFormError('Stop-Loss must be below entry price for Long');
        return null;
      }
      if (side === 'sell' && sl <= execPrice) {
        setFormError('Stop-Loss must be above entry price for Short');
        return null;
      }
    }
    return { amount: actualUsdAmount, units, tp, sl };
  }

  function handleExecute() {
    setFormError(null);
    // If an immediate-fill warning is active and hasn't been bypassed yet,
    // require a second click ("Place anyway") instead of placing silently.
    if (immediateWarning && !bypassWarning) {
      setBypassWarning(true);
      return;
    }

    // ── SL/TP sanity gate (Option B — blocking confirm modal) ────────────────
    // If the SL or TP looks like a typo or is unusually far from entry, show a
    // confirmation modal before proceeding. The user must explicitly click
    // "Confirm anyway" to bypass — a second accidental click isn't enough.
    if (hasSLTPWarning && !sltpConfirmBypassed) {
      setSltpConfirmPending(true);
      return;
    }

    void submitOrder();
  }

  /**
   * Send the order to the server (APP_LOG Bybit Parity BP-1, BP-2). A market order fills at the
   * server's live ask / bid — execPrice is only this panel's preview. The size goes as a coin
   * quantity or, in USDT mode, as a value the server converts at the fill price. The server plays
   * the placed / queued sound through the paper feed, so there is none here.
   */
  async function submitOrder() {
    if (submittingRef.current) return; // one request at a time (double-click guard)
    const v = validate();
    if (!v || !execPrice) return;

    submittingRef.current = true;
    setPlacing(true);
    let result: PlaceResult;
    try {
      result = await placeOrder({
        category,
        symbol,
        side,
        type: tab,
        size: qtyMode === 'usd' ? { value: v.amount } : { qty: v.units },
        ...(tab !== 'market' ? { triggerPrice: execPrice } : {}),
        takeProfit: v.tp,
        stopLoss: v.sl,
        ...(!isSpot
          ? {
              tpTriggerBy,
              slTriggerBy,
              ...(reducing ? { reduceOnly: true } : {}),
              ...(tab === 'stop' && closeOnTrigger ? { closeOnTrigger: true } : {}),
            }
          : {}),
      });
    } finally {
      submittingRef.current = false;
      setPlacing(false);
    }

    if (!result.id) {
      setFormError(result.error ?? 'Order could not be placed');
      return;
    }

    setQtyInput('');
    setPriceInput('');
    setTpInput('');
    setSlInput('');
    setTpEnabled(false);
    setSlEnabled(false);
    setBypassWarning(false);
    setSltpConfirmPending(false);
    setSltpConfirmBypassed(false);
    void executeAnim.start({ scale: [1, 1.04, 1], transition: { duration: 0.3, ease: 'easeOut' } });
    onPlaced?.();
  }

  // ── Submit label ──────────────────────────────────────────────────────────
  const submitSecondary = (() => {
    const qtyStr = units !== null ? `${units.toFixed(6)} ${baseAsset}` : `— ${baseAsset}`;
    if (tab === 'market') return `${qtyStr} · MARKET`;
    const p = execPrice ? fmtTickPrice(execPrice) : '—';
    return `${qtyStr} @ ${p} ${tab.toUpperCase()}`;
  })();

  const isBuy = side === 'buy';
  const sideColor = isBuy ? color.green : color.red;

  return (
    <aside
      className="flex h-full w-full shrink-0 flex-col border-l border-white/6 overflow-hidden lg:h-auto lg:w-64"
      style={{ background: bg.panel }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 px-3"
        style={{ background: bg.page }}
      >
        <span className="text-xs font-bold tracking-wide text-white/90">{symbol}</span>
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Close panel"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:text-brand-red"
          style={{ color: color.muted }}
        >
          <X className="h-3.5 w-3.5" />
        </motion.button>
      </div>

      {/* ── Market tabs (Figma 93:5515 / 93:7352) + leverage on USDT Perpetual ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-3">
        {/* The tablist holds the tabs only (the leverage chip isn't a tab: axe aria-required-children);
            `contents` keeps them laid out in the row as before */}
        <div role="tablist" aria-label="Market" className="contents">
          {MARKETS.map((m) => {
            const active = m.category === category;
            return (
              <button
                key={m.category}
                {...guide(m.category === 'spot' ? 'trade.market.spot' : 'trade.market.perp')}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleMarketChange(m.category)}
                className="relative whitespace-nowrap py-2 font-semibold transition-colors"
                style={{ fontSize: fontSize.xs11, color: active ? color.white : color.muted }}
              >
                {m.title}
                {active && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: color.purple }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {!isSpot && <LeverageChip symbol={symbol} />}
      </div>

      {/* ── Liquidation notices (USDT Perpetual, BP-3) ───────────────────── */}
      {!isSpot && <LiquidationNotices />}

      {/* ── Sell / Buy side selector ─────────────────────────────────── */}
      <div className="relative flex shrink-0 border-b border-white/5">
        {/* Sell */}
        <button
          {...guide('trade.side.sell')}
          onClick={() => handleSideChange('sell')}
          className="flex flex-1 flex-col items-center py-2 transition-colors"
          style={{
            background: !isBuy ? `${color.red}22` : 'transparent',
            borderBottom: !isBuy ? `2px solid ${color.red}` : '2px solid transparent',
          }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: !isBuy ? color.red : color.muted }}
          >
            Sell
          </span>
          <span
            className="tabular-nums font-bold"
            style={{ fontSize: fontSize.xs11, color: !isBuy ? color.white : color.muted }}
          >
            {quoteLive && (bid ?? latestPrice) ? fmtTickPrice((bid ?? latestPrice)!) : '—'}
          </span>
        </button>

        {/* Spread badge */}
        <div
          {...guide('trade.spread')}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded px-1 text-center tabular-nums"
          style={{
            background: bg.surface,
            fontSize: fontSize.xxs,
            color: color.muted,
            minWidth: 28,
          }}
          title={
            spread != null
              ? `Bid: ${fmtTickPrice(bid!)} · Ask: ${fmtTickPrice(ask!)}`
              : quoteLive && bid != null && ask != null
                ? // Live but crossed (bid > ask) or locked (bid = ask): say which, and keep the values
                  `${bid > ask ? 'Crossed' : 'Locked'} book — Bid: ${fmtTickPrice(bid)} · Ask: ${fmtTickPrice(ask)}`
                : 'Spread — awaiting bid/ask feed'
          }
        >
          {spread != null ? spread.toFixed(priceDecimals) : '—'}
        </div>

        {/* Buy */}
        <button
          {...guide('trade.side.buy')}
          onClick={() => handleSideChange('buy')}
          className="flex flex-1 flex-col items-center py-2 transition-colors"
          style={{
            background: isBuy ? `${color.green}22` : 'transparent',
            borderBottom: isBuy ? `2px solid ${color.green}` : '2px solid transparent',
          }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: isBuy ? color.green : color.muted }}
          >
            Buy
          </span>
          <span
            className="tabular-nums font-bold"
            style={{ fontSize: fontSize.xs11, color: isBuy ? color.white : color.muted }}
          >
            {quoteLive && (ask ?? latestPrice) ? fmtTickPrice((ask ?? latestPrice)!) : '—'}
          </span>
        </button>
      </div>

      {/* ── Order type tabs ──────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 border-b border-white/5" role="tablist">
        {(isSpot ? SPOT_TABS : TABS).map((t) => (
          <button
            key={t.id}
            {...guide(TAB_ANCHORS[t.id])}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => handleTabChange(t.id)}
            className="relative flex-1 py-2 text-xs font-semibold transition-colors"
            style={{ color: tab === t.id ? color.white : color.muted }}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: color.purpleDark }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Scrollable form body ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* Price input — Limit / Stop only */}
        <AnimatePresence initial={false}>
          {tab !== 'market' && (
            <motion.div
              key="price-field"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <label
                htmlFor={priceInputId}
                className="mb-1 block font-semibold uppercase tracking-wider"
                style={{ fontSize: fontSize.xs10, color: color.muted }}
              >
                Price
              </label>
              <NumericInput
                id={priceInputId}
                ariaLabel="Order price"
                testId="trading-price-input"
                anchor="trade.price"
                suffix="USDT"
                step={0.01}
                min={0}
                value={displayPrice}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  setFormError(null);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Amount: a coin quantity or a USDT value (Bybit's "by Qty" / "by Value") */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <FieldLabel>Amount</FieldLabel>
            <div
              className="flex overflow-hidden rounded border border-white/10"
              role="group"
              aria-label="Amount unit"
            >
              {(
                [
                  ['units', baseAsset],
                  ['usd', 'USDT'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  {...guide('trade.amount-unit', mode === 'units' ? 'coin' : 'usdt')}
                  type="button"
                  aria-pressed={qtyMode === mode}
                  onClick={() => handleQtyMode(mode)}
                  className="px-1.5 py-0.5 font-semibold transition-colors"
                  style={{
                    fontSize: fontSize.xs10,
                    color: qtyMode === mode ? color.white : color.muted,
                    background: qtyMode === mode ? bg.surface : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <NumericInput
            id="trading-qty"
            name="qty"
            ariaLabel="Order amount"
            testId="trading-qty-input"
            anchor="trade.amount"
            step={qtyMode === 'usd' ? '0.01' : '0.000001'}
            min={0}
            value={qtyInput}
            placeholder={qtyMode === 'usd' ? '0.00' : '0.000000'}
            suffix={qtyMode === 'usd' ? 'USDT' : baseAsset}
            onChange={(e) => {
              setQtyInput(e.target.value);
              setFormError(null);
            }}
          />

          {/* Equivalent display */}
          {equivalent && (
            <p className="mt-1" style={{ fontSize: fontSize.xs10, color: color.muted }}>
              ≈ <span className="text-white/60">{equivalent}</span>
            </p>
          )}

          {/* Quick fill: share of what this order can use (Figma's 0–100% slider) */}
          <div className="mt-2 flex justify-between gap-1" role="group" aria-label="Order size">
            {SIZE_STEPS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleSizeStep(pct)}
                disabled={!execPrice}
                aria-label={pct === 100 ? 'Max' : `${pct}%`}
                className="flex-1 rounded py-0.5 tabular-nums transition-colors hover:text-white disabled:opacity-40"
                style={{
                  fontSize: fontSize.xxs,
                  color: color.muted,
                  border: `1px solid ${color.muted}20`,
                }}
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>

          {/* Available: USDT, or the free coins for a spot sell */}
          <p className="mt-1" style={{ fontSize: fontSize.xs10, color: color.muted }}>
            Available{' '}
            <span className="text-white/60">
              {spotSell ? `${coinFree.toFixed(6)} ${baseAsset}` : `${fmtAmount(balance)} USDT`}
            </span>
          </p>

          {/* Reduce-only / close-on-trigger — USDT Perpetual (BP-5 B) */}
          {!isSpot && (
            <OrderFlags
              reduceOnly={reduceOnly}
              closeOnTrigger={closeOnTrigger}
              showCloseOnTrigger={tab === 'stop'}
              onReduceOnly={(v) => {
                setReduceOnly(v);
                setFormError(null);
              }}
              onCloseOnTrigger={(v) => {
                setCloseOnTrigger(v);
                setFormError(null);
              }}
            />
          )}
        </div>

        {/* ── Exits (TP / SL) — a spot sell and a reduce-only order have none ── */}
        {!spotSell && !reducing && (
          <div className="rounded-md border border-white/6" style={{ background: bg.page }}>
            {/* Collapsible header */}
            <button
              onClick={() => setExitsOpen((o) => !o)}
              className="flex w-full items-center justify-between px-2.5 py-2 text-xs font-semibold text-white/70 transition-colors hover:text-white"
            >
              <span>Exits</span>
              {exitsOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            <AnimatePresence initial={false}>
              {exitsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 border-t border-white/5 px-2.5 pb-2.5 pt-2">
                    {/* Take Profit */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={tpEnabled}
                          label="Enable take profit"
                          anchor="trade.tp.enable"
                          onChange={(v) => {
                            setTpEnabled(v);
                            if (!v) setTpInput('');
                            setFormError(null);
                          }}
                        />
                        <span
                          className="text-xs"
                          style={{ color: tpEnabled ? color.white : color.muted }}
                        >
                          Take profit, price
                        </span>
                        {tpEnabled && !isSpot && (
                          <span className="ml-auto">
                            <TriggerBySelect
                              value={tpTriggerBy}
                              onChange={setTpTriggerBy}
                              ariaLabel="Take profit trigger price"
                            />
                          </span>
                        )}
                      </div>
                      {tpEnabled && (
                        <NumericInput
                          ariaLabel="Take profit price"
                          testId="trading-tp-input"
                          suffix="TP"
                          anchor="trade.tp.price"
                          suffixColor={`${color.green}b3`}
                          borderColor={`${color.green}60`}
                          suffixPadding="pr-12"
                          step={0.01}
                          min={0}
                          value={tpInput}
                          onChange={(e) => {
                            setTpInput(e.target.value);
                            setFormError(null);
                          }}
                        />
                      )}
                      <AnimatePresence initial={false}>
                        {tpPnl !== null && (
                          <motion.p
                            key="tp-pnl"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden tabular-nums"
                            style={{
                              fontSize: fontSize.xs10,
                              color: tpPnl >= 0 ? color.green : color.red,
                            }}
                          >
                            {formatPnl(tpPnl)}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Stop Loss */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={slEnabled}
                          label="Enable stop loss"
                          anchor="trade.sl.enable"
                          onChange={(v) => {
                            setSlEnabled(v);
                            if (!v) setSlInput('');
                            setFormError(null);
                          }}
                        />
                        <span
                          className="text-xs"
                          style={{ color: slEnabled ? color.white : color.muted }}
                        >
                          Stop loss, price
                        </span>
                        {slEnabled && !isSpot && (
                          <span className="ml-auto">
                            <TriggerBySelect
                              value={slTriggerBy}
                              onChange={setSlTriggerBy}
                              ariaLabel="Stop loss trigger price"
                            />
                          </span>
                        )}
                      </div>
                      {slEnabled && (
                        <NumericInput
                          ariaLabel="Stop loss price"
                          testId="trading-sl-input"
                          suffix="SL"
                          anchor="trade.sl.price"
                          suffixColor={`${color.red}b3`}
                          borderColor={`${color.red}60`}
                          suffixPadding="pr-12"
                          step={0.01}
                          min={0}
                          value={slInput}
                          onChange={(e) => {
                            setSlInput(e.target.value);
                            setFormError(null);
                          }}
                        />
                      )}
                      <AnimatePresence initial={false}>
                        {slPnl !== null && (
                          <motion.p
                            key="sl-pnl"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden tabular-nums"
                            style={{
                              fontSize: fontSize.xs10,
                              color: slPnl >= 0 ? color.green : color.red,
                            }}
                          >
                            {formatPnl(slPnl)}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Order Info ───────────────────────────────────────────────── */}
        <div className="rounded-md border border-white/6 p-2.5" style={{ background: bg.page }}>
          <FieldLabel as="p" className="mb-2">
            Order info
          </FieldLabel>

          {/* What the order uses (cost, or the coins for a spot sell) + progress bar */}
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <div
                className="flex items-center gap-1"
                style={{ fontSize: fontSize.xs10, color: color.muted }}
              >
                <span>{spotSell ? 'Selling' : 'Cost'}</span>
                <span
                  title={
                    isSpot
                      ? 'USDT this order takes from your balance'
                      : 'Margin + estimated open and close fees — what this order takes from your balance'
                  }
                >
                  <Info className="h-3 w-3 opacity-60" />
                </span>
              </div>
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize.xs10, color: costExceeds ? color.red : color.muted }}
                {...guide('trade.preview.cost')}
              >
                {spotSell
                  ? `${units !== null ? units.toFixed(6) : '—'} / `
                  : `${cost !== null ? fmtUsd(cost) : '—'} / `}
                <span style={{ color: color.white }}>
                  {spotSell ? `${coinFree.toFixed(6)} ${baseAsset}` : fmtUsd(balance)}
                </span>
              </span>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: `${color.muted}20` }}
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${costPct}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ background: costExceeds ? color.red : color.green }}
                title={costExceeds ? 'More than is available' : undefined}
              />
            </div>
          </div>

          {/* Summary rows per market */}
          {(isSpot
            ? [
                {
                  label: 'Order value',
                  value: preview ? fmtUsd(preview.value) : '—',
                },
                {
                  label: 'Est. fee',
                  anchor: guide('trade.preview.fees', 'spot'),
                  value:
                    preview?.fee !== undefined
                      ? `${preview.fee.toFixed(preview.feeAsset === 'USDT' ? 4 : 8)} ${preview.feeAsset}`
                      : '—',
                },
              ]
            : [
                { label: 'Leverage', value: `${leverage}x` },
                {
                  label: 'Order value',
                  value: preview ? fmtUsd(preview.value) : '—',
                },
                {
                  label: 'Margin',
                  value: preview?.margin !== undefined ? fmtUsd(preview.margin) : '—',
                },
                {
                  label: 'Est. liq. price',
                  // 0 = a 1× long, which can't be liquidated. Cross (BP-5 E): the account-wide
                  // estimate for the position this order would leave
                  value: (() => {
                    const liq = crossMode
                      ? crossOrderLiqEstimate(
                          { balance: freeBalance, positions, pendingOrders },
                          (sym) => getLastKnownMarkPrice(sym) ?? null,
                          {
                            symbol,
                            side: side === 'buy' ? 'long' : 'short',
                            qty: units ?? 0,
                            price: execPrice ?? 0,
                            leverage,
                            openFee: preview?.openFee ?? 0,
                          }
                        )
                      : preview?.liqPrice;
                    return liq ? `$${fmtMktPrice(liq)}` : '—';
                  })(),
                  tone: color.amber,
                  info: LIQUIDATION_EXPLAINER,
                  anchor: guide('trade.preview.liq'),
                },
                {
                  label: 'Est. open fee',
                  anchor: guide('trade.preview.fees', 'open'),
                  value: preview?.openFee !== undefined ? fmtUsd(preview.openFee, 4) : '—',
                },
                {
                  label: 'Est. close fee',
                  anchor: guide('trade.preview.fees', 'close'),
                  value: preview?.closeFee !== undefined ? fmtUsd(preview.closeFee, 4) : '—',
                },
              ]
          ).map(
            (row: {
              label: string;
              value: string;
              tone?: string;
              info?: string;
              anchor?: GuideProps;
            }) => (
              <div key={row.label} className="flex items-center justify-between py-0.5">
                <span
                  className="flex items-center gap-1"
                  style={{ fontSize: fontSize.xs10, color: color.muted }}
                >
                  {row.label}
                  {row.info && (
                    <span title={row.info}>
                      <Info className="h-3 w-3 opacity-60" />
                    </span>
                  )}
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontSize: fontSize.xs10, color: row.tone ?? color.white }}
                  data-testid={row.info ? 'order-est-liq-price' : undefined}
                  {...row.anchor}
                >
                  {row.value}
                </span>
              </div>
            )
          )}
          <p className="mt-1" style={{ fontSize: fontSize.xxs, color: color.muted }}>
            {feeRatesLabel(category)}
          </p>
        </div>

        {/* ── Immediate-fill warning callout ───────────────────────────── */}
        <AnimatePresence>
          {immediateWarning && (
            <motion.div
              key="immediate-warning"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-md border px-2.5 py-2"
              style={{ borderColor: `${color.warning}55`, background: `${color.warning}0d` }}
            >
              <div className="flex items-start gap-1.5">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: color.warning }}
                />
                <div className="flex flex-col gap-1">
                  <p
                    style={{ fontSize: fontSize.xs10, color: color.warningLight, lineHeight: 1.4 }}
                  >
                    {immediateWarning.message}
                  </p>
                  <p
                    style={{
                      fontSize: fontSize.xs10,
                      color: `${color.warning}99`,
                      lineHeight: 1.4,
                    }}
                  >
                    {immediateWarning.suggestion}
                  </p>
                  {bypassWarning && (
                    <p
                      className="font-semibold"
                      style={{ fontSize: fontSize.xs10, color: color.warningLight }}
                    >
                      Click the button below to confirm and place anyway.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SL / TP sanity confirm modal (Option B — blocking) ───────── */}
        <AnimatePresence>
          {sltpConfirmPending && (
            <motion.div
              key="sl-confirm-modal"
              data-testid="sl-confirm-modal"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-md border px-2.5 py-2.5"
              style={{ borderColor: `${color.warning}88`, background: `${color.warning}15` }}
            >
              <div className="flex items-start gap-1.5">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: color.warning }}
                />
                <div className="flex flex-col gap-1.5 w-full">
                  <p
                    className="font-semibold"
                    style={{ fontSize: fontSize.xs10, color: color.warningLight, lineHeight: 1.4 }}
                  >
                    ⚠ Suspicious SL/TP value detected
                  </p>

                  {slWarnings.typoWarning && (
                    <p
                      style={{
                        fontSize: fontSize.xs10,
                        color: `${color.warningLight}99`,
                        lineHeight: 1.4,
                      }}
                    >
                      {slWarnings.typoWarning}
                    </p>
                  )}
                  {slWarnings.largeDistanceWarning && (
                    <p
                      style={{
                        fontSize: fontSize.xs10,
                        color: `${color.warningLight}99`,
                        lineHeight: 1.4,
                      }}
                    >
                      {slWarnings.largeDistanceWarning}
                    </p>
                  )}
                  {tpWarnings.typoWarning && (
                    <p
                      style={{
                        fontSize: fontSize.xs10,
                        color: `${color.warningLight}99`,
                        lineHeight: 1.4,
                      }}
                    >
                      {tpWarnings.typoWarning}
                    </p>
                  )}
                  {tpWarnings.largeDistanceWarning && (
                    <p
                      style={{
                        fontSize: fontSize.xs10,
                        color: `${color.warningLight}99`,
                        lineHeight: 1.4,
                      }}
                    >
                      {tpWarnings.largeDistanceWarning}
                    </p>
                  )}

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setSltpConfirmPending(false);
                        setSltpConfirmBypassed(false);
                      }}
                      className="flex-1 rounded py-1 text-xs font-semibold transition-colors hover:opacity-80"
                      style={{
                        background: `${color.muted}33`,
                        color: color.muted,
                        fontSize: fontSize.xs10,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      data-testid="sl-confirm-anyway"
                      onClick={() => {
                        setSltpConfirmPending(false);
                        setSltpConfirmBypassed(true);
                        // Submit immediately — sltpConfirmBypassed is set above, but we call
                        // the shared submit directly rather than waiting for state to flush.
                        void submitOrder();
                      }}
                      className="flex-1 rounded py-1 text-xs font-semibold transition-colors hover:opacity-80"
                      style={{
                        background: `${color.warning}33`,
                        color: color.warningLight,
                        fontSize: fontSize.xs10,
                      }}
                    >
                      Confirm SL/TP anyway
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Form error ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {formError && (
            <motion.p
              {...guide('trade.error')}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.red }}
            >
              {formError}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Submit button (sticky bottom) ────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 p-3">
        <motion.button
          {...guide('trade.submit')}
          onClick={handleExecute}
          animate={executeAnim}
          aria-label={`Execute ${isBuy ? 'buy' : 'sell'} ${tab} order`}
          disabled={
            placing ||
            !latestPrice ||
            !qtyInput ||
            parseFloat(qtyInput) <= 0 ||
            (tab === 'market' && (!isConnected || !isOnline))
          }
          whileHover={{ filter: 'brightness(1.1)' }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full flex-col items-center justify-center rounded-md py-2.5 transition-all disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            background: sideColor,
            boxShadow: `0 0 16px 0px ${sideColor}30`,
          }}
        >
          <span className="text-sm font-bold" style={{ color: isBuy ? bg.page : color.white }}>
            {placing
              ? 'Placing…'
              : bypassWarning && immediateWarning
                ? 'Place anyway'
                : isBuy
                  ? 'Buy'
                  : 'Sell'}
          </span>
          <span
            className="font-semibold opacity-80"
            style={{ fontSize: fontSize.xs10, color: isBuy ? bg.page : color.white }}
          >
            {submitSecondary}
          </span>
        </motion.button>
      </div>
    </aside>
  );
}
