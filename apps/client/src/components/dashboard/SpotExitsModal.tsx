/**
 * Spot TP / SL on coins already held (APP_LOG Bybit Parity BP-2): locks a quantity of the free
 * balance behind a take-profit and / or stop-loss sell (an OCO pair — the first to fire cancels
 * the other). The server checks the prices against the live market and Bybit's rules.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePaperStore, type SpotBalance } from '@/store/paperStore';
import { NumericInput } from '@/components/ui/NumericInput';
import { fontSize, zIndex } from '@/lib/tokens';
import styles from './TradeDialog.module.css';

interface SpotExitsModalProps {
  holding: SpotBalance;
  onClose: () => void;
}

export function SpotExitsModal({ holding, onClose }: SpotExitsModalProps) {
  const placeSpotExits = usePaperStore((s) => s.placeSpotExits);
  const [qty, setQty] = useState(holding.free.toString());
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
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

  const parse = (v: string) => parseFloat(v.replace(/,/g, ''));

  async function confirm() {
    const q = parse(qty);
    const takeProfit = tp ? parse(tp) : undefined;
    const stopLoss = sl ? parse(sl) : undefined;
    if (!(q > 0) || q > holding.free) {
      setError(`Enter a quantity up to ${holding.free} ${holding.coin}`);
      return;
    }
    if (!takeProfit && !stopLoss) {
      setError('Set a take-profit, a stop-loss or both');
      return;
    }
    setSaving(true);
    const res = await placeSpotExits(`${holding.coin}USDT`, q, takeProfit, stopLoss);
    setSaving(false);
    if (res.id) onClose();
    else setError(res.error ?? 'Could not place the TP / SL');
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
        aria-labelledby="spot-exits-title"
        tabIndex={-1}
      >
        <h2 id="spot-exits-title" className={styles.title} style={{ fontSize: fontSize.xs }}>
          TP / SL — {holding.coin}
        </h2>
        <div className={styles.fields}>
          <div>
            <label className={styles.fieldLabel} style={{ fontSize: fontSize.xs10 }}>
              Quantity (available {holding.free} {holding.coin})
            </label>
            <NumericInput
              ariaLabel="Quantity"
              suffix={holding.coin}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} style={{ fontSize: fontSize.xs10 }}>
              Take profit, price
            </label>
            <NumericInput
              ariaLabel="Take profit price"
              suffix="TP"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} style={{ fontSize: fontSize.xs10 }}>
              Stop loss, price
            </label>
            <NumericInput
              ariaLabel="Stop loss price"
              suffix="SL"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
            />
          </div>
        </div>
        <p className={styles.note} style={{ fontSize: fontSize.xs10 }}>
          Locks this quantity. The first order to trigger sells at the bid and cancels the other.
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
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? 'Placing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
