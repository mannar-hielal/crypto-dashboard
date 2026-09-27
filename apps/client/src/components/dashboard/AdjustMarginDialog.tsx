/**
 * Add / reduce margin on an isolated USDT Perpetual position (BYBIT_PARITY_PLAN BP-5 A) — Bybit's
 * add-margin. Opened from the pencil on the Positions row's Margin cell. The leverage stays; the
 * liquidation price moves, previewed before confirming. Only margin added by hand can be reduced;
 * the server decides (balance, liquidation) and its refusal is shown inline.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePaperStore, type Position } from '@/store/paperStore';
import { adjustMarginPreview } from '@/lib/positionMath';
import { fmtMktPrice } from '@/lib/utils';
import { color, fontSize, zIndex } from '@/lib/tokens';
import styles from './TradeDialog.module.css';

type Mode = 'add' | 'reduce';

interface AdjustMarginDialogProps {
  position: Position;
  onClose: () => void;
}

export function AdjustMarginDialog({ position, onClose }: AdjustMarginDialogProps) {
  const balance = usePaperStore((s) => s.balance);
  const adjustPositionMargin = usePaperStore((s) => s.adjustPositionMargin);
  const [mode, setMode] = useState<Mode>('add');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const max = mode === 'add' ? balance : position.extraMargin;
  const amount = Number(input.replace(/,/g, ''));
  const valid = Number.isFinite(amount) && amount > 0 && amount <= max + 1e-9;
  const signed = mode === 'add' ? amount : -amount;
  const preview = valid ? adjustMarginPreview(position, signed, position.symbol) : null;
  const fmtLiq = (v: number | null) => (v !== null && v > 0 ? `$${fmtMktPrice(v)}` : '—');

  async function confirm() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const err = await adjustPositionMargin(position.id, signed);
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
        aria-labelledby="adjust-margin-title"
        tabIndex={-1}
      >
        <h2 id="adjust-margin-title" className={styles.title} style={{ fontSize: fontSize.xs }}>
          Adjust margin — {position.symbol} {position.side === 'long' ? 'Long' : 'Short'}{' '}
          {position.leverage}x
        </h2>
        <div className={styles.presets} role="tablist" aria-label="Add or reduce">
          {(['add', 'reduce'] as const).map((m) => (
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
                setInput('');
                setError(null);
              }}
            >
              {m === 'add' ? 'Add' : 'Reduce'}
            </button>
          ))}
        </div>
        <label className={styles.note} style={{ fontSize: fontSize.xs10 }}>
          Amount (USDT)
          <input
            type="text"
            inputMode="decimal"
            aria-label="Margin amount"
            className={styles.amountInput}
            style={{ fontSize: fontSize.xs11, color: color.white }}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
          />
        </label>
        <p className={styles.note} style={{ fontSize: fontSize.xs10 }}>
          {mode === 'add' ? 'Available' : 'Max reducible (margin you added)'}: $
          {Math.max(0, max).toFixed(2)}{' '}
          <button
            type="button"
            className={styles.linkButton}
            style={{ color: color.purple }}
            onClick={() => setInput(Math.max(0, Math.floor(max * 100) / 100).toString())}
          >
            Max
          </button>
        </p>
        <dl
          className={`${styles.note} ${styles.preview}`}
          style={{ fontSize: fontSize.xs10 }}
          data-testid="adjust-margin-preview"
        >
          <div>
            <dt>Liq. price: </dt>
            <dd style={{ color: color.amber }}>
              {fmtLiq(position.liqPrice)} → {fmtLiq(preview?.liqPrice ?? null)}
            </dd>
          </div>
        </dl>
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
            disabled={!valid || saving}
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
