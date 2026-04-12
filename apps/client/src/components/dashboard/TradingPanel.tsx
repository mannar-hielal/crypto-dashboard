import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useMarketStore } from '@/store/marketStore';
import { usePaperStore } from '@/store/paperStore';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderSide = 'buy' | 'sell';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESETS = [25, 50, 75, 100] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface TradingPanelProps {
  /** Called when the user clicks the X button to close the panel */
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TradingPanel — Right sidebar
 *
 * Paper trade order entry: balance summary, Buy/Sell toggle,
 * USDT amount input with % presets, and the execute button.
 *
 * Lives to the right of ChartPanel. State is shared via paperStore.
 * The X button in the header collapses this panel; re-open via the
 * toggle icon (⊞) in SymbolBar.
 */
export function TradingPanel({ onClose }: TradingPanelProps) {
  const [orderSide, setOrderSide] = useState<OrderSide>('buy');
  const [usdtInput, setUsdtInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [slInput, setSlInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const symbol = useMarketStore((s) => s.symbol);
  const latestPrice = useMarketStore((s) => s.latestPrice);

  const balance = usePaperStore((s) => s.balance);
  const positions = usePaperStore((s) => s.positions);
  const placeOrder = usePaperStore((s) => s.placeOrder);

  // Note: local state resets automatically when the symbol changes because
  // DashboardPage passes key={symbol} to this component — React remounts it
  // with fresh state instead of patching it in place.

  // ── Derived values ────────────────────────────────────────────────────────
  const unrealizedPnl = positions.reduce((sum, pos) => {
    if (!latestPrice) return sum;
    const pnl =
      pos.side === 'long'
        ? (latestPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - latestPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  const equity =
    balance +
    positions.reduce((sum, pos) => {
      if (!latestPrice) return sum + pos.entryUsdtAmount;
      const pnl =
        pos.side === 'long'
          ? (latestPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - latestPrice) * pos.quantity;
      return sum + pos.entryUsdtAmount + pnl;
    }, 0);

  const parsedUsdt = parseFloat(usdtInput);
  const previewQty =
    latestPrice && !isNaN(parsedUsdt) && parsedUsdt > 0 ? parsedUsdt / latestPrice : null;
  const baseAsset = symbol.replace('USDT', '');

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSideChange(side: OrderSide) {
    setOrderSide(side);
    setFormError(null);
    setTpInput('');
    setSlInput('');
  }

  function handlePreset(pct: number) {
    const amount = (balance * pct) / 100;
    setUsdtInput(amount > 0 ? amount.toFixed(2) : '');
    setFormError(null);
  }

  function handleExecute() {
    setFormError(null);
    if (!latestPrice) {
      setFormError('Waiting for live price…');
      return;
    }
    const amount = parseFloat(usdtInput);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid USDT amount');
      return;
    }
    if (amount > balance) {
      setFormError('Insufficient balance');
      return;
    }

    const tp = tpInput ? parseFloat(tpInput) : undefined;
    const sl = slInput ? parseFloat(slInput) : undefined;

    // Validate TP/SL — must be positive and in the correct direction
    if (tp !== undefined && !isNaN(tp)) {
      if (tp <= 0) {
        setFormError('Take-Profit must be a positive price');
        return;
      }
      if (orderSide === 'buy' && tp <= latestPrice) {
        setFormError('Take-Profit must be above current price for a Long');
        return;
      }
      if (orderSide === 'sell' && tp >= latestPrice) {
        setFormError('Take-Profit must be below current price for a Short');
        return;
      }
    }
    if (sl !== undefined && !isNaN(sl)) {
      if (sl <= 0) {
        setFormError('Stop-Loss must be a positive price');
        return;
      }
      if (orderSide === 'buy' && sl >= latestPrice) {
        setFormError('Stop-Loss must be below current price for a Long');
        return;
      }
      if (orderSide === 'sell' && sl <= latestPrice) {
        setFormError('Stop-Loss must be above current price for a Short');
        return;
      }
    }

    const id = placeOrder(
      symbol,
      orderSide,
      latestPrice,
      amount,
      tp !== undefined && !isNaN(tp) ? tp : undefined,
      sl !== undefined && !isNaN(sl) ? sl : undefined
    );
    if (!id) {
      setFormError('Order could not be placed');
      return;
    }
    setUsdtInput('');
    setTpInput('');
    setSlInput('');
  }

  return (
    <aside
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-white/[0.06]"
      style={{ background: bg.panel }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.05] px-3"
        style={{ background: bg.page }}
      >
        <span className="text-xs font-bold tracking-wide text-white/80">Paper Trading</span>
        <div className="flex items-center gap-0.5">
          {/* Close panel — re-open via the ⊞ icon in SymbolBar */}
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Close panel (re-open with the ⊞ toggle in the top row)"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:text-brand-red"
            style={{ color: color.muted }}
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 p-3">
        {/* Balance */}
        <div>
          <p
            className="mb-0.5 font-semibold uppercase tracking-widest"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Balance
          </p>
          <NumberFlow
            value={balance}
            format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 2 }}
            className="text-sm font-bold tabular-nums text-white"
          />
        </div>

        {/* Equity row */}
        <div
          className="flex items-center justify-between rounded-md border border-white/[0.06] px-2.5 py-1.5"
          style={{ background: bg.surface }}
        >
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Equity
          </span>
          <NumberFlow
            value={equity}
            format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 2 }}
            className="text-xs tabular-nums font-semibold text-white/80"
          />
        </div>

        {/* Unrealized P&L */}
        <div className="flex items-center justify-between">
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Unrealized P&amp;L
          </span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: unrealizedPnl >= 0 ? color.green : color.red }}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)} USDT
          </span>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-white/[0.05]" />

        {/* Buy / Sell toggle */}
        <div
          className="flex rounded-md p-0.5 border border-white/[0.06]"
          style={{ background: bg.surface }}
        >
          <motion.button
            onClick={() => handleSideChange('buy')}
            whileTap={{ scale: 0.97 }}
            className="flex-1 rounded py-1.5 text-xs font-bold transition-all"
            style={{
              background: orderSide === 'buy' ? color.green : 'transparent',
              color: orderSide === 'buy' ? bg.page : color.muted,
            }}
          >
            Buy / Long
          </motion.button>
          <motion.button
            onClick={() => handleSideChange('sell')}
            whileTap={{ scale: 0.97 }}
            className="flex-1 rounded py-1.5 text-xs font-bold transition-all"
            style={{
              background: orderSide === 'sell' ? color.red : 'transparent',
              color: orderSide === 'sell' ? '#ffffff' : color.muted,
            }}
          >
            Sell / Short
          </motion.button>
        </div>

        {/* Available balance hint */}
        <div className="flex items-center justify-between" style={{ fontSize: fontSize.xs10 }}>
          <span style={{ color: color.muted }}>Available</span>
          <span className="font-semibold text-white/60">
            $
            {balance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            USDT
          </span>
        </div>

        {/* Amount input */}
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={usdtInput}
              onChange={(e) => {
                setUsdtInput(e.target.value);
                setFormError(null);
              }}
              placeholder="Amount"
              className="w-full rounded-md border border-white/[0.08] px-2.5 py-1.5 pr-14 text-xs text-white transition-colors focus:outline-none focus:border-brand-purple-dark/50"
              style={{ background: bg.surface, fontSize: fontSize.xs }}
            />
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              USDT
            </span>
          </div>

          {/* Quantity preview */}
          {previewQty !== null && (
            <p style={{ fontSize: fontSize.xs10, color: color.muted }}>
              ≈{' '}
              <span className="text-white/60">
                {previewQty.toFixed(6)} {baseAsset}
              </span>
              {latestPrice && (
                <span style={{ color: `${color.muted}99` }} className="ml-1">
                  @ ${latestPrice.toFixed(2)}
                </span>
              )}
            </p>
          )}

          {/* Quick-fill presets */}
          <div className="flex gap-1">
            {PRESETS.map((pct) => (
              <motion.button
                key={pct}
                onClick={() => handlePreset(pct)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex-1 rounded border border-white/[0.08] py-0.5 font-semibold transition-colors hover:border-brand-purple-dark/40 hover:text-white"
                style={{ fontSize: fontSize.xs10, color: color.muted }}
              >
                {pct}%
              </motion.button>
            ))}
          </div>
        </div>

        {/* TP / SL inputs */}
        <div className="flex flex-col gap-1.5">
          <p
            className="font-semibold uppercase tracking-widest"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            TP / SL <span className="normal-case font-normal opacity-60">(optional)</span>
          </p>
          {/* Take Profit */}
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
              placeholder="Take Profit"
              className="w-full rounded-md border border-white/[0.08] px-2.5 py-1.5 pr-12 text-xs text-white transition-colors focus:outline-none focus:border-brand-green/50"
              style={{ background: bg.surface }}
            />
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
              style={{ fontSize: fontSize.xs10, color: `${color.green}b3` }}
            >
              TP
            </span>
          </div>
          {/* Stop Loss */}
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
              placeholder="Stop Loss"
              className="w-full rounded-md border border-white/[0.08] px-2.5 py-1.5 pr-12 text-xs text-white transition-colors focus:outline-none focus:border-brand-red/50"
              style={{ background: bg.surface }}
            />
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-semibold"
              style={{ fontSize: fontSize.xs10, color: `${color.red}b3` }}
            >
              SL
            </span>
          </div>
        </div>

        {/* Form error */}
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

        {/* Execute button */}
        <motion.button
          onClick={handleExecute}
          disabled={!latestPrice || !usdtInput || parseFloat(usdtInput) <= 0}
          whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
          whileTap={{ scale: 0.98 }}
          className="w-full rounded-md py-2.5 text-xs font-bold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            background: orderSide === 'buy' ? color.green : color.red,
            color: orderSide === 'buy' ? bg.page : '#ffffff',
            boxShadow:
              orderSide === 'buy' ? `0 0 16px 0px ${color.green}30` : `0 0 16px 0px ${color.red}30`,
          }}
        >
          {orderSide === 'buy' ? '↑ Buy' : '↓ Sell'} {symbol} · Market
        </motion.button>

        {/* Mark price */}
        {latestPrice !== null && (
          <div
            className="flex items-center justify-between rounded-md border border-white/[0.06] px-2.5 py-1.5"
            style={{ background: bg.surface }}
          >
            <span
              className="font-semibold uppercase tracking-wider"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Mark Price
            </span>
            <span
              className="tabular-nums font-semibold text-white/70"
              style={{ fontSize: fontSize.xs11 }}
            >
              $
              {latestPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
