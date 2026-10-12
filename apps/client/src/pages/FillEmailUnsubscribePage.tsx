/**
 * The link in an "order filled" e-mail: switches that user's fill e-mails off, no sign-in. The
 * signed token in the URL says whose preference it is; the server answers the same whatever the
 * account's state, and a forged token is a 400.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { notificationsApi } from '@crypto-dashboard/sdk';
import { SeoHead } from '@/components/SeoHead';
import { guide } from '@/lib/guideAnchors';
import styles from './FillEmailUnsubscribePage.module.css';

type Status = 'loading' | 'done' | 'error';

export function FillEmailUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const attempted = useRef(false);
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? '' : 'This link is missing its token.');

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    notificationsApi
      .unsubscribe(token)
      .then((r) => {
        setStatus('done');
        setMessage(r.message);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Something went wrong.');
      });
  }, [token]);

  return (
    <>
      <SeoHead
        title="Stop order e-mails"
        description="Stop the order-filled e-mails from cryptopapertrade.com."
        path="/notifications/unsubscribe"
        noIndex
      />
      <div className={styles.page}>
        <main className={styles.card} {...guide('notify.unsubscribe.status')}>
          {status === 'loading' && <h1 className={styles.title}>Turning it off…</h1>}
          {status === 'done' && (
            <>
              <h1 className={styles.title}>Done</h1>
              <p className={styles.text}>{message}</p>
              <p className={styles.text}>You can turn it back on any time in Settings.</p>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className={styles.title}>That did not work</h1>
              <p className={`${styles.text} ${styles.error}`}>{message}</p>
              <p className={styles.text}>
                You can also switch the e-mails off in Settings once you are signed in.
              </p>
            </>
          )}
          <Link to="/" className={styles.link}>
            Back to the homepage
          </Link>
        </main>
      </div>
    </>
  );
}
