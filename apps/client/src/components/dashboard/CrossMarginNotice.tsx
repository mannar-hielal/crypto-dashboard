/**
 * One-time notice for accounts that were isolated before cross margin existed (BYBIT_PARITY_PLAN
 * BP-5 E, O2): cross is Bybit's default and what new accounts start in; this account stays
 * isolated until its owner switches. "How it works" explains the difference; "Switch to Cross"
 * calls the server (which applies Bybit's checks). Dismissed per browser.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { usePaperStore } from '@/store/paperStore';
import { CROSS_EXPLAINER, ISOLATED_EXPLAINER } from '@/lib/positionMath';
import { bg, color, fontSize } from '@/lib/tokens';
import styles from './CrossMarginNotice.module.css';

const DISMISSED_KEY = 'cd-cross-margin-notice-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function CrossMarginNotice() {
  const eligible = usePaperStore((s) => s.marginModeNotice && s.marginMode === 'ISOLATED_MARGIN');
  const setMarginMode = usePaperStore((s) => s.setMarginMode);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!eligible || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private mode / blocked storage: the notice just comes back next time
    }
  }

  async function switchToCross() {
    setSaving(true);
    setError(null);
    const err = await setMarginMode('REGULAR_MARGIN');
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div
      className={styles.notice}
      role="status"
      data-testid="cross-margin-notice"
      style={{
        background: bg.banner,
        borderColor: `${color.purpleDark}60`,
        fontSize: fontSize.xs10,
        color: color.muted,
      }}
    >
      <div className={styles.row}>
        <span>
          <strong style={{ color: color.white }}>Cross margin is now available.</strong> It is
          Bybit&apos;s default and new accounts start in it. Your account stays in isolated margin
          until you switch.
        </span>
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss the cross margin notice"
          onClick={dismiss}
          style={{ color: color.muted }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <div className={styles.details}>
          <p>{CROSS_EXPLAINER}</p>
          <p>{ISOLATED_EXPLAINER}</p>
        </div>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.link}
          style={{ color: color.purple }}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          How it works
        </button>
        <button
          type="button"
          className={`${styles.link} ${styles.switch}`}
          style={{ color: color.purple }}
          disabled={saving}
          onClick={() => void switchToCross()}
        >
          {saving ? 'Switching…' : 'Switch to Cross'}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error} style={{ color: color.red }}>
          {error}
        </p>
      )}
    </div>
  );
}
