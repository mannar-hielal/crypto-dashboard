/**
 * USDT Perpetual leverage for one symbol (BYBIT_PARITY_PLAN BP-2): a "10x" chip (isolated margin,
 * named in its label and the modal) that opens a modal with the presets. Leverage is per symbol and locked while that symbol has an open
 * position or active order (the server refuses the change; the modal says why up front).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Lock } from 'lucide-react';
import { CRYPTO_LEVERAGE_OPTIONS, leverageFor, usePaperStore } from '@/store/paperStore';
import { fontSize, zIndex } from '@/lib/tokens';
import styles from './TradeDialog.module.css';

interface LeverageChipProps {
  symbol: string;
}

export function LeverageChip({ symbol }: LeverageChipProps) {
  const leverage = usePaperStore((s) => leverageFor(s, symbol));
  const locked = usePaperStore(
    (s) =>
      s.positions.some((p) => p.symbol === symbol) ||
      s.pendingOrders.some((o) => o.symbol === symbol && o.category === 'linear')
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.chip}
        style={{ fontSize: fontSize.xs11 }}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Leverage ${leverage}x, isolated margin${locked ? ' (locked)' : ''}`}
      >
        {/* "Isolated margin" is in the label and the modal — the 256px panel has no room here */}
        {leverage}x
        {locked ? (
          <Lock size={11} aria-hidden="true" />
        ) : (
          <ChevronDown size={12} aria-hidden="true" />
        )}
      </button>
      {open && (
        <LeverageModal
          symbol={symbol}
          current={leverage}
          locked={locked}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface LeverageModalProps {
  symbol: string;
  current: number;
  locked: boolean;
  onClose: () => void;
}

function LeverageModal({ symbol, current, locked, onClose }: LeverageModalProps) {
  const setSymbolLeverage = usePaperStore((s) => s.setSymbolLeverage);
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
    if (choice === current) return onClose();
    setSaving(true);
    const err = await setSymbolLeverage(symbol, choice);
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
        <div className={styles.presets} role="group" aria-label="Leverage">
          {CRYPTO_LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              type="button"
              className={styles.preset}
              style={{ fontSize: fontSize.xs11 }}
              aria-pressed={choice === lev}
              disabled={locked}
              onClick={() => setChoice(lev)}
            >
              {lev}×
            </button>
          ))}
        </div>
        <p className={styles.note} style={{ fontSize: fontSize.xs10 }}>
          {locked
            ? "Leverage can't be changed while you have an open position or active orders on this symbol."
            : 'Isolated margin · max 10×. Applies to new orders on this symbol.'}
        </p>
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
            disabled={locked || saving}
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
