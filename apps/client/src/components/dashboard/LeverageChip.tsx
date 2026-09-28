/**
 * USDT Perpetual leverage for one symbol (APP_LOG Bybit Parity BP-2, BP-3): a "10x" chip (isolated
 * margin, named in its label and the modal) that opens a modal with the presets. As on Bybit, the
 * leverage can change while the symbol has an open position or active orders: the server
 * re-margins them (BP-3). The modal previews the position's new margin and liquidation price and
 * shows the server's refusal (not enough balance, or a raise the mark price would liquidate).
 *
 * BP-5 E: the chip reads `Cross 10x` / `Isolated 10x`, and the modal also switches the account's
 * margin mode (Cross | Isolated tabs with an explainer). The mode is account-wide, as in Bybit UTA;
 * the server applies Bybit's switch checks and its refusal lists every reason.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import {
  CRYPTO_LEVERAGE_OPTIONS,
  leverageFor,
  usePaperStore,
  type Position,
} from '@/store/paperStore';
import {
  CROSS_EXPLAINER,
  ISOLATED_EXPLAINER,
  remarginPreview,
  riskTierInfo,
  riskTierLabel,
} from '@/lib/positionMath';
import type { PaperMarginMode } from '@crypto-dashboard/sdk';
import { fmtMktPrice } from '@/lib/utils';
import { useInstrument } from '@/hooks/useInstruments';
import { color, fontSize, zIndex } from '@/lib/tokens';
import styles from './TradeDialog.module.css';

interface LeverageChipProps {
  symbol: string;
}

export function LeverageChip({ symbol }: LeverageChipProps) {
  const leverage = usePaperStore((s) => leverageFor(s, symbol));
  const marginMode = usePaperStore((s) => s.marginMode);
  const [open, setOpen] = useState(false);
  const cross = marginMode === 'REGULAR_MARGIN';

  return (
    <>
      <button
        type="button"
        className={styles.chip}
        style={{ fontSize: fontSize.xs11 }}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Leverage ${leverage}x, ${cross ? 'cross' : 'isolated'} margin`}
      >
        {cross ? 'Cross' : 'Isolated'} {leverage}x
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <LeverageModal
          symbol={symbol}
          current={leverage}
          currentMode={marginMode}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface RemarginPreviewProps {
  position: Position;
  leverage: number;
  symbol: string;
}

/** "Margin: $500.00 → $1,000.00 · Liq. price: $45,148.99 → $40,xxx" for the chosen leverage. */
function RemarginPreview({ position, leverage, symbol }: RemarginPreviewProps) {
  const instrument = useInstrument('linear', symbol);
  const next = remarginPreview(position, leverage, symbol, instrument?.tickSize);
  const margin = position.entryUsdtAmount + position.closeFeeReserve;
  const fmtLiq = (v: number | null) => (v !== null && v > 0 ? `$${fmtMktPrice(v)}` : '—');
  return (
    <dl
      className={`${styles.note} ${styles.preview}`}
      style={{ fontSize: fontSize.xs10 }}
      data-testid="remargin-preview"
    >
      <div>
        <dt>Position margin: </dt>
        <dd style={{ color: color.white }}>
          ${margin.toFixed(2)} → ${next.margin.toFixed(2)}
        </dd>
      </div>
      <div>
        <dt>Liq. price: </dt>
        <dd style={{ color: color.amber }}>
          {fmtLiq(position.liqPrice)} → {fmtLiq(next.liqPrice)}
        </dd>
      </div>
    </dl>
  );
}

interface TierLineProps {
  symbol: string;
  leverage: number;
  positionValue: number;
}

/** The position's risk-limit tier and the max position value at the chosen leverage (O6). */
function TierLine({ symbol, leverage, positionValue }: TierLineProps) {
  const info = riskTierInfo(symbol, positionValue, leverage);
  if (!info) return null;
  return (
    <p className={styles.note} style={{ fontSize: fontSize.xs10 }} data-testid="leverage-tier-info">
      {riskTierLabel(info)} · Max position value at {leverage}×:{' '}
      {info.cap !== null ? `${info.cap.toLocaleString('en-US')} USDT` : '—'}
    </p>
  );
}

interface LeverageModalProps {
  symbol: string;
  current: number;
  currentMode: PaperMarginMode;
  onClose: () => void;
}

const MODE_TABS: readonly (readonly [PaperMarginMode, string])[] = [
  ['REGULAR_MARGIN', 'Cross'],
  ['ISOLATED_MARGIN', 'Isolated'],
];

function LeverageModal({ symbol, current, currentMode, onClose }: LeverageModalProps) {
  const setSymbolLeverage = usePaperStore((s) => s.setSymbolLeverage);
  const setMarginMode = usePaperStore((s) => s.setMarginMode);
  const [mode, setMode] = useState<PaperMarginMode>(currentMode);
  const cross = mode === 'REGULAR_MARGIN';
  const position = usePaperStore((s) => s.positions.find((p) => p.symbol === symbol));
  const hasOrders = usePaperStore((s) =>
    s.pendingOrders.some((o) => o.symbol === symbol && o.category === 'linear')
  );
  const [choice, setChoice] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the dialog; Escape closes it
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function confirm() {
    if (choice === current && mode === currentMode) return onClose();
    setSaving(true);
    // The mode first (account-wide), then this symbol's leverage
    const modeErr = mode !== currentMode ? await setMarginMode(mode) : null;
    const err = modeErr ?? (choice !== current ? await setSymbolLeverage(symbol, choice) : null);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  return createPortal(
    <div
      className={styles.overlay}
      style={{ zIndex: zIndex.modal }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leverage-title"
        tabIndex={-1}
      >
        <h2 id="leverage-title" className={styles.title} style={{ fontSize: fontSize.xs }}>
          Adjust leverage — {symbol}
        </h2>
        <div className={styles.presets} role="tablist" aria-label="Margin mode">
          {MODE_TABS.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              className={styles.preset}
              style={{ fontSize: fontSize.xs11 }}
              aria-selected={mode === m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p
          className={styles.note}
          style={{ fontSize: fontSize.xs10 }}
          data-testid="margin-mode-explainer"
        >
          {cross ? CROSS_EXPLAINER : ISOLATED_EXPLAINER}
          {mode !== currentMode && ' The margin mode applies to your whole account.'}
        </p>
        <div className={styles.presets} role="group" aria-label="Leverage">
          {CRYPTO_LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              type="button"
              className={styles.preset}
              style={{ fontSize: fontSize.xs11 }}
              aria-pressed={choice === lev}
              onClick={() => {
                setChoice(lev);
                setError(null);
              }}
            >
              {lev}×
            </button>
          ))}
        </div>
        <p className={styles.note} style={{ fontSize: fontSize.xs10 }}>
          {position || hasOrders
            ? `${cross ? 'Cross' : 'Isolated'} margin · max 10×. Your open position and active orders on this symbol are re-margined at the new leverage.`
            : `${cross ? 'Cross' : 'Isolated'} margin · max 10×. Applies to new orders on this symbol.`}
        </p>
        {/* The isolated preview; in cross the liquidation price is an account-wide estimate */}
        {!cross && position && choice !== current && (
          <RemarginPreview position={position} leverage={choice} symbol={symbol} />
        )}
        <TierLine
          symbol={symbol}
          leverage={choice}
          positionValue={position ? position.quantity * position.entryPrice : 0}
        />
        {error && (
          <p className={styles.error} role="alert" style={{ fontSize: fontSize.xs10 }}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} ${styles.cancel}`}
            style={{ fontSize: fontSize.xs11 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.action} ${styles.confirm}`}
            style={{ fontSize: fontSize.xs11 }}
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
