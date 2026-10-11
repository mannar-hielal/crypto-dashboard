/**
 * The one-time offer of the opt-in "an order of yours filled" e-mail: shown when the account has a
 * resting order, a verified address and has not answered it. Same card as the welcome card and never
 * at the same time (the welcome card goes first). Saying yes writes the consent (with its time) on
 * the account; either answer retires the offer. Preferences stay in Settings.
 */

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { notificationsApi } from '@crypto-dashboard/sdk';
import { guide } from '@/lib/guideAnchors';
import { useAuthStore } from '@/store/authStore';
import { usePaperStore } from '@/store/paperStore';
import styles from './LearnCard.module.css';
import { useTourStore } from './tourStore';

export function FillEmailOffer() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const verified = useAuthStore((s) => !!s.user?.emailVerifiedAt);
  const hasResting = usePaperStore((s) => s.pendingOrders.length > 0);
  const loaded = useTourStore((s) => s.loaded);
  const cardDone = useTourStore((s) => s.cardDismissed);
  const answered = useTourStore((s) => s.fillOfferDismissed);
  const running = useTourStore((s) => s.activeId !== null);
  const [error, setError] = useState<string | null>(null);
  /** The account's current setting, read once the offer would otherwise show */
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const eligible = loaded && cardDone && !answered && !running && verified && hasResting;

  useEffect(() => {
    if (!eligible || !accessToken || enabled !== null) return;
    let cancelled = false;
    notificationsApi
      .get(accessToken)
      .then((s) => {
        if (!cancelled) setEnabled(s.fillEmail);
      })
      .catch(() => {
        // Can't tell: show nothing rather than ask for something that may already be on
        if (!cancelled) setEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, accessToken, enabled]);

  if (!eligible || enabled !== false) return null;

  const decline = () => useTourStore.getState().dismissFillOffer();
  const accept = async () => {
    if (!accessToken) return;
    setError(null);
    try {
      await notificationsApi.set({ fillEmail: true }, accessToken);
      useTourStore.getState().dismissFillOffer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn it on.');
    }
  };

  return (
    <aside className={styles.card} aria-label="E-mail offer" {...guide('notify.offer')}>
      <div className={styles.head}>
        <h2 className={styles.title}>Want an e-mail when it fills?</h2>
        <button
          type="button"
          className={styles.close}
          aria-label="No thanks"
          onClick={decline}
          {...guide('notify.offer.dismiss')}
        >
          <X size={16} />
        </button>
      </div>
      <p className={styles.text}>
        Your order is waiting for its price. We can e-mail you once if it fills while you are away —
        nothing else, and you can switch it off in Settings or from the e-mail.
      </p>
      {error && <p className={styles.text}>{error}</p>}
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void accept()}
          {...guide('notify.offer.accept')}
        >
          E-mail me
        </button>
        <button type="button" className={styles.link} onClick={decline}>
          No thanks
        </button>
      </div>
    </aside>
  );
}
