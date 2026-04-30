/**
 * PositionEditPanel
 *
 * TV-style right-column panel for editing TP/SL exits on an open position.
 * Replaces the TradingPanel in the right slot when the user clicks the pencil
 * icon on a position's TP or SL cell in PaperTradingPanel.
 */

import { useState } from 'react';
import { X, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePaperStore, COMMISSION_RATE } from '@/store/paperStore';
import { paneStores, lastKnownPrices } from '@/store/paneStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { bg, color, fontSize } from '@/lib/tokens';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMktPrice(price: number): string {
  const maxDp = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDp,
  });
}

/** Small toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
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

interface PositionEditPanelProps {
  positionId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PositionEditPanel({ positionId, onClose }: PositionEditPanelProps) {
  const position = usePaperStore((s) => s.positions.find((p) => p.id === positionId));
  const leverage = usePaperStore((s) => s.leverage);
  const updatePositionExits = usePaperStore((s) => s.updatePositionExits);

  // Price feed for mark price (trade value calculation)
  const lp0 = useStore(paneStores[0], (s) => s.latestPrice);
  const lp1 = useStore(paneStores[1], (s) => s.latestPrice);
  const lp2 = useStore(paneStores[2], (s) => s.latestPrice);
  const lp3 = useStore(paneStores[3], (s) => s.latestPrice);
  const paneSymbols = useLayoutStore(useShallow((s) => s.panes.map((p) => p.symbol)));
  const priceBySymbol: Record<string, number> = {};
  [lp0, lp1, lp2, lp3].forEach((lp, i) => {
    if (lp !== null) priceBySymbol[paneSymbols[i]] = lp;
  });
  const markPrice = position
    ? (priceBySymbol[position.symbol] ??
      lastKnownPrices.get(position.symbol) ??
      position.entryPrice)
    : 0;

  // ── Local state ─────────────────────────────────────────────────────────────
  const [tpEnabled, setTpEnabled] = useState(() => !!position?.takeProfit);
  const [slEnabled, setSlEnabled] = useState(() => !!position?.stopLoss);
  const [tpInput, setTpInput] = useState(() =>
    position?.takeProfit ? fmtMktPrice(position.takeProfit) : ''
  );
  const [slInput, setSlInput] = useState(() =>
    position?.stopLoss ? fmtMktPrice(position.stopLoss) : ''
  );

  if (!position) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2"
        style={{ background: bg.panel, color: color.muted, fontSize: fontSize.xs11 }}
      >
        <span>Position not found.</span>
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isLong = position.side === 'long';
  const tpVal = parseFloat(tpInput.replace(/,/g, '')) || null;
  const slVal = parseFloat(slInput.replace(/,/g, '')) || null;

  // Direction-aware TP/SL warnings
  const tpWarning: string | null =
    tpEnabled && tpVal != null
      ? isLong && tpVal <= position.entryPrice
        ? 'Take Profit must be above entry price for a long position.'
        : !isLong && tpVal >= position.entryPrice
          ? 'Take Profit must be below entry price for a short position.'
          : null
      : null;

  const slWarning: string | null =
    slEnabled && slVal != null
      ? isLong && slVal >= position.entryPrice
        ? 'Stop Loss must be below entry price for a long position.'
        : !isLong && slVal <= position.entryPrice
          ? 'Stop Loss must be above entry price for a short position.'
          : null
      : null;

  // Risk / Reward
  let rrRatio: string | null = null;
  if (tpEnabled && slEnabled && tpVal && slVal && tpVal !== slVal) {
    const reward = Math.abs(tpVal - position.entryPrice);
    const risk = Math.abs(slVal - position.entryPrice);
    if (risk > 0) rrRatio = (reward / risk).toFixed(2);
  }

  // Position info
  const tradeValue = position.entryPrice * position.quantity;
  const commission = position.entryUsdtAmount * COMMISSION_RATE;
  const rewardUsd =
    tpEnabled && tpVal ? Math.abs(tpVal - position.entryPrice) * position.quantity : null;
  const riskUsd =
    slEnabled && slVal ? Math.abs(slVal - position.entryPrice) * position.quantity : null;
  const rewardPct = rewardUsd != null ? (rewardUsd / position.entryUsdtAmount) * 100 : null;
  const riskPct = riskUsd != null ? (riskUsd / position.entryUsdtAmount) * 100 : null;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleConfirm() {
    updatePositionExits(
      positionId,
      tpEnabled && tpVal ? tpVal : null,
      slEnabled && slVal ? slVal : null
    );
    onClose();
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
              {position.symbol}
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
          {isLong ? (
            <TrendingUp className="h-3 w-3" style={{ color: color.green }} />
          ) : (
            <TrendingDown className="h-3 w-3" style={{ color: color.red }} />
          )}
          <span style={{ color: isLong ? color.green : color.red, fontWeight: 600 }}>
            {isLong ? 'Long' : 'Short'}
          </span>
          <span>{position.quantity.toFixed(6)}</span>
          <span>@</span>
          <span className="tabular-nums">${fmtMktPrice(position.entryPrice)}</span>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="shrink-0 px-3 pt-3">
          <hr style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* ── Exits section ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-3 py-3">
          {/* Section heading with R/R */}
          <div className="flex items-center justify-between">
            <span
              className="font-semibold uppercase tracking-wider"
              style={{ fontSize: fontSize.xs10, color: color.muted }}
            >
              Exits
            </span>
            {rrRatio && (
              <span style={{ fontSize: fontSize.xs10, color: color.muted }}>
                Risk / Reward <span className="font-semibold text-white/80">{rrRatio}</span>
              </span>
            )}
          </div>

          {/* ── Take Profit row ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={tpEnabled} onChange={setTpEnabled} />
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

          {/* ── Stop Loss row ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Toggle checked={slEnabled} onChange={setSlEnabled} />
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

        {/* ── Position info ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-3 py-3">
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            Position info
          </span>
          {(
            [
              { label: 'Leverage', value: `1:${leverage}` },
              {
                label: 'Mark price',
                value: `$${fmtMktPrice(markPrice)} USD`,
              },
              {
                label: 'Trade value',
                value: `${tradeValue.toFixed(2)} USD`,
              },
              {
                label: 'Commission',
                value: `$${commission.toFixed(4)} USD`,
              },
              ...(rewardUsd != null && rewardPct != null
                ? [
                    {
                      label: 'Reward',
                      value: `${rewardPct.toFixed(2)}% / ${rewardUsd.toFixed(2)} USD`,
                      col: color.green,
                    },
                  ]
                : []),
              ...(riskUsd != null && riskPct != null
                ? [
                    {
                      label: 'Risk',
                      value: `${riskPct.toFixed(2)}% / ${riskUsd.toFixed(2)} USD`,
                      col: color.red,
                    },
                  ]
                : []),
            ] as { label: string; value: string; col?: string }[]
          ).map(({ label, value, col }) => (
            <div key={label} className="flex items-center justify-between">
              <span style={{ fontSize: fontSize.xs11, color: color.muted }}>{label}</span>
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize.xs11, color: col ?? 'rgba(255,255,255,0.75)' }}
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
          whileTap={{ scale: 0.97 }}
          className="w-full rounded py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
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
