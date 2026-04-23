import { useState, useId, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { X, ChevronUp, ChevronDown, ArrowLeftRight, Info, AlertTriangle } from 'lucide-react';
import { useStore } from 'zustand';
import { useLayoutStore } from '@/store/layoutStore';
import { paneStores } from '@/store/paneStore';
import { usePaperStore, COMMISSION_RATE } from '@/store/paperStore';
import { useTradingSoundCtx } from '@/hooks/TradingSoundContext';
import { floorToLot } from '@/lib/markets';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderSide = 'buy' | 'sell';
export type OrderTab = 'market' | 'limit' | 'stop';
/** Whether the quantity input is expressed in base-asset units or USD */
type QtyMode = 'units' | 'usd';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: OrderTab; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
];

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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Small toggle switch (checkbox-style) */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? color.green : `${color.muted}40` }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
        style={{ transform: checked ? 'translateX(-12px)' : 'translateX(0)' }}
      />
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TradingPanelProps {
  onClose: () => void;
  /** Tab selected before the symbol changed — preserved across remounts */
  initialTab?: OrderTab;
  /** Called whenever the user switches tabs so the parent can persist the selection */
  onTabChange?: (tab: OrderTab) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradingPanel({ onClose, initialTab = 'market', onTabChange }: TradingPanelProps) {
  const priceInputId = useId();

  // ── Store reads ───────────────────────────────────────────────────────────
  const activePane = useLayoutStore((s) => s.activePane);
  const symbol = useLayoutStore((s) => s.panes[s.activePane].symbol);
  const baseAsset = symbol.replace('USDT', '');

  const lp0 = useStore(paneStores[0], (s) => s.latestPrice);
  const lp1 = useStore(paneStores[1], (s) => s.latestPrice);
  const lp2 = useStore(paneStores[2], (s) => s.latestPrice);
  const lp3 = useStore(paneStores[3], (s) => s.latestPrice);
  const latestPrice = [lp0, lp1, lp2, lp3][activePane];

  const ic0 = useStore(paneStores[0], (s) => s.isConnected);
  const ic1 = useStore(paneStores[1], (s) => s.isConnected);
  const ic2 = useStore(paneStores[2], (s) => s.isConnected);
  const ic3 = useStore(paneStores[3], (s) => s.isConnected);
  const isConnected = [ic0, ic1, ic2, ic3][activePane];
  const isOnline = useOnlineStatus();

  const bid0 = useStore(paneStores[0], (s) => s.bid);
  const bid1 = useStore(paneStores[1], (s) => s.bid);
  const bid2 = useStore(paneStores[2], (s) => s.bid);
  const bid3 = useStore(paneStores[3], (s) => s.bid);
  const ask0 = useStore(paneStores[0], (s) => s.ask);
  const ask1 = useStore(paneStores[1], (s) => s.ask);
  const ask2 = useStore(paneStores[2], (s) => s.ask);
  const ask3 = useStore(paneStores[3], (s) => s.ask);
  const bid = [bid0, bid1, bid2, bid3][activePane];
  const ask = [ask0, ask1, ask2, ask3][activePane];
  const spread = bid != null && ask != null ? ask - bid : null;

  const balance = usePaperStore((s) => s.balance);
  const leverage = usePaperStore((s) => s.leverage);
  const placeOrder = usePaperStore((s) => s.placeOrder);
  const placeLimitOrder = usePaperStore((s) => s.placeLimitOrder);
  const placeStopOrder = usePaperStore((s) => s.placeStopOrder);
  const sound = useTradingSoundCtx();

  // ── Local state ───────────────────────────────────────────────────────────
  const [side, setSide] = useState<OrderSide>('buy');
  const [tab, setTab] = useState<OrderTab>(initialTab);
  const [qtyMode, setQtyMode] = useState<QtyMode>('usd');
  const [qtyInput, setQtyInput] = useState('');
  // Empty on every key-reset mount — displayPrice (below) falls back to latestPrice
  // so the field always reflects the new symbol's live price without useEffect.
  const [priceInput, setPriceInput] = useState('');
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpInput, setTpInput] = useState('');
  const [slInput, setSlInput] = useState('');
  const [exitsOpen, setExitsOpen] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [bypassWarning, setBypassWarning] = useState(false);
  const executeAnim = useAnimation();

  // ── Derived values ────────────────────────────────────────────────────────

  /**
   * The price shown and used for Limit/Stop orders.
   * While the user hasn't typed anything (priceInput === ''), we compute a
   * default that mirrors TradingView's behaviour: always start slightly on the
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
    if (wantBelow) {
      const p = bid != null ? bid : latestPrice * 0.9999;
      return p.toFixed(2);
    } else {
      const p = ask != null ? ask : latestPrice * 1.0001;
      return p.toFixed(2);
    }
  })();

  const execPrice = tab === 'market' ? latestPrice : parseFloat(displayPrice) || null;

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
      if (side === 'buy' && execPrice >= latestPrice)
        return {
          message: `Limit Buy price ($${execPrice.toLocaleString()}) is at or above market ($${latestPrice.toLocaleString()}) — this order will fill immediately.`,
          suggestion: 'Use a Stop Buy if you want to enter when price rises to this level.',
        };
      if (side === 'sell' && execPrice <= latestPrice)
        return {
          message: `Limit Sell price ($${execPrice.toLocaleString()}) is at or below market ($${latestPrice.toLocaleString()}) — this order will fill immediately.`,
          suggestion: 'Use a Stop Sell if you want to enter when price falls to this level.',
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

  /**
   * Lot-size rounded qty — mirrors TradingView's behaviour.
   * In USD mode:  floor(inputUSD / price, lotDecimals) → actual filled qty
   * In units mode: floor(inputQty, lotDecimals)
   */
  const units: number | null = (() => {
    if (rawUnits === null) return null;
    return floorToLot(rawUnits, symbol);
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
    if (qtyMode === 'units' && actualUsdAmount !== null) return `$${actualUsdAmount.toFixed(2)}`;
    return null;
  })();

  // margin/tradeValue/commission are all based on the lot-rounded actual filled amount
  const margin = actualUsdAmount;
  const tradeValue = actualUsdAmount !== null ? actualUsdAmount * leverage : null;
  const commission = actualUsdAmount !== null ? actualUsdAmount * COMMISSION_RATE : null;
  const marginPct = margin !== null ? Math.min(100, (margin / balance) * 100) : 0;
  const marginExceeds = margin !== null && margin > balance;

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
    const sign = pnl >= 0 ? '+' : '';
    const pct = usdtAmount ? (pnl / usdtAmount) * 100 : 0;
    return `${sign}$${pnl.toFixed(2)} · ${sign}${pct.toFixed(2)}%`;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSideChange(s: OrderSide) {
    setSide(s);
    setFormError(null);
    setBypassWarning(false);
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
    // Clear any manually typed price so displayPrice falls back to latestPrice
    // for the new tab — giving the user the current live price as the starting point.
    setPriceInput('');
  }

  function handleSwapQtyMode() {
    // Convert the current input value to the other mode
    if (qtyInput && execPrice) {
      const v = parseFloat(qtyInput);
      if (!isNaN(v)) {
        if (qtyMode === 'usd') {
          // Show lot-rounded qty when switching to units mode
          const rounded = floorToLot(v / execPrice, symbol);
          setQtyInput(rounded.toFixed(6));
        } else {
          // actualUsdAmount already reflects rounded qty × price
          setQtyInput(
            actualUsdAmount !== null ? actualUsdAmount.toFixed(2) : (v * execPrice).toFixed(2)
          );
        }
      }
    }
    setQtyMode((m) => (m === 'usd' ? 'units' : 'usd'));
    setFormError(null);
  }

  function validate(): { amount: number; tp?: number; sl?: number } | null {
    if (!execPrice || (tab === 'market' && (!isConnected || !isOnline))) {
      setFormError('Waiting for live price…');
      return null;
    }
    if (!usdtAmount) {
      setFormError(`Enter a ${qtyMode === 'usd' ? 'USD' : baseAsset} amount`);
      return null;
    }
    if (!actualUsdAmount || actualUsdAmount <= 0) {
      setFormError('Amount too small for minimum lot size');
      return null;
    }
    if (actualUsdAmount + actualUsdAmount * COMMISSION_RATE > balance) {
      setFormError('Insufficient balance');
      return null;
    }

    const tp = tpEnabled && tpInput ? parseFloat(tpInput) : undefined;
    const sl = slEnabled && slInput ? parseFloat(slInput) : undefined;

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
    return { amount: actualUsdAmount, tp, sl };
  }

  function handleExecute() {
    setFormError(null);
    // If an immediate-fill warning is active and hasn't been bypassed yet,
    // require a second click ("Place anyway") instead of placing silently.
    if (immediateWarning && !bypassWarning) {
      setBypassWarning(true);
      return;
    }
    const v = validate();
    if (!v || !execPrice) return;

    const id =
      tab === 'market'
        ? placeOrder(symbol, side, execPrice, v.amount, v.tp, v.sl)
        : tab === 'limit'
          ? placeLimitOrder(symbol, side, execPrice, v.amount, v.tp, v.sl)
          : placeStopOrder(symbol, side, execPrice, v.amount, v.tp, v.sl);

    if (!id) {
      setFormError('Order could not be placed');
      return;
    }

    // Play sound feedback
    if (tab === 'market') sound.playOrderPlaced();
    else sound.playOrderQueued();

    setQtyInput('');
    setPriceInput('');
    setTpInput('');
    setSlInput('');
    setTpEnabled(false);
    setSlEnabled(false);
    setBypassWarning(false);
    void executeAnim.start({ scale: [1, 1.04, 1], transition: { duration: 0.3, ease: 'easeOut' } });
  }

  // ── Submit label ──────────────────────────────────────────────────────────
  const submitSecondary = (() => {
    const qtyStr = units !== null ? `${units.toFixed(6)} ${baseAsset}` : `— ${baseAsset}`;
    if (tab === 'market') return `${qtyStr} · MARKET`;
    const p = execPrice ? execPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
    return `${qtyStr} @ ${p} ${tab.toUpperCase()}`;
  })();

  const isBuy = side === 'buy';
  const sideColor = isBuy ? color.green : color.red;

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-l border-white/6 overflow-hidden"
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

      {/* ── Sell / Buy side selector ─────────────────────────────────── */}
      <div className="relative flex shrink-0 border-b border-white/5">
        {/* Sell */}
        <button
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
            style={{ fontSize: fontSize.xs11, color: !isBuy ? '#fff' : color.muted }}
          >
            {(bid ?? latestPrice)
              ? (bid ?? latestPrice)!.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : '—'}
          </span>
        </button>

        {/* Spread badge */}
        <div
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded px-1 text-center tabular-nums"
          style={{
            background: bg.surface,
            fontSize: fontSize.xxs,
            color: color.muted,
            minWidth: 28,
          }}
          title={
            spread != null
              ? `Bid: ${bid?.toLocaleString(undefined, { maximumFractionDigits: 4 })} · Ask: ${ask?.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
              : 'Spread — awaiting bid/ask feed'
          }
        >
          {spread != null ? spread.toFixed(spread < 1 ? 4 : 2) : '—'}
        </div>

        {/* Buy */}
        <button
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
            style={{ fontSize: fontSize.xs11, color: isBuy ? '#fff' : color.muted }}
          >
            {(ask ?? latestPrice)
              ? (ask ?? latestPrice)!.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : '—'}
          </span>
        </button>
      </div>

      {/* ── Order type tabs ──────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 border-b border-white/5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => handleTabChange(t.id)}
            className="relative flex-1 py-2 text-xs font-semibold transition-colors"
            style={{ color: tab === t.id ? '#fff' : color.muted }}
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
              <div className="relative">
                <input
                  id={priceInputId}
                  type="number"
                  min="0"
                  step="0.01"
                  value={displayPrice}
                  onChange={(e) => {
                    setPriceInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-md border border-white/8 px-2.5 py-1.5 pr-14 text-xs text-white transition-colors focus:outline-none focus:border-brand-purple-dark/50"
                  style={{ background: bg.surface, fontSize: fontSize.xs }}
                />
                <span
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
                  style={{ fontSize: fontSize.xs10, color: color.muted }}
                >
                  USDT
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quantity input with Units ↔ USD swap */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span
              className="font-semibold uppercase tracking-wider"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              {qtyMode === 'usd' ? 'Amount (USD)' : `Quantity (${baseAsset})`}
            </span>
            <button
              onClick={handleSwapQtyMode}
              className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-white"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
              title={`Switch to ${qtyMode === 'usd' ? 'Units' : 'USD'}`}
            >
              <ArrowLeftRight className="h-3 w-3" />
              {qtyMode === 'usd' ? 'Units' : 'USD'}
            </button>
          </div>

          <div className="relative">
            <input
              id="trading-qty"
              name="qty"
              type="number"
              min="0"
              step={qtyMode === 'usd' ? '0.01' : '0.000001'}
              value={qtyInput}
              onChange={(e) => {
                setQtyInput(e.target.value);
                setFormError(null);
              }}
              placeholder={qtyMode === 'usd' ? '0.00' : '0.000000'}
              className="w-full rounded-md border border-white/8 px-2.5 py-1.5 pr-14 text-xs text-white transition-colors focus:outline-none focus:border-brand-purple-dark/50"
              style={{ background: bg.surface, fontSize: fontSize.xs }}
            />
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              {qtyMode === 'usd' ? 'USD' : baseAsset}
            </span>
          </div>

          {/* Equivalent display */}
          {equivalent && (
            <p className="mt-1" style={{ fontSize: fontSize.xs10, color: color.muted }}>
              ≈ <span className="text-white/60">{equivalent}</span>
            </p>
          )}

          {/* Available balance hint */}
          <p className="mt-1" style={{ fontSize: fontSize.xs10, color: color.muted }}>
            Available{' '}
            <span className="text-white/60">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        </div>

        {/* ── Exits (TP / SL) ──────────────────────────────────────────── */}
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
                        onChange={(v) => {
                          setTpEnabled(v);
                          if (!v) setTpInput('');
                          setFormError(null);
                        }}
                      />
                      <span className="text-xs" style={{ color: tpEnabled ? '#fff' : color.muted }}>
                        Take profit, price
                      </span>
                    </div>
                    {tpEnabled && (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={tpInput}
                          onChange={(e) => {
                            setTpInput(e.target.value);
                            setFormError(null);
                          }}
                          placeholder="0.00"
                          className="w-full rounded-md border border-white/8 px-2.5 py-1.5 pr-12 text-xs text-white transition-colors focus:outline-none"
                          style={{ background: bg.surface, borderColor: `${color.green}60` }}
                        />
                        <span
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
                          style={{ fontSize: fontSize.xs10, color: `${color.green}b3` }}
                        >
                          TP
                        </span>
                      </div>
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
                        onChange={(v) => {
                          setSlEnabled(v);
                          if (!v) setSlInput('');
                          setFormError(null);
                        }}
                      />
                      <span className="text-xs" style={{ color: slEnabled ? '#fff' : color.muted }}>
                        Stop loss, price
                      </span>
                    </div>
                    {slEnabled && (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={slInput}
                          onChange={(e) => {
                            setSlInput(e.target.value);
                            setFormError(null);
                          }}
                          placeholder="0.00"
                          className="w-full rounded-md border border-white/8 px-2.5 py-1.5 pr-12 text-xs text-white transition-colors focus:outline-none"
                          style={{ background: bg.surface, borderColor: `${color.red}60` }}
                        />
                        <span
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
                          style={{ fontSize: fontSize.xs10, color: `${color.red}b3` }}
                        >
                          SL
                        </span>
                      </div>
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

        {/* ── Order Info ───────────────────────────────────────────────── */}
        <div className="rounded-md border border-white/6 p-2.5" style={{ background: bg.page }}>
          <p
            className="mb-2 font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Order info
          </p>

          {/* Margin row + progress bar */}
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <div
                className="flex items-center gap-1"
                style={{ fontSize: fontSize.xs10, color: color.muted }}
              >
                <span>Margin</span>
                <span title="Margin required to open this position (your input amount, deducted from balance)">
                  <Info className="h-3 w-3 opacity-60" />
                </span>
              </div>
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize.xs10, color: marginExceeds ? color.red : color.muted }}
              >
                {margin !== null ? `$${margin.toFixed(2)}` : '—'}
                {' / '}
                <span style={{ color: '#fff' }}>${balance.toFixed(2)}</span>
              </span>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: `${color.muted}20` }}
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${marginPct}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ background: marginExceeds ? color.red : color.green }}
                title={marginExceeds ? 'Margin exceeds available balance' : undefined}
              />
            </div>
          </div>

          {/* Info rows */}
          {[
            { label: 'Leverage', value: `${leverage}:1` },
            {
              label: 'Trade value',
              value: tradeValue !== null ? `$${tradeValue.toFixed(2)}` : '—',
            },
            { label: 'Commission', value: commission !== null ? `$${commission.toFixed(4)}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-0.5">
              <span style={{ fontSize: fontSize.xs10, color: color.muted }}>{label}</span>
              <span className="tabular-nums" style={{ fontSize: fontSize.xs10, color: '#fff' }}>
                {value}
              </span>
            </div>
          ))}
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
              style={{ borderColor: '#f59e0b55', background: '#f59e0b0d' }}
            >
              <div className="flex items-start gap-1.5">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: '#f59e0b' }}
                />
                <div className="flex flex-col gap-1">
                  <p style={{ fontSize: fontSize.xs10, color: '#fcd34d', lineHeight: 1.4 }}>
                    {immediateWarning.message}
                  </p>
                  <p style={{ fontSize: fontSize.xs10, color: '#f59e0b99', lineHeight: 1.4 }}>
                    {immediateWarning.suggestion}
                  </p>
                  {bypassWarning && (
                    <p
                      className="font-semibold"
                      style={{ fontSize: fontSize.xs10, color: '#fcd34d' }}
                    >
                      Click the button below to confirm and place anyway.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Form error ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {formError && (
            <motion.p
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
          onClick={handleExecute}
          animate={executeAnim}
          disabled={
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
          <span className="text-sm font-bold" style={{ color: isBuy ? bg.page : '#fff' }}>
            {bypassWarning && immediateWarning ? 'Place anyway' : isBuy ? 'Buy' : 'Sell'}
          </span>
          <span
            className="font-semibold opacity-80"
            style={{ fontSize: fontSize.xs10, color: isBuy ? bg.page : '#fff' }}
          >
            {submitSecondary}
          </span>
        </motion.button>
      </div>
    </aside>
  );
}
