/**
 * PendingOrderEditPanel
 *
 * TV-style right-column panel for editing a pending limit or stop order.
 * Shows price, quantity (with live USD equivalent), TP/SL toggles, order info,
 * and an insufficient-funds banner when the new cost exceeds available balance.
 * Replaces the TradingPanel in the right slot when the user clicks the pencil
 * icon on a pending order row in PaperTradingPanel.
 */

import { useState } from 'react';
import { X, AlertTriangle, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePaperStore, COMMISSION_RATE } from '@/store/paperStore';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMktPrice(price: number): string {
  const maxDp = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDp,
  });
}

function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-8)}` : id;
}

/** Small toggle switch */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? color.green : `${color.muted}40` }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
        style={{ right: '2px', transform: checked ? 'translateX(-12px)' : 'translateX(0px)' }}
      />
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PendingOrderEditPanelProps {
  orderId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PendingOrderEditPanel({ orderId, onClose }: PendingOrderEditPanelProps) {
  const order = usePaperStore((s) => s.pendingOrders.find((o) => o.id === orderId));
  const balance = usePaperStore((s) => s.balance);
  const leverage = usePaperStore((s) => s.leverage);
  const editPendingOrder = usePaperStore((s) => s.editPendingOrder);

  // ── Local state (initialised from the live order) ───────────────────────────
  const [priceInput, setPriceInput] = useState(() =>
    order ? fmtMktPrice(order.triggerPrice) : ''
  );
  // Qty mode: 'units' = enter base-asset qty; 'usd' = enter margin (USDT)
  const [qtyMode, setQtyMode] = useState<'units' | 'usd'>('units');
  const [qtyInput, setQtyInput] = useState(() => (order ? order.qty.toFixed(6) : ''));
  const [usdInput, setUsdInput] = useState(() => (order ? order.usdtAmount.toFixed(2) : ''));
  const [tpEnabled, setTpEnabled] = useState(() => !!order?.takeProfit);
  const [slEnabled, setSlEnabled] = useState(() => !!order?.stopLoss);
  const [tpInput, setTpInput] = useState(() =>
    order?.takeProfit ? fmtMktPrice(order.takeProfit) : ''
  );
  const [slInput, setSlInput] = useState(() =>
    order?.stopLoss ? fmtMktPrice(order.stopLoss) : ''
  );
  const [submitResult, setSubmitResult] = useState<'rejected' | null>(null);

  if (!order) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2"
        style={{ background: bg.panel, color: color.muted, fontSize: fontSize.xs11 }}
      >
        <span>Order not found.</span>
        <button
          onClick={onClose}
          className="underline hover:text-white"
          style={{ fontSize: fontSize.xs11 }}
        >
          Close
        </button>
      </div>
    );
  }

  const activeOrder = order;

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isBuy = activeOrder.side === 'buy';
  const typeLabel = activeOrder.type === 'limit' ? 'Limit' : 'Stop';

  const newPrice = parseFloat(priceInput.replace(/,/g, '')) || activeOrder.triggerPrice;

  // Resolve qty and margin based on active input mode
  const newQty =
    qtyMode === 'units'
      ? parseFloat(qtyInput.replace(/,/g, '')) || order.qty
      : newPrice > 0 && leverage > 0
        ? ((parseFloat(usdInput.replace(/,/g, '')) || activeOrder.usdtAmount) * leverage) / newPrice
        : activeOrder.qty;

  const newUsdtAmount =
    qtyMode === 'units'
      ? newPrice > 0 && leverage > 0
        ? (newQty * newPrice) / leverage
        : activeOrder.usdtAmount
      : parseFloat(usdInput.replace(/,/g, '')) || activeOrder.usdtAmount;

  const usdEquivalent = newQty * newPrice; // notional trade value

  const oldReserved = activeOrder.usdtAmount + activeOrder.usdtAmount * COMMISSION_RATE;
  const scratchBalance = balance + oldReserved;
  const newRequired = newUsdtAmount + newUsdtAmount * COMMISSION_RATE;
  const insufficientFunds = newRequired > scratchBalance;

  const tpVal = parseFloat(tpInput.replace(/,/g, '')) || null;
  const slVal = parseFloat(slInput.replace(/,/g, '')) || null;

  // Direction-aware TP/SL warnings
  // Use the correct price reference name so stop orders don't say "limit price".
  const priceReferenceLabel = activeOrder.type === 'stop' ? 'stop price' : 'limit price';

  const tpWarning: string | null =
    tpEnabled && tpVal != null
      ? isBuy && tpVal <= newPrice
        ? `Take Profit must be above ${priceReferenceLabel} for a buy order.`
        : !isBuy && tpVal >= newPrice
          ? `Take Profit must be below ${priceReferenceLabel} for a sell order.`
          : null
      : null;

  const slWarning: string | null =
    slEnabled && slVal != null
      ? isBuy && slVal >= newPrice
        ? `Stop Loss must be below ${priceReferenceLabel} for a buy order.`
        : !isBuy && slVal <= newPrice
          ? `Stop Loss must be above ${priceReferenceLabel} for a sell order.`
          : null
      : null;

  // Confirm is disabled when: insufficient funds, a direction warning is active,
  // or a toggle is on but the parsed value is missing/zero (would silently remove the leg).
  const confirmDisabled = !!(
    insufficientFunds ||
    tpWarning ||
    slWarning ||
    (tpEnabled && !tpVal) ||
    (slEnabled && !slVal)
  );

  // Description line (TV-style)
  const descLabel = `${isBuy ? 'Buy' : 'Sell'} ${typeLabel} ${fmtMktPrice(newQty)} @ ${fmtMktPrice(activeOrder.triggerPrice)}`;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSwapMode() {
    if (qtyMode === 'units') {
      // Convert current units → USD margin
      const qty = parseFloat(qtyInput.replace(/,/g, '')) || activeOrder.qty;
      const usd =
        newPrice > 0 && leverage > 0 ? (qty * newPrice) / leverage : activeOrder.usdtAmount;
      setUsdInput(usd.toFixed(2));
      setQtyMode('usd');
    } else {
      // Convert current USD margin → units
      const usd = parseFloat(usdInput.replace(/,/g, '')) || activeOrder.usdtAmount;
      const qty = newPrice > 0 && leverage > 0 ? (usd * leverage) / newPrice : activeOrder.qty;
      setQtyInput(qty.toFixed(6));
      setQtyMode('units');
    }
  }

  function handleConfirm() {
    if (confirmDisabled) return;
    const result = editPendingOrder(
      orderId,
      newPrice,
      newUsdtAmount,
      tpEnabled && tpVal ? tpVal : null,
      slEnabled && slVal ? slVal : null
    );
    if (result === 'rejected') {
      setSubmitResult('rejected');
      // Close after a short delay so the user can see the rejection
      setTimeout(onClose, 1200);
    } else {
      onClose();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ background: bg.panel, borderLeft: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col gap-0.5 border-b px-3 py-2.5"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white" style={{ fontSize: fontSize.sm }}>
              {order.symbol}
            </span>
            <span style={{ fontSize: fontSize.xs10, color: color.muted }}>
              order {shortId(orderId)}
            </span>
          </div>
          <button
            onClick={onClose}
            title="Discard and close"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:text-white"
            style={{ color: color.muted }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: fontSize.xs11, color: color.muted }}
        >
          {isBuy ? (
            <TrendingUp className="h-3 w-3" style={{ color: color.green }} />
          ) : (
            <TrendingDown className="h-3 w-3" style={{ color: color.red }} />
          )}
          <span style={{ color: isBuy ? color.green : color.red, fontWeight: 600 }}>
            {descLabel}
          </span>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
        {/* ── Insufficient-funds banner ──────────────────────────────────── */}
        {(insufficientFunds || submitResult === 'rejected') && (
          <div
            className="mx-3 mt-3 flex items-start gap-2 rounded p-2"
            style={{ background: `${color.red}18`, border: `1px solid ${color.red}44` }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: color.red }} />
            <p style={{ fontSize: fontSize.xs10, color: color.red }}>
              {submitResult === 'rejected'
                ? 'Order rejected — not enough funds.'
                : `Not enough funds. Required: $${newRequired.toFixed(2)}, Available: $${scratchBalance.toFixed(2)}`}
            </p>
          </div>
        )}

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="px-3 pt-3">
          <hr style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* ── Price ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 px-3 py-3">
          <label style={{ fontSize: fontSize.xs10, color: color.muted }}>Price</label>
          <input
            type="text"
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="w-full rounded px-2.5 py-1.5 text-right tabular-nums text-white outline-none"
            style={{
              fontSize: fontSize.xs11,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>

        {/* ── Quantity (USD ↔ Units) ─────────────────────────────────────── */}
        <div className="flex flex-col gap-1 px-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label style={{ fontSize: fontSize.xs10, color: color.muted }}>
                {qtyMode === 'units' ? 'Units' : 'Amount (USD)'}
              </label>
              {/* Mode swap button */}
              <button
                type="button"
                onClick={handleSwapMode}
                title="Switch between Units and USD"
                className="flex items-center justify-center rounded transition-colors hover:text-white"
                style={{ color: color.muted }}
              >
                <ArrowLeftRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <span className="tabular-nums" style={{ fontSize: fontSize.xs10, color: color.muted }}>
              {qtyMode === 'units'
                ? `≈ ${usdEquivalent.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`
                : `≈ ${newQty.toLocaleString(undefined, { maximumFractionDigits: 6 })} units`}
            </span>
          </div>
          {qtyMode === 'units' ? (
            <input
              type="text"
              inputMode="decimal"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              className="w-full rounded px-2.5 py-1.5 text-right tabular-nums text-white outline-none"
              style={{
                fontSize: fontSize.xs11,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${insufficientFunds ? color.red : 'rgba(255,255,255,0.1)'}`,
              }}
            />
          ) : (
            <input
              type="text"
              inputMode="decimal"
              value={usdInput}
              onChange={(e) => setUsdInput(e.target.value)}
              className="w-full rounded px-2.5 py-1.5 text-right tabular-nums text-white outline-none"
              style={{
                fontSize: fontSize.xs11,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${insufficientFunds ? color.red : 'rgba(255,255,255,0.1)'}`,
              }}
            />
          )}
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="px-3">
          <hr style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* ── Exits section ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-3 py-3">
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Exits
          </span>

          {/* Take Profit */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={tpEnabled} onChange={setTpEnabled} label="Enable take profit" />
              <span
                style={{
                  fontSize: fontSize.xs11,
                  color: tpEnabled ? 'rgba(255,255,255,0.8)' : color.muted,
                }}
              >
                Take profit, price
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled={!tpEnabled}
              value={tpInput}
              onChange={(e) => setTpInput(e.target.value)}
              placeholder="—"
              className="w-full rounded px-2.5 py-1.5 text-right tabular-nums text-white outline-none transition-opacity disabled:opacity-40"
              style={{
                fontSize: fontSize.xs11,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${tpWarning ? color.red : 'rgba(255,255,255,0.1)'}`,
              }}
            />
            {tpWarning && (
              <p
                className="flex items-center gap-1"
                style={{ fontSize: fontSize.xs10, color: color.amber }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {tpWarning}
              </p>
            )}
          </div>

          {/* Stop Loss */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={slEnabled} onChange={setSlEnabled} label="Enable stop loss" />
              <span
                style={{
                  fontSize: fontSize.xs11,
                  color: slEnabled ? 'rgba(255,255,255,0.8)' : color.muted,
                }}
              >
                Stop loss, price
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled={!slEnabled}
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              placeholder="—"
              className="w-full rounded px-2.5 py-1.5 text-right tabular-nums text-white outline-none transition-opacity disabled:opacity-40"
              style={{
                fontSize: fontSize.xs11,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${slWarning ? color.red : 'rgba(255,255,255,0.1)'}`,
              }}
            />
            {slWarning && (
              <p
                className="flex items-center gap-1"
                style={{ fontSize: fontSize.xs10, color: color.amber }}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {slWarning}
              </p>
            )}
          </div>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="px-3">
          <hr style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* ── Order info ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-3 py-3">
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Order info
          </span>
          {(
            [
              { label: 'Leverage', value: `1:${leverage}` },
              {
                label: 'Trade value',
                value: `${usdEquivalent.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`,
              },
              { label: 'Margin (reserved)', value: `$${newUsdtAmount.toFixed(2)} USD` },
            ] as { label: string; value: string }[]
          ).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span style={{ fontSize: fontSize.xs11, color: color.muted }}>{label}</span>
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize.xs11, color: 'rgba(255,255,255,0.75)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer: Confirm / Discard ─────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col gap-2 border-t px-3 py-3"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <motion.button
          onClick={handleConfirm}
          disabled={confirmDisabled}
          whileTap={!confirmDisabled ? { scale: 0.97 } : {}}
          className="w-full rounded py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'rgba(105,91,236,0.85)', fontSize: fontSize.xs }}
        >
          Confirm
        </motion.button>
        <motion.button
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded py-2 text-sm font-semibold transition-colors hover:text-white"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: color.muted,
            fontSize: fontSize.xs,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          Discard
        </motion.button>
      </div>
    </div>
  );
}
