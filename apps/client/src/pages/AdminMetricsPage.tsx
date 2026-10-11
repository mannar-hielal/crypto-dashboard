/**
 * Admin-only retention metrics: weekly signup cohorts from tables the app already keeps (plan
 * "Retention analytics"). The server is the real gate (403 for anyone but the admin); the redirect
 * here only hides the page, like AdminNewsletterPage.
 */

import { useEffect, useReducer, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { adminApi } from '@crypto-dashboard/sdk';
import type { MetricsRate, RetentionCohort, RetentionMetricsResponse } from '@crypto-dashboard/sdk';
import { Footer } from '@/components/Footer';
import { SeoHead } from '@/components/SeoHead';
import { useAuthStore } from '@/store/authStore';
import styles from './AdminMetricsPage.module.css';

interface State {
  data: RetentionMetricsResponse | null;
  error: string | null;
  loading: boolean;
}

type Action =
  | { type: 'loading' }
  | { type: 'success'; data: RetentionMetricsResponse }
  | { type: 'error'; error: string };

const initialState: State = { data: null, error: null, loading: true };

// A refresh keeps the previous numbers on screen until the new ones arrive
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: null };
    case 'success':
      return { data: action.data, error: null, loading: false };
    case 'error':
      return { ...state, error: action.error, loading: false };
  }
}

const percent = (r: MetricsRate) => `${Math.round((r.count / r.eligible) * 100)}%`;

/** "4 / 8" with "50%" beneath; "—" while nobody is eligible yet (their window hasn't passed) */
function RateCell({ rate }: { rate: MetricsRate }) {
  if (rate.eligible === 0) return <span className={styles.none}>—</span>;
  return (
    <>
      {rate.count} / {rate.eligible}
      <span className={styles.pct}>{percent(rate)}</span>
    </>
  );
}

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

function hoursLabel(h: number | null): string {
  return h === null ? '—' : `${h} h`;
}

function Row({ cohort, total }: { cohort: RetentionCohort; total?: boolean }) {
  return (
    <tr className={total ? styles.totalRow : undefined}>
      <td>{total || cohort.weekStart === null ? 'All weeks' : weekLabel(cohort.weekStart)}</td>
      <td>{cohort.signups}</td>
      <td>{cohort.verified}</td>
      <td>
        <RateCell rate={cohort.activated} />
      </td>
      <td>{hoursLabel(cohort.medianHoursToFirstOrder)}</td>
      <td>
        <RateCell rate={cohort.activeWeek1} />
      </td>
      <td>
        <RateCell rate={cohort.activeWeek2} />
      </td>
      <td>
        <RateCell rate={cohort.activeWeek4} />
      </td>
      <td>{cohort.resetUsers}</td>
      <td>
        <RateCell rate={cohort.firstOrderWithStopLoss} />
      </td>
    </tr>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>{label}</p>
      <p className={styles.cardValue}>{value}</p>
      {sub && <p className={styles.cardSub}>{sub}</p>}
    </div>
  );
}

const rateValue = (r: MetricsRate) => (r.eligible === 0 ? '—' : `${r.count} / ${r.eligible}`);
const rateSub = (r: MetricsRate) => (r.eligible === 0 ? 'nobody eligible yet' : percent(r));

export function AdminMetricsPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.email === import.meta.env.VITE_ADMIN_EMAIL;

  const [state, dispatch] = useReducer(reducer, initialState);
  // Bumped by Refresh: the load effect re-runs for it (a reducer dispatch, not setState in an effect)
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = state;

  useEffect(() => {
    if (user && !isAdmin) navigate('/dashboard', { replace: true });
  }, [user, isAdmin, navigate]);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    let cancelled = false;
    dispatch({ type: 'loading' });
    adminApi
      .getRetentionMetrics(accessToken)
      .then((res) => !cancelled && dispatch({ type: 'success', data: res }))
      .catch(
        (err) =>
          !cancelled &&
          dispatch({
            type: 'error',
            error: err instanceof Error ? err.message : 'Failed to load metrics',
          })
      );
    return () => {
      cancelled = true;
    };
  }, [accessToken, isAdmin, reloadKey]);

  const updated = data
    ? new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <SeoHead title="Retention metrics" description="Admin panel — retention metrics." noIndex />
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>Retention metrics</h1>
              <p className={styles.subtitle}>
                {data
                  ? `Last ${data.windowWeeks} weeks · updated ${updated}`
                  : 'Weekly signup cohorts'}
              </p>
            </div>
            <div className={styles.actions}>
              <Link to="/admin/newsletter" className={styles.pill}>
                Newsletter admin
              </Link>
              <button
                type="button"
                className={styles.pill}
                onClick={() => setReloadKey((k) => k + 1)}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {error ? (
            <div className={`${styles.state} ${styles.error}`}>{error}</div>
          ) : !data ? (
            <div className={styles.state}>Loading…</div>
          ) : (
            <>
              {data.truncated && (
                <p className={styles.warn}>
                  The row cap cut the window short: these numbers are a lower bound.
                </p>
              )}
              <div className={styles.strip}>
                <Card
                  label="Signups"
                  value={String(data.totals.signups)}
                  sub={`${data.totals.verified} verified`}
                />
                <Card
                  label="Activated"
                  value={rateValue(data.totals.activated)}
                  sub={rateSub(data.totals.activated)}
                />
                <Card
                  label="Week-1 return"
                  value={rateValue(data.totals.activeWeek1)}
                  sub={rateSub(data.totals.activeWeek1)}
                />
                <Card
                  label="Median to 1st order"
                  value={hoursLabel(data.totals.medianHoursToFirstOrder)}
                />
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Week of</th>
                      <th>Signups</th>
                      <th>Verified</th>
                      <th>Activated</th>
                      <th>Median to 1st</th>
                      <th>Wk 1</th>
                      <th>Wk 2</th>
                      <th>Wk 4</th>
                      <th>Resets</th>
                      <th>1st with SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <Row cohort={data.totals} total />
                    {data.cohorts.map((c) => (
                      <Row key={c.weekStart} cohort={c} />
                    ))}
                  </tbody>
                </table>
              </div>

              <p className={styles.note}>
                <strong>Activated</strong> = first order placed within 7 days of signup.{' '}
                <strong>Wk 1 / 2 / 4</strong> = acted on a later UTC day within days 1–7, 8–14,
                22–28 (an order, a note or a reset); a week counts only once it has fully passed.
                Cohorts are signup weeks starting Monday UTC; the admin and QA accounts are left
                out.
              </p>
              <p className={styles.note}>
                <strong>What this can&apos;t see:</strong> users who only watch charts, visitors who
                never register, and tour steps — the page under-counts return until a daily activity
                record exists.
              </p>
            </>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
}
