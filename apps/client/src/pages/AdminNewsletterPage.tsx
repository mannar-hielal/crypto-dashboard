import { useEffect, useReducer, useState } from 'react';
import { Footer } from '@/components/Footer';
import { SeoHead } from '@/components/SeoHead';
import { useAuthStore } from '@/store/authStore';
import { newsletterApi } from '@crypto-dashboard/sdk';
import type { SubscriberInfo } from '@crypto-dashboard/sdk';
import { bg, color, fontSize } from '@/lib/tokens';

type StatusFilter = 'all' | 'pending' | 'verified' | 'unsubscribed';

type State = {
  loading: boolean;
  error: string | null;
  subscribers: SubscriberInfo[];
  total: number;
};

type Action =
  | { type: 'loading' }
  | { type: 'error'; error: string }
  | { type: 'success'; subscribers: SubscriberInfo[]; total: number };

const initialState: State = {
  loading: true,
  error: null,
  subscribers: [],
  total: 0,
};

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { loading: true, error: null, subscribers: [], total: 0 };
    case 'error':
      return { loading: false, error: action.error, subscribers: [], total: 0 };
    case 'success':
      return { loading: false, error: null, subscribers: action.subscribers, total: action.total };
  }
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  pending: 'Pending',
  verified: 'Verified',
  unsubscribed: 'Unsubscribed',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  verified: '#2ccd78',
  unsubscribed: '#d5455c',
};

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? local.substring(0, 2) + '••••' : local + '••••';
  const domainParts = domain.split('.');
  const domainName = domainParts[0];
  const maskedDomain =
    domainName.length > 2 ? domainName.substring(0, 2) + '•••' : domainName + '•••';
  return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
}

export function AdminNewsletterPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showEmails, setShowEmails] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const filterParam = statusFilter === 'all' ? undefined : statusFilter;

    dispatch({ type: 'loading' });

    newsletterApi
      .getSubscribers(accessToken, filterParam)
      .then((data) =>
        dispatch({ type: 'success', subscribers: data.subscribers, total: data.total })
      )
      .catch((err) =>
        dispatch({
          type: 'error',
          error: err instanceof Error ? err.message : 'Failed to load subscribers',
        })
      );
  }, [accessToken, statusFilter]);

  const { loading, error, subscribers, total } = state;

  return (
    <>
      <SeoHead
        title="Newsletter Subscribers"
        description="Admin panel — newsletter subscriber management."
        noIndex
      />

      <div
        className="relative flex min-h-screen flex-col"
        style={{
          background: `linear-gradient(180deg, ${bg.deep} 0%, ${bg.page} 30%, ${bg.navy} 100%)`,
        }}
      >
        <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-6 py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white">Newsletter Subscribers</h1>
            <p className="mt-1" style={{ color: color.muted, fontSize: fontSize.sm }}>
              {total} subscriber{total !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Controls row */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(Object.entries(STATUS_LABELS) as [StatusFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: statusFilter === key ? color.purple : bg.surface,
                    color: statusFilter === key ? '#fff' : color.muted,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowEmails(!showEmails)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: showEmails ? color.red + '20' : bg.surface,
                color: showEmails ? color.red : color.muted,
              }}
            >
              {showEmails ? 'Hide emails' : 'Show emails'}
            </button>
          </div>

          {/* Table */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: `${color.purpleDark}33`, background: bg.panel }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
                  style={{ borderColor: `${color.purple}40`, borderTopColor: color.purple }}
                />
              </div>
            ) : error ? (
              <div
                className="px-6 py-12 text-center"
                style={{ color: color.red, fontSize: fontSize.sm }}
              >
                {error}
              </div>
            ) : subscribers.length === 0 ? (
              <div
                className="px-6 py-12 text-center"
                style={{ color: color.muted, fontSize: fontSize.sm }}
              >
                No subscribers found.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${color.purpleDeep}40`,
                      color: color.muted,
                      fontSize: fontSize.xs,
                    }}
                  >
                    <th className="px-6 py-3 font-medium uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 font-medium uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 font-medium uppercase tracking-wider">Subscribed</th>
                    <th className="px-6 py-3 font-medium uppercase tracking-wider">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((sub) => (
                    <tr
                      key={sub.id}
                      className="transition-colors hover:opacity-90"
                      style={{
                        borderBottom: `1px solid ${color.purpleDeep}30`,
                      }}
                    >
                      <td className="px-6 py-3.5" style={{ color: color.white }}>
                        {showEmails ? sub.email : maskEmail(sub.email)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            background: `${STATUS_COLORS[sub.status]}18`,
                            color: STATUS_COLORS[sub.status],
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: STATUS_COLORS[sub.status] }}
                          />
                          {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                        </span>
                      </td>
                      <td
                        className="px-6 py-3.5"
                        style={{ color: color.muted, fontSize: fontSize.xs }}
                      >
                        {new Date(sub.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td
                        className="px-6 py-3.5"
                        style={{ color: color.muted, fontSize: fontSize.xs }}
                      >
                        {sub.verifiedAt
                          ? new Date(sub.verifiedAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
